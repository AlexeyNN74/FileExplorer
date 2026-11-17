# Validation evidence

This is the original startup-fix validation snapshot. The dependency follow-up (committed root locks and version alignment) is recorded separately in [tauri-dependency-alignment.md](tauri-dependency-alignment.md).

Date: 2026-11-17. Base commit: `22b69f5a677f23ec96f0578acdcf6ce76a2db60b`. Work is on `fix/catalina-startup-diagnostics` in **AlexeyNN74/FileExplorer**, not the upstream repository.

Execution environment: Debian 13 Linux x86_64, Rust 1.100.0, Node 24.22.1, npm 11.9.0. Local dependency graph: tauri 2.5.1, tauri-runtime-wry 2.6.0, wry 0.51.2, objc2 0.6.1 (plus 0.5.2). The user's macOS graph (tauri 2.12.6 / runtime-wry 2.12.4 / tao 0.37.2 / objc2 0.6.5) was examined from published crate sources, not built/run here. Tracked dependency declarations and lock versions were not updated.

| Requirement / command | Fresh result | Status / limits |
| --- | --- | --- |
| Bootstrap regression against old implementation: `cargo test --locked settings_write_failure_does_not_deadlock_logger -- --nocapture` | exit 101; child hung until 5-second deadline | Demonstrated old recursion after settings write failure on Linux; final portable child test uses a file as the config directory instead of a protected system cwd |
| Same regression after correction | exit 0; 1 passed, child completes in ~0.02 s | Confirmed no recursive logger deadlock; explicit paths remain fixed after changing cwd; logger attaches real settings after fallback initialization |
| `cargo test --locked startup::tests -- --test-threads=1` | exit 0; 5 passed | Explicit migration, no overwrite, invalid source, path rebasing; diagnostic opt-in/no-write default, message/JS/React round-trip, limits, Unix 0600, one-file replacement |
| `cargo test --locked state::settings_data:: -- --test-threads=1` | exit 0; 20 passed | Settings behavior regression |
| `cargo test --locked state::logging:: -- --test-threads=1` | exit 0; 13 passed including bootstrap regression | Logging behavior regression |
| `cargo test --locked -- --test-threads=1` | exit 0; **242 passed, 0 failed, 0 ignored**, ~154 s | Linux base suite. Initial onboarding baseline was 234 passed / 2 failed out of 236; concurrent-search/cancel tests passed in isolated reruns. Their pre-existing intermittency is not claimed fixed by this PR |
| `node --test tests/errorDiagnostics.test.js` | exit 0; **4 passed** | Payload fields/limits, non-Error throws, hostile getters, disabled/local status, broken IPC. This is not an end-to-end Catalina React rendering test |
| `npm run build` | exit 0; 110 modules | Existing CSS `@media` and mixed dynamic/static import warnings remain |
| `cargo build --locked` | exit 0 | Linux native build. Existing unused-import/assignment/dependency warnings remain |
| `cargo check --locked --target x86_64-apple-darwin --profile catalina-dev` | exit 101, E0463: Apple target's `core` not installed | Cargo accepts the custom profile. No macOS build/runtime or profile efficacy claim; Apple SDK/device checks remain required |
| `rustfmt --edition 2021 --check src-tauri/src/startup.rs` | exit 0 | New Rust module formatted |
| `cargo fmt --all -- --check` | exit 1 | Repository-wide formatting differences, including unchanged command modules. No whole-repository formatting churn introduced |
| `git diff --check` | exit 0 | No whitespace errors |

The existing Linux test workflow now also executes the frontend diagnostic tests and Vite build. That workflow has not yet been observed on GitHub for this branch.

Native GUI startup in this cloud image remains blocked by WebKit helper locations in its read-only system installation. Earlier local path-mapping experiments produced WebKit/ptrace errors, so no Linux GUI success is claimed. No macOS system library, Gatekeeper, SIP or WebKit security setting was changed or bypassed.

## Acceptance mapping

- Dev crash cause: identified from dependency source and supplied error; profile mitigation prepared; **partial**, device validation pending.
- Original React exception cause: **unverified** until a real report is collected. Error-boundary reporting implemented and tested at JS/native seams; no speculative UI fix.
- Finder cwd/logger recursion: source mechanism and Linux deadlock regression **confirmed**; standard Tauri paths, startup order and explicit import implemented. Real Finder behavior remains **unverified**.
- Other OS support: Linux builds/tests pass; Windows/macOS path resolution uses Tauri APIs, but their runtime verification remains pending.
- Merge/release readiness: **not approved**. See [catalina-verification.md](catalina-verification.md); the PR must remain draft until device verification.
