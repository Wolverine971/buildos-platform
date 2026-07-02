<!-- docs/marketing/visual-assets/references/ai-scene-lane.md -->

# The AI-Scene Lane — OFF by default, opt-in only

> The iklipse "direct, don't prompt" image engine, available to BuildOS **only** for abstract, illustrative, non-product mood frames — and **only when explicitly turned on** per asset. This is a _deliberate, flagged deviation_ from BuildOS's standing Real Media Policy. Read §0 before you ever use it.

---

## 0. Read this first — the policy this deviates from

BuildOS's `BUILDOS_REAL_MEDIA_POLICY.md` is unambiguous:

> BuildOS marketing uses **zero AI-generated images and zero AI-generated videos**… AI can help with text seeds, outlines, hooks, or editing prompts. **It cannot create the image or video asset.**

That is the **default and the strategic counterposition** (no synthetic spectacle; show the actual work). This lane exists because the founder explicitly opted into a **hybrid**: real-media by default, with a narrow exception for _evocative, clearly-illustrative, non-product_ scenes (e.g. a mood frame of scattered sticky notes for an Instagram hook). It does **not** loosen the rule for anything that could be mistaken for product proof.

**Hard boundaries (never cross):**

- **Never AI-generate product UI.** No fake BuildOS screens, dashboards, panels, or anything that implies a real workflow. Product = real screenshots/recordings, always.
- **Never AI-generate the founder.** No synthetic DJ, avatars, talking heads, or workspace-as-proof.
- **Never present an AI scene as a receipt.** It is atmosphere/illustration, not evidence.
- **Always flag it.** Any asset using this lane is labeled in its plan as `AI-SCENE (brand deviation)` so it's never mistaken for real media.

If the frame could make a viewer think "that's BuildOS" or "that's DJ" or "that's proof," it is **out of bounds** — capture the real thing instead.

**Good uses (in bounds):** an abstract "the muddy middle" mood frame; scattered-notes / tab-overload chaos as a _feeling_, not a real screen; a metaphorical "drowning in tools" hook image for IG. **All non-product. All clearly illustrative.**

---

## 1. The engine — direct, don't prompt

