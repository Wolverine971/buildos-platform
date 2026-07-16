<!-- docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel/README.md -->

# BuildOS HyperFrames pilot

This is the first motion derivative of the real-media Author Workflow Teardown. It reuses the existing live BuildOS receipt and Inkprint card; it does not generate imagery.

## Local run

Requirements: Node.js 22+ and FFmpeg.

```bash
npx --yes hyperframes@0.7.36 lint . --json
npx --yes hyperframes@0.7.36 render . --output cold-manuscript-reel.mp4 --quality draft
```

Optional website capture, matching the HyperAgent `website-to-hyperframes` skill:

```bash
npx --yes hyperframes@0.7.36 capture https://build-os.com --output capture/build-os --max-screenshots 8 --json
```

Preview:

```bash
npx --yes hyperframes@0.7.36 preview .
```

The companion `HYPERAGENT_THREAD_PROMPT.md` is intentionally bounded to one lint-and-render pass so a first HyperAgent test does not expand into an expensive multi-agent media run.

## Verified pilot result

- HyperFrames lint: 0 errors, 0 warnings.
- Draft render: 1080×1920, 30 fps, 16.5 seconds, approximately 473 KB.
- Five representative frames visually checked for safe zones and silent readability.
- A capped website capture of `build-os.com` completed without warnings and confirmed the live palette (`#FBFAF9`, `#17171C`, `#B85614`) matches the composition's Inkprint tokens.
