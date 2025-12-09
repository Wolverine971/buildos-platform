<!-- redesign-3-bible.md -->

# BuildOS “Inkprint” Design System Bible (Long Version)

_A go-to reference for designing new pages and refactoring existing UI. If you’re about to add a component, change spacing, pick a color, or make a “quick” UI tweak—check this first._

---

## 0) What this system is (and why it exists)

### The problem we’re solving

Most SaaS design systems are “clean glass panels”: gradients, blur, soft shadows, perfect geometry. That’s fine for dashboards that want to feel neutral.

BuildOS is not neutral. BuildOS is:

- an **operating system for a messy mind**
- a **context engine**
- a **project ontology** that turns chaos into structure

So the UI should do two things at once:

1. **Support dense cognition** (lots of information, fast scanning, minimal friction)
2. **Communicate state without words** (synesthetic: you can _feel_ where you are)

### The core metaphor

**Ink on paper. Carved printmaking. Field notes.**

- Interfaces feel _printed_ and _tactile_, not glossy.
- Structure feels _carved_ (linocut/woodcut), not “floating”.
- Meaning can be encoded in _texture_, not just color.

### What “Inkprint” is NOT

- Not skeuomorphic “leather notebook”
- Not distressed grunge everywhere
- Not “texture as decoration”
- Not heavy noise that reduces readability

**Inkprint = semantic texture + disciplined layout + ruthless readability.**

---

## 1) The Laws (non‑negotiables)

### Law 1 — Readability beats texture

Textures are a _second channel_.
If text contrast suffers or the surface feels noisy: lower texture intensity or remove it.

### Law 2 — One surface = one texture

A single card/panel gets **at most one** texture token (Bloom/Grain/Pulse/Static/Thread/Frame).
Nested surfaces can have different textures only if the hierarchy is clear (outer “Frame”, inner “Static” for warnings).

### Law 3 — Meaning is consistent

If **Pulse** means urgency in one place, it means urgency everywhere.
No remixing textures just because they “look cool.”

### Law 4 — Use tokens, not random Tailwind colors

Don’t sprinkle `bg-slate-950` or `text-gray-700` across the app.
Use semantic tokens: `bg-background`, `bg-card`, `text-muted-foreground`, `bg-accent`, etc.

### Law 5 — Printed, not plastic

Prefer:

- crisp borders
- subtle inner shadows
- small, controlled outer shadows

Avoid:

- strong glows
- heavy blur “glass” for primary surfaces
- neon gradients

---

## 2) The system architecture (how it’s implemented)

Your current Tailwind setup already uses a good foundation:

- `darkMode: 'class'` for explicit theming
- a `withOpacity(...)` helper that maps Tailwind colors to CSS variables (clean + scalable)

Inkprint continues that approach: **CSS variables define the theme; Tailwind consumes them.**

### Why CSS variables?

- One place to define light/dark palettes
- Easy future theming (“sepia mode”, “high contrast mode”, “brand skins”)
- Keeps components stable while allowing global change

---

## 3) Visual Principles (the “why” behind the look)

### 3.1 Tactile clarity

Everything should feel _touchable_ and _bounded_:

- Borders are like ink lines.
- Inner shadows feel like pressed paper.
- Buttons feel like stamped labels.

### 3.2 Information-first hierarchy

BuildOS surfaces often contain:

- structured tasks
- ontology nodes
- diff views
- notes + metadata
- status signals

So hierarchy must be:

- fast to scan
- easy to chunk
- consistent across screens

### 3.3 Synesthetic meaning

We’re giving users a second sensory channel:

- Not just “red means danger”
- But also “Static means chaos / blockage”
  This reduces cognitive load. People learn the “feel” of states.

---

## 4) The Inkprint “Texture Grammar” (synesthetic layer)

Textures are **semantic tokens**. Each represents an internal state.

### 4.1 Texture tokens and meaning

Use these names everywhere:

