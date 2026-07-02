<!-- docs/marketing/visual-assets/references/inkprint-card-system.md -->

# BuildOS Inkprint Card System — the real-media visual layer

> The BuildOS-native counterpart to the iklipse "direct, don't prompt" engine. Where iklipse directs **AI photoreal scenes**, this directs **on-brand BuildOS marketing assets** that respect the Real Media Rule: text/diagram cards, before/after screenshot compositions, and screen-recording storyboards. The `/moodboard` and `/ideate` commands consume this.

This is the canonical visual-identity reference for BuildOS social/marketing assets. It is distilled from the full design system (`apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`) and the brand guide (`docs/marketing/brand/brand-guide-1-pager.md`). You do not need to read those to use this — but they are the source of truth if anything conflicts.

---

## 0. The non-negotiable: Real Media Rule

BuildOS marketing uses **zero AI-generated images and zero AI-generated videos** as its default and its strategic counterposition: while AI companies sell synthetic spectacle, BuildOS shows the real tool, real work, real founder. **Receipts over vibes. Screens over scenes. Work over spectacle.**

Three asset families are **always on-brand**:

1. **Inkprint cards** — text/quote/diagram cards that are clearly explanatory (the allowed "rendered" exception, because they are obviously graphics, not fake photography).
2. **Before/after compositions** — real BuildOS screenshots, arranged.
3. **Screen recordings / founder footage** — the actual product and the actual person.

The **AI-scene lane** (the iklipse engine) is **OFF by default**. It may be opened only for **abstract, illustrative, non-product** visuals (e.g. an evocative "scattered sticky notes" mood frame for Instagram) and must be explicitly flagged as a brand deviation. **Product UI and founder footage are NEVER AI-generated — full stop.** See `references/ai-scene-lane.md`.

---

## 1. What Inkprint is (so the cards feel like the product)

Inkprint is BuildOS's design language: **ink on paper, carved printmaking, field notes.** Halftone dots, linocut texture, tactile paper surfaces. Not glass panels, not gradients, not neon glow, not sterile dashboards. A BuildOS card should look like a **printed dispatch from the workbench**, not a SaaS feature ad.

The core feeling: _a calm, structured page that a messy mind can finally rest on._ Every marketing card should carry that relief — the visual equivalent of "the project remembers what matters."

---

## 2. The palette (use these exact values when specifying a card)

Inkprint is a **two-mode printed artifact** — the same card under different lighting, never two different brands. Specify cards in **HSL or hex** so Canva / gemini / a designer can match exactly.

### Light mode — "paper studio" (default for most cards)

| Role                                             | Token                 | HSL           | Approx hex |
| ------------------------------------------------ | --------------------- | ------------- | ---------- |
| Background (warm paper)                          | `--background`        | `40 15% 98%`  | `#fbfaf7`  |
| Foreground (deep ink)                            | `--foreground`        | `240 10% 10%` | `#16161a`  |
| Card surface                                     | `--card`              | `40 12% 94%`  | `#f0ede8`  |
| Muted surface                                    | `--muted`             | `40 12% 90%`  | `#e8e4dd`  |
| Muted text                                       | `--muted-foreground`  | `240 5% 42%`  | `#66666e`  |
| Decorative border                                | `--border`            | `40 10% 82%`  | `#d6d0c6`  |
| **Accent — burnt orange (the one signal color)** | `--accent`            | `24 80% 40%`  | `#b85416`  |
| Accent text-on-fill                              | `--accent-foreground` | white         | `#ffffff`  |
| Success (sage)                                   | `--success`           | `150 55% 33%` | `#268359`  |
| Warning (goldenrod)                              | `--warning`           | `45 88% 38%`  | `#b6900b`  |
| Danger (terracotta)                              | `--destructive`       | `6 70% 47%`   | `#cc3a2e`  |
| Info (teal-blue)                                 | `--info`              | `200 60% 40%` | `#2986a3`  |

### Dark mode — "ink room" (use for the one high-contrast "peak" card or a moodier set)

| Role                         | HSL          | Approx hex |
| ---------------------------- | ------------ | ---------- |
| Background (warm charcoal)   | `32 4% 11%`  | `#1d1c1a`  |
| Foreground                   | `40 10% 92%` | `#eae7e1`  |
| Card                         | `32 5% 15%`  | `#282723`  |
| Accent (bright burnt orange) | `24 85% 58%` | `#ee8743`  |

