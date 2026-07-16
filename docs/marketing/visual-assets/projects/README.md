<!-- docs/marketing/visual-assets/projects/README.md -->

# Content Projects

This is the working studio for real marketing compositions. Each project owns its brief, source composition, delivery master, and publishing record.

## Project registry

| Category                 | Project                                                                               | Status                                                      | Curated delivery                                   |
| ------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Author workflow teardown | [Cold Manuscript Reel](author-workflow-teardown/cold-manuscript-reel/PROJECT.md)      | Final candidate; publishing decisions remain                | `delivery/hyperframes-pilot-reel-silent-final.mp4` |
| Product education        | [Agentic Chat Save Tutorial](product-education/agentic-chat-save-tutorial/PROJECT.md) | Published externally; URL/platform still needs to be logged | `delivery/buildos-agentic-chat-tutorial.mp4`       |

## Project shape

```text
projects/<category>/<project>/
  PROJECT.md        # status, truth boundaries, publish record
  SCRIPT.md         # optional narration and on-screen copy
  STORYBOARD.md     # timed story decisions
  DESIGN.md         # optional project-specific direction
  index.html        # renderable composition
  source-material/  # authored or curated supporting material
  assets/           # local copied media; normally ignored
  capture/          # local raw capture workspace; normally ignored
  renders/          # drafts and timestamped renders; ignored
  snapshots/        # visual QA; ignored
  delivery/         # curated master and compact source package
```

## Storage rules

- Commit `PROJECT.md`, authored source, the selected final master, and a compact source package when the local media is needed to reproduce the project.
- Keep raw captures, media caches, thumbnails, snapshots, QA frames, and draft/timestamped renders local. They are regeneration material, not repository history.
- Record the final platform URL and publish date in `PROJECT.md`, then link campaign results to the applicable scorecard.
- Start new projects from [`../hyperframes/PROJECT_TEMPLATE.md`](../hyperframes/PROJECT_TEMPLATE.md) and follow the [HyperFrames production lane](../hyperframes/README.md).
