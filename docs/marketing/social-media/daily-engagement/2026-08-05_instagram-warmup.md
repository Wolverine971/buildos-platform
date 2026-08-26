<!-- docs/marketing/social-media/daily-engagement/2026-08-05_instagram-warmup.md -->

# Instagram Warmup - August 5, 2026

**Date:** 2026-08-05
**Account:** @djwayne3 (intended) — **NOT REACHED**
**Scan Time:** ~10:00 ET
**Status:** 🚫 **BLOCKED — STAGE 1 NOT RUN. No scan performed. No opportunities queued.**

**Reason code:** `browser_limitation: instagram_account_not_in_picker`
**Consecutive blocked runs:** 5 (08-01, 08-02, 08-03, 08-04, 08-05)

---

## What blocked the run

Unchanged from 08-03 and 08-04. The `Default` Chrome profile ("djwayne35") — the sanctioned home
for @djwayne3 — still has @djwayne3 **evicted from its Switch-accounts picker**. Today's picker,
read directly off the modal:

| Picker row     | Identity                       | State      |
| -------------- | ------------------------------ | ---------- |
| `9takesdotcom` | 9takes brand account           | **ACTIVE** |
| `build.os`     | BuildOS brand account          | Saved      |
| `4109800852`   | `dj_pew_pew` (per 08-01 probe) | Saved      |
| —              | **`djwayne3`**                 | **ABSENT** |

Eviction (not logout) requires a password re-login, which no agent can perform.

@9takesdotcom is **still the active account in `Default`**, three days after it was first flagged.
It continues to shorten the survival time of every other session in that cookie jar.

---

## Fix status: still not started (day 3 of the same recommendation)

Filesystem check today — both blocking steps remain undone, and `Profile 1` has now gone
**10 days** without being opened:

| Step                                 | Evidence (2026-08-05)                                                                   | Done? |
| ------------------------------------ | --------------------------------------------------------------------------------------- | ----- |
| `Profile 1` exists, named `djwayne3` | `Preferences.profile.name` = `djwayne3`                                                 | ✅    |
| Claude extension installed there     | `fcoeoabgfenejglbffodgkkbkcdhcgfn` present in `Default` + `Profile 2`, **absent in P1** | ❌    |
| @djwayne3 logged in there            | `Profile 1/Cookies` last written **Jul 26 16:44** — unchanged since the 08-04 check     | ❌    |

Without the extension, `Profile 1` can never register in `list_connected_browsers`, so no
scheduling or routing change can reach @djwayne3. Only DJ can unblock this.

**Full profile inventory (new this run):**

| Profile     | `profile.name` | Claude ext | Cookies last written |
| ----------- | -------------- | ---------- | -------------------- |
| `Default`   | djwayne35      | ✅         | Aug 5 09:55 (live)   |
| `Profile 1` | **djwayne3**   | ❌         | Jul 26 16:44 (stale) |
| `Profile 2` | 9takes.com     | ✅         | Aug 5 09:54 (live)   |
| `Profile 3` | 9takes.com     | ❌         | Jul 26 13:31 (stale) |

Two live extension-bearing profiles, both pointed at 9takes. The one profile named for @djwayne3
is the one that can't connect.

---

## 🆕 Runbook upgrade: deviceId IS stable — the display name is not

08-04 concluded the "Browser 1"/"Browser 2" labels swap between runs. Correct, but incomplete —
**the deviceId behind them does not move.** Comparing the two runs:

| deviceId         | 08-04 label | 08-05 label | Profile (both runs)          |
| ---------------- | ----------- | ----------- | ---------------------------- |
| `69b386a7-1fd8…` | Browser 2   | Browser 1   | **`Default` — djwayne35** ✅ |
| `afb6b693-b882…` | Browser 1   | Browser 2   | `Profile 2` — 9takes         |

**Apply:** select `69b386a7-1fd8-4fa3-b982-3fb8634ac609` directly, then confirm with the picker
fingerprint (`build.os` + `4109800852` rows). This turns a 2-browser probe into a 1-browser probe.
Keep the picker check as the verification — deviceId can change if the extension is reinstalled.

**Also new:** the first `list_connected_browsers` call returned "Browser extension is not
connected"; an immediate retry returned both browsers. **Retry once before declaring a connection
failure** — a single cold call is not evidence of a disconnected extension.

---

## Priority Summary

_No scan performed. No posts evaluated, no accounts profiled, no queue built._

**Lane balance:** Solo 0 / PKM 0 / AI 0 / Course 0 / Author 0 / Freelance 0 / WateringHole 0 / ADHD 0 → **N/A (blocked)**

## Reply Queue

_Empty. Nothing for `/instagram-reply` today._

---

## Carry-over and open loops

- **@lavanyasaraf\_ — now 19 days unanswered.** Commented on and liked a @djwayne3 post on
  **Jul 17**; reply drafted 07-31, never posted (`stage_2_queued`, comment-log line 124). Still the
  highest-value casualty — the only inbound Solo-lane signal on @djwayne3 in weeks. Chase her
  _current_ post when access returns; the 07-31 surfaces are long stale.
- **@vasilioskambouras** — two `stage_2_queued` drafts still pending (07-01, 07-11). Both
  permalinks need re-verification before use (he delete-reposts).
- **07-31 reply queue: dead, 5 days old.** Next successful warmup re-sources from scratch.
- **Stage 0 discovery queue untouched** — `queued_for_warmup` candidates remain eligible and unspent.

---

## Relationship Memory Updates

| Account | Profile | Update                                                                     |
| ------- | ------- | -------------------------------------------------------------------------- |
| —       | —       | None — no accounts were scanned, so no profiles were created or refreshed. |

---

## What was touched

Nothing. Read-only throughout:

- One instagram.com load per connected browser (2 total).
- Switch-accounts picker opened and closed on each — no row was clicked.
- `@9takesdotcom` was active on both browsers on arrival and was left active on both.
- Zero likes, comments, follows, saves, DMs, or story views.
- Both MCP tabs closed at end of run.
- Local filesystem reads only (Chrome `Preferences`, extension dir listings, cookie-file `stat`).

---

## Recommended fix (DJ — ~7 min, durable)

Unchanged from 08-03/08-04. Steps 2 and 3 are the blockers:

1. Chrome → profile switcher → **"djwayne3"** (`Profile 1` — already exists, unused since Jul 26).
2. **Install the Claude extension there** and sign in to claude.ai with the same account as Claude
   Code. Allow `instagram.com` in the extension's site permissions. ← _this is the hard blocker_
3. instagram.com → log in as **@djwayne3** → ✅ check **"Save login info"**.
4. Update `/Users/djwayne/9takes/docs/instagram/instagram-cron-browser-setup.md` and
   `scripts/instagram-warmup-cron.sh` (`CHROME_PROFILE="Default"` → `"Profile 1"`).

Also worth doing: **log @9takesdotcom out of `Default`.** It doesn't belong there and it shortens
the life of every other session in that jar.

**Escalation note:** at 5 consecutive blocked runs, consider pausing the daily cron until the fix
lands. Each run now costs a browser probe and produces a near-identical doc; the marginal
intelligence per run has gone to roughly zero.
