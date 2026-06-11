<!-- references/token-taxonomy-and-ai-context.md -->

# Token Taxonomy, Tiering & AI-on-Grain Context

Load for token-deep-dives and for any "generate / scaffold UI from the system" review. Holds the tiering and naming mechanics, the core-plus-child architecture, and the rules for feeding the system to an LLM. Cite Frost (SmashingConf NY 2024, "Is Atomic Design Dead?") and Curtis for naming.

## Tokens as single source of truth (Frost 2024)

Design tokens are the **single source of truth for values, published OUT** to: code, design tools (Figma), the reference docs, and ingested by native apps. This is the maturity target — one source, many published targets.

Agent-checkable: a token system is **not** single-source-of-truth if any consuming surface (code, Figma, docs, native) holds a hardcoded value that should be a token. Flag every hardcoded color/space/radius/type value that duplicates an existing token as a **drift point**.

In BuildOS terms the token layer is Inkprint: `bg-card`, `text-foreground`, `shadow-ink`, texture classes (`tx-bloom`, `tx-grain`). Light/dark via `dark:` is already token-driven theming — that is the model, extend it, don't bypass it.

## Three-tier token taxonomy (the check)

Every token must sit in exactly one tier. If you can't name the tier, the token is mis-scoped.

| Tier | Role | Naming shape | Example | Rule |
| --- | --- | --- | --- | --- |
| **Option / core** | Raw, brand-agnostic values | `{property}-{scale}` | `gray-700`, `space-4`, `blue-500` | No component or intent in the name. Never referenced directly by components. |
| **Semantic / decision** | Intent-mapped, theme-aware | `{role}-{property}` | `text-foreground`, `bg-card`, `border-default` | Components consume THESE, not core. Re-points per theme (light/dark). |
| **Component / recipe** | Per-component overrides | `{component}-{part}-{property}` | `button-primary-bg`, `card-shadow` | Optional. Only when a component needs a value the semantic tier can't express. Resolves to a semantic token, not a raw core value. |

Agent-checkable failures:
- A component referencing a **core** token directly (skips the semantic tier) → naming/tiering violation.
- A component token resolving to a **raw core value** instead of a semantic token → broken indirection.
- A semantic token with a literal value baked in (`text-foreground: #111`) instead of pointing at a core token → no theme portability.
- "Broad token flexibility" with no tier rule → reject; demand the tier + naming rule first (this is the skill's existing guardrail, operationalized).

## Core + child / recipe design systems (Frost 2024)

Scale without one-size-fits-all: a **core** design system plus **child / recipe** systems that are product-specific and **build on the core** (they consume core tokens + components, never fork them).

Agent-checkable:
- A child/recipe system that **redefines core values** instead of theming via tokens → it has forked, not extended. Flag.
- A child system the core team can't ship a token change through (the change doesn't propagate) → broken inheritance.

## Un-styled base + token themes (the anti-"baked aesthetic" rule)

Frost 2024: the Bootstrap/Material failure is shipping a **default aesthetic** consumers then "hack the shit out of." Ship components **close-to-the-metal / un-styled**, then layer **design tokens + themes** through web components.

Agent-checkable: a base component that hardcodes brand styling (a specific color, a "drop shadow the world has never seen") rather than reading from tokens → fails the un-styled rule. Vanity styling is **not** a justification to deviate from the tokenized/native baseline.

## Web components as cross-framework single source of truth (Frost 2024)

Web components remove the need to rebuild "the same freaking accordion" per framework — one source of truth fed from code to any product, framework-agnostic. Build **through real production frontend code** (Storybook environments), then hand to backend to wire up. Not isolated component museums.

Agent-checkable: the same component reimplemented per framework (a React accordion AND an Angular accordion AND a Svelte accordion, hand-maintained) → a single-source-of-truth gap; name the duplication.

## AI-on-grain: feed the system as light context (Frost 2024 reciprocal thesis)

"AI is part of our design-system toolkit now. But also, design systems are part of our AI toolkit." The load-bearing insight: the design system supplies **"sturdy, settled, well-considered constraints"** that stop an LLM "going all over the place like a garden hose with nobody holding it."

Rules (agent-checkable, not hype):

1. **Light context, not fine-tuning.** Feed a **"table of contents" of components** — "here's the accordion, it has these props" (Storybook-style docs: component names, props/shapes, tokens). Do **not** feed the whole codebase; do **not** assume a trained model. Setup is "super-light." Flag any plan that proposes fine-tuning where a component/props/token manifest would do.
2. **The differentiator is the context, not the model.** Raw ChatGPT does "an okay job" off-grain. On-grain output requires the system's conventions in context. A generation feature that omits the design-system manifest → predicted off-grain output; flag it.
3. **Generate on-grain components** — output must emit named system primitives (`DS grid`, `DS card`) and check into Storybook, not raw divs.
4. **Translate across stacks** — React/Storybook → web components by a button push; a **YAML spec** of "what a date picker does" → functional code. Use AI for the translation, keep the system as the target shape.
5. **Retrofit legacy products into the system = the single biggest adoption lever.** "Here's a messy existing site → run it through the system → design-system-powered experience out the other end." Multi-themed automatically because it's wired to the system architecture. When the review's bottleneck is adoption, the AI move is **retrofit existing surfaces**, not greenfield generation.
6. **Sentient Design context-stacking** (Josh Clark) — design system + user context + other context → adaptive/personalized output (color blindness, motor disability, language). AI tools are **design materials** designers steer, not autopilot.

BuildOS note: `packages/smart-llm` already runs the LLM stack. Any "generate UI / scaffold component" agent feature should feed the Inkprint component table-of-contents (names, props, tokens) as light context to keep output on-grain. An agent generating UI without that manifest is the garden hose.

## What "good" looks like (one-glance)

- Three named tiers, components consume semantic tier only, core never referenced directly.
- Tokens published to every consuming surface; zero hardcoded duplicates.
- Core + child via inheritance, not forks.
- Un-styled base + token themes; native/OS controls preferred over vanity styling.
- AI generation steered by a light component/props/token manifest; legacy retrofit prioritized for adoption.
