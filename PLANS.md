# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Build an isolated Margin-to-Vale adapter spike on branch `feat/distribution-finetuning-research`.

### Outcome

The experiment compiles reviewed, executable Margin rules into a temporary Vale style, compares raw-regex and markup-aware diagnostics against labeled fixtures, and produces a read-only report against the live database.

### Constraints

- Keep implementation under `experiments/vale-adapter/` with no production imports.
- Keep SQLite authoritative. Generated Vale files are temporary derived artifacts.
- Reject a live immutable read when a non-empty WAL exists.
- Do not edit the current guard generator, MCP server, Tauri app, or database.
- Pin and report the Vale source revision used for the spike.
- Run the standard verification gate, stage only this lane's files, commit, and push.

### Steps

1. Add synthetic rules, labeled Markdown cases, and failing contract tests.
2. Implement the rule compiler, raw-regex baseline, Vale JSON parser, and scorer.
3. Implement immutable live-rule loading and a CLI report.
4. Build Vale from a pinned source revision and run the live spike.
5. Record the decision, verify, commit, and push.

### Boundary

The main checkout was clean at the start of this task. This spike stays outside production code and does not overlap the concurrent application lane.

### Decisions

- Margin's database remains authoritative. Vale projects exist only in temporary directories.
- General rules apply to every run. Writing-type rules join the active style only for their matching type.
- Vale diagnostics map back to Margin rule IDs so evaluation output preserves provenance.
- The adapter remains an optional evaluation path until it passes a 30-document private-corpus test.

### Results

- All 16 live executable rules compiled against Vale revision `8fe98044d4bc90e5291372a183b4c7021490aa09`.
- The raw-regex baseline scored 3 true positives, 2 false positives, and 0 false negatives across six synthetic Markdown cases.
- Vale scored 3 true positives, 0 false positives, and 0 false negatives. Markup parsing removed the fenced-code and inline-code errors.
- The live database SHA-256 remained `e71e26e771432babbd96978d4d77d9b399143988df5bd83048019feb910248d3`.

### Surprises

- Vale accepted all current Python-style detection patterns without translation changes.
- The first standard verification run stopped at the documented MCP Node runtime mismatch because the pinned local path had moved. Rerunning with Node 22.23.1 passed.

### Verification

- Eight Vale adapter tests pass across four files.
- Strict adapter TypeScript compilation passes.
- The pinned live comparison passes and does not modify SQLite.
- `MCP_NODE_BIN=/opt/homebrew/Cellar/node@22/22.23.1/bin/node scripts/verify standard` passes, including 292 frontend tests, 18 post-training tests, 8 adapter tests, the production build, 184 MCP tests, MCP TypeScript, and the gap audit.

### Handoff

The spike supports a private 30-document evaluation before any production dependency decision. No production code, schema, guard generator, MCP implementation, Tauri surface, or private corpus text changed.
