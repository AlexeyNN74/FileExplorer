# Catalina frontend startup investigation

## Evidence before changes

The user reports a successful locked x86_64 macOS app build and a native window displaying **App.jsx's React ErrorFallback** on a real 2013 iMac. This proves that this run reached index.html, loaded/executed the main JS graph and mounted React far enough to catch a descendant exception. It does not prove the main UI, IPC calls, every resource or WebKit API works. The exact exception, WebKit version and user agent have not yet been supplied.

Confirmed source-level incompatibility: ThemeProvider unconditionally called `MediaQueryList.addEventListener('change', ...)` in its mount effect. MediaQueryList inherited EventTarget only in Safari 14; Safari 13 supports addListener/removeListener instead. The old call throws TypeError on a faithful legacy API fixture; a React effect error can be caught by the boundary. [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/MediaQueryList.json), EventTarget_inheritance, records Safari 14 and addListener since 5.1. **This is a confirmed compatibility defect, not a confirmed diagnosis of this particular iMac's exception.** Catalina may have newer WebKit installed; obtain the user agent and actual error.

Confirmed build requirement gap: Vite 6's installed default build target includes safari14 (node_modules/vite/dist/node/constants.js); no override existed. Catalina originally shipped Safari 13. An explicit safari13 target transforms optional chaining/nullish syntax and other supported lowerings. It does not polyfill DOM/JavaScript runtime APIs or prove execution on the device. React 19 is not replaced: its core Promise/Map/Set/Symbol requirements are available in Safari 13, and no evidence justifies a React downgrade. The application guards ResizeObserver; matchMedia now has both modern and legacy subscription paths. Storage access and malformed saved sidebar JSON remain possible causes, not patched without a report.

Native graph stays tauri 2.5.1, runtime-wry 2.6.0, Wry 0.51.2, Tao 0.33.0. No dependency versions change. The earlier objc2 debug-only protocol-registration issue remains documented separately. Wry guards `shouldPerformDownload` with respondsToSelector. A native window and working React boundary demonstrate native startup progressed for this run, not that every native/WebKit feature supports Catalina.

## Resources, CSP and IPC

The built index references local `/assets/*.js`, `/assets/*.css`, the local favicon and the new classic bootstrap. `frontendDist` resolves to Vite's dist directory. The automated build check verifies each generated HTML resource actually exists, and the bootstrap precedes the module graph. Root paths are normal for Tauri's local URL-scheme handler; no observed missing-resource evidence warrants a base-path or scheme rewrite.

CSP remains unchanged; no unsafe-eval, wildcard script origin or macOS security bypass is added. Tauri's codegen handles embedded asset CSP. The pre-existing Google font stylesheet injected in main.jsx is blocked by default-src self (cosmetic font fallback); it does not explain an ErrorBoundary exception on its own. The new bootstrap records securitypolicyviolation events for investigation. A successful Node asset check cannot validate real custom-scheme loading or CSP enforcement on Catalina.

Settings/theme startup invokes Rust commands. withGlobalTauri=false does not disable the imported @tauri-apps/api IPC bridge. SettingsProvider handles rejected calls; no actual IPC error has been supplied. RUST_LOG/RUST_BACKTRACE do not capture JavaScript render errors; EXPLR_DIAGNOSTICS is a separate explicit process flag. Native crashes, a missing bootstrap itself, and a WebKit process crash cannot be diagnosed by the JavaScript error boundary.

## Implementation

- `src/utils/mediaQuery.js`, `src/providers/ThemeProvider.jsx`: feature-detected modern/legacy listeners with matching cleanup; preserve theme behavior.
- `vite.config.js`: explicit safari13 syntax target; no mass polyfills or dependency upgrades.
- `public/startup-diagnostics.js`, `index.html`: dependency-free classic ES5 bootstrap before module evaluation. Capture resource/JS/unhandled-promise/CSP errors in bounded session memory and show a generic screen if the root has no interface. Never replace an existing React screen.
- `src/App.jsx`: retain the actual caught error; a user can explicitly reveal message, JS stack, React component stack and bootstrap context (user agent, local URL, events). No automatic upload, HTML injection or default exception display. Existing opt-in native JSON persistence is preserved.
- `tests/startupCompatibility.test.js`: legacy/modern API behavior and cleanup; early script failure without React/IPC; bounded events and preservation of existing UI.
- `scripts/check-frontend-build.js`, `.github/workflows/test-only.yml`: check target, embedding path, asset existence and bootstrap order after every frontend build.

## Fresh local validation (Linux)

`node --test tests/*.test.js`: 12 passed. `npm run build`: passed (existing CSS @media/import warnings remain). `node scripts/check-frontend-build.js`: passed, four local assets verified. `npm run check:tauri`: passed, locked graph unchanged. `npm run tauri -- build --debug --no-bundle`: tested separately; this embeds assets and runs CLI preflight but is not a native macOS execution test. See the PR's GitHub Actions checks for the exact pushed revision; do not substitute previous green runs.

No real Catalina/browser engine is available here. The Node tests simulate the relevant old API contract and early error paths; they do not execute WebKit or render React end-to-end. The original iMac exception remains unconfirmed until a report is collected. Do not mark the startup problem solved or merge based solely on these checks.

## Exact iMac verification

1. Fetch the latest PR #1 branch and record `git rev-parse HEAD`, `sw_vers`, `uname -m`. Close existing Explr processes. From the project root:

```sh
npm ci
cargo fetch --locked
npm run check:tauri
node --test tests/*.test.js
npm run build
node scripts/check-frontend-build.js
cargo tauri build --target x86_64-apple-darwin --bundles app -- --locked
```

2. Launch the newly built app's executable (replace the project path with the actual absolute path; do not run an older installed copy):

```sh
cd /
EXPLR_DIAGNOSTICS=1 "/absolute/path/FileExplorer/target/x86_64-apple-darwin/release/bundle/macos/Explr.app/Contents/MacOS/src-tauri" > "$TMPDIR/explr-startup.txt" 2>&1
```

3. If ErrorFallback or the new early-load screen appears, click **Show diagnostic details**. Select/copy the displayed JSON text into a local file. It includes the actual exception, stacks where available, userAgent and resource/CSP events, and works even if native IPC is broken. Review personal paths before sharing. For React boundary failures with working IPC also collect `~/Library/Logs/com.explr.app/frontend-error.json`. A pre-React failure is held in session memory only; absence of the native file is then expected. Do not infer absence of an error from an absent file.
4. If the main UI opens, verify directory listing, navigation, settings, system theme changes, file preview and normal restart; record each result. Repeat by opening this same .app in Finder and by direct launch from another directory. Check settings stay in the standard app directory. Disable EXPLR_DIAGNOSTICS for ordinary launches; it does not automatically delete old reports.
5. If the screen is entirely blank and no diagnostic button exists, capture stderr and a new sample; bootstrap/WebKit execution may itself have failed. Send the exact revision, userAgent if obtainable, OS version, report text and actual launch path. Unrelated WebKit system-log events remain hypotheses until correlated by process/time.

A successful real-device main-interface launch and these feature checks are required before declaring the reported issue resolved.
