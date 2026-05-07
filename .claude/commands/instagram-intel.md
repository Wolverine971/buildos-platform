---
description: Audit Instagram relationship pipeline state and recommend next lead-generation actions.
argument-hint: "[optional date, lane, or handle]"
disable-model-invocation: true
---

# Instagram Intel

Run an operations review of the Instagram relationship pipeline for BuildOS.

This command does not browse Instagram by default. It audits the local system: discovery queue, warmup docs, reply docs, profiles, people nodes, and the comment ledger.

Use it when DJ asks:

- what should I engage with next?
- what is stale?
- who needs follow-up?
- which lane is working?
- what did we not close?
- where is the relationship loop broken?

---

## Required Context

Read:

- `docs/marketing/social-media/discovery/instagram/candidates.md`
- `docs/marketing/social-media/comment-log.md`
- `docs/marketing/social-media/instagram-profiles/README.md`
- recent files in `docs/marketing/social-media/daily-engagement/`
- relevant profiles in `docs/marketing/social-media/instagram-profiles/`
- `docs/marketing/social-media/instagram-engagement-targets.md`
- `docs/marketing/growth/lead-gen-operating-system-2026-04-10.md`

---

## Audit Questions

Answer these concretely:

1. Which drafted replies are still pending posting?
2. Which queued opportunities are stale and should be dropped?
3. Which candidates are ready for `/instagram-warmup`?
4. Which profiles need reconciliation because they have many pending touches and no confirmed engagement?
5. Which lane produced the best new candidates?
6. Which lane is overrepresented or low quality?
7. Which accounts are ready for a DM or deeper research pass?
8. Which accounts should be moved to `monitor` or `skip`?
9. What is the next best 30-minute action?

---

## Optional Output

For substantial audits, create:

`docs/marketing/social-media/instagram/YYYY-MM-DD_intel.md`

Do not overwrite an existing intel note. Add a suffix if needed.

---

## Scorecard

Use this scorecard:

| Metric | Count | Notes |
|--------|-------|-------|
| New candidates | X | from discovery queue |
| Queued for warmup | X | ready now |
| Drafted pending posting | X | needs manual action |
| Confirmed comments | X | from comment-log |
| Replies or reactions received | X | from comment-log/profile history |
| Profiles with stale pending rows | X | repeated queues, no confirmations |
| Candidates to skip | X | save future scan time |

---

## Completion Summary

End with:

```text
Instagram intel complete.

Best next action: [one action]
Stale queue items: X
Ready candidates: X
Pending reply reconciliations: X
Recommended next command: [command]
```
