<!-- docs/portfolio/wayne-strategies/handoff/README.md -->

# BuildOS — Wayne Strategies portfolio package

Completed 2026-10-29. Slug: **`buildos`**. Six layers, one self-contained Svelte 5 component, and seven direct repository assets totaling **233,649 bytes (228 KiB)**.

## Integrate

1. Copy this directory's `assets/` contents into `static/assets/work/projects/buildos/`.
2. Copy `ProjectVisual.svelte` and `layers.json` into `src/lib/components/work-projects/buildos/`.
3. Pass the selected layer's ID to the component. Set `compact` for sheets and small previews; use the default for the open story.

```svelte
<div style="width: 100%; aspect-ratio: 16 / 10;">
	<ProjectVisual layerId="conversation" compact={false} animated={false} />
</div>
```

The layer IDs are `workspace`, `conversation`, `connected-work`, `sharing`, `execution`, and `inkprint`. The first layer is `kind: "site"`, preserving the portfolio shell's existing homepage screenshot as the closed card face. Unknown IDs deliberately render the workspace visual.

The component imports no application modules, libraries, or fonts. Its only runtime dependency is Svelte. It makes no network/API calls; local images use the required `/assets/work/projects/buildos/` prefix. CSS is component-scoped. A container-relative type scale handles the 16:10 frame. Compact mode changes hierarchy and removes secondary detail. The parent owns all interaction; the artwork contains no controls. An outer image role supplies a complete accessible description for each composition. Optional entrance motion is disabled under reduced motion.

## Story and design choices

The central story is **conversation becoming inspectable project work**. Fading Crown, the repository's fictional novel demo, carries that story across the public workspace, chat receipts, and task board. Reusing the same recognizable project makes the product tangible.

| Layer                | What the client sees                                                  | Why it earns a layer                                                                     |
| -------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| BuildOS              | Paper workbench with the actual demo project                          | Connects the promise to a real working surface                                           |
| Chat into work       | A specific scheduling request, saved-task card, and real receipt crop | Makes tool execution and inspectable results concrete                                    |
| Connected work       | Actual task board beside an illustrative document and project tree    | Shows tasks in the context of goals, plans, and supporting material                      |
| People & permissions | Share sheet with separate person and agent columns                    | Reveals a distinctive collaboration and access design                                    |
| Work that persists   | Agent work panel, a turn record, and actual demo calendar             | Explains durable execution and integration jobs through the product's interface language |
| Inkprint             | Light/dark specimens and four semantic textures                       | Shows a designed system with meaning across product surfaces                             |

The palette follows the canonical Inkprint stylesheet: warm paper, deep ink, burnt orange, sage success, differentiated bench/sheet surfaces, printed labels, and restrained texture. Existing wordmarks are used unchanged. Texture specimens reproduce the stylesheet's Bloom, Grain, Thread, and Grid patterns with presentation-sized spacing and opacity. This is an explanatory design specimen, not a replacement token library.

The compositions use intentionally different silhouettes: an angled application sheet, a conversation stack, a document over a task board, a share modal, a work inbox with a receipt record, and a paired theme specimen. They avoid a generic flowchart treatment.

## Source-to-export asset manifest

All assets below were copied byte-for-byte; no image generation, private account capture, or image editing was used.

| Repository source                                      | Export                          | Use                                                               |
| ------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| `apps/web/static/home/hero-real-light.jpg`             | `assets/project-demo.jpg`       | Actual Fading Crown project surface; workspace visual and gallery |
| `apps/web/static/home/hero-work-light.jpg`             | `assets/chat-receipt-demo.jpg`  | Actual project-creation receipt; full-size gallery                |
| `apps/web/static/home/case-board-light.jpg`            | `assets/task-board-demo.jpg`    | Actual task board; workbench visual and gallery                   |
| `apps/web/static/home/case-schedule-chat-light.jpg`    | `assets/schedule-chat-demo.jpg` | Actual task-update receipt; conversation visual and gallery       |
| `apps/web/static/home/case-schedule-cal-light.jpg`     | `assets/calendar-demo.jpg`      | Actual public demo calendar; execution visual and gallery         |
| `apps/web/static/marketing-assets/wordmark-paper.webp` | `assets/wordmark-paper.webp`    | Original dark-letter wordmark for paper surfaces                  |
| `apps/web/static/marketing-assets/wordmark-ink.webp`   | `assets/wordmark-ink.webp`      | Original light-letter wordmark for ink surfaces                   |

