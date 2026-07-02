<!-- docs/marketing/social-media/daily-engagement/INSTAGRAM_REPLY_ROLLUP_2026-07-01.md -->

# Instagram Reply Queue — Rollup (2026-07-01)

**Supersedes:** `tasker/02-instagram-reply-queue.md` (closed 2026-07-01, rolled up here)
**Sources:** 6/24 replies doc, 6/25–7/01 warmups, `comment-log.md`
**One-line status:** Sourcing is healthy; **nothing has posted since 2026-05-21 (~19 consecutive queues, zero touches)**, and as of 7/01 the @djwayne3 session is logged out — nothing CAN post until DJ re-logs in.

---

## Step 0 — Unblock (DJ, manual, ~2 min)

**Re-log into @djwayne3 in Chrome.** On 7/01 both account-switch paths (top-right "Switch" and Settings → Switch accounts) demanded a full password re-login — no cached one-click row. This blocks the entire IG loop. Credentials were correctly NOT entered by automation; only DJ can do this.

> If this recurs, session-refresh cadence for @djwayne3 is the top operational risk to the whole Instagram program — flag it in `/instagram-intel`.

## Step 1 — Run the live queue (same session as re-login)

Run `/instagram-reply 2026-07-01`. The 7/01 queue is **provisional (memory-derived, no live scan)** — re-pull each account's feed and re-check comment counts before posting. Priority if time-constrained:

| #   | Account             | Why                                                                                             | Guardrails                                                                                      |
| --- | ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | **@leaturnerholt**  | Highest relationship value; held 0-comment first-commenter window (`DaK1cwhgHtu`); overdue debt | UK-casual, warm, no pitch. **Open the @build.os DM alongside (see Step 2)**                     |
| 2   | **@thejustinwelsh** | Aspirational Solo peer; "Talent is overrated" (`DaNV2h2FunP`) — decays fast                     | Lived agreement, one concrete line, no pitch. Prefer a fresher post if exists                   |
| 3   | @vasilioskambouras  | Only Stage-0 discovery in weeks; near-verbatim thesis (context-across-chats reel `DaMdh7uK6oB`) | Peer-builder curiosity about HIS system. NO product name                                        |
| 4   | @davidperell        | Author lane, Harry Dry offer clip (`DaL1kUrkZ4e`)                                               | React to ONE idea, no recap, no plug                                                            |
| 5   | @dickiebush         | Solo peer, follows @djwayne3, Steve Jobs post (`DaL3QorCAVM`)                                   | Flat declarative. NO product name (recent grid mention). Watch `cognivalai` bot                 |
| 6   | @jayclouse          | Course-lane peer, info-vs-connection reel (`DaK7XrajcEP`)                                       | NEVER a funnel keyword (no "COHORT"), no product name                                           |
| 7   | @gregisenberg       | Mining drought broke 6/30 (`DaNa3AtRksf`)                                                       | Mining-first: never engage Greg directly, never reference anti-AI blog, never namedrop OpenClaw |

Tone rules for everything: `[[feedback_instagram_comment_tone]]` — real person on their phone, no polished aphorisms, no reframing their point back at them.

## Step 2 — Close the two aging relationship debts

1. **Lea's unopened @build.os attachment DM (~2026-03-30)** — three months old, the single highest inbound signal in the whole series. She DM'd first AND liked a @build.os comment (5/07). Open it before or alongside the comment.
2. **Lea's comment touch itself** — carried and unexecuted since at least 6/24.

## Step 3 — Log + reconcile the record

- Log every posted reply in `comment-log.md` (the 6/24 rows for Justin/Dickie/Perell/Nathan/Lea are all still `Pending` — **confirmed never posted**; mark them superseded or executed as appropriate).
- The 6/24 drafts (`2026-06-24_instagram-replies.md`) are voice-reference only now — those posts are ~7 days stale. Don't post them without a freshness re-check; prefer the 7/01 queue.

## Standing process fixes (decided, just enforce)

- **Stop generating warmup docs on days nothing will post.** The warmup engine ran 12+ times while zero replies shipped — pure waste that also buries the signal. Generate a queue only when a posting session is actually planned.
- **Always re-verify freshness/comment count at reply time** — every queue decays in hours (drop rules: Justin >40 comments, Jay >5, Dickie >10–15, Nathan >20).
- Multi-account hazard: Chrome cycles through @9takesdotcom / @dj_pew_pew / @build.os / @djwayne3 — verify the active account before any action.

## Done when

- [ ] @djwayne3 session restored
- [ ] Lea + Justin (minimum) replies posted and logged in `comment-log.md`
- [ ] Lea's @build.os DM opened
- [ ] 6/24 `Pending` rows in comment-log reconciled
- [ ] Warmup generation paused on non-posting days
