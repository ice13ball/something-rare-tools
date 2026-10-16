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

if [[ -n "$(git status --porcelain)" ]]; then echo "working tree not clean" >&2; exit 1; fi

gcloud builds submit --project="$PROJECT" --config=cloudbuild.yaml --substitutions="_IMAGE=${IMAGE_REPO},_SHA=${SHA}" .
gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" --image "$IMAGE" \
  --allow-unauthenticated --min-instances=0 --max-instances=2 --memory=512Mi --cpu=1 \
  --concurrency=40 --timeout=60s --port=8080
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)'
