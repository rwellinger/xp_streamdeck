/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

if (process.platform !== "darwin") {
	console.error(
		"sync-profiles is a macOS-only dev tool (uses AppleScript and ~/Library/...).\n" +
			"Windows users should manage profiles via the Stream Deck app's import/export UI.",
	);
	process.exit(2);
}

const PROFILES_DIR = join(
	homedir(),
	"Library/Application Support/com.elgato.StreamDeck/ProfilesV3",
);
const REPO_PROFILES_DIR = resolve(process.cwd(), "streamdeck-profiles");
const PROFILE_NAME_PREFIX = "xp_stream_";
const PARENT_PROFILE_NAME = "X-Plane";
const PARENT_FILE_BASENAME = "xp_stream_parent";
const ARCHIVE_EXT = ".streamDeckProfile";

// Profiles live in per-model subfolders of streamdeck-profiles/ so that one repo
// can ship layouts for several Stream Deck sizes. The key is the Device.Model
// string stored in each profile's manifest; the value is the subfolder name.
// Unknown models fall back to the repo root (with a warning on export).
const MODEL_PROFILE_DIRS: Record<string, string> = {
	"20GAT9902": "StreamDeck XL",
	"20GBA9901": "Streamdeck 3",
};

// Normalization targets for exported archives. Keeps git diffs noise-free:
// the live Device.UUID is hardware-bound (different per Mac) and Pages.Current
// changes every time the user switches pages in the UI. Both are reset on
// import or by Stream Deck itself.
const NEUTRAL_DEVICE_UUID = "985ddafc-cc60-4f6b-810b-ad4b235f5c93";
const NEUTRAL_PAGE_UUID = "00000000-0000-0000-0000-000000000000";

// Used to give every file inside the freshly produced ZIP the same timestamp
// so two consecutive `make export` runs produce byte-identical archives.
const DETERMINISTIC_EPOCH = new Date("2000-01-01T00:00:00Z");

type Manifest = {
	Device: { Model: string; UUID: string };
	Name: string;
	Pages: { Current: string; Default: string; Pages: string[] };
	Version: string;
};

type LiveProfile = {
	folderName: string;
	folderPath: string;
	manifest: Manifest;
};

function run(cmd: string, args: string[], cwd?: string): void {
	execFileSync(cmd, args, { stdio: "inherit", cwd });
}

const STREAM_DECK_APP_NAME = "Elgato Stream Deck";
const STREAM_DECK_PROC_NAME = "Stream Deck";

