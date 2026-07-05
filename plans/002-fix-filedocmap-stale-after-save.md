# Plan 002: Fix stale fileDocMapRef after document save and rename

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4748020..HEAD -- src/hooks/useDocument.ts src/hooks/__tests__/useDocument.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — additive updates to an in-memory cache; existing reads are unchanged
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4748020`, 2026-06-11

## Why this matters

`useDocument.ts` maintains `fileDocMapRef` — a `Map<string, Document>` keyed by
file path — so that re-opening an already-known file reuses the stable document
ID rather than generating a new one. But the map is only populated at mount
time from `getRecentDocuments`. It is never updated when:

1. A file is saved (the word count changes; ID is stable, but map entry is stale)
2. A file is opened for the first time in this session (map never gains the new entry)
3. A file is renamed (old path removed, new path added; map holds the dead old key)

Bug in scenario 3 (most dangerous): after renaming `/a.md` to `/b.md`, if the
user opens `/b.md` again (e.g., via "Open With" from Finder), `fileDocMapRef.current.get("/b.md")` returns `undefined`. A fresh UUID is generated.
`upsertDocument` resolves the conflict via `UNIQUE(file_path)` and returns the
existing document (correct ID), but only because the DB guard works — the
in-memory map is permanently wrong until the next app restart.

Bug in scenarios 1 and 2: the map misses entries for files opened in a session
that weren't in the recent-docs list at mount. This causes redundant UUID
generation on every re-open, relying entirely on the DB upsert to resolve it —
which is correct but wasteful and masks the symptom.

The fix is to update the map wherever a document is created or mutated in the
session.

## Current state

- `src/hooks/useDocument.ts` — `fileDocMapRef` at line 84, populated at line 97:

```typescript
// src/hooks/useDocument.ts:84-99
const fileDocMapRef = useRef<Map<string, Document>>(new Map());

useEffect(() => {
  getRecentDocuments(20)
    .then((docs) => {
      setRecentDocs(docs);
      for (const d of docs) {
        if (d.source === "keep-local" && d.keep_local_id) {
          keepLocalDocMapRef.current.set(d.keep_local_id, d);
        }
        if (d.file_path) {
          fileDocMapRef.current.set(d.file_path, d);  // ONLY update site
        }
      }
    })
    .catch(console.error);
}, []);
```

Map is read at lines 130 and 167 in `openFile` and `openFilePath` respectively:
```typescript
// src/hooks/useDocument.ts:130 (openFile)
const existing = currentDoc?.file_path === selectedPath
  ? currentDoc
  : fileDocMapRef.current.get(selectedPath);

// src/hooks/useDocument.ts:167 (openFilePath)
const existing = currentDoc?.file_path === path
  ? currentDoc
  : fileDocMapRef.current.get(path);
