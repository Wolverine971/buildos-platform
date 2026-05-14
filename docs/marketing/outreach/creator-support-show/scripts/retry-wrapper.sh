# docs/marketing/outreach/creator-support-show/scripts/retry-wrapper.sh
#!/usr/bin/env bash
# One-shot retry wrapper for Creator Support Show transcripts.
# Triggered by LaunchAgent ~/Library/LaunchAgents/com.dj.buildos.css-retry.plist
# at 12:00 PM America/New_York on 2026-05-14 (= 9:00 AM America/Los_Angeles).
# Self-unloads the LaunchAgent on completion.

set -uo pipefail

REPO="/Users/djwayne/buildos-platform"
DIR="$REPO/docs/marketing/outreach/creator-support-show"
TRANSCRIPTS="$DIR/transcripts"
SCRIPT="$DIR/scripts/download-transcripts.sh"
REPORT="$DIR/retry-report-2026-05-14.md"
LOG="$DIR/scripts/retry-2026-05-14.log"
PLIST="$HOME/Library/LaunchAgents/com.dj.buildos.css-retry.plist"

mkdir -p "$DIR/scripts"
exec >>"$LOG" 2>&1

echo ""
echo "=================================================="
echo "[$(date -Iseconds)] Retry run starting."
echo "=================================================="

# Year guard: this only ever runs on 2026-05-14. If somehow re-fired in a later year, bail.
YEAR=$(date +%Y); MONTH=$(date +%m); DAY=$(date +%d)
if [[ "$YEAR" != "2026" || "$MONTH" != "05" || "$DAY" != "14" ]]; then
  echo "[$(date -Iseconds)] Date guard failed ($YEAR-$MONTH-$DAY). Exiting + unloading."
  /bin/launchctl unload "$PLIST" 2>/dev/null || true
  exit 0
fi

# Sanity check the download script exists.
if [[ ! -x "$SCRIPT" ]]; then
  echo "[$(date -Iseconds)] ERROR: $SCRIPT missing or not executable."
  exit 1
fi

BEFORE=$(ls "$TRANSCRIPTS" 2>/dev/null | wc -l | tr -d ' ')
echo "[$(date -Iseconds)] Transcripts on disk before run: $BEFORE / 49"

# Run the idempotent download script. Captures both stdout and stderr to the log.
"$SCRIPT"
RC=$?

AFTER=$(ls "$TRANSCRIPTS" 2>/dev/null | wc -l | tr -d ' ')
NEW=$((AFTER - BEFORE))
STILL_FAILED=$((49 - AFTER))

echo "[$(date -Iseconds)] Transcripts on disk after run: $AFTER / 49 (gained $NEW, still missing $STILL_FAILED)"
echo "[$(date -Iseconds)] download-transcripts.sh exit code: $RC"

# Write the retry report.
cat >"$REPORT" <<EOF
---
title: 'Creator Support Show — Retry Report'
created: 2026-05-14
status: phase-1-retry-complete
owner: DJ Wayne
purpose: Outcome of the 2026-05-14 retry for the 34 transcripts that hit YouTube's IpBlock on 2026-05-13.
related_docs:
    - /docs/marketing/outreach/creator-support-show/00-inventory.md
    - /docs/marketing/outreach/creator-support-show/99-outreach-prep.md
path: docs/marketing/outreach/creator-support-show/retry-report-2026-05-14.md
---

# Retry Report — $(date -Iseconds)

## Summary

- **Transcripts on disk before run:** $BEFORE / 49
- **Transcripts on disk after run:** $AFTER / 49
- **Newly captured this run:** $NEW
- **Still missing:** $STILL_FAILED
- **Wrapper exit code from download script:** $RC

## What this run did

Ran the idempotent \`download-transcripts.sh\` script. Skipped transcripts that already existed on disk. Sequentially fetched the remaining ones with 3s delays between calls.

## Next steps

EOF

if [[ "$STILL_FAILED" -eq 0 ]]; then
  cat >>"$REPORT" <<'EOF'
All 49 transcripts captured. Phase 1 transcript collection complete. Proceed to Phase 2 cold-outreach drafting per `99-outreach-prep.md`.
EOF
elif [[ "$STILL_FAILED" -le 5 ]]; then
  cat >>"$REPORT" <<EOF
Most transcripts captured. $STILL_FAILED still missing — likely transient or video-specific issues. Inspect \`scripts/retry-2026-05-14.log\` for failure details. Re-run \`download-transcripts.sh\` manually after another 6-24h window if needed.
EOF
else
  cat >>"$REPORT" <<EOF
$STILL_FAILED transcripts still missing — possible re-block or network issue. Stop retrying on this IP. Either:

1. Wait another 6-24h and try once more.
2. Run from a different network (VPN, mobile hotspot).
3. Configure a residential proxy in \`youtube-transcript-api\` (Webshare integration).

Inspect \`scripts/retry-2026-05-14.log\` for the specific failure mode.
EOF
fi

cat >>"$REPORT" <<EOF

## Log location

\`docs/marketing/outreach/creator-support-show/scripts/retry-2026-05-14.log\`

## Self-cleanup

This run unloaded the one-shot LaunchAgent at \`~/Library/LaunchAgents/com.dj.buildos.css-retry.plist\`. The plist file is left on disk for audit; delete it manually if desired.
EOF

echo "[$(date -Iseconds)] Wrote retry report to $REPORT."

# Self-unload so this LaunchAgent never fires again. The plist stays on disk for audit.
/bin/launchctl unload "$PLIST" 2>/dev/null || true
echo "[$(date -Iseconds)] LaunchAgent unloaded. Done."
