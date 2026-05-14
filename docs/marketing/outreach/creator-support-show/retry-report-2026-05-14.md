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

# Retry Report — 2026-05-14T12:02:13-04:00

## Summary

- **Transcripts on disk before run:** 15 / 49
- **Transcripts on disk after run:** 15 / 49
- **Newly captured this run:** 0
- **Still missing:** 34
- **Wrapper exit code from download script:** 0

## What this run did

Ran the idempotent `download-transcripts.sh` script. Skipped transcripts that already existed on disk. Sequentially fetched the remaining ones with 3s delays between calls.

## Next steps

34 transcripts still missing — possible re-block or network issue. Stop retrying on this IP. Either:

1. Wait another 6-24h and try once more.
2. Run from a different network (VPN, mobile hotspot).
3. Configure a residential proxy in `youtube-transcript-api` (Webshare integration).

Inspect `scripts/retry-2026-05-14.log` for the specific failure mode.

## Log location

`docs/marketing/outreach/creator-support-show/scripts/retry-2026-05-14.log`

## Self-cleanup

This run unloaded the one-shot LaunchAgent at `~/Library/LaunchAgents/com.dj.buildos.css-retry.plist`. The plist file is left on disk for audit; delete it manually if desired.
