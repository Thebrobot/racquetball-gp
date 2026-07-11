#!/bin/bash
# Local live-sync loop for the Sarasota Open weekend.
#
# Runs the R2 bracket scrape + GP points refresh roughly every 10 minutes,
# committing and pushing any changes (each push triggers a site redeploy).
# Acts as a fallback/companion to the scheduled GitHub Action, and exits on
# its own after Mon Jul 13 2026 06:00 UTC (Sunday night ET).
#
# Usage:  bash scripts/live-sync-loop.sh

set -u
cd "$(dirname "$0")/.."
unset PLAYWRIGHT_BROWSERS_PATH

SYNC_FILES=(src/data/sarasota-results.json src/data/gp-points.json public/data/live-activity.json)

while true; do
	echo ""
	echo "=== live-sync $(date '+%a %b %d %I:%M:%S %p') ==="

	git pull --rebase --autostash origin main || echo "(pull failed, continuing with local state)"

	node scripts/sync-r2-brackets.mjs sarasota || echo "(bracket sync failed this cycle)"
	node scripts/sync-gp-points.mjs || echo "(points sync failed this cycle)"

	if ! git diff --quiet -- "${SYNC_FILES[@]}"; then
		git add -- "${SYNC_FILES[@]}"
		git commit -m "chore: sync R2 bracket results"
		git push origin main || echo "(push failed — will retry next cycle)"
	else
		echo "No changes this cycle."
	fi

	if [ "$(date -u +%Y%m%d%H)" -ge 2026071306 ]; then
		echo "Weekend window over — stopping live-sync loop."
		break
	fi

	sleep 300
done