function isStreamDeckRunning(): boolean {
	try {
		execFileSync("pgrep", ["-x", STREAM_DECK_PROC_NAME], {
			stdio: ["ignore", "ignore", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
}

function waitUntilStreamDeckGone(timeoutMs: number): boolean {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isStreamDeckRunning()) {
			return true;
		}
		execFileSync("sleep", ["0.2"]);
	}
	return false;
}

function quitStreamDeck(): void {
	if (!isStreamDeckRunning()) {
		return;
	}
	console.log("→ quitting Stream Deck app");
	try {
		execFileSync(
			"osascript",
			["-e", `tell application "${STREAM_DECK_APP_NAME}" to quit saving no`],
			{ stdio: ["ignore", "ignore", "ignore"] },
		);
	} catch {
		// Confirmation dialog or AppleScript permission denial — fall through to pkill.
	}
	if (waitUntilStreamDeckGone(3000)) {
		return;
	}
	console.log("  (graceful quit didn't take — sending SIGTERM)");
	try {
		execFileSync("pkill", ["-x", STREAM_DECK_PROC_NAME], {
			stdio: ["ignore", "ignore", "ignore"],
		});
	} catch {
		// pkill returns non-zero if no match — fine
	}
	if (waitUntilStreamDeckGone(3000)) {
		return;
	}
	throw new Error("Stream Deck app did not quit within 6 seconds");
}

function launchStreamDeck(): void {
	console.log("→ relaunching Stream Deck app");
	run("open", ["-a", STREAM_DECK_APP_NAME]);
}

function readManifest(manifestPath: string): Manifest {
	return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
}

function listLiveProfiles(): LiveProfile[] {
	if (!existsSync(PROFILES_DIR)) {
		throw new Error(
			`ProfilesV3 directory not found at:\n  ${PROFILES_DIR}\n` +
				"Open the Stream Deck app and create at least one profile first.",
		);
	}
	const out: LiveProfile[] = [];
	for (const entry of readdirSync(PROFILES_DIR)) {
		if (!entry.endsWith(".sdProfile")) {
			continue;
		}
		const folderPath = join(PROFILES_DIR, entry);
		const manifestPath = join(folderPath, "manifest.json");
		if (!existsSync(manifestPath)) {
			continue;
		}
		try {
			const manifest = readManifest(manifestPath);
			out.push({ folderName: entry, folderPath, manifest });
		} catch (err) {
			console.warn(`  ! skipping ${entry} (malformed manifest): ${(err as Error).message}`);
		}
	}
	return out;
}

function readDeviceUuid(profiles: LiveProfile[]): { uuid: string; model: string } {
	for (const p of profiles) {
		if (p.manifest.Device?.UUID) {
			return { uuid: p.manifest.Device.UUID, model: p.manifest.Device.Model };
		}
	}
	throw new Error(
		"No live profile found with a Device.UUID.\n" +
			"Open the Stream Deck app and create at least one profile so we can read the device UUID.",
	);
}

function shouldSyncProfile(manifest: Manifest): {
	sync: boolean;
	archiveBasename?: string;
} {
	if (manifest.Name === PARENT_PROFILE_NAME) {
		return { sync: true, archiveBasename: PARENT_FILE_BASENAME };
	}
	if (manifest.Name.startsWith(PROFILE_NAME_PREFIX)) {
		return { sync: true, archiveBasename: manifest.Name };
	}
	return { sync: false };
}

function copyDirExcludingDsStore(src: string, dest: string): void {
	cpSync(src, dest, {
		recursive: true,
		filter: (s) => !s.endsWith("/.DS_Store") && !s.endsWith(".DS_Store"),
	});
}

function touchTreeDeterministic(dir: string): void {
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		utimesSync(current, DETERMINISTIC_EPOCH, DETERMINISTIC_EPOCH);
		const stat = statSync(current);
		if (stat.isDirectory()) {
			for (const child of readdirSync(current)) {
				stack.push(join(current, child));
			}
		}
	}
}

function normalizeStagedManifest(manifestPath: string): void {
	const manifest = readManifest(manifestPath);
	manifest.Device.UUID = NEUTRAL_DEVICE_UUID;
	manifest.Pages.Current = NEUTRAL_PAGE_UUID;
	writeFileSync(manifestPath, JSON.stringify(manifest));
}

function buildPackageJson(deviceModel: string): string {
	return JSON.stringify({
		AppVersion: "7.4.2.22730",
		DeviceModel: deviceModel,
		DeviceSettings: null,
		FormatVersion: 1,
		OSType: "macOS",
		OSVersion: "15.7.7",
		RequiredPlugins: [
			"com.elgato.streamdeck.profile.rotate",
			"com.robertw.xplane",
			"com.elgato.streamdeck.page",
		],
	});
}

function makeTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function ensureRepoProfilesDir(): void {
	if (!existsSync(REPO_PROFILES_DIR)) {
		mkdirSync(REPO_PROFILES_DIR, { recursive: true });
	}
}

// Profiles can sit at the repo root or in any subfolder (per-model dirs,
// PilotsDeck-Converted/, …), so scan the whole tree rather than a flat readdir.
function findArchivesRecursive(dir: string): string[] {
	const out: string[] = [];
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.isFile() && entry.name.endsWith(ARCHIVE_EXT)) {
				out.push(full);
			}
		}
	}
	return out.sort((a, b) => a.localeCompare(b));
}

