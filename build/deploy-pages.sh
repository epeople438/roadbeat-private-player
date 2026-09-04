#!/usr/bin/env bash
# Builds the static site and publishes it to the gh-pages branch, which is what
# GitHub Pages serves. Run from the project root:
#
#   npm run deploy
#
# Only build output reaches gh-pages; the source lives on main. Nothing here
# touches the music library, which never leaves the phone.
set -euo pipefail

REMOTE="${ROADBEAT_REMOTE:-origin}"
BRANCH="gh-pages"
WORKTREE="$(mktemp -d)"
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true; rm -rf "$WORKTREE"' EXIT

if [ -n "$(git status --porcelain)" ]; then
  echo "warning: working tree has uncommitted changes; deploying them anyway" >&2
fi

echo "==> building"
npm run build:pages

echo "==> preparing $BRANCH worktree"
git fetch "$REMOTE" "$BRANCH"
git worktree add --force "$WORKTREE" "$REMOTE/$BRANCH" --detach >/dev/null

echo "==> replacing published files"
find "$WORKTREE" -mindepth 1 -not -path "$WORKTREE/.git*" -delete
cp -R dist-pages/. "$WORKTREE"/

cd "$WORKTREE"
if [ -z "$(git status --porcelain)" ]; then
  echo "==> no change to publish"
  exit 0
fi

git add -A
git commit -q -m "Deploy build from main $(git -C "$OLDPWD" rev-parse --short HEAD)"
git push "$REMOTE" "HEAD:$BRANCH"
echo "==> published to https://epeople438.github.io/roadbeat-private-player/"