**Color law:** Color is _not_ the star — texture + hierarchy are. The burnt-orange accent is the **only** brand color; use it for **one** thing per card (the hook word, the arrow, the underline, the BuildOS mark). Never rainbow a card. **Never** use the old 9takes amber/gold (`#f59e0b`) — BuildOS's accent is the deeper, more grounded **burnt orange** (`#b85416`). No neon, no glow, no purple-AI sparkle.

---

## 3. Texture grammar (pick ONE per card; it carries meaning)

A card gets **at most one** texture, and texture is **semantic** — it says what kind of moment this is. Use it at **weak/medium** intensity behind text (never strong behind copy).

| Texture    | Class       | Means                             | Use on a card about…                    |
| ---------- | ----------- | --------------------------------- | --------------------------------------- |
| **Bloom**  | `tx-bloom`  | ideation, newness, the brain dump | the messy input, "new project", capture |
| **Grain**  | `tx-grain`  | steady execution, craft           | the work getting done, the plan         |
| **Pulse**  | `tx-pulse`  | urgency, momentum, the deadline   | "today", the next move                  |
| **Static** | `tx-static` | overwhelm, noise, blockers        | the _before_ — scattered tools, chaos   |
| **Thread** | `tx-thread` | relationships, connection, memory | "the project remembers", linked context |
| **Frame**  | `tx-frame`  | canon, structure, the decision    | the _after_ — the structured result     |

**Default mapping for a before/after story:** the _before_ card wears **Static** (overwhelm); the _after_ card wears **Frame** (structure) or **Thread** (connected memory). That texture shift _is_ the transformation, felt without words.

---

## 4. Weight (how heavy the card feels — the "paper stock")

| Weight                                           | Means                   | Use for                           |
| ------------------------------------------------ | ----------------------- | --------------------------------- |
| **Ghost** (`wt-ghost`, dashed border, no shadow) | ephemeral, a suggestion | a fading "before" note, a draft   |
| **Paper** (`wt-paper`, `shadow-ink`)             | standard                | most cards                        |
| **Card** (`wt-card`, `shadow-ink-strong`)        | this matters            | the transformation, the key claim |
| **Plate** (`wt-plate`, deep + inset)             | system-level, immutable | rare; a manifesto/closing card    |

Heavier = thicker border, deeper shadow. On a card set, escalate weight toward the payoff slide.

---

## 5. Typography

- **UI/headline font:** Inter (fallbacks Söhne, GT America). Use for hooks, labels, the BuildOS mark.
- **Notes/longform font:** IBM Plex Serif / Literata. Use for a **handwritten-thought** or **quote** card — the "field notes" voice.
- **Hierarchy:** one clearly dominant element per card. Hook = `text-3xl`–`text-5xl` semibold. Body = `text-base`. Metadata = the **micro-label** pattern: uppercase, `0.65rem`, `0.15em` tracking, often in accent (e.g. `THE MUDDY MIDDLE`, `BEFORE / AFTER`).
- **Never** arbitrary tiny sizes; the scale floors at ~11px.
- Eyebrow micro-labels are the BuildOS "printed label" tell — use them to anchor the card's section/theme.

---

## 6. The card anatomy (composition is 50% of the result — same idea as iklipse's "Camera = 50%")

A strong Inkprint card, like a strong photo, is **composition first, decoration last**. The card equivalents of camera angle / distance / light:

