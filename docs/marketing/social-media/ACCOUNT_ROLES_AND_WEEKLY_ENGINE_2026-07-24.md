<!-- docs/marketing/social-media/ACCOUNT_ROLES_AND_WEEKLY_ENGINE_2026-07-24.md -->

# Account Roles & the Weekly Engine

**Created:** 2026-07-24 · **Owner:** DJ · **Status:** active
**Source of the decision:** IG "zero engagement" diagnosis (see memory `project_instagram_growth_diagnosis_2026-07-24`).

This is the source of truth for **which account does what** and **how the weekly content engine runs**. It exists because the last content pipeline died from lack of durability — not lack of quality.

---

## The diagnosis, in one paragraph

Instagram engagement was near-zero not because the content was bad (it isn't — the reels and product carousels are on-strategy) but for **structural** reasons: publishing was sporadic (~11 posts across a year, multi-week gaps), split across two tiny accounts (@build.os = 40 followers, @djwayne3 = 686), on a channel where BuildOS's buyers don't primarily live — while the daily Instagram effort went into **commenting on other accounts**, not publishing. IG reach is two-track (followers → strangers); from 40 followers there's no base to reach strangers, and long gaps re-cold-start the algorithm every time.

## The decision (2026-07-24)

DJ chose: **grow BuildOS channel-agnostic** (not "grow Instagram"), run **both accounts with clear roles**, at **~2–3 hrs/week, on-camera OK**.

Consequence, stated plainly: **Instagram is a repurpose/support channel, not the primary growth engine.** For a B2B founder tool, the buyer lives on **LinkedIn (founder profile), YouTube, and X** — which is also what BuildOS's own strategy already says (primary wedge = authors/YouTubers). Primary effort follows the buyer; IG gets the repurposed cut.

---

## Account roles

### DJ — the founder (@djwayne3 on IG; personal profile on LinkedIn/X) = REACH + STORY

- The person building in public. People follow **people**, not logos — this is the cold-start advantage.
- Gets the **founder cut**: first-person, the messy middle, the demonstration reel, the honest take.
- On IG, the reel here is the **reach vehicle**; **collab-tag @build.os** so reach flows to the brand.
- LinkedIn founder profile is the **primary** surface for every atom.

### @build.os — the brand = PROOF + REPOSITORY

- The credibility **destination**, not a reach engine. Stop trying to cold-start it to virality at 40 followers.
- Gets the **clean product cut**: screen-native demos, feature receipts, testimonials, "how it works."
- **Low cadence, high signal.** Its job is to look legit when someone who saw the founder content clicks through.
- Bio + pinned posts = the clearest possible statement of what BuildOS is.

> Rule of thumb: **founder content earns the attention; brand content converts it.** Never invert.

---

## The weekly engine

One **atom** per week — a real demonstration (`messy input → BuildOS structures it → relief`) — shot once, cut four ways. Full mechanics + templates + scaffold script live in
[`../proof-content-harness/README.md`](../proof-content-harness/README.md).

| #   | Surface                            | Account    | Role                                                    |
| --- | ---------------------------------- | ---------- | ------------------------------------------------------- |
| 1   | **LinkedIn post** (+ native video) | DJ founder | **PRIMARY** — the buyer channel                         |
| 2   | **X post**                         | DJ founder | quick-take of the same insight                          |
| 3   | **Instagram Reel**                 | @djwayne3  | reach; ends on a _send-this_ line; collab-tag @build.os |
| 4   | **Brand proof**                    | @build.os  | clean product cut for the repository                    |

**Cadence:** every **7–9 days**, enforced by the ops status engine (`weekly_atom` block in
`../ops/cadence.json`). The engine flags it 🔴 overdue / 🟡 due / 🔵 next in the same report as the
blog cadence — so it can't silently rot again. Track id in the queue: **`founder-proof`**.

**Time budget:** ~20 min of DJ per week (one 15s hook + one screen capture); the agent drafts the four surfaces from a real project via the harness.

---

## E3 — the channel A/B (this decides where DJ's hours go)

For the first **3–4 weeks**, post the **same atom** to IG (founder reel) **and** LinkedIn (founder post).
Record per surface, from Insights/analytics:

| Metric                  | IG reel (@djwayne3) | LinkedIn (founder) |
| ----------------------- | ------------------- | ------------------ |
| Reach / impressions     |                     |                    |
| % non-follower reach    |                     |                    |
| Profile visits / clicks |                     |                    |
| Saves + sends/shares    |                     |                    |
| Qualified signups (UTM) |                     |                    |

**Decision rule:** after 4 atoms, weight the next month's effort toward whichever surface produced
more **qualified reach** (profile visits + signups), not raw likes. Data decides the split, not opinion.
Metrics flow back into each atom's `metrics[]` in the ops queue (stage ④ ENGAGE).

> The single number still unverified at diagnosis time: **% non-follower reach** on the last ~10 IG
> posts. Pull it from Insights on the first atom — if it's ~0%, the cold-start diagnosis is confirmed
> and consistency is the fix; if it's decent but signups are ~0, it's a conversion/offer problem instead.

---

## What did NOT change

- The **anti-feed blog cluster** track is still real and still tracked — it's just been dormant. The
  weekly atom is a _second_ track (`founder-proof`) that ramps in alongside it, not a replacement.
- **Anti-AI stance, real-media policy, receipts doctrine** all still apply to every atom.
- The daily **commenting/warmup** stays — but it's relationship-seeding, not a growth engine on its own.
