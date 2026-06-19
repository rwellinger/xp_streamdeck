.DEFAULT_GOAL := help
SHELL := /bin/bash

PLUGIN_UUID  := com.robertw.xplane
SDPLUGIN_DIR := $(PLUGIN_UUID).sdPlugin
MAIN_BRANCH  := main
STREAMDECK   := npx --no-install streamdeck

.PHONY: help setup build deploy clean distclean test lint lint-fix format format-check check smoke icons package release cleanup_tags cleanup_branches cleanup_actions import export

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "; printf "Available targets:\n"} \
		/^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install npm dependencies (restores what distclean removed)
	npm install

build: ## Compile TypeScript via rollup into <plugin>/bin/plugin.js
	npm run build

deploy: build ## Build, then restart the plugin in the Stream Deck app
	$(STREAMDECK) restart $(PLUGIN_UUID)

clean: ## Remove build output (bin, logs, packed plugin, generated icons) — keeps node_modules
	rm -rf $(SDPLUGIN_DIR)/bin $(SDPLUGIN_DIR)/logs
	rm -f $(PLUGIN_UUID).streamDeckPlugin
	rm -rf out

distclean: clean ## Like clean, plus wipe node_modules (full reset; needs `make setup` after)
	rm -rf node_modules

test: ## Type-check the source (no test framework configured yet)
	npx tsc --noEmit

lint: ## Run Biome lint + format check (read-only; fails CI on issues)
	npm run --silent lint

lint-fix: ## Apply safe lint fixes (imports, unused, style)
	npm run --silent lint:fix

format: ## Format all sources in place via Biome
	npm run --silent format

format-check: ## Check formatting without writing (CI-friendly)
	npm run --silent format:check

check: lint test ## Run lint + type-check — recommended before every commit

smoke: ## Run the X-Plane client smoke script (X-Plane must be running)
	npm run --silent smoke

icons: ## Generate Stream Deck button icons from scripts/icons/catalog.ts into out/icons/
	npm run --silent icons

import: ## Restore profiles from streamdeck-profiles/<DIR> (default: StreamDeck XL). Override: make import DIR="Streamdeck 3"
	npx tsx scripts/sync-profiles.ts import $(if $(DIR),"$(DIR)",)

export: ## Snapshot live profiles into streamdeck-profiles/<DIR> (default: StreamDeck XL). Override: make export DIR="Streamdeck 3"
	npx tsx scripts/sync-profiles.ts export $(if $(DIR),"$(DIR)",)

convert: ## Convert a PilotsDeck profile to this plugin. Usage: make convert IN=in.streamDeckProfile [OUT=out.streamDeckProfile]
	@if [ -z "$(IN)" ]; then echo "IN is required, e.g. make convert IN='SR2x.streamDeckProfile'"; exit 1; fi
	npx tsx scripts/convert-pilotsdeck.ts "$(IN)" $(if $(OUT),"$(OUT)",)

package: build ## Build a distributable .streamDeckPlugin (uses streamdeck pack — see M08)
	$(STREAMDECK) pack -f $(SDPLUGIN_DIR)

release: ## Bump version, commit, tag and push; CI publishes the release ZIP. Usage: make release VERSION=1.0.2
	@if [ -z "$(VERSION)" ]; then echo "VERSION is required, e.g. make release VERSION=1.0.2"; exit 1; fi
	node scripts/release.mjs $(VERSION)

cleanup_tags: ## Remove local tags that no longer exist on origin
	git fetch --prune --prune-tags origin

cleanup_branches: ## Delete local branches already merged into main
	git fetch --prune origin
	@git branch --merged $(MAIN_BRANCH) --format='%(refname:short)' \
		| grep -vE '^($(MAIN_BRANCH))$$' \
		| xargs -r -n1 git branch -d

cleanup_actions: ## Delete all GitHub Actions workflow runs (requires gh CLI)
	@command -v gh >/dev/null 2>&1 || { echo "gh CLI not installed (brew install gh)"; exit 1; }
	@read -p "Delete ALL GitHub Actions runs for this repo? [y/N] " ans; \
		[ "$$ans" = "y" ] || { echo "aborted"; exit 0; }
	@gh run list --limit 200 --json databaseId --jq '.[].databaseId' \
		| xargs -r -I{} gh run delete {}
