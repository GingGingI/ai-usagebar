#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
target_dir="$repo_dir/build/gnome42/ai-usagebar@wilfison"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT

cp -R "$repo_dir/lib" "$repo_dir/ui" "$repo_dir/icons" "$repo_dir/schemas" "$stage_dir/"
cp "$repo_dir/stylesheet.css" "$repo_dir/LICENSE" "$stage_dir/"
mkdir -p "$stage_dir/compat"
for file in extension.js main.js prefs.js prefsWindow.js; do
    cp "$repo_dir/compat/gnome42/$file" "$stage_dir/$file"
done
cp "$repo_dir/compat/gnome42/shell.js" "$repo_dir/compat/gnome42/gettext.js" "$stage_dir/compat/"
cp "$repo_dir/compat/gnome42/http.js" "$stage_dir/lib/http.js"

python3 - "$repo_dir/metadata.json" "$stage_dir/metadata.json" <<'PY'
import json
import sys
with open(sys.argv[1], encoding='utf-8') as source:
    metadata = json.load(source)
metadata['shell-version'] = ['42']
with open(sys.argv[2], 'w', encoding='utf-8') as target:
    json.dump(metadata, target, ensure_ascii=False, indent=2)
    target.write('\n')
PY

glib-compile-schemas --strict "$stage_dir/schemas"
mkdir -p "$(dirname "$target_dir")"
rm -rf "$target_dir"
mv "$stage_dir" "$target_dir"
echo "GNOME 42 extension: $target_dir"
