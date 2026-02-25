#!/usr/bin/env bash
# Reads version from package.json and writes it to Cargo.toml and tauri.conf.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(node -p "require('$ROOT/package.json').version")

echo "Syncing version $VERSION across all manifests..."

# Cargo.toml — update the version line in [package]
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" "$ROOT/src-tauri/Cargo.toml"

# tauri.conf.json — update the top-level version field
node -e "
const fs = require('fs');
const p = '$ROOT/src-tauri/tauri.conf.json';
const conf = JSON.parse(fs.readFileSync(p, 'utf8'));
conf.version = '$VERSION';
fs.writeFileSync(p, JSON.stringify(conf, null, 2) + '\n');
"

echo "Done. All files now at v$VERSION"