- **Bloom** (`tx-bloom`) — _ideation, newness, creative expansion_
  _Feels like:_ airy, open, radiating
  _Use for:_ creation flows, onboarding, “new project”, “draft”, inspiration sections

- **Grain** (`tx-grain`) — _execution, steady progress, craftsmanship_
  _Feels like:_ friction, steady pull, woodgrain
  _Use for:_ active work views, task lists, “in progress”, checklists

- **Pulse** (`tx-pulse`) — _urgency, sprints, deadlines, momentum_
  _Feels like:_ thump, heartbeat, acceleration
  _Use for:_ “today focus”, deadlines, priority zones, sprint banners

- **Static** (`tx-static`) — _blockers, noise, overwhelm, risk_
  _Feels like:_ buzzing, interference
  _Use for:_ error states, blockers, warning modules, messy inputs, “needs triage”

- **Thread** (`tx-thread`) — _relationships, collaboration, dependencies_
  _Feels like:_ woven, intertwined
  _Use for:_ shared projects, dependency graphs, collaboration cues, “linked” entities

- **Frame** (`tx-frame`) — _canon, structure, decisions, officialness_
  _Feels like:_ carved border, final form
  _Use for:_ primary containers, canonical project overview, modals, important surfaces

- **Strip** (`tx-strip`) — _header band / separator / printed label strip_
  _Feels like:_ top margin of a printed poster
  _Use for:_ top borders, card headers, navigation separators, section transitions

### 4.2 Texture intensity rules

Each texture has three intensities (recommendation):

- **Weak**: default for most UI surfaces
- **Medium**: hero surfaces and section headers
- **Strong**: marketing hero, large banners, background-only areas

**Rules of thumb**

- Body text over texture: **Weak** only
- Headers can tolerate **Medium**
- Strong textures should _not_ sit behind dense text blocks

### 4.3 Texture layering (do/don’t)

✅ Do:

- Frame on outer container, then Static inside an alert box
- Strip for headers, Frame for the card body

❌ Don’t:

- Static texture as the background behind an entire data table
- Multiple textures stacked on the same surface
- Random textures “because variety”

### 4.4 Mapping textures to product states (canonical mapping)

This is the consistency contract:

| Concept                                | Texture |
| -------------------------------------- | ------- |
| “New / Draft / Idea capture”           | Bloom   |
| “Working / Executing”                  | Grain   |
| “High priority / Deadline”             | Pulse   |
| “Blocked / Error / Risk”               | Static  |
| “Depends on / Shared with / Linked to” | Thread  |
| “Approved / Canon / Primary UI”        | Frame   |

**If you need a new meaning, create a new semantic token and document it. Do not overload existing ones.**

---

## 5) Color system (paper + ink + accent)

### 5.1 The philosophy

Color is not the star. **Texture + hierarchy are the star.**
Color provides:

- legibility
- semantics (success/warn/danger/info)
- one brand accent (BuildOS “signal” color)

### 5.2 Semantic tokens (what to use in Tailwind)

Use these everywhere:

- `bg-background`, `text-foreground`
- `bg-card`, `text-card-foreground`
- `bg-muted`, `text-muted-foreground`
- `border-border`
- `bg-accent`, `text-accent-foreground`
- `ring-ring`

This matches the direction of your Tailwind architecture (CSS vars + opacity helper) .

### 5.3 Light vs dark mode philosophy

- **Light mode:** “paper studio” — warm whites, ink lines visible, textures subtle
- **Dark mode:** “ink room” — near-black surfaces, textures switch to screen-like blend, accent glows slightly (but controlled)

The key: **light and dark should feel like the same printed artifact under different lighting**, not like two different brands.

### 5.4 Status colors + texture pairing

Status should never be color alone—pair with texture where appropriate:

- Success: color + **Grain** (steady progress)
- Warning: color + **Static** (interference)
- Danger: color + **Static** (stronger)
- Info: color + **Thread** (connection / message)