The screenshots are public marketing assets captured in August 2026. `docs/marketing/strategy/project-workspace-rollout-2026-09-10.md` identifies Fading Crown as a fictional book in a dedicated demo account, and `apps/web/scripts/seed-demo-account.ts` defines its demo persona. `HomepageV2.svelte` uses the images as actual demo captures. They are not customer records or customer success claims. Preserve gallery captions when opening them at full size.

## Most impressive source details

- **Human permissions and agent permissions are separate.** The sharing interface offers owner/editor/viewer roles and Off/Read/Write agent access. `agentAccessAllowed` requires an editing role for agent Write; invite links can expire, reset, or turn off.
- **Streaming is reconciled with durable truth.** `AgentChatWorkerUiAdapter` separates temporary text previews from saved assistant text, tracks execution generations, and deduplicates semantic events. A reconnect is more than replaying a message bubble.
- **Workers know when they no longer own a turn.** `AgenticChatTurnLeaseKeeper` renews ownership and exposes a freshness check for writes. Recovery, cancellation, and uncertain changes have distinct handling.
- **Relationship receipts validate the actual edge.** The mutation receipt builder checks project identity, source and target kinds/IDs, and expected link details.
- **Calendar sync handles failure categories.** The background job distinguishes non-retryable responses from retryable failures; it is separate from the chat UI.
- **Inkprint has a maintained source of truth.** The canonical stylesheet generates the public modular CSS library; a separate generator carries theme values to the mobile project.

Exact evidence is attached to each layer in `layers.json`. Evidence paths are internal review material, not client-facing copy.

## Validation performed

Free, isolated checks only:

- Svelte MCP autofixer using installed **Svelte 5.57.1**: no issues or suggestions.
- Both client and server compiler targets: **zero warnings**.
- Contract validation: six unique IDs, first kind `site`, all required fields, 2–4 branches per layer, and all evidence paths present.
- Asset validation: all seven references resolve; total image bytes recorded.
- Server rendering: **18 variants**, covering every layer at 600px full size, 300px compact, and 150px compact.
- Headless Chrome: all **21 rendered image instances** loaded; no page errors; no interactive controls; **zero clipped text ranges**, including clipping against nested containers.
- Reduced-motion check: optional animation resolves to `none`.
- Visual review of the contact sheet, followed by layout fixes for chat, document, sharing, and worker compositions.

Reproduce from the BuildOS repository root:

```sh
node docs/portfolio/wayne-strategies/validate.mjs
node docs/portfolio/wayne-strategies/validate-browser.mjs
```

The browser script uses the repo's existing Playwright dependency and installed Chrome; it opens only the generated local HTML preview. These support files are outside the integration package.

Review artifacts:

- `../preview/index.html` — static contact sheet, viewable locally without a server.
- `../preview/validation.json` — component, contract, and asset results.
- `../preview/browser-validation.json` — browser results.
- `/Users/djwayne/buildos-platform/output/playwright/buildos-portfolio/contact-sheet.png` — rendered visual proof.

## Limitations and status

- The direct screenshots show the August demo UI. Newer capabilities are represented by clearly labeled interface studies grounded in current repository source, not by claiming newly captured live operation.
- The sharing roles, simplified document, and worker record are explanatory examples. They do not imply actual users, permissions granted, jobs run, or a measured reliability/speed outcome.
- This task did not authenticate into BuildOS, run models, mutate production, send invitations, sync calendars, deploy, or send messages. No live or paid validation was performed. The package makes no fresh deployment claim.
- Native theme generation is implemented in source; the native app remains **in development**. That distinction appears in the Inkprint layer and copy.
- Some screenshot imagery intentionally extends beyond its composition frame. Textual artwork was checked for clipping; full original images are available through galleries.
- Final integration with the portfolio's 3D sheets, hover behavior, and surrounding typography belongs to the coordinating chat. No changes were made in the Wayne Strategies repository.

There are no blocking issues for integration.

**Absolute handoff directory:** `/Users/djwayne/buildos-platform/docs/portfolio/wayne-strategies/handoff/`
