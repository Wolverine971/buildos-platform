<!-- docs/marketing/visual-assets/README.md -->

# BuildOS Visual Assets — direct, don't prompt

Art-direction pipeline for BuildOS marketing visuals. Ported from the 9takes `/moodboard` + `/ideate` commands and **retargeted onto BuildOS's Real Media Rule**: receipts over vibes, screens over scenes, work over spectacle.

## The two commands and one assembly lane

- **`/ideate <scene | post-path>`** — _concept-anchored._ Workshop one scene, feeling, or post draft into a finished **asset plan** (Inkprint card / before-after real screenshots / screen-recording storyboard). The workhorse for "give this post a visual." Output → `asset-plans/`.
- **`/moodboard <persona | campaign>`** — _persona/campaign-anchored._ Mine a maker's real workflow into a coherent **asset set** for a carousel/campaign. Output → `moodboards/`.
- **[HyperFrames production lane](hyperframes/README.md)** — _assembly and delivery._ Turn one approved story plus real screenshots/footage into a deterministic 9:16 Reel, carousel/QA frames, cover candidate, and source package. This is not a generative-media lane.
- **[Content projects](projects/README.md)** — _working studio._ Keep each composition, project truth record, curated master, and publishing closeout together.

Both run the same engine: **Idea → emotional truth → story test (Character + Conflict + Curiosity) → composition → finish → build.** The build step comes last; the brief just transcribes decisions already locked.

## The brand law

**Real-media by default.** Zero AI-generated images/video for anything that is or implies the product or the founder. The `--ai-scene` lane (the iklipse photoreal engine) is OFF by default and only for abstract, non-product mood frames — flagged as a deliberate deviation from `BUILDOS_REAL_MEDIA_POLICY.md`.

## Layout

```
visual-assets/
  README.md                       ← this file
  references/
    inkprint-card-system.md       ← the real-media visual identity (palette, texture, card anatomy, checklist)
    ai-scene-lane.md              ← the opt-in AI mood-frame lane (off by default)
    iklipse-source/               ← the "direct, don't prompt" evidence layer (6 source analyses)
  asset-plans/                    ← /ideate output (one doc per scene/post)
  moodboards/                     ← /moodboard output (one doc per persona/campaign)
  hyperframes/                    ← repeatable motion assembly, HyperAgent setup, publish QA
  projects/                       ← compositions grouped by category and project
    <category>/<project>/
      PROJECT.md                  ← status, truth boundary, and publish record
      index.html                  ← source composition
      delivery/                   ← curated final master + compact source package
```

Raw captures, copied asset caches, thumbnails, snapshots, QA frames, and draft/timestamped renders stay inside the applicable project but are ignored by Git. See the [project registry and storage rules](projects/README.md).

## Source of truth

- Brand: `docs/marketing/brand/brand-guide-1-pager.md`, `BUILDOS_REAL_MEDIA_POLICY.md`, `BUILDOS_PROOF_AND_PRESENCE_DOCTRINE.md`
- Design: `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- Voice: `docs/marketing/social-media/FOUNDER_CONTEXT.md`
- Existing card format: `docs/marketing/social-media/publish-kits/2026-03-12-do-this-asset-template.md`
