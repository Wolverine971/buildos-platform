# Stage ② — ASSETS

The named pain: content ships without visuals. Every deliverable that declares an `asset_needs` must get real assets attached before it can post. The engine flags these as 🖼️ ASSET GAPS.

## Hard constraint — the Real Media Rule

Read `docs/marketing/brand/BUILDOS_REAL_MEDIA_POLICY.md` before generating anything. Summary:

- **Zero AI-generated images or video** for anything that is or implies the product or the founder.
- **Approved sources:** real screenshots, real screen recordings, real DJ/workspace footage, Inkprint typography cards, explanatory diagrams.
- The opt-in AI-scene lane (`docs/marketing/visual-assets/references/ai-scene-lane.md`) is OFF by default and only for abstract, non-product imagery.

So "both screenshots + generated" means: **real product screenshots + brand-built Inkprint cards / diagrams** — not AI photos of the product.

## The two tools (both are commands, not skills)

- **`/ideate <post-path|scene>`** — concept-anchored. Workshops one post into a finished asset plan (Inkprint card / before-after real screenshots / screen-recording storyboard). Output → `docs/marketing/visual-assets/asset-plans/`.
- **`/moodboard <persona|campaign>`** — persona/campaign-anchored asset set. Output → `docs/marketing/visual-assets/moodboards/`.

Assembly (Reels / carousels) uses the deterministic lane in `docs/marketing/visual-assets/hyperframes/` (see its `INSTAGRAM_PUBLISH_CHECKLIST.md`).

## Playbook

1. From the engine's ASSET GAPS list, take the deliverable + its `asset_needs` (e.g. `carousel-9-slides`, `screen-recording`, `hook-screenshot`).
2. Decide the asset type under the Real Media Rule:
   - IG carousel → 9 Inkprint slide cards (hook slide + one feeling/receipt per slide + term-to-own/CTA), built via the hyperframes carousel lane or `/ideate`.
   - TikTok → real screen recording of the relevant BuildOS surface (use `video-to-guide` skill patterns for frame/clip work), not a talking-AI render.
   - Twitter/LinkedIn → one hook image or real screenshot if the copy benefits; many text posts need none (then clear the `asset_needs` as `[]`).
3. Produce the asset(s), save under the appropriate `visual-assets/` project folder.
4. **Patch the queue:** push the saved file path(s) into that deliverable's `assets: [...]`. Re-run the engine — the gap clears.

## Anti-feed cluster note

No anti-feed-specific visuals exist yet (only the author-workflow-teardown and one product-education project are built). The cluster's carousels/recordings are greenfield — the IG carousel spec (9 slides) is defined in the publish kit, so build from that.
