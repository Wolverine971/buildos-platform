<!-- docs/marketing/social-media/daily-engagement/2026-08-01_instagram-warmup.md -->

# Instagram Warmup - August 1, 2026

**Date:** 2026-08-01
**Account:** @djwayne3 — **BLOCKED, NOT VERIFIED**
**Scan Time:** ~09:00 ET (unattended cron run)
**Status:** BLOCKED — `browser_limitation: instagram_account_not_in_picker` — NO SCAN PERFORMED

---

## What happened

1. Two Chrome extensions were connected, both with generic names ("Browser 1" / "Browser 2"). Identified them empirically before any scanning:
    - **Browser 1** = 9takes profile (`Profile 2`) — active account @9takesdotcom. Not touched beyond identification (one read-only instagram.com load).
    - **Browser 2** = djwayne35 profile (`Default`) — the correct BuildOS browser. Active account on arrival: **@build.os**.
2. Opened Switch accounts in the djwayne35 profile. The picker contains **only two accounts**:
    - `build.os`
    - `dj_pew_pew` (rendered as **"4109800852"** while its row was stale; label corrected after it became the active session once)
3. **@djwayne3 is not in the picker at all.** This is the same eviction pattern as 2026-07-21 — the account isn't just logged out, it has been dropped from the profile's saved-accounts list entirely. Password re-login is required, which no agent can (or should) perform.
4. Restored the profile's prior state: **@build.os is the active account again.** No likes, comments, follows, DMs, or scans were performed on any account.

## Eviction history (this is now a pattern)

| Date           | Event                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| 2026-07-21     | @djwayne3 evicted from Default-profile picker (first occurrence; runs 7/21–7/24 aborted as stubs) |
| ~2026-07-26/30 | DJ restored the session; 7/30 and 7/31 warmups ran full scans                                     |
| 2026-08-01     | **Evicted again** — held for at most ~2 days after the last completed run                         |

The 2026-07-26 mapping doc (`/Users/djwayne/9takes/docs/instagram/instagram-cron-browser-setup.md`) pre-declared the fallback for exactly this case: _"if @djwayne3's session proves flaky there (same eviction pattern as before), the fallback is moving it to a dedicated profile."_ Two evictions in 11 days qualifies. Recommend DJ move @djwayne3 to its own Chrome profile (e.g. unused `Profile 1`, display name "djwayne3", which already exists per the mapping doc) instead of re-logging into `Default` a third time.

## Carry-over state (unchanged by this run)

- **2026-07-31 reply queue (7 drafts) was never posted** — all still `Drafted` in the comment log: @thejustinwelsh `DbdKfrGljZG`, @shawnblanc `Dba09oOkXGD`, @lavanyasaraf\_ `DbaB9v6hfU-` (warm inbound, reciprocity now 15 days), @davidperell `Dbbtyb3gGvG`, @nathanbarry `DbbEX8IA9TE`, @vasilioskambouras `DbYimtwIsvR`, @leaturnerholt `DbQLMSzDNc5`, plus @tag_amit mining on Hampton `DbYjxGRjhkX`. Most of these surfaces will be stale/dead by the time the session is restored — expect the next warmup to re-source rather than carry.
- Stage 0 queue untouched: @vasilioskambouras `queued_for_warmup`, @lavanyasaraf\_ `queued_for_warmup`, @oleg_poskotin / @thecodewhisperer / @natecreates `monitor`.

## Notifications & Stories Activity

Not checked — blocked before scan.

## Priority Summary / Reply Queue / Post Opportunities

None — blocked before scan.

## Relationship Memory Updates

None.
