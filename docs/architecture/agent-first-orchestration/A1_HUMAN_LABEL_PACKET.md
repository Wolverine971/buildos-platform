<!-- docs/architecture/agent-first-orchestration/A1_HUMAN_LABEL_PACKET.md -->

# A1 — Human label packet (route ceiling)

**Purpose:** measure the human label ceiling for the Phase A routing gate. Nobody has ever done this,
and the whole 65/72 gate rests on the assumption that these 13 items have obvious right answers.

**Cost:** ~20 minutes, $0.
**Rule:** label from what is on this page only. Do not open the corpus files, the results, or the
prompt. The router sees exactly what you see here — nothing more.

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

| Label | Definition given to the router |
| --- | --- |
| **direct** | One bounded read-only BuildOS operation, or a project status summary. |
| **workflow** | External research, multiple independent sources, or context → research → recommendation. |
| **clarify** | A missing scope or referent prevents a safe and useful plan. |
| **capability_gap** | The requested capability is absent from the cards or the permission ceiling. |

---

## How to label

For each request, write one label. If you genuinely hesitate, add "(50/50 with X)" — **that is the
single most valuable thing this exercise can produce.** An item real humans split on cannot be scored
as a router failure, and one such item caps the achievable score below the gate.

Two items are marked ⚠️ — see the honesty note at the bottom before labeling those.

---

### 1.

> Okay, where are we at with this project?

**Label:** `________________`

### 2.

> We are building a Cold Email Campaign. Goal: let a user describe their offer, ICP, proof, and
> target segment, then have the agent create a campaign brief, research plan, first-touch email,
> follow-up sequence, deliverability checklist, and a reply-handling playbook.

**Label:** `________________`

### 3.

> What tasks need action next in this project?

**Label:** `________________`

### 4.

> Can you check my connected email inbox and see if there are any emails related to Project Alpha?

**Label:** `________________`

### 5. ⚠️

> I need to batch some content production for today or this week. Are there any tasks or information
> on what I have planned, or what I should have planned? Please research this and let me know.

**Label:** `________________`

### 6.

> Summarize this project in 5 bullets. Include the names of documents you used.

**Label:** `________________`

### 7.

> Help me plan this week.

**Label:** `________________`

### 8.

> I have an iPhone. Can you research which app I should download for this?

**Label:** `________________`

### 9.

> Okay, what is this in sync score referring to? Please explain this to me.

**Label:** `________________`

### 10.

> Open the document named Measurement & Telemetry Protocol and summarize what it says as content. Do
> not perform any project updates.

**Label:** `________________`

### 11.

> Okay, are you connected to my email inbox?

**Label:** `________________`

### 12.

> Amazing. Now here are some specific video ideas that I want to do. First idea is about what snipers
> in the future are going to look like. What skill sets do they need? What mission sets will they do?
> What is the team structure?

**Label:** `________________`

### 13.

> What should I work on today?

**Label:** `________________`

---

## Honesty note — read only after you have labeled

Two items are already contaminated for you, and pretending otherwise would waste the exercise.

**Item 5** is the one I have discussed with you at length (it is C09). You know the router answers
`direct`, and you know the prompt's own written rule points that way. So your label on item 5 is
**asymmetrically informative**:

- If you label it **`clarify`** — that is strong evidence, because you answered *against* the anchor
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