```

The `saved` document (from `upsertDocument`) has the canonical ID and file_path.
After any successful `upsertDocument` on a file-backed doc, the map should be
updated.

Four mutations that should also update the map:
1. `openFile` — calls `upsertDocument`, returns `saved`; map gets new entry
2. `openFilePath` — same pattern
3. `saveCurrentFile` — calls `upsertDocument` with updated word_count; map entry is stale but key is unchanged (refresh is benign)
4. `renameDocFile` — old path removed, new path added with updated document

Convention in this file: `keepLocalDocMapRef` is updated after `upsertDocument`
in `openKeepLocalArticle` at line 238:
```typescript
if (saved.keep_local_id) {
  keepLocalDocMapRef.current.set(saved.keep_local_id, saved);
}
```
Match this pattern for `fileDocMapRef`.

## Commands you will need

| Purpose   | Command                              | Expected on success        |
|-----------|--------------------------------------|----------------------------|
| Typecheck | `./node_modules/.bin/tsc --noEmit`   | exit 0, no errors          |
| Tests     | `pnpm test -- useDocument`           | all pass                   |
| Full test | `pnpm test`                          | all pass                   |

## Scope

**In scope** (the only files you should modify):
- `src/hooks/useDocument.ts`
- `src/hooks/__tests__/useDocument.test.ts` (add tests)

**Out of scope** (do NOT touch):
- `keepLocalDocMapRef` — the keep-local map is handled correctly; do not change it
- App.tsx — the document hook is the correct layer for this fix
- Any Rust/backend code

## Git workflow

- Branch: `fix/002-filedocmap-stale`
- Commit style: `fix(hooks): keep fileDocMapRef in sync after open/save/rename`
- Do NOT push or open a PR unless the operator instructed it

## Steps

### Step 1: Update `openFile` to refresh the map after successful upsert

In `openFile` (around line 145 of `useDocument.ts`), after:
```typescript
const saved = await upsertDocument(doc);
```
add:
```typescript
fileDocMapRef.current.set(saved.file_path!, saved);
```

The `!` is safe here because `openFile` only runs for `source: "file"` docs —
`file_path` is always set.

**Verify**: `./node_modules/.bin/tsc --noEmit` → exit 0

### Step 2: Update `openFilePath` to refresh the map after successful upsert

In `openFilePath` (around line 182), after:
```typescript
const saved = await upsertDocument(doc);
```
add:
```typescript
fileDocMapRef.current.set(saved.file_path!, saved);
```

**Verify**: `./node_modules/.bin/tsc --noEmit` → exit 0

### Step 3: Update `saveCurrentFile` to refresh the map

In `saveCurrentFile` (around line 291), after:
```typescript
const saved = await upsertDocument(updated);
setCurrentDoc(saved);
refreshRecentDocs();
```
add (before `refreshRecentDocs`):
```typescript
if (saved.file_path) {
  fileDocMapRef.current.set(saved.file_path, saved);
}
```

**Verify**: `./node_modules/.bin/tsc --noEmit` → exit 0

### Step 4: Update `renameDocFile` to remove old path and add new path

In `renameDocFile` (around line 251), after:
```typescript
const updated = await renameFile(targetDoc.file_path, newName);
if (currentDoc?.id === targetDoc.id) {
  setCurrentDoc(updated);
  setFilePath(updated.file_path);
}
refreshRecentDocs();
```
add (before `refreshRecentDocs`):
```typescript
// Remove old path, add new path in the cache
if (targetDoc.file_path) {
  fileDocMapRef.current.delete(targetDoc.file_path);
}
if (updated.file_path) {
  fileDocMapRef.current.set(updated.file_path, updated);
}
```

**Verify**: `./node_modules/.bin/tsc --noEmit` → exit 0

### Step 5: Add tests

In `src/hooks/__tests__/useDocument.test.ts`, find the existing test pattern
(look for `describe("useDocument"` or the first `it(` block) to understand
mock shape. Add tests that verify:

1. After `openFilePath`, re-opening the same path uses the same document ID
   (map hit, not a new UUID generated)
2. After `renameDocFile`, opening the new path uses the existing document ID

These tests will need to mock `upsertDocument` and `renameFile` from
`@/lib/tauri-commands`. See existing tests in the file for the mock pattern.

**Verify**: `pnpm test -- useDocument` → all pass, including the 2 new tests

## Test plan

Two new tests in `src/hooks/__tests__/useDocument.test.ts`:
- "re-opening a file after openFilePath reuses the same document ID"
- "after renameDocFile, the new path resolves to the existing document"

Model after the existing `useDocument.test.ts` hook test patterns. Run
`pnpm test -- useDocument` after writing tests to confirm pass.

## Done criteria

- [ ] `./node_modules/.bin/tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0, 2 new useDocument tests pass
- [ ] `grep -n "fileDocMapRef.current.set" src/hooks/useDocument.ts` returns at least 4 matches (mount + openFile + openFilePath + saveCurrentFile + renameDocFile)
- [ ] `grep -n "fileDocMapRef.current.delete" src/hooks/useDocument.ts` returns 1 match (in renameDocFile)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- The `useDocument.ts` code at the excerpted lines does not match (file has been refactored)
- `upsertDocument` or `renameFile` return types have changed from `Document`
- `file_path` is not guaranteed to be set on the returned `saved` document (check: add a guard instead of `!`)
- `pnpm test` was already failing before this change (pre-existing failure — report, don't mask)

## Maintenance notes

- `fileDocMapRef` is not persisted across app restarts — it's purely a session-level cache. The DB upsert is always the authoritative source; this fix removes redundant UUID generation and keeps the cache warm.
- If a second open-document variant is added (e.g., `openFileFromURL`), apply the same `fileDocMapRef.current.set` pattern there.
- Future: consider whether `keepLocalDocMapRef` and `fileDocMapRef` should be unified into a single `docCacheRef` keyed by a discriminated union.
