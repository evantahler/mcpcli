#!/bin/bash
set -e

MAIN=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
MAIN_BRANCH=$(git -C "$MAIN" rev-parse --abbrev-ref HEAD)

if [ "$MAIN_BRANCH" = "main" ]; then
  echo "Main worktree is on main — pulling latest"
  git -C "$MAIN" pull
else
  echo "Main worktree is on $MAIN_BRANCH — fetching"
  git -C "$MAIN" fetch
fi
