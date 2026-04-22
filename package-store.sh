#!/usr/bin/env bash
# Builds a clean Web Store zip from dist/:
#   - Removes the `key` field (rejected by the Web Store)
#   - Strips .map files and .DS_Store

set -euo pipefail

ZIP="markdrive-store.zip"

echo "▶ Building…"
pnpm build

echo "▶ Patching dist/manifest.json for store…"
python3 - <<'PYEOF'
import json

with open("dist/manifest.json") as f:
    m = json.load(f)

# Remove key (rejected by Web Store)
m.pop("key", None)

with open("dist/manifest.json", "w") as f:
    json.dump(m, f, indent=2)
    f.write("\n")

print("  key field removed")
PYEOF

echo "▶ Creating $ZIP…"
rm -f "$ZIP"
cd dist
zip -r "../$ZIP" . \
    --exclude "*.map" \
    --exclude ".DS_Store" \
    --exclude "__MACOSX"
cd ..

echo "✅  $ZIP ready ($(du -sh "$ZIP" | cut -f1))"