// Resolve (and create) the subfolder an exported archive belongs in, based on the
// Stream Deck model it was built for.
function modelProfileDir(model: string): string {
	const sub = MODEL_PROFILE_DIRS[model];
	if (!sub) {
		console.warn(`  ! unknown device model ${model} — writing to repo root`);
	}
	const dir = sub ? join(REPO_PROFILES_DIR, sub) : REPO_PROFILES_DIR;
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

type ExportTarget = { profile: LiveProfile; archiveBasename: string };

function parseSelection(input: string, max: number): number[] | string {
	const trimmed = input.trim().toLowerCase();
	if (trimmed === "" || trimmed === "abort" || trimmed === "q") {
		return "abort";
	}
	if (trimmed === "all" || trimmed === "*") {
		return Array.from({ length: max }, (_, i) => i + 1);
	}
	const picks: number[] = [];
	for (const part of trimmed.split(",")) {
		const n = Number.parseInt(part.trim(), 10);
		if (!Number.isInteger(n) || n < 1 || n > max) {
			return `invalid entry "${part.trim()}" (must be 1..${max}, 'all', or 'abort')`;
		}
		if (!picks.includes(n)) {
			picks.push(n);
		}
	}
	return picks;
}

async function promptProfileSelection(targets: ExportTarget[]): Promise<ExportTarget[]> {
	if (!process.stdin.isTTY) {
		throw new Error(
			"make export needs an interactive terminal to pick which profiles to export.\n" +
				"Run it directly in a shell, not piped or under CI.",
		);
	}
	console.log("\nLive profiles found:\n");
	for (const [i, t] of targets.entries()) {
		console.log(`  ${String(i + 1).padStart(2, " ")}) ${t.archiveBasename}`);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		while (true) {
			const answer = await rl.question(
				"\nWhich profiles to export? (e.g. 3, or 1,3,5, or 'all'): ",
			);
			const parsed = parseSelection(answer, targets.length);
			if (parsed === "abort") {
				console.log("Aborted — nothing exported.");
				return [];
			}
			if (typeof parsed === "string") {
				console.log(`  ! ${parsed}`);
				continue;
			}
			return parsed.map((n) => {
				const t = targets[n - 1];
				if (!t) {
					throw new Error(`Index ${n} out of range`);
				}
				return t;
			});
		}
	} finally {
		rl.close();
	}
}

async function exportProfiles(): Promise<void> {
	const profiles = listLiveProfiles();
	const targets: ExportTarget[] = profiles
		.map((p) => ({ profile: p, ...shouldSyncProfile(p.manifest) }))
		.filter((t): t is { profile: LiveProfile; sync: true; archiveBasename: string } => t.sync)
		.map(({ profile, archiveBasename }) => ({ profile, archiveBasename }))
		.sort((a, b) => a.archiveBasename.localeCompare(b.archiveBasename));

	if (targets.length === 0) {
		console.log("No xp_stream_* or X-Plane profiles found in ProfilesV3 — nothing to export.");
		return;
	}

	const selected = await promptProfileSelection(targets);
	if (selected.length === 0) {
		return;
	}

	quitStreamDeck();
	ensureRepoProfilesDir();

	for (const { profile, archiveBasename } of selected) {
		const stageDir = makeTempDir("xp-sd-export-");
		try {
			const innerProfiles = join(stageDir, "Profiles");
			mkdirSync(innerProfiles, { recursive: true });
			const stagedProfileDir = join(innerProfiles, profile.folderName);
			copyDirExcludingDsStore(profile.folderPath, stagedProfileDir);
			normalizeStagedManifest(join(stagedProfileDir, "manifest.json"));
			writeFileSync(
				join(stageDir, "package.json"),
				buildPackageJson(profile.manifest.Device.Model),
			);
			touchTreeDeterministic(stageDir);

			const filename = `${archiveBasename}${ARCHIVE_EXT}`;
			const outDir = modelProfileDir(profile.manifest.Device.Model);
			const outArchive = join(outDir, filename);
			// Overwrite the target, and clean up a legacy flat copy at the repo root
			// from before the per-model layout. Do NOT sweep other model folders by
			// basename: the same profile name can legitimately exist for a different
			// device (e.g. xp_stream_c172sp under both StreamDeck XL and Streamdeck 3).
			const legacyFlat = join(REPO_PROFILES_DIR, filename);
			for (const stale of [outArchive, legacyFlat]) {
				if (existsSync(stale)) {
					rmSync(stale);
				}
			}
			run("zip", ["-X", "-r", "-q", outArchive, "package.json", "Profiles"], stageDir);
			console.log(
				`  ✓ ${join(MODEL_PROFILE_DIRS[profile.manifest.Device.Model] ?? "", filename)}  (UUID ${profile.folderName.replace(".sdProfile", "")})`,
			);
		} finally {
			rmSync(stageDir, { recursive: true, force: true });
		}
	}

	console.log(`\nExported ${selected.length} profile(s) → ${REPO_PROFILES_DIR}`);
	launchStreamDeck();
}

function findInnerSdProfile(extractedDir: string): { name: string; path: string } {
	const profilesDir = join(extractedDir, "Profiles");
	if (!existsSync(profilesDir)) {
		throw new Error(`Archive layout unexpected: no Profiles/ in ${extractedDir}`);
	}
	for (const entry of readdirSync(profilesDir)) {
		if (entry.endsWith(".sdProfile")) {
			return { name: entry, path: join(profilesDir, entry) };
		}
	}
	throw new Error(`No *.sdProfile folder inside ${profilesDir}`);
}

function importProfiles(): void {
	ensureRepoProfilesDir();
	const archives = findArchivesRecursive(REPO_PROFILES_DIR);
	if (archives.length === 0) {
		console.log(`No ${ARCHIVE_EXT} archives under ${REPO_PROFILES_DIR} — nothing to import.`);
		return;
	}

	const liveBefore = listLiveProfiles();
	const { uuid: deviceUuid, model: deviceModel } = readDeviceUuid(liveBefore);
	console.log(`→ local Device.UUID: ${deviceUuid}  (model ${deviceModel})`);

	quitStreamDeck();

	let imported = 0;
	let skipped = 0;
	for (const archivePath of archives) {
		const archive = basename(archivePath);
		const stageDir = makeTempDir("xp-sd-import-");
		try {
			run("unzip", ["-q", "-o", archivePath, "-d", stageDir]);
			const inner = findInnerSdProfile(stageDir);
			const manifestPath = join(inner.path, "manifest.json");
			const manifest = readManifest(manifestPath);

			// Each archive carries the Stream Deck model it was built for. Importing a
			// profile sized for another device (e.g. a Streamdeck 3 layout onto an XL)
			// yields a broken profile, so skip anything that doesn't match.
			if (manifest.Device.Model !== deviceModel) {
				console.log(
					`  – skipping ${archive}  (built for model ${manifest.Device.Model}, local device is ${deviceModel})`,
				);
				skipped += 1;
				continue;
			}

			manifest.Device.UUID = deviceUuid;
			manifest.Device.Model = deviceModel;
			writeFileSync(manifestPath, JSON.stringify(manifest));

			const targetDir = join(PROFILES_DIR, inner.name);
			if (existsSync(targetDir)) {
				rmSync(targetDir, { recursive: true, force: true });
			}
			copyDirExcludingDsStore(inner.path, targetDir);
			console.log(`  ✓ ${archive}  →  ${inner.name}  (Name: ${manifest.Name})`);
			imported += 1;
		} finally {
			rmSync(stageDir, { recursive: true, force: true });
		}
	}

	console.log(
		`\nImported ${imported} profile(s)${
			skipped > 0 ? `, skipped ${skipped} built for other models` : ""
		} → ${PROFILES_DIR}`,
	);
	launchStreamDeck();
}

async function main(): Promise<void> {
	const subcommand = process.argv[2];
	if (subcommand === "export") {
		await exportProfiles();
	} else if (subcommand === "import") {
		importProfiles();
	} else {
		console.error("Usage: tsx scripts/sync-profiles.ts <export|import>");
		process.exit(2);
	}
}

main().catch((err) => {
	console.error(`ERROR: ${(err as Error).message}`);
	process.exit(1);
});
