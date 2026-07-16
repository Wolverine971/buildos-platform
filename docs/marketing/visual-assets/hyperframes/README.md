<!-- docs/marketing/visual-assets/hyperframes/README.md -->

# BuildOS HyperFrames Production Lane

**Status:** active · **Owner:** DJ Wayne · **First verified project:** Cold Manuscript
**Job:** turn one real BuildOS receipt into a silent-readable Instagram Reel, carousel frames, and a reusable source package without generating imagery.

This is the assembly lane between the [Creator Receipt Kit](../../campaigns/creator-acquisition/03-receipt-kit.md) and publishing. `/ideate` decides the visual idea. `/moodboard` decides a campaign set. HyperFrames turns the approved story and real assets into deterministic media.

## The operating rule

AI may direct, sequence, crop, annotate, animate, and package. It may not invent the product, the founder, the customer, or the proof.

Allowed:

- real BuildOS screenshots and screen recordings;
- real founder or permissioned creator footage;
- Inkprint typography, texture, diagrams, and annotations;
- deterministic HTML/CSS/GSAP motion;
- AI-assisted story structure, editing decisions, captions, and QA.

Not allowed:

- generated people, desks, offices, product screens, or founder footage;
- fake UI or conceptual UI presented as current product;
- generic AI b-roll used to manufacture atmosphere;
- automatic variants before the first draft is reviewed;
- claims stronger than the real receipt.

## Where things live

```text
docs/marketing/visual-assets/
  hyperframes/                         <- operating system, templates, setup
  asset-plans/                         <- approved visual direction
  projects/<category>/<project>/       <- one composition project
      PROJECT.md                       <- claim, audience, caption, permissions
      STORYBOARD.md                    <- timed story beats
      index.html                       <- HyperFrames composition
      assets/                          <- local copied media, normally ignored
      capture/                         <- local raw capture workspace, ignored
      renders/                         <- draft/timestamped output, ignored
      delivery/                        <- curated master + compact source package
```

Sensitive raw creator footage does not belong in git. Keep it in the approved private media location and copy only permissioned, publish-safe derivatives into a project. The full project registry and storage policy live in [`../projects/README.md`](../projects/README.md).

## One receipt → one story → three outputs

1. **Receipt:** capture one truthful product transformation.
2. **Story:** name one pain, make it felt, show the receipt, state the boundary, close with one question or next move.
3. **Composition:** build one 9:16 silent-readable source.
4. **Outputs:** silent Reel master, five QA/carousel frames, compact HyperAgent source package.
5. **Music:** add licensed music natively in Instagram for organic publishing, or mix only owned/royalty-free audio into a separate reusable master.
6. **Review:** verify claims, privacy, legibility, audio rights, cover crop, caption, and attribution before publishing.

## Standard story spine

| Beat           | Job                                        | Default duration |
| -------------- | ------------------------------------------ | ---------------: |
| Recognition    | Put the creator inside a specific moment   |             2–4s |
| Cost           | Make the pain concrete                     |             2–4s |
| Worldview      | Name the pattern without pitching          |             3–5s |
| Receipt        | Show the real BuildOS transformation       |             3–6s |
| Boundary + CTA | Say what BuildOS does and does not replace |             2–4s |

The first product receipt should appear by the midpoint. A short Reel does not need voiceover if the typography and proof remain clear with sound off.

## Build commands

From the repository root:

```bash
# Fast review master + QA frames
./scripts/marketing/hyperframes-reel.sh \
  docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel \
  draft

# Upload-quality silent master
./scripts/marketing/hyperframes-reel.sh \
  docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel \
  final

# Optional: create a separate master with audio you own or are licensed to reuse
./scripts/marketing/hyperframes-reel.sh \
  docs/marketing/visual-assets/projects/author-workflow-teardown/cold-manuscript-reel \
  final \
  /absolute/path/to/owned-or-royalty-free-track.mp3
```

The script pins HyperFrames `0.7.36`, the version verified against the first project. Upgrade intentionally after rerunning lint and visual QA; do not float production renders onto a new CLI release automatically.

## Project gate

Do not render until `PROJECT.md` answers:

- Who should recognize themselves?
- What single pain is named?
- What real receipt supports the claim?
- What was manual?
- What product limitation must remain explicit?
- Is every person/project publishable with the recorded permission state?
- Is the close asking for one useful action?

Do not publish until the [Instagram checklist](INSTAGRAM_PUBLISH_CHECKLIST.md) passes.

## HyperAgent operating model

Use one persistent **BuildOS Visual Director** agent and one new thread per asset experiment. The agent carries the brand judgment; the thread carries only the current receipt, story, and deliverables. See [HyperAgent setup](HYPERAGENT_AGENT_SETUP.md).

The first thread is already packaged, and completed work is registered separately from this reusable operating system:

- [Content project registry](../projects/README.md)
- [Cold Manuscript project](../projects/author-workflow-teardown/cold-manuscript-reel/)
- [Bounded HyperAgent prompt](../projects/author-workflow-teardown/cold-manuscript-reel/HYPERAGENT_THREAD_PROMPT.md)
- [Cold Manuscript source package](../projects/author-workflow-teardown/cold-manuscript-reel/delivery/hyperframes-pilot-source.zip)
- [Cold Manuscript final master](../projects/author-workflow-teardown/cold-manuscript-reel/delivery/hyperframes-pilot-reel-silent-final.mp4)
- [Published Agentic Chat tutorial project](../projects/product-education/agentic-chat-save-tutorial/PROJECT.md)

## Definition of done

- [ ] One real receipt and one claim
- [ ] `PROJECT.md` and `STORYBOARD.md` complete
- [ ] HyperFrames `check` passes
- [ ] Draft rendered once and representative frames reviewed
- [ ] Privacy, permissions, and product-boundary review passed
- [ ] Final silent master rendered
- [ ] Music path chosen: Instagram licensed audio or owned/royalty-free master
- [ ] Cover, caption, alt text, CTA, and UTM content ID ready
- [ ] Published URL and performance logged in the campaign scorecard
