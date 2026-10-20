#!/bin/bash
# Build "Faust Notes.ipa" (unsigned) for SideStore / AltStore, which sign it with your Apple ID.
# Needs Xcode (iOS SDK). No Xcode project: swiftc + zip.
#
# Usage: ./build-ipa.sh                 build into ./build
#        ./build-ipa.sh component       also rebuild faust-web-component (component-src/, see README)

set -e
cd "$(dirname "$0")"

APP="build/Payload/FaustNotes.app"
SDK=$(xcrun --sdk iphoneos --show-sdk-path)
TARGET=arm64-apple-ios16.0

# optional: rebuild the web component from its sources (with the faust-notes patch)
if [ "$1" = "component" ]; then
    if [ ! -d component-src ]; then
        git clone https://github.com/grame-cncm/faust-web-component.git component-src
        (cd component-src && git apply ../component.patch)
    fi
    (cd component-src && npm install && npm run build)
    cp component-src/dist/faust-web-component.js www/
fi

rm -rf build
mkdir -p "$APP"

# native code
xcrun --sdk iphoneos swiftc -O -sdk "$SDK" -target $TARGET -parse-as-library \
    -o "$APP/FaustNotes" native/App.swift

# icons (PNG files declared in Info.plist: no asset catalog, so no simulator runtime needed) and Info.plist
cp native/icons/*.png "$APP/"
cp native/Info.plist "$APP/Info.plist"

# web app (without source maps)
rsync -a --exclude '*.map' --exclude '.DS_Store' www/ "$APP/www/"

# unsigned IPA
(cd build && zip -qr "Faust Notes.ipa" Payload)
echo "Built: $(pwd)/build/Faust Notes.ipa ($(du -h "build/Faust Notes.ipa" | cut -f1))"