The one rule that makes AI images not look generic (the account's #1 post, 1,476♥): **Don't prompt AI. Direct it.** The sequence is **Idea → Reference → Art Direction → Camera → Light → Prompt.** _The prompt comes later than you think._ Lock the vision in steps 1–5; the prompt in step 6 just transcribes decisions you already made.

1. **Idea** — what is this image _about_? (not the setting — the meaning)
2. **Reference** — what should it _feel_ like? (a film look, a photographer's mood, in words)
3. **Art direction** — what should it _look_ like? (world, palette, era, styling)
4. **Camera** — how is it _seen_? (angle + distance + lens — see §3)
5. **Light** — the mood-maker (direction + quality + source + time)
6. **Prompt** — tell the tool what you already decided (§4)

## 2. The story test (every frame must pass) — Character + Conflict + Curiosity

A pretty image with nothing happening fails. Each frame needs:

- **Character** — someone/something to care about ("who is this?")
- **Conflict** — something wrong, changing, or at stake ("what's going on?")
- **Curiosity** — something left unanswered ("what happens next?")

_Curiosity outperforms clarity._ Show enough to understand, hide enough to make them wonder. For BuildOS scenes, the Character is the maker mid-mess, the Conflict is the scattered/forgetting problem, the Curiosity is _what changes_ (the relief just out of frame).

## 3. Camera — angle → emotion (the cheat sheet)

Pick the angle that _accentuates the feeling_ — never default to eye level by accident. **Camera = 50% of the result.**

| Angle             | Creates                  | Use when                                      |
| ----------------- | ------------------------ | --------------------------------------------- |
| Eye level         | trust, honesty           | unguarded connection                          |
| Low angle         | authority, dominance     | the subject should loom                       |
| High angle        | vulnerability, smallness | exposed, defeated, buried                     |
| Bird's-eye / top  | scale, overwhelm         | the desk-mess that dwarfs them; pattern shots |
| Dutch tilt        | tension, unease          | something is wrong / psychological            |
| Over-the-shoulder | immersion, presence      | see what they see                             |

**Distance:** extreme close-up (a single feature = obsession/intimacy) · close-up (emotion) · medium (action) · wide (loneliness, context) · extreme wide (scale).
**Lens:** `24–35mm` wide = environmental, the _world_ · `50mm` = honest baseline · `85mm` = intimate separation · `100mm macro` = obsessive detail · `135mm+` = voyeur compression.

## 4. The prompt skeleton (only after 1–5 are locked)

**Default tool: ChatGPT (GPT Image)** — it follows a labeled natural-language production brief better than a keyword string. Describe **one believable frame** as if briefing a photographer. Wrap every prompt in a fenced code block so it copy-pastes.

```
Photorealistic [POV / framing].
Scene: [where + when + the world detail].
Subject: [who / whose eyes, doing or seeing what — NON-PRODUCT, NON-FOUNDER].
Details: [specific real props, textures, the one true tell; crowds = "a blurred, undetailed mass"].
Camera: [angle + distance + lens-mm].
Light: [direction + quality + single dominant source + time of day].
Color & finish: [palette; where the burnt-orange BuildOS accent lives, if any; photorealistic, real imperfections, film grain].
Constraints: [NO BuildOS UI / NO real product screen / NO identifiable founder; anti-yellow-tint on cold shots; keep shadow detail on dark shots; no on-image text].
Format: [square 1:1 (1024×1024) or 4:5 portrait].
```

**ChatGPT guardrails (learned the hard way):**

- **Beat the yellow-tint bias.** GPT Image pushes a global warm cast. On cold/neutral scenes add _"do NOT apply a global warm/yellow cast; keep shadows cool grey-blue."_ A genuinely warm scene is the exception.
- **Beat "too dark."** Name the single light source; add _"keep shadow detail visible, not crushed black."_
- **Beat "too many subjects."** Crowds/clutter = _a blurred, undetailed mass_; never request many distinct rendered faces.
- **Photorealistic + real texture.** Open with "Photorealistic"; request real imperfections (dust, fabric wear, film grain) to fight the glossy AI look.
- **No render tails.** No `Unreal Engine / octane / 8k / hyper realistic / make-it-epic` — they produce the generic AI look. Keep only: the moment, camera, light, palette, format.
- **Format in words, not flags** (no `--ar` for ChatGPT).

**Text-bearing panels** never go through ChatGPT — those are Inkprint cards (Canva or the `gemini-imagegen` skill / Nano Banana Pro, which renders in-image text cleanly). Photo captions are overlaid _after_ generation.

## 5. BuildOS brand layer for AI scenes

Even an AI scene wears the BuildOS feel: **burnt orange** (`#b85416`) as the single accent (a warm sliver of light, a lamp, a lit screen edge) against muted paper/charcoal — **never** the old 9takes amber/gold, never neon, never purple-AI sparkle, never robot imagery. The mood is **relief out of chaos**, not futuristic spectacle.

## 6. Variation + kill

Per frame, emit the prompt **plus a variation axis** (the one knob to spin for 2–3 alternates) and a **kill rule** (keep only the frame where the feeling is unmistakable and the composition is strong). AI gives quantity; you supply quality. Generate the strongest frame first, approve it, then upload it as a style reference for any others so grain/palette stay consistent.

---

## Go deeper

- `references/iklipse-source/` — the full source analyses this engine is distilled from (`iklipse-dont-prompt-ai.md`, `iklipse-3-step-story-formula.md`, `iklipse-camera-angle-cheat-sheet.md`, `iklipse-only-ai-workflow.md`, `iklipse-better-ai-results.md`, `iklipse-ai-and-emotions.md`).
- `references/inkprint-card-system.md` — the real-media default lane (where most BuildOS assets belong).
- `docs/marketing/brand/BUILDOS_REAL_MEDIA_POLICY.md` — the standing policy this lane deliberately and narrowly deviates from.
