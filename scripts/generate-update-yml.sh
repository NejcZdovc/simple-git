#!/usr/bin/env bash
set -euo pipefail

# Generates latest-mac.yml for electron-updater and uploads it to the GitHub release.
# Usage: ./scripts/generate-update-yml.sh <version>
# Requires: GITHUB_TOKEN env var, gh CLI, and the zip artifact in out/make/zip/

VERSION="${1:?Usage: generate-update-yml.sh <version>}"
TAG="v${VERSION}"

# Find the zip artifact
ZIP_PATH=$(find out/make/zip -name "*.zip" | head -1)
if [ -z "$ZIP_PATH" ]; then
  echo "Error: No zip artifact found in out/make/zip/" >&2
  exit 1
fi

# Electron Forge's GitHub publisher replaces spaces with dots in asset names
ZIP_NAME=$(basename "$ZIP_PATH" | tr ' ' '.')
ZIP_SIZE=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH")
ZIP_SHA512=$(shasum -a 512 "$ZIP_PATH" | awk '{print $1}' | xxd -r -p | base64)
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

YML_PATH="out/make/latest-mac.yml"

cat > "$YML_PATH" <<EOF
version: ${VERSION}
files:
  - url: ${ZIP_NAME}
    sha512: ${ZIP_SHA512}
    size: ${ZIP_SIZE}
path: ${ZIP_NAME}
sha512: ${ZIP_SHA512}
releaseDate: '${RELEASE_DATE}'
EOF

echo "Generated ${YML_PATH}:"
cat "$YML_PATH"

# Upload to GitHub release
gh release upload "$TAG" "$YML_PATH" --clobber
echo "Uploaded latest-mac.yml to release ${TAG}"
