<!-- docs/marketing/social-media/daily-engagement/2026-07-26_instagram-warmup-pm.md -->

# Instagram Warmup - July 26, 2026 (PM cron run)

**Date:** 2026-07-26
**Account:** @djwayne3 — NOT REACHED
**Scan Time:** 15:49 ET (deterministic cron via `scripts/instagram-warmup-cron.sh`)
**Status:** BLOCKED — `browser_limitation: instagram_account_not_in_picker`. No scan performed. No engagement of any kind.

> The 08:36 stub (`2026-07-26_instagram-warmup.md`) was a separate earlier attempt that died before verification; this PM run is the first to complete Phase 0.5 browser forensics since the new one-profile-per-account architecture landed.

---

## Phase 0.5 Result — Browser + Account Verification

Two Chrome extensions were connected, both with **generic names** ("Browser 1", "Browser 2") — the optional interactive naming step from the canonical mapping doc (`/Users/djwayne/9takes/docs/instagram/instagram-cron-browser-setup.md`) hasn't been done, so name-matching on "djwayne35" was impossible. Identified both via read-only checks instead:

| Extension                 | Identity evidence                                                                       | Chrome profile                                                                                                | Verdict                                 |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| "Browser 1" (`afb6b693…`) | Active account @9takesdotcom (avatar alt + `/9takesdotcom/` profile link)               | `Profile 2` "9takes.com"                                                                                      | Off-limits for BuildOS scan             |
| "Browser 2" (`69b386a7…`) | Active account @dj_pew_pew; **Switch-accounts picker = `dj_pew_pew` + `build.os` only** | `Default` "djwayne35" (build.os lives only in the shared main profile; Cadre's Profile 5 would never hold it) | Correct profile — but @djwayne3 missing |

**The blocker:** in the `Default` profile's Switch-accounts picker, the rows are `dj_pew_pew`, `build.os`, and "Log into an Existing Account". **@djwayne3 is still evicted from the picker** — unchanged since the 2026-07-21 eviction. Restoring it requires the full password "Log into an Existing Account" path, which only DJ can do (agents never enter passwords).

No account switch was attempted; the picker dialog was opened read-only and closed. The only sanctioned target (@djwayne3) does not exist in any connected session.

---

## What DJ must do (one-time, ~2 min)

1. Open Chrome → profile switcher → **"djwayne35"** (profile dir `Default`).
2. Go to instagram.com → **Log into an Existing Account** → `@djwayne3` → **check "Save login info"**.
3. Confirm the Claude extension is signed in and `instagram.com` is allowed in its site permissions.
4. _Recommended while there:_ run one interactive `claude --chrome` session from `~/buildos-platform` and let the extension's connect prompt name the browser **"djwayne35"** — both extensions currently report as "Browser 1"/"Browser 2", which forces slow forensic disambiguation every run.

---

## Note for future runs (until browsers are named)

Disambiguate generically-named extensions **without switching accounts**: navigate to instagram.com, read active-account signals, and if needed open More → Switch accounts read-only. Discriminators: `build.os` in the picker ⇒ `Default`/djwayne35; active @9takesdotcom ⇒ `Profile 2`; a picker with only Cadre accounts ⇒ `Profile 5`.

---

## Execution Debt (carried forward)

- Last completed warmup: **7/20** (degraded API-only mode). 7/21–7/24 aborted as stubs; 7/26 AM died pre-verification; 7/26 PM (this run) blocked at Phase 0.5.
- The entire 7/20 reply queue was session-gated and never executed — debt now ~2.5 weeks.
- Still to re-test once unblocked: Instagram public `web_profile_info` API 400s on business-category accounts (Justin, Shawn, Dickie, notionhq, hamptonfounders, writeordiemag, theadhdtools).

---

## Notifications & Stories Activity

Not reached — blocked before any @djwayne3 surface was accessible.

## Priority Summary / Reply Queue / Post Opportunities

None — no scan performed.

## Relationship Memory Updates

None.
