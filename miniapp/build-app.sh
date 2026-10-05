#!/bin/bash
# Build "Faust IDE.app": a standalone macOS application made of the Electron
# runtime (from node_modules), main.js and a copy of ../dist (the IDE build).
# No npm and no network at launch. Run again after rebuilding dist/ (npm run dist).
#
# Usage: ./build-app.sh            build into ./build
#        ./build-app.sh install    build and copy to /Applications

set -e
cd "$(dirname "$0")"

NAME="Faust IDE"
ID="com.lucaspanedda.faustide"
ELECTRON="node_modules/electron/dist/Electron.app"
OUT="build/$NAME.app"
RES="$OUT/Contents/Resources"
PLIST="$OUT/Contents/Info.plist"

[ -d "$ELECTRON" ] || { echo "Electron runtime missing: run 'npm install' in $(pwd)"; exit 1; }
[ -f ../dist/index.html ] || { echo "IDE build missing: run 'npm run dist' in $(cd .. && pwd)"; exit 1; }

rm -rf build
mkdir -p build
ditto "$ELECTRON" "$OUT"

# application code: main.js + IDE build (source maps are not needed)
mkdir -p "$RES/app"
cp main.js "$RES/app/"
cat > "$RES/app/package.json" << EOF
{ "name": "faustide-mini", "productName": "$NAME", "version": "$(node -p "require('../package.json').version")", "main": "main.js" }
EOF
rsync -a --exclude '*.map' ../dist/ "$RES/app/dist/"
rm -f "$RES/default_app.asar"

# icon and identity
cp icon.icns "$RES/electron.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $NAME" \
                        -c "Set :CFBundleDisplayName $NAME" \
                        -c "Set :CFBundleIdentifier $ID" \
                        -c "Set :NSMicrophoneUsageDescription Audio input for the Faust programs" \
                        "$PLIST"

# ad-hoc signature (required on Apple Silicon)
xattr -cr "$OUT"
codesign --sign - --force --deep "$OUT" 2> /dev/null
codesign --verify --deep "$OUT"
echo "Built: $(pwd)/$OUT ($(du -sh "$OUT" | cut -f1))"

if [ "$1" = "install" ]; then
    rm -rf "/Applications/$NAME.app"
    ditto "$OUT" "/Applications/$NAME.app"
    echo "Installed: /Applications/$NAME.app"
    rm -rf build    # the copy in /Applications is the one in use
fi