- **The dominant** (= the subject): the one thing the eye lands on first — the hook line, the before/after pair, the single number. Commit to it; don't let three things tie for attention.
- **The eyebrow** (= the label that orients): a micro-label top-left or top-center telling the reader what they're looking at.
- **The texture field** (= the lighting/mood): the one `tx-*` behind the surface, carrying the emotional register (Static = overwhelm, Frame = calm).
- **The accent** (= the single bright accent / catch-light): one burnt-orange element. The eye needs exactly one place to rest.
- **The breathing room** (= the negative space): paper space top-weighted so it survives the feed crop and feels calm, not crammed. Relief is a layout property, not just a word.
- **The chrome** (= the frame, kept light): BuildOS has **no rigid chrome standard** (unlike 9takes' fixed corners). The rule is the opposite — chrome stays small and unobtrusive so the _proof_, not the brand mark, dominates. Default: a small BuildOS wordmark (or none) in one consistent corner across a set; **handle/URL live in the caption, not burned onto the card.** Don't frame the work; let the work read.

**The pattern-break device** (the single strongest composition trick, ported straight from iklipse §13): show a **pattern** and let **one thing break it** — e.g. a grid of identical scattered notes and **one** that's been pulled into a clean structured row; five greyed dead tools and **one** lit BuildOS panel. The eye finds the subject instantly and the meaning lands without a caption.

---

## 7. The three real-media asset types (what a card "shot" can be)

When `/ideate` or `/moodboard` directs a **default (brand-ON, real-media)** asset, it is one of these. Each has its own mini-skeleton (the commands carry the full spec):

1. **Inkprint card** — a designed text/quote/diagram graphic. Output = a **production brief** (background token, texture, the exact on-card text verbatim, the dominant, the accent placement, chrome, aspect ratio) for **Canva** or the **gemini-imagegen** skill (Nano Banana Pro renders text-in-image cleanly). Sub-types: _hook card_, _pain-list card_, _quote card_, _transformation/arrow card_, _diagram card_.
2. **Before/after composition** — real BuildOS **screenshots**, arranged. Output = a **capture + layout brief**: exactly which two real product states to screenshot (the messy input vs the structured result), the split (side-by-side / stacked / swipe), the labels, the one accent, and the crop. _The screenshots themselves are real and never AI._
3. **Screen-recording storyboard** — the hero video. Output = a **shot list**: the exact brain-dump text to type/speak, the on-screen beats (what the viewer should see happen), the duration per beat, the on-screen captions, and the VO line. Real product, real cursor, real result.

A fourth, **founder footage**, is real video of DJ using BuildOS — directed as a storyboard, never synthesized.

---

## 8. Caption + on-card copy voice (BuildOS founder voice)

On-card text and captions follow the brand voice: **grounded, clear, relieving, lightly contrarian.** Lead with **relief**, not AI. Use the brand's own terms — _thinking environment, messy thinking, structured work, project memory, the next move, the project remembers._ Avoid the leading-with-AI traps (_AI-powered, productivity tool, agentic, ontology_ at first contact).

- Ground every factual claim in something real (a real screenshot, a real number, a real workflow). No invented proof.
- The turn that lands: a **concrete mess → a calm structure** ("revision notes in four places → one revision plan, two minutes later").
- Name **BuildOS** at the close, don't strip it. (Confirm sign-off + caption rules against `FOUNDER_CONTEXT.md`.)

---

## 9. Brand non-negotiables (the checklist every card must pass)

- [ ] **Real media** unless the AI-scene lane was explicitly opened for a non-product abstract frame (and flagged).
- [ ] **Burnt orange** (`#b85416`) is the only accent, used once. No 9takes amber, no rainbow, no neon glow, no robot/sparkle-AI imagery.
- [ ] **One texture**, semantic, weak/medium behind text. Before = Static; After = Frame/Thread.
- [ ] **One dominant** element; top-weighted; breathing room; survives the feed crop.
- [ ] **Chrome stays light** — small/unobtrusive mark (or none), consistent corner; handle/URL in the caption, not on the card.
- [ ] Reads in **light or dark** as the same printed artifact.
- [ ] Lead with **relief**, name **BuildOS** at the close, ground every claim in something real.
- [ ] Feels like a **dispatch from the workbench**, not a content-farm graphic or a sales diagram.

---

## Go deeper

- `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` — full design system (tokens, textures, weights, components).
- `docs/marketing/brand/brand-guide-1-pager.md` — voice, audience order, terms, the Real Media Rule.
- `docs/marketing/brand/BUILDOS_REAL_MEDIA_POLICY.md` — the real-media do/don'ts.
- `docs/marketing/brand/BUILDOS_PROOF_AND_PRESENCE_DOCTRINE.md` — "receipts over vibes," and **10 ready-made real-media scene ideas** (The Return Test, The Chaos Tray, The Red String Without Red String, Before/After Receipt, The Interrupted Founder, The Workbench Screen, …) — mine these for before/after + storyboard assets.
- `docs/marketing/social-media/publish-kits/2026-03-12-do-this-asset-template.md` — the existing `DO THIS / INSTEAD OF THIS` card format (4:5, the three image-treatment options).
- `docs/marketing/social-media/FOUNDER_CONTEXT.md` — DJ's voice ("interesting guy + cheerleader," not thought leader; receipts over vibes; lead with curiosity; handle `@djwayne3`).
- `references/iklipse-source/` — the "direct, don't prompt" evidence layer (Character+Conflict+Curiosity, camera→emotion, the directing spine) that the composition method here is ported from.
- `references/ai-scene-lane.md` — the opt-in AI-image lane (off by default).
