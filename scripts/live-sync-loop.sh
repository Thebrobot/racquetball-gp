#!/bin/bash
# Local live-sync loop for a tournament weekend (currently Port St. Lucie Open).
#
# GitHub's scheduled sync is throttled to every few hours, so during the event
# run this on a Mac that stays awake: it scrapes the R2 brackets every 5 minutes,
# commits and pushes changes (each push redeploys the site, and the live page
# turns new results into notifications). Exits on its own after the window.
#
# Usage:  bash scripts/live-sync-loop.sh            (defaults to psl)
#         bash scripts/live-sync-loop.sh sarasota

set -u
cd "$(dirname "$0")/.."
unset PLAYWRIGHT_BROWSERS_PATH

EVENT="${1:-psl}"
WINDOW_END_UTC=2026102606   # Mon Oct 26 2026 06:00 UTC (Sunday night ET)
SYNC_FILES=(src/data/ocala-results.json src/data/sarasota-results.json src/data/port-st-lucie-results.json src/data/gp-points.json public/data/live-activity.json)

while true; do
	echo ""
	echo "=== live-sync ($EVENT) $(date '+%a %b %d %I:%M:%S %p') ==="

	# Recover from a rebase left behind by an interrupted pull (e.g. Wi-Fi drop).
	if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
		echo "(recovering from interrupted rebase)"
		git rebase --abort 2>/dev/null || rm -rf .git/rebase-merge .git/rebase-apply
	fi

	git pull --rebase --autostash origin main || echo "(pull failed, continuing with local state)"

	node scripts/sync-r2-brackets.mjs "$EVENT" || echo "(bracket sync failed this cycle)"
	node scripts/sync-gp-points.mjs || echo "(points sync failed this cycle)"

	if ! git diff --quiet -- "${SYNC_FILES[@]}"; then
		git add -- "${SYNC_FILES[@]}"
		git commit -m "chore: sync R2 bracket results"
		git push origin main || echo "(push failed — will retry next cycle)"
	else
		echo "No changes this cycle."
	fi

	if [ "$(date -u +%Y%m%d%H)" -ge "$WINDOW_END_UTC" ]; then
		echo "Weekend window over — stopping live-sync loop."
		break
	fi

	sleep 300
done
