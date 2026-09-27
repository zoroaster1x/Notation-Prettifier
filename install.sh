#!/usr/bin/env bash
# Notation Prettifier, an Obsidian plugin that renders rough math notation as
# LaTeX in the editor and reading view and can bake the LaTeX into the note.
#
# Copyright (C) 2026 Zoroaster1x
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later
# version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
# details.
#
# You should have received a copy of the GNU General Public License along with
# this program. If not, see <https://www.gnu.org/licenses/>.

#
# Usage:
#   ./install.sh /path/to/YourVault
#   ./install.sh /path/to/YourVault --no-build
#
# The vault must already exist and contain a .obsidian folder. Open the vault
# once in Obsidian if it does not. This script only copies the plugin files; it
# never touches the notes in the vault.

set -euo pipefail

VAULT="${1:-}"
NO_BUILD="${2:-}"

if [ -z "$VAULT" ]; then
	echo "Usage: $0 /path/to/YourVault [--no-build]"
	exit 1
fi

if [ ! -d "$VAULT/.obsidian" ]; then
	echo "Error: $VAULT does not look like an Obsidian vault (no .obsidian folder found)."
	echo "Open the folder once in Obsidian, then run this script again."
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

build_with() {
	if [ "$1" = "bun" ]; then
		bun install --silent
		bun esbuild.config.mjs production
	else
		npm install --silent
		npm run build
	fi
}

if [ "$NO_BUILD" != "--no-build" ]; then
	if command -v bun >/dev/null 2>&1; then
		echo "Building with bun and esbuild..."
		build_with bun
	elif command -v npm >/dev/null 2>&1; then
		echo "Building with npm and esbuild..."
		build_with npm
	else
		if [ ! -f main.js ]; then
			echo "Error: no build tool and no prebuilt main.js found."
			exit 1
		fi
		echo "No build tool found; using the existing main.js."
	fi
fi

DEST="$VAULT/.obsidian/plugins/notation-prettifier"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
if [ -f versions.json ]; then
	cp versions.json "$DEST/"
fi

echo
echo "Installed Notation Prettifier to:"
echo "  $DEST"
echo
echo "Next steps in Obsidian:"
echo "  1. Settings -> Community plugins -> make sure Restricted mode is off."
echo "  2. If Symbols Prettifier is still enabled, disable it: this plugin"
echo "     already carries its arrow and sign shortcuts."
echo "  3. Click the reload icon next to Installed plugins."
echo "  4. Enable 'Notation Prettifier' and open a note with rough notation."