---

## 6) Typography system (scan-first, not “marketing font soup”)

### 6.1 Type roles

You already have a great split between:

- `font-ui` (Inter/Söhne/GT America etc.)
- `font-notes` (serif for scratch/notes)

Inkprint uses that split intentionally:

**UI type (default):**

- commands, buttons, labels, navigation
- crisp and modern

**Notes type (optional surfaces):**

- longform thinking
- journaling
- scratchpad mode
- “field notes” vibe

### 6.2 Hierarchy model

Inkprint type is built for **dense hierarchy**:

**H1 / Hero**

- big, but not airy
- tight tracking
- minimal gradient usage (texture highlight is preferred)

**H2 / Section title**

- strong but compact
- paired with a “strip” header texture when needed

**Micro-label**

- uppercase, wide tracking
- used for metadata (“Ontology: …”, “Project State”, timestamps)
- these are your “printed captions”

**Body**

- 14–16px for normal UI
- 12–13px for dense views (diffs/tables), but increase line-height

### 6.3 Typography plugin usage

You already have typography support and extensive configuration for prose rendering .
Inkprint guideline:

- `prose` is for rich markdown surfaces ONLY
- Wrap markdown areas in a `Card` with **weak** texture
- Avoid textures stronger than weak behind `prose`

---

## 7) Layout + spacing (how pages should “feel”)

### 7.1 Two density modes (BuildOS needs both)

BuildOS has both:

- “calm” pages (overview, onboarding)
- “dense” pages (ontology, diffs, editor)

You already have a dense spacing scale in Tailwind (`dense-3` … `dense-20`) .
Inkprint formalizes this:

**Comfort mode**

- used for marketing, onboarding, settings
- generous section spacing
- more texture allowed

**Dense mode**

- used for ontology views, diff views, tables
- reduce texture (weak or none)
- tighter spacing, stronger borders, clearer column alignment

### 7.2 Grid rules

- Pages are typically:
    - max width container
    - left: content
    - right: supporting panel (context, metadata, actions)

- Avoid full-bleed dense content without strong separators.

### 7.3 Surface rhythm

Inkprint UIs should have a recognizable rhythm:

- background (paper)
- big section separators (Strip)
- cards (Frame)
- internal groupings (simple border + muted background)

---

## 8) Surfaces + elevation (the “paper stack”)

### 8.1 Surface levels

Use these conceptual levels:

1. **Background**
   `bg-background`
   The paper field.

2. **Card / Panel**
   `bg-card border-border shadow-ink`
   The main printed sheet.

3. **Inset**
   `bg-background border-border shadow-ink-inner`
   A sub-surface inside a card (like a pasted-in note).

4. **Overlay (Modal/Popover)**
   `bg-card shadow-ink-strong` + Frame texture
   Feels like another sheet placed on top.

### 8.2 Shadows (keep them “ink-like”)

Your current config includes many shadows (`soft`, `card`, `card-hover`, etc.) .
Inkprint narrows shadows to a few purposeful ones:

- **Inner shadow** for inputs / inset surfaces
- **Soft shadow** for cards
- **Strong shadow** only for overlays

**Why?** Too many shadow styles destroys the “printed” metaphor and becomes generic SaaS.

---

## 9) Component styling (canonical recipes)

This section is where you check “how should X look?” before inventing styles.

### 9.1 Buttons

**Goal:** stamped labels / punchy actions

**Shapes**

- primary buttons: pill / rounded-full
- secondary buttons: pill, outlined

**Variants**

- Primary action: **accent** (rare)
- Default action: **ink** (foreground on background)
- Secondary: outline
- Destructive: danger (paired with Static texture)

**Texture usage**

- Buttons can carry light texture if they represent a “mode” (Pulse for “Sprint now”).
- Don’t texture every button. Texture = meaning.

**Interaction feel**

- Press = 1px down (subtle)
- Hover = slight opacity shift
- Focus = strong ring, always visible

