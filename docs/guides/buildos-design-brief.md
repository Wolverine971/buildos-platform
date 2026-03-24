# BuildOS Design Brief for Image Assets

## What BuildOS Is

**BuildOS** is an AI-powered productivity platform — an "operating system for a messy mind." Users write stream-of-consciousness brain dumps and AI extracts projects, tasks, and context. It includes daily briefs, calendar integration, ontology-driven project management, and agentic chat.

## Design System: "Inkprint"

The design language is called **Inkprint** — a synesthetic, texture-based system inspired by:

- **Halftone printing** — dot patterns, registration marks
- **Linocut / woodblock prints** — bold, carved, tactile surfaces
- **Field notes** — paper-like, utilitarian, worn-in

**Core metaphor:** Ink on paper. Carved printmaking. Field notes.

**It is NOT:** skeuomorphic leather notebook, distressed grunge, or "texture as decoration." It's disciplined, readable, and semantic.

## Color Palette

| Role | Light Mode | Dark Mode |
|------|-----------|-----------|
| **Background** | Warm off-white `hsl(40, 20%, 98%)` | Warm near-black `hsl(30, 6%, 11%)` |
| **Card surface** | Slightly warmer `hsl(40, 15%, 96%)` | Dark charcoal `hsl(30, 6%, 15%)` |
| **Primary text** | Deep ink black `hsl(240, 10%, 10%)` | Off-white `hsl(40, 10%, 92%)` |
| **Muted text** | `hsl(240, 5%, 45%)` | `hsl(40, 5%, 58%)` |
| **Borders** | `hsl(40, 10%, 85%)` | `hsl(30, 6%, 24%)` |
| **Accent (brand)** | Warm orange-amber `hsl(24, 80%, 55%)` | Slightly brighter `hsl(24, 85%, 58%)` |
| **Destructive** | Red `hsl(0, 72%, 51%)` | Brighter red |
| **Success** | Emerald `hsl(160, 84%, 39%)` | Brighter emerald |
| **Warning** | Amber `hsl(38, 92%, 50%)` | Brighter amber |
| **Info** | Blue `hsl(217, 91%, 60%)` | Brighter blue |

**Key:** Light mode = "paper studio" (warm whites, visible ink lines). Dark mode = "ink room" (near-black, textures switch to screen blend). Both should feel like the same printed artifact under different lighting, not two different brands.

## Typography

- **Primary (UI):** Inter, Sohne, GT America, system-ui (clean sans-serif)
- **Secondary (notes/longform):** IBM Plex Serif, Literata (for journaling/scratchpad areas)
- **Micro-labels:** 0.65rem, uppercase, wide tracking (0.15em) — for metadata like "UPDATED: 2H AGO"

## Texture Vocabulary (Semantic, Not Decorative)

Each texture maps to a **meaning**, not just a visual:

| Texture | Visual Pattern | Meaning |
|---------|---------------|---------|
| **Bloom** | Radial halftone dots | Ideation, newness, creative expansion |
| **Grain** | Diagonal lines (woodgrain) | Execution, steady progress, craftsmanship |
| **Pulse** | Horizontal stripes | Urgency, sprints, deadlines, momentum |
| **Static** | Fractal noise | Blockers, errors, overwhelm, risk |
| **Thread** | Crosshatch (woven) | Relationships, dependencies, collaboration |
| **Frame** | Grid lines (linocut carved) | Canon, structure, decisions, officialness |
| **Grid** | Graph paper | Input, editable, writable surfaces |
| **Strip** | Vertical bands | Header bands, separators, printed labels |

Textures are always very subtle (3-10% opacity). They're a "second channel" — never competing with readability.

## Weight System (Visual Mass = Importance)

| Weight | Metaphor | Visual Feel |
|--------|----------|-------------|
| **Ghost** | Onionskin paper | Dashed border, no shadow, transparent — ephemeral/suggestion |
| **Paper** | Bond paper | Solid border, subtle shadow — standard working state |
| **Card** | Cardstock | Thicker border, stronger shadow — important, committed |
| **Plate** | Metal plate | Double border, deep shadow + inset — system-critical, immutable |

## Visual Principles

1. **Dense, scan-first** — high information density, compact spacing, minimal decorative whitespace
2. **Printed, not plastic** — crisp borders, subtle inner shadows, small controlled outer shadows. No glows, heavy blur, or neon gradients
3. **Readability beats texture** — texture is a background channel, never competing with content
4. **Color is not the star** — texture + hierarchy are the stars. Color provides legibility, semantics, and one brand accent
5. **Tactile, pressable** — buttons have subtle press-down animation (1px translateY on active)
6. **Confident motion** — quick, minimal flourish, no floaty/bouncy. 120-280ms transitions depending on weight

## Brand Icon

The logo/icon is a **"brain bolt"** — available in the static assets directory. The brand accent is a warm orange-amber.

## Data Model Icons (Lucide)

| Entity | Icon | Color |
|--------|------|-------|
| Project | FolderKanban | emerald-500 |
| Goal | Target | amber-500 |
| Plan | Calendar | indigo-500 |
| Task | ListChecks | slate-500 |
| Milestone | Flag | emerald-500 |
| Output | Layers | purple-500 |
| Document | FileText | sky-500 |
| Risk | AlertTriangle | red-500 |
| Decision | Scale | violet-500 |

## Two Operating Modes

- **Mode A (Command Center):** Dense, scan-first, minimal scrolling, predictable alignment. This is the default for all app surfaces (dashboards, task lists, project views).
- **Mode B (Orientation/Brand):** Controlled asymmetry, atmospheric depth, used sparingly for landing pages, onboarding, empty states, and creation moments.

## What to Avoid

- Glass morphism, strong blur, neon gradients
- Clean/sterile/corporate SaaS aesthetics
- Heavy noise or grunge that reduces readability
- Skeuomorphic leather/wood/cork
- Bouncy/floaty animations
- Excessive whitespace in app surfaces

## What to Lean Into

- Paper + ink metaphor — warm, tactile, printed feel
- Halftone dot patterns as accents
- Linocut/woodblock boldness for hero moments
- Graph paper / field notes utility
- Dense information layouts with clear hierarchy
- The warm orange-amber accent as the singular pop of brand color
