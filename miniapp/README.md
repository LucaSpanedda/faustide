# Faust IDE as a macOS application

A native macOS app (`/Applications/Faust IDE.app`) made of the Electron runtime, `main.js`
and a copy of the IDE build (`../dist`). It opens in well under a second, works offline and
does not need npm or a local server at launch.

Compared to the IDE in a browser tab:

- audio, timers and meters keep full speed when the window is in the background
  (renderer backgrounding and timer throttling are disabled);
- microphone and MIDI permissions are always granted;
- window size and position are remembered, a second launch focuses the open window;
- links (documentation etc.) open in the default browser.

## Install

The probes need the `probes` branch of faustwasm, linked in place of the npm package (with
the npm package the IDE works, without the Probes tab):

```bash
git clone -b probes https://github.com/LucaSpanedda/faustwasm.git
git clone -b macos-app https://github.com/LucaSpanedda/faustide.git
cd faustwasm && npm install && npm run build && cd ..
cd faustide
npm install
rm -rf node_modules/@grame/faustwasm && ln -s ../../../faustwasm node_modules/@grame/faustwasm
npm run dist                 # builds the IDE into dist/
cd miniapp
npm install                  # Electron runtime
./build-app.sh install       # builds and copies "Faust IDE.app" to /Applications
```

After changing the IDE: `npm run dist` in the repository root, then `./build-app.sh install` here.

Update to the latest IDE from Grame (on the `macos-app` branch):

```bash
git remote add upstream https://github.com/grame-cncm/faustide.git   # only once
git fetch upstream
git merge upstream/master
npm install && npm run dist
cd miniapp && ./build-app.sh install
git push origin macos-app
```

After a merge from Grame, `npm install` restores the npm faustwasm: link the probes branch again
before `npm run dist`. To go back to a known version: `git checkout macos-app-ide-1.14.0` (or
`macos-app-ide-1.10.3`), then `npm install && npm run dist` and `./build-app.sh install`.

`./build-app.sh` alone builds the app into `miniapp/build/` without installing it.
`npm start` runs the same window without packaging (development).

## Files

- `main.js`: the Electron main process (window, permissions, background audio).
- `build-app.sh`: copies `Electron.app` from `node_modules`, adds `main.js` and `dist/`,
  sets name, identifier and icon, signs the bundle ad hoc.
- `icon.icns`: application icon.

The IDE data (open files, settings) is kept in `~/Library/Application Support/faustide-mini`.
