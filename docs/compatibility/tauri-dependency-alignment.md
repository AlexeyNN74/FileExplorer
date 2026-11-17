# Tauri dependency alignment follow-up for PR #1

## Confirmed cause

The CLI compares major/minor of the resolved Rust crate and installed npm package. It reads the Cargo **workspace** lock. The repository previously ignored `/Cargo.lock` and tracked only `src-tauri/Cargo.lock`, which Cargo does not use for this workspace. Without the root lock the CLI can fall back to the manifest's `2.0.0-rc` requirement before Cargo resolves it. This explains why the reported error can name rc despite a nested lock containing 2.2.2.

A local CLI inspection also confirmed a core mismatch: Rust tauri 2.5.1 versus installed JS API 2.12.5. Dialog was Rust 2.2.2 versus npm 2.8.4. No `--ignore-version-mismatches` bypass is used.

## Bounded correction

| Component | Rust | npm | Decision |
| --- | --- | --- | --- |
| Tauri core | 2.5.1 | @tauri-apps/api 2.5.0 | Same 2.5 release line; retain already resolved Rust version |
| Dialog | 2.2.2 | @tauri-apps/plugin-dialog 2.2.2 | Same stable version; replace prerelease manifest requirement |
| Shell | 2.2.1 | absent | Backend-only plugin; already registered in main.rs, no frontend shell imports, no new npm dependency needed |
| FS | 2.3.0 (transitive from dialog) | absent | No frontend FS plugin imports; no change |
| Build crate | 2.2.0 | not applicable | Independent build crate release; pin existing resolved version |
| CLI | not part of app's Rust graph | @tauri-apps/cli 2.12.5 | Pin the already installed CLI; CLI minor need not match core minor |
| Opener | absent | removed | Unused/unregistered npm package; 2.7.3 required API ^2.12.0; do not add a new native plugin solely to retain an unused dependency |

All direct Rust Tauri declarations and npm Tauri declarations now pin their existing/intended stable versions. The **entire previously tested Rust resolved graph is retained**, including runtime-wry 2.6.0, Wry 0.51.2 and Tao 0.33.0. There is no Rust dependency version update. The tracked root lock includes dependencies previously missing from the stale nested lock, including ssh2; it is the actual existing workspace graph, not the result of a general cargo update.

Only installed npm API and dialog versions change (2.12.5 → 2.5.0, 2.8.4 → 2.2.2); unused opener is removed. Other npm package versions are unchanged. Both lock files are committed to prevent a clean machine or CI from silently resolving a newer Tauri runtime. Use npm ci and Cargo --locked.

## CI regression guard

`cargo fetch --locked` followed by `npm run check:tauri` compares Cargo metadata's direct resolved Tauri dependencies, exact manifest requirements, installed npm versions and package-lock entries. It rejects prerelease/range drift, major/minor mismatches, orphan npm plugins and stale npm locks. It allows different core patch versions and independent CLI/build versions; backend-only shell remains valid. The script uses offline metadata after fetch, requires no Python/TOML parser and is covered by four Node regression tests. Existing frontend tests also run in CI.

## Validation and limits

Before correction, the checker failed for the actual mismatched graph and CLI info reported both core and dialog mismatches. After correction, the consistency guard and all 8 Node tests pass, as do Vite and the locked Linux Rust build. The existing Rust lock was compared before/after and is unchanged; comparison of npm lock versions showed only the three changes listed above. A clean `npm ci` also passes. `npm run tauri -- build --debug --no-bundle` completes the CLI version preflight and builds the Linux application successfully (exit 0). The 5 startup tests and the subprocess logger regression also pass after alignment. Existing CSS/import and Rust warnings remain.

This correction addresses dependency selection and the CLI preflight failure. It does **not** prove native macOS compilation or Explr startup on Catalina. The macOS target/Apple SDK and real Intel iMac are unavailable in this Linux environment. Repeat the original `cargo tauri build --target x86_64-apple-darwin --bundles app` and the [device verification](catalina-verification.md) on the iMac. Do not merge or claim Catalina compatibility on the basis of Linux checks alone.
