<!-- docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel/HYPERAGENT_THREAD_PROMPT.md -->

# Paste into a new HyperAgent thread

Use the `hyperframes`, `hyperframes-cli`, `website-to-hyperframes`, and `gsap` skills. Do not use any image-generation or video-generation model.

We are producing a low-cost BuildOS Instagram pilot from real existing assets. BuildOS's media law is “receipts over vibes”: no AI-generated images, no AI-generated video, no fake UI, no synthetic founder footage, and no generic stock b-roll.

Inputs:

- Website: `https://build-os.com`
- Composition: `index.html` in this folder
- Storyboard: `STORYBOARD.md`
- Real product receipt: `../asset1-beforeafter-light.png`
- Inkprint explanatory card: `../asset2-painlist-light.png`

Tasks:

1. Run `hyperframes capture https://build-os.com` only to collect current visual tokens and website references. Do not replace the supplied brand palette or real receipt with generated visuals.
2. Lint `index.html` and make only the smallest corrections required for a clean HyperFrames render.
3. Render one draft-quality 1080×1920, 30 fps MP4.
4. Snapshot one representative frame from each scene for review.
5. Check: silent readability, Instagram safe zones, real-receipt legibility, one orange accent, no unsupported product claims.
6. Stop after the draft and report the output paths, lint results, render cost, and up to three high-leverage improvements. Do not create variants, voiceover, music, or more concepts unless asked.

Budget behavior:

- Use the cheapest capable model and low/standard effort.
- Do not delegate to subagents.
- Do not browse for inspiration.
- Do not regenerate supplied assets.
- Lint before rendering; render once at draft quality.