### 9.2 Cards

**Goal:** carved printed panels

**Always**

- `border-border`
- `shadow-ink`
- `ink-frame` (carved inner border)
- optional semantic texture (weak)

**Card structure**

- Header: label + title + small action
- Body: content
- Footer: actions aligned right

**When to use which texture**

- Frame = default for important cards
- Grain = active work cards
- Bloom = new/draft cards
- Static = triage cards

### 9.3 Inputs

**Goal:** paper inputs, crisp borders, inner press

- Rounded 2xl (not full pills—inputs should feel “fillable”)
- Inner shadow
- Focus ring visible
- Error state: danger border + Static texture optional _only around the field group_, not inside the input

### 9.4 Modals

**Goal:** placed sheet, not floating glass

- Strong shadow
- Frame texture (weak)
- Backdrop: background wash + Static texture weak
- Entrance: ink-in (fast, not bouncy)

Your current config includes animation primitives like slide/fade/scale and shimmer . Inkprint reinterprets these as “ink set” motion: quick settle, minimal bounce.

### 9.5 Tabs / Navigation

**Goal:** editorial, printed index tabs

- inactive: muted text
- active: foreground + Strip underline
- container: border line (paper edge)

### 9.6 Alerts / Toasts

**Goal:** warnings feel like “interference” (Static), success feels “crafted” (Grain)

- Alert background is subtle tinted surface
- Pair warning/danger with Static texture weak
- Toasts should be Cards (Frame/Thread) not random shadows

### 9.7 Skeletons / Loading

**Goal:** shimmer is allowed, but must feel consistent

You already have `shimmer` keyframes .
Inkprint guidance:

- shimmer lives on `bg-card` / `bg-muted` surfaces
- keep it subtle; loading should not “steal attention” from the page

---

## 10) Motion system (brand motion = “ink set”)

### 10.1 Motion personality

- confident
- quick
- minimal flourish
- no “floaty bouncy”
- tactile press feedback

### 10.2 Motion tokens

Use a small set:

- fast: 120ms
- default: 180ms
- slow: 260ms
- easing: “ink” (smooth settle) and “snap” (quick)

### 10.3 Where motion is allowed

✅ allowed

- modal open/close
- toast in/out
- hover/press on buttons
- small section reveals

❌ avoid

- constant looping animations (except subtle shimmer)
- large background motion textures
- excessive parallax

### 10.4 Reduced motion

Always respect `prefers-reduced-motion`. If motion is removed, the UI should still read correctly.

---

## 11) Accessibility and cognitive ergonomics

### 11.1 Contrast requirements

- Text on textured surfaces must meet contrast standards
- If texture reduces contrast, reduce intensity or remove texture

### 11.2 Focus styling is not optional

All interactive elements must show a visible focus ring.

- Focus ring should be consistent across components
- Avoid custom “outline: none” without replacement

### 11.3 Cognitive load management

Because BuildOS is information dense:

- Use micro-labels to anchor meaning (user knows what section they’re in)
- Chunk with borders and headings
- Avoid large blocks of undifferentiated content

### 11.4 Error recovery design

Errors are not just “red text.”
They should be:

- clearly bordered
- textured (Static)
- include next action (“Retry”, “Fix”, “Contact”)

---

## 12) Content + voice (microcopy rules)

Inkprint is editorial. Microcopy should be:

- direct
- compact
- confident
- slightly human, not corporate

**Examples**

- “Next move” (not “Recommendation”)
- “Blocker” (not “Error occurred”)
- “Capture → Shape → Drive” (verbs, not nouns)

Use micro-labels for metadata:

- “Ontology: …”
- “Context: 18 docs, 37 tasks”
- “Updated: 2h ago”

---

## 13) How to design a NEW page (checklist)

### Step 1 — Choose the density mode

- Is this overview/onboarding? → Comfort mode
- Is this ontology/diffs/editor? → Dense mode

