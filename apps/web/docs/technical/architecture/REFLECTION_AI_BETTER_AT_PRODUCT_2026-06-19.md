<!-- apps/web/docs/technical/architecture/REFLECTION_AI_BETTER_AT_PRODUCT_2026-06-19.md -->

# What "How to Make AI Better at Product" Should Change About BuildOS

**Status:** Reflection / draft for review
**Date:** 2026-06-19
**Owner:** DJ
**Source:** Luca Rossi, _How to make AI better at product_ — https://refactoring.fm/p/how-to-make-ai-better-at-product
**Related:** [`PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md`](./PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md)

---

## The article, compressed

AI got good at _coding_ because engineers built scaffolding around it — decision records (ADRs), loops, gates, guards. Product work never got that scaffolding, so AI is still bad at it. Only **9% of teams use AI for product specs vs. 90%+ for code**. The fix isn't a better model, it's treating **product knowledge as a structured asset**:

- **Product Decision Records (PDRs)** — capture _intent + chosen design + rejected alternatives + why_. Sized by novelty, not by work size.
- **Product Glossary** — define the product's core abstractions and the team's domain vocabulary. Atono's data: a glossary takes spec rework from ~**60% down to ~20%**.
- **The 3Gs (guides, gates, guards)** — inject non-deterministic judgment _before_ the model acts, rather than correcting after.
- **Workflow:** human-led intent → AI draft (informed by glossary + PDRs) → human review → implementation → documentation updates (new PDRs/glossary entries).

The uncomfortable part: **this is BuildOS's entire thesis, aimed at a market we're not explicitly claiming.** "Turn messy thinking into structured work" _is_ "treat thinking/product knowledge as a structured asset." We're building the substrate (the 06-16 knowledge-layer design is exactly this). But we're under-shipping three specific things the article names.

---

## 1. We capture tasks and docs. We don't capture _decisions._

This is the biggest gap. BuildOS's ontology has projects, tasks, goals, plans, milestones, risks, documents. It has **no first-class decision** — the one entity that carries _intent + chosen design + rejected alternatives + why._ That's the highest-value, least-captured context in any project, and it's invisible to the agent by construction.

The knowledge-layer design even has a "Capture" layer (Layer 4: "write durable conversation knowledge back into docs"), but it's framed as _generic doc-writing_. The article reframes it: the thing worth capturing automatically is the **decision and its tradeoffs**, not prose. When a user reasons through "we're going with weekly briefs over daily because X," that should become a typed, queryable PDR-shaped artifact — not a paragraph buried in a document the agent can't find.

**What to do better:** add a lightweight decision artifact (could be a document _subtype_ with a fixed shape: intent / choice / rejected / why) and teach the Capture layer to emit it. This is small and it's the highest-leverage thing in the whole article.

## 2. There's no per-project _glossary_ — so the agent never learns the user's language.

The ontology is _our_ vocabulary (project, task, goal). The glossary the article means is the _user's_ — their abstractions, their domain terms, the names they gave their own structures. Right now nothing in BuildOS learns that a given user means something specific by "the launch," "the corridor," "season two." Every agentic turn re-derives meaning from scratch.

This maps cleanly onto the knowledge map (Layer 1: `doc_structure` + descriptions + headings). A glossary is a sibling index: a small, growing dictionary of the user's recurring terms, maintained by the Librarian (Layer 5). The Atono 60%→20% number is the prize here — and it directly attacks our actual problem, which is that we route across weak/old models that need explicit grounding. A glossary is **cheap context that makes weak models behave like stronger ones.**

## 3. Our knowledge behavior is reactive. The article says it has to be proactive.

The 06-16 diagnosis is brutal and correct: the agent _cannot find document content today, by design._ Search is title-only, `search_vector` is never populated, doc-read tools are gated behind write-intent regex, and the ledgers (`write-ledger`, `context-gathering-ledger`) all fire _after_ tool rounds. A "let's market this" turn never even sees the marketing doc.

The article's whole point about gates/guards is that judgment should be injected _before_ the model acts, not corrected after. Layer 3 ("consult the knowledge map before acting") is the fix and it's already in the design — this reflection is just a vote to **prioritize Layer 3 over the fancier Librarian work.** Proactive read is the behavior change users actually feel; self-improving dedup is a luxury that doesn't matter if retrieval is still broken.

---

## The positioning thing, which is bigger than any feature

That **9%-vs-90%** stat is a market map. Nearly every "AI + work" tool is pointed at the 90% — code. Almost nobody is building the scaffolding for the 9% — _decisions, specs, thinking._ That is precisely the "thinking environment for people making complex things" lane we've already claimed in the marketing strategy. The article is, accidentally, third-party validation that the anti-AI / "lead with relief, structure your thinking" positioning is sitting on a real and nearly-empty market.

The lesson for our own dogfooding, too: we're _great_ at engineering ADRs (the repo is full of dated design docs — this one included) and _bad_ at product decision records. We document _how_ the agentic chat works; we rarely document _why we rejected the alternative._ We should keep PDRs on BuildOS-the-product the same way we keep ADRs on BuildOS-the-codebase. We'd be our own best case study.

---

## If I had to rank the moves

1. **Ship Layer 3 (proactive read) next** — retrieval-before-acting is the felt change; don't let it slip behind the Librarian.
2. **Add a decision artifact** (intent/choice/rejected/why) + Capture-layer emission — highest leverage in the article, smallest surface.
3. **Stand up a per-project glossary** as a sibling index, maintained in the background — the 60%→20% rework win, and it props up our weak-model routing.
4. **Keep PDRs on ourselves** — dogfood the exact thing we'd sell.

The thread through all four: BuildOS already decided that structured knowledge beats a bigger model. This article is a checklist of the specific structures we haven't built yet. **The decision record is the one I'd not let us skip.**

---

## Possible next artifacts

- A published anti-AI blog post in `apps/web/src/content/blogs/philosophy/` built on the "9% gap" framing (strong public piece).
- A design addendum to `PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md` proposing the **decision artifact** and **glossary** as named layers/indexes.
