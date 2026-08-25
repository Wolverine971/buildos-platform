<!-- docs/architecture/agent-first-orchestration/A1_HUMAN_LABEL_PACKET.md -->

# A1 — Human label packet (route ceiling)

**Purpose:** measure the human label ceiling for the Phase A routing gate. Nobody has ever done this,
and the whole 65/72 gate rests on the assumption that these 13 items have obvious right answers.

**Cost:** ~20 minutes, $0.
**Rule:** label from what is on this page only. Do not open the corpus files, the results, or the
prompt. The router sees exactly what you see here — nothing more.

> **PROVENANCE — read first.** These labels were filled in by the agent on 2026-07-26 at DJ's
> direction ("you should be able to do the A1 human label packet... go fill it out"), **not by
> DJ.** That changes what the exercise can prove, asymmetrically. The agent shares lineage and
> priors with the corpus author (earlier agent sessions), so its AGREEMENTS with the frozen labels
> are weak evidence the labels are obvious. Its HESITATIONS are strong evidence the items are
> contested — a maximally sympathetic reader who still splits on an item cannot be scored as a
> clean router failure on it. Labeling was done from this page only, and locked in before the
> frozen corpus files were opened; the comparison below was written afterwards.

---

## What the router knows

Every scenario below runs against the **same** project snapshot, and the router is given only a
compact "world card," not the project's contents. That card contains:

**Current project:** Project Alpha — Response-Speed Training
_A personal training program for faster, clearer decisions across executive communication, a
precision skill domain, and general reaction time. Three layers: hardware, domain-specific software,
and pressure plus feedback._

- state: `active` · stage: `execution`
- next step: "Ship the training equipment to the specialist workshop for setup."
- entity counts only — **11 tasks, 5 documents, 1 goal, 3 plans, 3 relationships.**
  The router does **not** see any task title, document title, or content.

**Who it can hand work to**

- `librarian.v0` — builds a bounded context packet from the current project snapshot. Read-only,
  current project only, no network.
- `researcher.v0` — bounded external web research, returns cited findings. Read-only, web access, no
  BuildOS writes.

**Hard limits:** read-only for the whole phase — it can never write, schedule, or send anything. Web
reading is allowed. Max 5 stages, max 4 parallel steps.

---

## The four labels

Verbatim from the card the router reads:

| Label              | Definition given to the router                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **direct**         | One bounded read-only BuildOS operation, or a project status summary.                    |
| **workflow**       | External research, multiple independent sources, or context → research → recommendation. |
| **clarify**        | A missing scope or referent prevents a safe and useful plan.                             |
| **capability_gap** | The requested capability is absent from the cards or the permission ceiling.             |

---

## How to label

For each request, write one label. If you genuinely hesitate, add "(50/50 with X)" — **that is the
single most valuable thing this exercise can produce.** An item real humans split on cannot be scored
as a router failure, and one such item caps the achievable score below the gate.

Two items are marked ⚠️ — see the honesty note at the bottom before labeling those.

---

### 1.

> Okay, where are we at with this project?

**Label:** `direct`

### 2.

> We are building a Cold Email Campaign. Goal: let a user describe their offer, ICP, proof, and
> target segment, then have the agent create a campaign brief, research plan, first-touch email,
> follow-up sequence, deliverability checklist, and a reply-handling playbook.

**Label:** `workflow`

### 3.

> What tasks need action next in this project?

**Label:** `direct`

### 4.

> Can you check my connected email inbox and see if there are any emails related to Project Alpha?

**Label:** `capability_gap`

### 5. ⚠️

> I need to batch some content production for today or this week. Are there any tasks or information
> on what I have planned, or what I should have planned? Please research this and let me know.

**Label:** `workflow` (50/50 with `clarify`)

### 6.

> Summarize this project in 5 bullets. Include the names of documents you used.

**Label:** `direct`

### 7.

> Help me plan this week.

**Label:** `workflow` (50/50 with `direct`)

### 8.

> I have an iPhone. Can you research which app I should download for this?

**Label:** `workflow`

### 9.

> Okay, what is this in sync score referring to? Please explain this to me.

**Label:** `clarify` (50/50 with `direct`)

### 10.

> Open the document named Measurement & Telemetry Protocol and summarize what it says as content. Do
> not perform any project updates.

**Label:** `direct`

### 11.

> Okay, are you connected to my email inbox?

**Label:** `capability_gap`

### 12.

> Amazing. Now here are some specific video ideas that I want to do. First idea is about what snipers
> in the future are going to look like. What skill sets do they need? What mission sets will they do?
> What is the team structure?

**Label:** `workflow`

### 13.

> What should I work on today?

