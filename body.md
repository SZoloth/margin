<!-- claude-projects-attribution: {"github_login":"SZoloth"} -->
_Requested by **Sam**_

Before: In CI, the clippy and cargo test steps pipe into `tee`, which always exits 0. A clippy warning or failing test still showed the step as passed.

After: Both steps fail when cargo fails. Evidence files are still uploaded because that step runs `if: always()`.

How: added `set -o pipefail` to the two `run:` blocks in `.github/workflows/ci.yml`. The first CI run may turn red if `main` already has warnings or failures that were hidden. That is the intended effect.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
