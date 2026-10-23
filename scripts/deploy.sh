#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
#
# Build the image with Cloud Build and deploy the single Cloud Run service.
# The project is always passed explicitly: the Mac's default gcloud project is a different one.
set -euo pipefail
PROJECT=something-rare
REGION=europe-west1
SERVICE=abyssal-tools
SHA=$(git rev-parse --short HEAD)
IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT}/abyssal/tools"
IMAGE="${IMAGE_REPO}:${SHA}"

# Gate: the deployed code must equal the public source and pass its tests. There is no override flag on purpose.
refuse() { echo "deploy refused: $*" >&2; exit 1; }

[[ -z "$(git status --porcelain)" ]] || refuse "working tree not clean"
git fetch --quiet origin main || refuse "cannot fetch origin/main"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] \
  || refuse "HEAD $(git rev-parse --short HEAD) is not origin/main $(git rev-parse --short origin/main); push or check out main first"
[[ -d node_modules ]] || refuse "node_modules missing; run npm ci (tests must run, not be skipped)"
# The golden test (real records, kept outside the repo) is part of npm test, but it skips itself when GOLDEN_DIR is unset.
# Default to the local golden set so the gate really runs it; if that is missing too, say so out loud instead of skipping silently.
GOLDEN_DEFAULT=/Users/ice13ball/data/sprawdzarka-golden/2026-10-16
if [[ -z "${GOLDEN_DIR:-}" ]]; then
  if [[ -d "$GOLDEN_DEFAULT" ]]; then
    export GOLDEN_DIR="$GOLDEN_DEFAULT"
  else
    echo "WARNING: golden skipped - GOLDEN_DIR is unset and $GOLDEN_DEFAULT does not exist; the golden regression test did NOT run" >&2
  fi
fi
[[ -z "${GOLDEN_DIR:-}" ]] || echo "golden test runs on $GOLDEN_DIR"
npm test || refuse "tests failed"
# The wall-clock test is not part of the full suite (under its parallel load the 2 s threshold measures the machine): it runs here, ALONE,
# after the suite, with its threshold unchanged. A failure refuses the deploy like any other test.
npm run test:perf || refuse "performance test failed"
npm run typecheck || refuse "type check failed"

gcloud builds submit --project="$PROJECT" --config=cloudbuild.yaml --gcs-source-staging-dir=gs://something-rare-cloudbuild-src/source --substitutions="_IMAGE=${IMAGE_REPO},_SHA=${SHA}" .
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image "$IMAGE" \
  --allow-unauthenticated --min-instances=0 --max-instances=2 --memory=512Mi --cpu=1 \
  --concurrency=40 --timeout=60s --port=8080
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)'
