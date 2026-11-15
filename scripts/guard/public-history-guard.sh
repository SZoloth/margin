#!/bin/sh
# Keeps Margin's private history out of the public repo (github.com/SZoloth/margin).
#
# The public repo's history starts at one commit, f1bac0f. Anything that reaches a
# different root commit came from the private repo (or somewhere else) and must
# not be pushed here.
#
#   As a git pre-push hook: copy or symlink to .git/hooks/pre-push. It only acts
#   when the push goes to github.com/SZoloth/margin, so it is safe to install in
#   the private clone too, where it is the hook that matters.
#
#   As a check:  scripts/guard/public-history-guard.sh --check [rev]   (CI uses this)

PUBLIC_ROOT=f1bac0fab3837cd332e9bf1441a250ffe7a61379

foreign_roots() {
  # Prints every root commit reachable from $1 other than the public root.
  git rev-list --max-parents=0 "$1" | grep -v "^$PUBLIC_ROOT\$"
}

if [ "$1" = "--check" ]; then
  rev="${2:-HEAD}"
  if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
    echo "public-history-guard: shallow clone, fetch full history first (fetch-depth: 0)" >&2
    exit 2
  fi
  bad=$(foreign_roots "$rev")
  if [ -n "$bad" ]; then
    echo "public-history-guard: $rev contains history that is not from the public repo." >&2
    echo "Foreign root commits: $bad" >&2
    exit 1
  fi
  echo "public-history-guard: ok, all history of $rev starts at ${PUBLIC_ROOT%"${PUBLIC_ROOT#???????}"}"
  exit 0
fi

# pre-push mode: $1 = remote name, $2 = remote URL, refs on stdin.
url=$(printf '%s' "$2" | tr 'A-Z' 'a-z' | sed -e 's#/*$##' -e 's#\.git$##')
case "$url" in
  *github.com/szoloth/margin|*github.com:szoloth/margin|*/git/szoloth/margin) ;;
  *) exit 0 ;;
esac

zero=0000000000000000000000000000000000000000
status=0
while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$zero" ] && continue
  bad=$(foreign_roots "$local_sha")
  if [ -n "$bad" ]; then
    echo "BLOCKED: $local_ref carries private Margin history; $2 is the PUBLIC repo." >&2
    echo "Foreign root commits: $bad" >&2
    echo "Push it to the private repo instead, or rebuild the branch from the public main." >&2
    status=1
  fi
done
exit $status
