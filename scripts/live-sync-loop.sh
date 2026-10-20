#!/bin/bash
# Retired. The local git-push loop raced the old GitHub Action and is no longer
# the source of live scores. Use the Vercel Cron (every 5 minutes during an
# event window) or:
#
#   npx tsx scripts/sync-brackets.ts
#   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
#     "$PUBLIC_SITE_URL/api/cron/sync-brackets?force=1"
#
echo "scripts/live-sync-loop.sh is retired. Use Vercel Cron or: npx tsx scripts/sync-brackets.ts" >&2
exit 1