### Step 2 — Choose the primary surface structure

Most pages should be:

- background (paper)
- header (strip or border)
- content: cards
- optional right panel

### Step 3 — Decide the semantic texture(s)

Pick 0–2 textures total for the page:

- 1 main theme texture for hero/primary
- 1 optional state texture for alerts/priority

### Step 4 — Build with primitives only

Start by composing:

- Card
- Button
- Inputs
- Modal
- Tabs

If you need a custom component: define it as a composition of primitives.

### Step 5 — Add motion last

Motion should reinforce hierarchy, not create it.

---

## 14) How to UPDATE existing pages (migration playbook)

### 14.1 The refactor mindset

You’re not “reskinning” components; you’re **normalizing meaning**:

- Replace random styling with tokens
- Replace decorative patterns with semantic textures
- Replace ad-hoc spacing with density rules

### 14.2 Step-by-step refactor flow (recommended order)

#### Pass A — Tokenize colors

Search and replace:

- `bg-white`, `bg-slate-*`, `text-gray-*`, `border-gray-*`
  → replace with:
- `bg-background`, `bg-card`, `bg-muted`
- `text-foreground`, `text-muted-foreground`
- `border-border`

(Do this first so light/dark mode becomes stable.)

#### Pass B — Normalize surfaces

Every page should have clear “paper stack” structure:

- Wrap major sections in Card
- Replace custom panels with `bg-card border-border shadow-ink`

#### Pass C — Normalize typography

- Replace custom heading sizes with consistent scale
- Use micro-label pattern for metadata
- Ensure prose areas use typography plugin only where needed

#### Pass D — Add semantic textures

Only after structure is clean:

- Add Frame to canonical cards
- Add Grain to work-in-progress lists
- Add Static only to warnings/errors/triage areas

#### Pass E — Motion + affordances

- Convert buttons to pressable behavior
- Ensure focus rings exist
- Replace “random” animations with ink-in/out patterns

### 14.3 Anti-pattern fixes (common)

- **Problem:** page looks “busy”
  **Fix:** reduce textures → weak only; remove on dense tables; increase whitespace around groups

- **Problem:** everything is a “card” but nothing feels important
  **Fix:** Use Frame only for primary; use plain bordered insets for secondary; reserve strong shadow for overlays

- **Problem:** too many colors
  **Fix:** everything goes through semantic tokens; only accent for primary actions and key highlights

- **Problem:** dark mode feels like a different app
  **Fix:** same hierarchy, same textures, same density; only the paper/ink inversion changes

---

## 15) Decision log (why these choices)

### Why textures?

Because BuildOS is about **state**:

- Where am I? (capture vs execute vs urgency vs blocked)
- What should I feel? (calm vs focus vs sprint vs interference)

Texture is a low-cognitive-load signal once learned.

### Why “printed”?

Printed design feels:

- authoritative
- structured
- tactile
  It reinforces the “operating system” concept: something you trust and rely on.

### Why minimal color?

Because color is fragile:

- accessibility issues
- dark-mode drift
- “status rainbow” fatigue

Texture + hierarchy survive theme changes much better than color.

---

## 16) “Before you ship” checklist (quick)

- [ ] Did you use semantic color tokens instead of random Tailwind colors?
- [ ] Is texture semantic, consistent, and low enough intensity for readability?
- [ ] Are surfaces clearly layered (background → card → inset → overlay)?
- [ ] Do buttons feel pressable and consistent?
- [ ] Can you scan the page in 3 seconds and understand the hierarchy?
- [ ] Does it still feel like BuildOS in both light and dark?
- [ ] Are focus states visible everywhere?
- [ ] Does reduced motion still work?

---

If you want, I can turn this into a **`DESIGN_SYSTEM.md`** structure that matches your repo (with links to specific components in `components/ui`, naming conventions, and “approved recipes” per view type like Ontology, Scratchpad, Diff, Settings).