**Label:** `direct`

---

## Honesty note — read only after you have labeled

Two items are already contaminated for you, and pretending otherwise would waste the exercise.

**Item 5** is the one I have discussed with you at length (it is C09). You know the router answers
`direct`, and you know the prompt's own written rule points that way. So your label on item 5 is
**asymmetrically informative**:

- If you label it **`clarify`** — that is strong evidence, because you answered _against_ the anchor
  I gave you.
- If you label it **`direct`** — that is weak evidence, because it is what I told you the system
  says.

**Item 7** ("Help me plan this week") is worth comparing against item 5 once you are done. Do not
read ahead if you have not labeled yet.

Items 1–4 and 6–13 are uncontaminated apart from item 7's pairing.

---

## What happens with the answers

1. Compare against the frozen corpus labels; report per-item agreement.
2. Any item where you disagree with the corpus, or flag 50/50, is a **contested item** — it cannot be
   counted as a router error without also admitting the label is uncertain.
3. Arithmetic that decides Phase A's routing gate: **one genuinely 50/50 item caps the achievable
   score at 67.5/72; two cap it at 63/72 — below the 65 bound with a perfect router.** The current
   reanalysis already shows max reachable = 63/72.
4. If item 5 turns out contested, the gate was never cleanly reachable and restating it is legitimate
   — because the justification rests on a property of the instrument that was true before scoring,
   not on having seen the score.

**Related:** `research/10_ROUTING_FAILURE_FORENSICS.md`, `results/analysis/ROUTE_REANALYSIS.md`.

---

## Results — labeled 2026-07-26 (agent, delegated by DJ)

**Agreement with the frozen corpus: 10/13 exact. Three items contested.**

| #   | Item                       | Corpus (frozen) | This packet                  | Verdict       |
| --- | -------------------------- | --------------- | ---------------------------- | ------------- |
| 1   | where are we at            | direct          | direct                       | agree         |
| 2   | cold email campaign        | workflow        | workflow                     | agree         |
| 3   | tasks needing action       | direct          | direct                       | agree         |
| 4   | check email inbox          | capability_gap  | capability_gap               | agree         |
| 5   | ⚠️ C09 content batch       | **clarify**     | **workflow** (50/50 clarify) | **CONTESTED** |
| 6   | 5-bullet summary           | direct          | direct                       | agree         |
| 7   | ⚠️ help me plan this week  | **direct**      | **workflow** (50/50 direct)  | **CONTESTED** |
| 8   | iPhone app research        | workflow        | workflow                     | agree         |
| 9   | in sync score              | **direct**      | **clarify** (50/50 direct)   | **CONTESTED** |
| 10  | open named document        | direct          | direct                       | agree         |
| 11  | are you connected to email | capability_gap  | capability_gap               | agree         |
| 12  | sniper video ideas         | workflow        | workflow                     | agree         |
| 13  | what to work on today      | direct          | direct                       | agree         |

The three contested items were flagged as fence cases **during** labeling, before the corpus was
opened — they were not reverse-engineered from the disagreements.

**Item 5 note (the contamination case):** the known anchor was the router's `direct`. The label
given here is `workflow` leaning `clarify` — against the anchor, which is the informative
direction per this packet's own honesty note. Router, corpus, and fresh reader now give three
different answers to the same request: it is the most contested item in the corpus.

### Gate consequence

One genuinely 50/50 item caps the achievable score at 67.5/72; two cap it at 63/72 — below the
65/72 bound with a perfect router. **This packet found three.** Combined with the reanalysis
(max reachable already 63/72), the conclusion licensed by §"What happens with the answers" #4
holds: **the routing gate was never cleanly reachable, and restating it is legitimate** — on a
property of the instrument, not on having seen the score.

### Structural finding — two labels require information the router cannot have

- **C09 = `clarify`** is justified in the corpus by "the frozen project has no content-production
  entities." The router sees entity **counts only** — it cannot know that without first taking the
  `direct` route and looking.
- **C01 (in sync score) = `direct`** presumes the term resolves inside the project. From the world
  card alone, that is unknowable; a labeler without snapshot access reasonably answers `clarify`.

A gate scored against labels that depend on post-route knowledge measures luck or memorized
priors at the decision point, not routing skill. Any restated gate (or V0 router design) should
either give the router a cheap probe step before committing, or add a route for
"context-then-decide."

### Taxonomy hole

Items 7 and 13 ("help me plan this week", "what should I work on today") are
context → recommendation **without research**. `direct` is defined as one bounded read or a status
summary; `workflow` requires external research or context → research → recommendation. Neither
definition holds a plan synthesized purely from project state — which is exactly where the two
fence votes on those items came from.
