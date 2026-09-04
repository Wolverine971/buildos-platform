# BuildOS marketing package

The original Brainbolt artwork, reusable logo compositions, social graphics, and existing motion loops.

## Start here
- Use logos/lockup-horizontal-paper.png on light backgrounds; the ink version uses light lettering for dark backgrounds.
- Transparent PNGs drop into slides, documents, websites, and email signatures.
- SVG compositions contain editable Arial text and embedded raster Brainbolt artwork. They are NOT fully vector masters. Use PNG for consistent typography across devices.
- Electric artwork uses the existing 1582 × 1380 pixel source. SVGs preserve that embedded resolution. For oversized print, commission a fully vector master.
- Elements contains the Brainbolt, Build, and OS separately. Blueprint brain and bolt include the original paper treatment.
- Disrupted compositions intentionally pull the identity apart; use the intact horizontal lockup for routine identification.

## Formats
- LinkedIn profile: 1584 × 396 PNG, under 8 MB. Main copy avoids the lower-left profile photo. Preview the crop on LinkedIn before applying.
- LinkedIn company: 4200 × 700 PNG. Preview the company cover crop before applying.
- Square: 1080 × 1080; portrait: 1080 × 1350; story: 1080 × 1920; presentation: 1920 × 1080.
- Story copy stays away from the top and bottom interface areas.
- Motion: transparent WebM for compatible browsers/editors, original MP4 for broad support. MP4 includes the original background; it is not transparent.

## Brand
Signal orange #F97316. Ink #18181B. Paper #FAF9F6. Use deep orange #B85214 for small orange text on paper.
Keep at least one quarter of the Brainbolt width clear around an intact logo. Do not stretch or crop the Brainbolt.
Use a dark background behind light lettering. Keep the electric artwork in its original colors.

## Messaging
Category: Thinking environment for people making complex things.
Promise: Turn messy thinking into structured work.
Differentiator: The project remembers what matters.

## Sources
Existing repository assets; no new generated imagery or footage.
Brand guide: docs/marketing/brand/brand-guide-1-pager.md.
LinkedIn profile specifications: https://www.linkedin.com/help/linkedin/answer/a568217/add-or-change-the-background-photo-on-your-profile

Rebuild: pnpm --filter @buildos/web exec node scripts/generate-marketing-assets.mjs
