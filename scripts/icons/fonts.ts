/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const FONT_FAMILY = "Inter";

// Static Inter 4.1 cuts (OFL-1.1) for every font-weight the templates use.
// resvg-js 2.x cannot pick weights from a variable font, so the static files
// are required. generate-icons.ts loads ONLY these (no system fonts), which
// keeps the output byte-identical on macOS, Linux CI and Windows.
export const FONT_FILES = [
	"Inter-SemiBold.ttf",
	"Inter-Bold.ttf",
	"Inter-ExtraBold.ttf",
	"Inter-Black.ttf",
].map((file) => resolve(HERE, "fonts", file));
