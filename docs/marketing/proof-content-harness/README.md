<!-- docs/marketing/proof-content-harness/README.md -->

# Proof-Content Harness

> A folder of **templates + a script + data** an agent drives, so producing a week's
> content costs ~20 minutes of DJ's time instead of a blank page every time.
> Same philosophy as the marketing-ops status engine: reroute the expensive part
> (drafting five things in one voice) into a repeatable tool, and keep the human
> loop tiny (one real input, one 15-second hook, ship).

The thing that killed the last content pipeline was **not** content quality — it was
**durability**. Posts lived in DJ's head and in one-off drafts, so the cadence rotted
for 88 days. This harness fixes that by making each week's unit a **cheap, repeatable
atom** and wiring it into the `/marketing` ops queue so the status engine nags on it.

---

## The atom

One **atom per week** = one real demonstration of BuildOS:

```
a real messy input  →  BuildOS structures it  →  the relief
```

The atom is **shot once, cut four ways**. DJ's face for the 3-second hook, the product
screen for the proof, captions burned in, real media only (no AI-generated images/video).

## The four surfaces (one atom → four posts)

| Surface            | Account                 | Role                                      | Voice                                         |
| ------------------ | ----------------------- | ----------------------------------------- | --------------------------------------------- |
| **LinkedIn post**  | DJ (founder)            | **PRIMARY** — where the buyer is          | first-person, professional-but-real, receipts |
| **X post**         | DJ (founder)            | quick-take version of the same insight    | lowercase, punchy, one move                   |
| **Instagram Reel** | **@djwayne3** (founder) | reach + story; ends on a _send-this_ line | warm, personal, first-person confession       |
| **Brand proof**    | **@build.os** (brand)   | clean product cut for the repository      | second-person observational, product-forward  |

Why this split: for a B2B founder tool the buyer lives on LinkedIn / YouTube / X, so
**LinkedIn is primary and IG is repurpose** — not the other way around. See
`../social-media/ACCOUNT_ROLES_AND_WEEKLY_ENGINE_2026-07-24.md` for the full rationale
and the account roles.

---

## How to run it (per week, ~20 min of DJ's time)

```bash
# 1. Scaffold a new atom folder from the templates (zero-dep, bare node)
node scripts/marketing/atom/new-atom.mjs <slug>
#    → creates docs/marketing/proof-content-harness/atoms/<YYYY-MM-DD>-<slug>/

# 2. Agent fills BRIEF.md from a REAL BuildOS project (pick the demonstration),
#    then drafts the four surface files in DJ's voice.

# 3. DJ records: one 15s talking-head hook + one screen capture. Drop both in assets/.

# 4. Register the atom in the ops queue via /marketing (never hand-edit queue.json),
#    then post LinkedIn-primary → X → IG reel → @build.os proof.

# 5. Mark each surface posted + drop metrics back via /marketing (stage ④ ENGAGE).
node scripts/marketing/ops/status.mjs      # see the new picture
```

## Folder shape

```
proof-content-harness/
  README.md                     ← you are here
  TEMPLATES/                    ← edited rarely; the reusable skeletons
    BRIEF.template.md
    linkedin-post.template.md
    x-post.template.md
    instagram-reel.template.md
    brand-proof.template.md
  atoms/
    2026-07-24-eighteen-projects/   ← one folder per week's atom
      BRIEF.md                  ← the source input + the decisions
      linkedin-post.md
      x-post.md
      instagram-reel.md
      brand-proof.md
      assets/                   ← hook video + screen capture land here
```

## The rules (so atoms stay on-strategy)

1. **Real input only.** The messy input is a real BuildOS project or a real DJ brain dump. Never staged.
2. **Lead with relief, not AI.** AI is the engine, not the headline. Sell the _before → after_ feeling.
3. **Real media only.** Screen recordings, founder footage, product screenshots. No AI-generated images/video.
4. **One topic lane.** Stay on "thinking environment / holding context across complex work" for 10+ atoms so IG/LLMs can classify the account. No topic whiplash.
5. **Engineer for sends.** Every IG/X post ends on a line worth DM-ing to one specific person.
6. **Privacy guard.** Client names and the job-search project must never be legible on camera. Blur, or use a BuildOS-owned / personal project as the visible example.

## Cadence (enforced by the ops engine)

`docs/marketing/ops/cadence.json → weekly_atom`: one atom every **7–9 days**,
LinkedIn-primary. The status engine flags it 🔴 overdue / 🟡 due / 🔵 next in the same
report as the blog cadence, so it can't silently die again.
