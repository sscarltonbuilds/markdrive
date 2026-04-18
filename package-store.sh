#!/usr/bin/env bash
# Builds a clean Web Store zip from dist/:
#   - Swaps oauth2 client_id to the prod client
#   - Removes the `key` field (rejected by the Web Store)
#   - Strips .map files and .DS_Store

set -euo pipefail

DEV_CLIENT="475063314751-135k2ajsdnri0ns0o6cfgtajq9q7atg3.apps.googleusercontent.com"
PROD_CLIENT="475063314751-b5qbs3c85obhlt3eau6n8h71ec6bep01.apps.googleusercontent.com"
ZIP="markdrive-store.zip"

echo "▶ Building…"
pnpm build

echo "▶ Patching dist/manifest.json for store…"
python3 - <<'PYEOF'
import json, sys

with open("dist/manifest.json") as f:
    m = json.load(f)

# Remove key (rejected by Web Store)
m.pop("key", None)

# Swap to prod OAuth client
dev  = "475063314751-135k2ajsdnri0ns0o6cfgtajq9q7atg3.apps.googleusercontent.com"
prod = "475063314751-b5qbs3c85obhlt3eau6n8h71ec6bep01.apps.googleusercontent.com"
if m.get("oauth2", {}).get("client_id") == dev:
    m["oauth2"]["client_id"] = prod

with open("dist/manifest.json", "w") as f:
    json.dump(m, f, indent=2)
    f.write("\n")

print("  client_id →", prod)
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
