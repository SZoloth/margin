# Production Readiness — 2026-08-06

## Decision

Margin is ready for a private pilot after this branch is reviewed and merged. A broad release remains blocked until the signed distribution path and recovery procedure pass on a clean Mac.

## Verified evidence

- One `scripts/verify data-layer` run passed 294 frontend tests, 184 MCP tests, 232 Rust tests, both production builds, the harness gap audit, `cargo check`, and Clippy with warnings denied.
- The production JavaScript dependency audit and RustSec audit report zero known vulnerabilities. RustSec still reports unmaintained transitive packages in the cross-platform graph, which remain a dependency-maintenance risk rather than a reported vulnerability.
- Tauri was upgraded to 2.11.5, which includes the custom-command remote-origin security fix. Margin now sets a content security policy and limits filesystem access to user-selected documents, previously opened documents, and the Claude integration directory.
- Search snippets are escaped before rendering. Regression tests cover malicious markup and preserve the intended search highlight tags.
- Startup now checks SQLite integrity, creates an online database backup before migrations, and retains the five newest backups.

## Distribution evidence

The local release build produced `Margin.app` and the updater archive. Updater signing then stopped because the local environment does not hold the private updater key, as intended. The resulting app has an ad hoc signature and cannot stand in for a signed release test.

The July 6 release attempt failed when Apple notarization returned HTTP 403 for a missing or expired agreement. The current main-branch CI rerun is queued after GitHub reported an Actions service outage on August 6.

## Remaining launch gates

1. Resolve the Apple Developer agreement and run the release workflow with the stored signing and updater secrets.
2. Install the notarized build on a clean Mac, then complete one signed updater round trip.
3. Restore a copy of a real Margin database from a generated startup backup and verify documents, annotations, corrections, and writing rules.
4. Run a private pilot with a user Sam names and capture a real draft, correction, synthesized rule, evaluation result, and return-use decision.
5. Require the production verification job on `main` before merging release changes.

## Stop condition

Do not call Margin production ready or publish a broad release while any launch gate is open. Pause the pilot if Margin loses user content, grants access outside approved paths, produces an unverifiable rule, or cannot recover from its newest healthy backup.
