<!-- docs/marketing/social-media/daily-engagement/2026-08-02_instagram-warmup.md -->

# Instagram Warmup - August 2, 2026

**Date:** 2026-08-02
**Account:** @djwayne3 — **BLOCKED, NOT VERIFIED**
**Scan Time:** ~10:00 ET (unattended run)
**Status:** BLOCKED — `browser_limitation: instagram_account_not_in_picker` — NO SCAN PERFORMED

---

## What happened

Second consecutive blocked run. Identical failure to 2026-08-01.

1. Two Chrome extensions connected, both generically named ("Browser 1" / "Browser 2"). Identified both empirically before any action, read-only:
    - **Browser 1** (`afb6b693`) = 9takes profile — active account **@9takesdotcom**. One read-only instagram.com load, nothing else. Not the BuildOS browser.
    - **Browser 2** (`69b386a7`) = djwayne35 profile (`Default`) — the correct BuildOS browser. Active account on arrival: **@build.os**.
2. Opened Switch accounts in the djwayne35 profile. The picker contains **only two accounts**:
    - `build.os` (active)
    - `4109800852` (stale label for `dj_pew_pew`)
3. **@djwayne3 is still not in the picker.** Not merely logged out — dropped from the profile's saved-accounts list. Password re-login required; no agent can or should perform that.
4. **Checked whether DJ had moved @djwayne3 to a dedicated profile** (the fix recommended on 8/01). He has not — no third extension is connected, and Browser 1 is still the 9takes profile.
5. Restored state: modal closed, **@build.os remains the active account** in the djwayne35 profile. Zero likes, comments, follows, DMs, or scans on any account.

## Eviction history

| Date           | Event                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| 2026-07-21     | @djwayne3 evicted from Default-profile picker (first occurrence; runs 7/21–7/24 aborted as stubs) |
| ~2026-07-26/30 | DJ restored the session; 7/30 and 7/31 warmups ran full scans                                     |
| 2026-08-01     | Evicted again — the restored session held at most ~2 days                                         |
| 2026-08-02     | **Still evicted.** Second consecutive dead run.                                                   |

Three evictions in 12 days. The `Default` profile is not holding this session. The 2026-07-26 mapping doc (`/Users/djwayne/9takes/docs/instagram/instagram-cron-browser-setup.md`) already pre-declared the fallback: move @djwayne3 to a dedicated Chrome profile (unused `Profile 1`, display name "djwayne3", already exists per that doc). Re-logging into `Default` a third time will most likely buy another ~2 days.

Likely mechanism worth noting for the fix: `Default` is shared with @build.os and @dj_pew_pew, and Instagram caps/rotates the saved-accounts list per browser session. @djwayne3 is the account that keeps getting dropped because it is the least-used session in that profile.

## Carry-over state (unchanged by this run)

- **2026-07-31 reply queue (7 drafts + 1 mining reply) still unposted — now 2 days stale**, all `Drafted` in the comment log: @thejustinwelsh `DbdKfrGljZG`, @shawnblanc `Dba09oOkXGD`, @lavanyasaraf\_ `DbaB9v6hfU-` (warm inbound — reciprocity debt now **16 days**), @davidperell `Dbbtyb3gGvG`, @nathanbarry `DbbEX8IA9TE`, @vasilioskambouras `DbYimtwIsvR`, @leaturnerholt `DbQLMSzDNc5`, plus @tag_amit mining on Hampton `DbYjxGRjhkX`. Treat these as dead on restore — re-source rather than carry. The only one worth chasing on relationship grounds regardless of surface age is **@lavanyasaraf\_** (inbound comment + like on @djwayne3's own post; still the only fresh inbound Solo-lane signal in weeks).
- Stage 0 queue untouched: @vasilioskambouras `queued_for_warmup`, @lavanyasaraf\_ `queued_for_warmup`, @oleg_poskotin / @thecodewhisperer / @natecreates `monitor`.

## Notifications & Stories Activity

Not checked — blocked before scan.

## Priority Summary / Reply Queue / Post Opportunities

None — blocked before scan.

## New Accounts Discovered

None.

## Relationship Memory Updates

None.
