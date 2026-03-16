#!/bin/bash

# Deploy to production (Cloudflare Pages via Git)
# Production is tied to the 'main' branch — pushing to main triggers a production build.
# The custom domain tv.gitdocker.com points to the production environment.

# Usage:
#   ./deploy.sh          — commit and push to main (production)
#   ./deploy.sh preview  — deploy a preview build via wrangler

set -e

if [ "$1" = "preview" ]; then
    echo "🚀 Deploying preview build via wrangler..."
    npx wrangler pages deploy . --project-name libretv --commit-dirty=true
else
    echo "🚀 Deploying to production (main branch)..."
    git add -A
    git commit -m "${2:-deploy: update production}" --allow-empty
    git push origin main
    echo "✅ Pushed to main. Cloudflare Pages will build and deploy to tv.gitdocker.com"
fi
