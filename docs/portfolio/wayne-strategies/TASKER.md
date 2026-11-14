<!-- docs/portfolio/wayne-strategies/TASKER.md -->

# BuildOS portfolio replacement

Status: Complete — 2026-10-29

## Brief

Create the complete repo-owned `buildos` visual/content package for Wayne Strategies' `/work` portfolio. Show real engineering and interaction depth through sanitized interface compositions and direct assets. Keep the first layer a `site`; deliver 3–7 layers, a portable Svelte 5 component, assets, and an integration README. Work only in this repository; preserve unrelated changes and application behavior.

Contract: `/Users/djwayne/wayne-strategies/docs/case-studies/portfolio-agent-contract.md`.

## Core story

BuildOS turns conversation into connected project work. Demonstrate the path from a prompt through observable tool execution to tasks, plans, goals, and documents; project sharing with explicit permissions; asynchronous worker jobs and integrations; and the distinctive Inkprint interface.

## Source findings

- Repository instructions require free, focused validation and preservation of unrelated edits. This presentation-only package is outside `apps/web`; no full application checks or paid API tests are needed.
- The export must be dependency-free except Svelte, use `/assets/work/projects/buildos/`, and render every layer at 150–600px in a 16:10 frame.
- The public Fading Crown screenshots are explicitly documented as captures of a fictional book in a dedicated demo account. Seven direct assets were copied unchanged, totaling 233,649 bytes.
- Current source separates human roles from agent permissions; reconciles durable chat events and temporary previews; manages worker turn leases; and gives relationships validated receipts.
- The canonical Inkprint stylesheet defines semantic textures, paper/ink themes, and bench/sheet hierarchy. The public library and mobile theme have generators; the native app remains in development.
- Exact evidence and source-to-export mappings are recorded in `handoff/README.md` and `handoff/layers.json`.

## Execution

1. Inspect product source, brand tokens, UI components, worker lifecycle, collaboration permissions, and reusable public assets.
2. Write evidence-backed layers and compose sanitized product visuals using the real interface language.
3. Implement `handoff/ProjectVisual.svelte`, add direct assets, and prepare integration instructions.
4. Run isolated Svelte checks, asset/contract verification, and visual checks at compact and full sizes.
5. Record results and exact handoff paths.

## Acceptance checklist

- [x] 3–7 source-backed layers; first kind is `site`; 2–4 branches each.
- [x] Every layer has a distinctive, legible visual and complete evidence.
- [x] Direct repository assets with manifest; no private records or invented performance claims.
- [x] Responsive, scoped, accessible Svelte 5 component with `layerId`, `compact`, and `animated` props.
- [x] No application imports, network calls, additional runtime dependencies, or interactive controls in artwork.
- [x] Reduced motion respected; every asset URL resolves; compact text does not clip.
- [x] Svelte analysis and isolated rendering pass; limitations documented.
- [x] README and completion handoff delivered; no deployments or external messages.

## Completion

Delivered all six layers: workspace, chat into work, connected work, people and permissions, worker execution, and Inkprint. Svelte client/server compilation passed with zero warnings. Eighteen rendered variants passed browser image-loading, clipping, control, and reduced-motion checks. Preview and reproducible validation scripts sit beside the handoff.

Handoff: `/Users/djwayne/buildos-platform/docs/portfolio/wayne-strategies/handoff/`.

Blockers: none. Portfolio integration and its browser QA remain with the coordinator. No paid or live product tests were run.
