# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

Learn mode is implemented on `cursor/learn-mode-9cf3`.

Type the open document, the selection, or a highlight over a dimmed copy. Correct letters brighten, a miss is an underline and does not block, and Escape returns the reader caret to that spot. Progress lives in `localStorage["margin-learn-progress"]` only.

Entry: Cmd/Ctrl+Shift+L, the chrome Learn button, the selection toolbar, a highlight's note card, the command palette, and View → Learn This Text.

Verified here with unit tests and the `learn-mode` drive.mjs journey (light and dark). A native Tauri/WebKit build was not run on this machine.
