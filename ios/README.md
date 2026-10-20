# Faust Notes (iPhone)

A small Faust IDE for iPhone and iPad, with the look of a notes app: every patch is a note
(a `.dsp` file), written and run with the [faust-web-component](https://github.com/grame-cncm/faust-web-component)
editor of GRAME (CodeMirror + the Faust compiler in WebAssembly).

- list of the notes with search, new / duplicate / rename / delete, automatic saving;
- editor with Run / Stop, audio input (microphone), controls, block diagram, scope, spectrum, test signal;
- code size: pinch with two fingers on the code;
- the notes are plain `.dsp` files in the Files app (On My iPhone > Faust Notes);
  import `.dsp` files, share / export with the Share button (AirDrop, Files, Mail...);
- some examples on first launch;
- works offline: the compiler is inside the app.

## Install on an iPhone (SideStore)

The app is not on the App Store: it is installed as an unsigned `.ipa` that
[SideStore](https://sidestore.io) (or AltStore) signs with your Apple ID.
With a free Apple ID the app must be refreshed in SideStore every 7 days.

On a Mac with Xcode installed (only the iOS SDK is used, no Xcode project):

```bash
git clone -b ios-notes https://github.com/LucaSpanedda/faustide.git
cd faustide/ios
./build-ipa.sh                  # -> build/Faust Notes.ipa
```

Then copy `build/Faust Notes.ipa` to the iPhone (AirDrop, or the Files app), turn on the SideStore
VPN (LocalDevVPN), and in SideStore: My Apps > + > choose the `.ipa`.

To update the app, install the new `.ipa` the same way: the notes are kept.

## Files

- `www/`: the web app (`index.html`, `style.css`, `app.js`), the built `faust-web-component.js`
  and the examples (`www/examples/*.dsp`, listed in `index.json`).
- `native/App.swift`: the iOS shell. It serves `www/` through a `faustnotes://` URL scheme (a secure
  context, so Web Audio worklets and the microphone work), stores the notes in Documents, and
  handles share, import, microphone permission and the audio session.
- `native/Info.plist`, `native/icons/`: app identity, permissions (microphone), file sharing, icons.
- `component.patch`: small changes to faust-web-component (a `change` event, a `code` property and a
  `stop()` method, used by `app.js`).
- `build-ipa.sh`: builds the `.ipa`. `./build-ipa.sh component` first clones faust-web-component,
  applies `component.patch` and rebuilds it (needs Node.js).

The web app also runs in a browser (notes in localStorage): `cd www && python3 -m http.server`.
