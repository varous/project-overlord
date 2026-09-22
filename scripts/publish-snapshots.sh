#!/usr/bin/env bash
# Publish CI screenshots to the `snapshots` orphan branch.
#
# Required env: BRANCH_NAME, GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_RUN_ID
# Optional env: DEPLOY_URL, ONLINE_OUTCOME, GITHUB_WORKSPACE
#
# Layout: <branch-slug>/<short-sha>/ and <branch-slug>/latest/, each holding the PNGs,
# ground-height.json and metadata.json. Never force-pushes.
set -euo pipefail

BRANCH_NAME="${BRANCH_NAME:?BRANCH_NAME is required}"
SHORT_SHA="${GITHUB_SHA:0:7}"
BRANCH_SLUG="${BRANCH_NAME//\//-}"
RUN_URL="https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
ONLINE_OUTCOME="${ONLINE_OUTCOME:-unknown}"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WORKSPACE="${GITHUB_WORKSPACE:-$(pwd)}"
OUT_SRC="${WORKSPACE}/e2e-output"
DEST="/tmp/snapshots-branch"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

if git ls-remote --exit-code --heads origin snapshots >/dev/null 2>&1; then
  git fetch origin snapshots
  git worktree add -B snapshots "$DEST" FETCH_HEAD
  cd "$DEST"
else
  git worktree add --detach "$DEST" HEAD
  cd "$DEST"
  git checkout --orphan snapshots
  git rm -rf . >/dev/null 2>&1 || true
  {
    echo "# project-overlord CI screenshots"
    echo
    echo "This orphan branch holds CI-generated screenshots only. Do not put source code here."
  } > README.md
fi

mkdir -p "$BRANCH_SLUG/$SHORT_SHA" "$BRANCH_SLUG/latest"
mkdir -p "$OUT_SRC"
if [ ! -f "$OUT_SRC/ground-height.json" ]; then
  printf '{"skipped":"online smoke did not produce a height"}\n' > "$OUT_SRC/ground-height.json"
fi
if [ ! -f "$OUT_SRC/console.json" ]; then
  printf '{"errors":[],"warnings":[],"failedRequests":[],"tilesLoaded":{}}\n' > "$OUT_SRC/console.json"
fi

copy_artifacts() {
  local dest_dir="$1"
  find "$OUT_SRC" -maxdepth 1 -type f \
    \( -name '*.png' -o -name 'ground-height.json' -o -name 'console.json' \) \
    -exec cp {} "$dest_dir/" \;
}

copy_artifacts "$BRANCH_SLUG/$SHORT_SHA"
copy_artifacts "$BRANCH_SLUG/latest"

GROUND_HEIGHT_JSON="$(cat "$OUT_SRC/ground-height.json")"
if [ -z "${DEPLOY_URL:-}" ]; then
  DEPLOY_JSON="null"
else
  DEPLOY_JSON="$(jq -Rn --arg v "$DEPLOY_URL" '$v')"
fi

write_metadata() {
  local dest_dir="$1"
  jq -n \
    --arg sha "$GITHUB_SHA" \
    --arg branch "$BRANCH_NAME" \
    --arg runUrl "$RUN_URL" \
    --arg createdAt "$CREATED_AT" \
    --arg onlineSmokeOutcome "$ONLINE_OUTCOME" \
    --argjson groundHeight "$GROUND_HEIGHT_JSON" \
    --argjson deployUrl "$DEPLOY_JSON" \
    '{
      sha: $sha,
      branch: $branch,
      runUrl: $runUrl,
      deployUrl: $deployUrl,
      createdAt: $createdAt,
      onlineSmokeOutcome: $onlineSmokeOutcome,
      groundHeight: $groundHeight
    }' > "$dest_dir/metadata.json"
}

write_metadata "$BRANCH_SLUG/$SHORT_SHA"
write_metadata "$BRANCH_SLUG/latest"

git add -A
if git diff --cached --quiet; then
  echo "No snapshot changes to commit."
  exit 0
fi

git commit -m "snapshots: ${BRANCH_NAME} @ ${SHORT_SHA}"

for attempt in 1 2 3; do
  if git push origin snapshots; then
    echo "Pushed snapshots branch (attempt ${attempt})."
    exit 0
  fi
  echo "Push rejected; rebasing onto origin/snapshots and retrying (attempt ${attempt})."
  git pull --rebase origin snapshots || true
done

echo "::error::Failed to push the snapshots branch after 3 attempts."
exit 1
