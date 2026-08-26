<!-- docs/marketing/social-media/daily-engagement/2026-08-04_instagram-warmup.md -->

# Instagram Warmup - August 4, 2026

**Date:** 2026-08-04
**Account:** @djwayne3 (intended) — **NOT REACHED**
**Scan Time:** 09:00–09:10 ET
**Status:** 🚫 **BLOCKED — STAGE 1 NOT RUN. No scan performed. No opportunities queued.**

**Reason code:** `browser_limitation: instagram_account_not_in_picker`
**Consecutive blocked runs:** 4 (08-01, 08-02, 08-03, 08-04)

---

## What blocked the run

Unchanged from 08-03: the `Default` Chrome profile ("djwayne35") — the sanctioned home for
@djwayne3 per the canonical mapping doc — still has @djwayne3 **evicted from its Switch-accounts
picker**. Today's picker, read directly:

| Picker row     | Identity                       | State      |
| -------------- | ------------------------------ | ---------- |
| `9takesdotcom` | 9takes brand account           | **ACTIVE** |
| `build.os`     | BuildOS brand account          | Saved      |
| `4109800852`   | `dj_pew_pew` (per 08-01 probe) | Saved      |
| —              | **`djwayne3`**                 | **ABSENT** |

Eviction (not logout) means password re-login is required, which no agent can perform.

The cross-profile contamination flagged on 08-03 also persists: **@9takesdotcom is still logged
into `Default` and is still the active account there**, two days later. It continues to shorten
the survival time of every other session in that cookie jar.

---

## 🔍 New finding: the 08-03 recommended fix has not been started

The 08-03 doc recommended moving @djwayne3 to its own dedicated `Profile 1`. Filesystem check
today shows **neither of the two required steps has happened**, which is why the block repeated:

| Step                                 | Evidence                                                                                                       | Done? |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----- |
| `Profile 1` exists, named `djwayne3` | `Preferences.profile.name` = `djwayne3`                                                                        | ✅    |
| Claude extension installed there     | Extension `fcoeoabgfenejglbffodgkkbkcdhcgfn` present in `Default` and `Profile 2`, **absent from `Profile 1`** | ❌    |
| @djwayne3 logged in there            | `Profile 1/Cookies` is 126 KB, last written **Jul 26 16:44** — the profile has not been opened in 9 days       | ❌    |

This is the concrete reason only two browsers appear in `list_connected_browsers`: with no Claude
extension in `Profile 1`, it can never register as a connectable browser, so the agent has no path
to @djwayne3 no matter how the run is scheduled.

---

## Browser identification (labels are not stable — use picker contents)

Both connected extension instances again reported `@9takesdotcom` as the active account. The
generic "Browser 1"/"Browser 2" labels **swapped meaning since 08-03** — matching on name alone
would have picked the wrong profile today.

| Signal                 | Browser 1 (`afb6b693…`) | Browser 2 (`69b386a7…`)                  |
| ---------------------- | ----------------------- | ---------------------------------------- |
| Active IG account      | `9takesdotcom`          | `9takesdotcom`                           |
| Switch-accounts picker | `9takesdotcom` **only** | `9takesdotcom`, `build.os`, `4109800852` |
| Sidebar "Suggested"    | generic                 | includes **BuildOS** (DJ-graph residue)  |
| **Verdict**            | **9takes profile**      | **`Default` — "djwayne35"** ✅           |

**Durable technique:** the `build.os` + `dj_pew_pew` picker rows are the reliable fingerprint for
`Default`. Identify by picker contents, never by the extension's display name — the deviceId→name
mapping is not stable between runs.

---

## Priority Summary

_No scan performed. No posts evaluated, no accounts profiled, no queue built._

**Lane balance:** Solo 0 / PKM 0 / AI 0 / Course 0 / Author 0 / Freelance 0 / WateringHole 0 / ADHD 0 → **N/A (blocked)**

## Reply Queue

_Empty. Nothing for `/instagram-reply` today._

---

## Carry-over and open loops

- **@lavanyasaraf\_ — now 18 days unanswered.** She commented on and liked a @djwayne3 post on
  **Jul 17**; a reply was drafted 07-31 but never posted (`stage_2_queued`, comment-log line 124).
  Still the single highest-value item lost to the outage — the only inbound Solo-lane signal on
  @djwayne3 in weeks. Chase her _current_ post the moment access is restored; the 07-31 surfaces
  (`DbaB9v6hfU-`, `DbUvoY2hewL`) are long stale.
- **07-31 reply queue: remains dead.** 4 days old. Next successful warmup re-sources from scratch.
- **Stage 0 discovery queue untouched**, so `queued_for_warmup` candidates (@vasilioskambouras,
  @lavanyasaraf\_) remain eligible and unspent.

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
- `@9takesdotcom` was active on both browsers on arrival and was left active on both.
- Zero likes, comments, follows, saves, DMs, or story views.
- Local filesystem reads only (Chrome `Preferences`, extension dir listings, cookie-file `stat`).

---

## Recommended fix (DJ — ~7 min, durable)

Same plan as 08-03, now with the two blocking steps confirmed undone:

1. Chrome → profile switcher → **"djwayne3"** (`Profile 1` — already exists, unused since Jul 26).
2. **Install the Claude extension there** and sign in — this is the step that's missing, and
   without it `Profile 1` can never appear in `list_connected_browsers`. Allow `instagram.com` in
   site permissions.
3. instagram.com → log in as **@djwayne3** → ✅ check **"Save login info"**.
4. Update `/Users/djwayne/9takes/docs/instagram/instagram-cron-browser-setup.md` and
   `scripts/instagram-warmup-cron.sh` (`CHROME_PROFILE="Default"` → `"Profile 1"`).

Also worth doing: **log @9takesdotcom out of `Default`.** It doesn't belong there and it shortens
the life of every other session in that jar.
