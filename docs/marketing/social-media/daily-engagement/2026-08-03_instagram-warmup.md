<!-- docs/marketing/social-media/daily-engagement/2026-08-03_instagram-warmup.md -->

# Instagram Warmup - August 3, 2026

**Date:** 2026-08-03
**Account:** @djwayne3 (intended) — **NOT REACHED**
**Scan Time:** 09:00–09:15 ET
**Status:** 🚫 **BLOCKED — STAGE 1 NOT RUN. No scan performed. No opportunities queued.**

**Reason code:** `browser_limitation: instagram_account_not_in_picker`
**Consecutive blocked runs:** 3 (08-01, 08-02, 08-03)

---

## What blocked the run

The `Default` Chrome profile ("djwayne35") — the sanctioned home for @djwayne3 per the
canonical mapping doc — has @djwayne3 **evicted from its Switch-accounts picker entirely**.
The picker holds three accounts, and @djwayne3 is not one of them:

| Picker row     | Identity                       | State             |
| -------------- | ------------------------------ | ----------------- |
| `9takesdotcom` | 9takes brand account           | **ACTIVE** ⚠️ NEW |
| `build.os`     | BuildOS brand account          | Saved             |
| `4109800852`   | `dj_pew_pew` (per 08-01 probe) | Saved             |
| —              | **`djwayne3`**                 | **ABSENT**        |

Eviction (not logout) means password re-login is required, which no agent can perform.
This is the **fourth eviction in 13 days** (7/21, 7/30-restore, 8/01, and still gone today).

---

## 🚨 New finding: cross-profile contamination in `Default`

**@9takesdotcom is now logged into the djwayne35 (`Default`) profile and is the active
account there.** On 08-02 the `Default` picker held only `build.os` + `dj_pew_pew`. Today it
holds three accounts including the 9takes brand account.

Why this matters, and why it changes the recommended fix:

- It directly violates the mapping doc's own hygiene rule ("don't log the brand accounts into
  other desktop browsers/profiles"). 9takes is supposed to live only in `Profile 2`.
- It is the mechanism behind the eviction loop. Instagram rotates the **least-used** session out
  of a multi-account cookie jar. @djwayne3 is the least-used account in `Default` — every
  additional account added to that jar shortens its survival time. The 7/30 restore survived
  ~2 days; with a third competing account now present, a fourth re-login into `Default` would
  likely survive less.
- **Conclusion: re-logging @djwayne3 into `Default` is now the wrong fix.** It buys ~2 days and
  costs a manual login each time. The dedicated-profile fallback that the mapping doc
  pre-declared for exactly this pattern is the only durable option left.

---

## How the two connected browsers were identified

Both connected Claude extension instances reported `@9takesdotcom` as the active Instagram
account, which made naive name-matching useless (both browsers register as the generic
"Browser 1" / "Browser 2"). Identification method, all read-only:

| Signal                     | Browser 1                                                                     | Browser 2                |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------ |
| Active IG account          | `9takesdotcom`                                                                | `9takesdotcom`           |
| Switch-accounts picker     | `9takesdotcom`, `build.os`, `4109800852`                                      | `9takesdotcom` **only**  |
| instagram.com localStorage | 48 keys, fp `720e6216`                                                        | 19 keys, fp `4ec4cd1b`   |
| Legacy brand markers       | `__cadre_ig_profiles`, `cadre_montana_v1` (pre-7/26 shared-profile leftovers) | none                     |
| **Verdict**                | **`Default` — "djwayne35"** ✅                                                | **`Profile 2` — 9takes** |

The `build.os` + `dj_pew_pew` picker rows are the fingerprint that confirms Browser 1 is
`Default`; the Cadre localStorage keys are residue from the pre-7/26 era when all four accounts
shared that one profile.

**Useful technique for future blocked runs:** comparing `localStorage` key-count + fingerprint
on instagram.com distinguishes Chrome profiles when `chrome://version` is unreachable (the
extension refuses browser-internal URLs) and when extension-storage mtimes are ambiguous.
Note that `du -sh` on `Local Extension Settings` can grow while the directory mtime stays
stale — size, not mtime, is the live-activity signal.

---

## Priority Summary

_No scan performed. No posts evaluated, no accounts profiled, no queue built._

**Lane balance:** Solo 0 / PKM 0 / AI 0 / Course 0 / Author 0 / Freelance 0 / WateringHole 0 / ADHD 0 → **N/A (blocked)**

## Reply Queue

_Empty. Nothing for `/instagram-reply` today._

---

## Carry-over and open loops

- **@lavanyasaraf\_ — now 17 days unanswered.** She commented on and liked a @djwayne3 post on
  **Jul 17**; a reply was drafted 07-31 but never posted (`stage_2_queued`, comment-log line 124).
  This is an inbound relationship signal from a Solo-lane account and is the single highest-value
  item lost to the outage. It should be chased on whatever her current post is the moment access
  is restored — the specific 07-31 surfaces (`DbaB9v6hfU-`, `DbUvoY2hewL`) are now stale.
- **07-31 reply queue (7 drafts + Hampton mining reply): declared dead.** Now 3 days old; the
  posts are past their engagement windows. Next successful warmup should **re-source from
  scratch**, not carry these forward. (Same call as 08-02.)
- **Stage 0 discovery queue** was not touched, so `queued_for_warmup` candidates remain eligible
  and unspent for the next run.

---

## Relationship Memory Updates

| Account | Profile | Update                                                                     |
| ------- | ------- | -------------------------------------------------------------------------- |
| —       | —       | None — no accounts were scanned, so no profiles were created or refreshed. |

---

## What was touched

Nothing. Read-only throughout:

- One instagram.com load per connected browser.
- Switch-accounts picker opened and closed on each — no row was clicked.
- `@9takesdotcom` was the active account on both browsers on arrival and was left active on both.
- Zero likes, comments, follows, saves, DMs, or story views.

---

## Recommended fix (DJ — ~7 min, durable)

The mapping doc's pre-declared fallback, now unavoidable:

1. Chrome → profile switcher → **"djwayne3"** (`Profile 1`, djwayne3@gmail.com — already exists, unused).
2. Install the Claude extension there, sign in, allow `instagram.com` in site permissions.
3. instagram.com → log in as **@djwayne3** → ✅ check **"Save login info"**.
4. Update `/Users/djwayne/9takes/docs/instagram/instagram-cron-browser-setup.md` and
   `scripts/instagram-warmup-cron.sh` (`CHROME_PROFILE="Default"` → `"Profile 1"`).

Separately, worth cleaning up: **log @9takesdotcom out of the `Default` profile.** It doesn't
belong there, and leaving it shortens the life of every other session in that cookie jar.

Once `Profile 1` is live, @djwayne3 sits alone in its own jar and the eviction loop ends —
same reasoning that fixed 9takes and Cadre on 7/26.
