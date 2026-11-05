<!-- apps/web/docs/design/home-page-design-review.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-06-22; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

The newer [A–D comparison and Home D implementation review](#homepage-variants-audit--2026-11-03)
appears below the original June review.

# Home Page Design Review

Reviewed against `youtube-design-principles-guide.md`. Target file: `apps/web/src/routes/+page.svelte`.

## Biggest issue: flat hierarchy across the whole page

You have 9 sections (Hero → Replace → How → Stack → Examples → Segments → Graph → Blog → Options → CTA), and they all render with the same treatment: bordered section, eyebrow label + h2 + muted subtitle, then a card grid with `shadow-ink` + `tx tx-frame tx-weak` cards. The squint test from §2 of the guide fails — everything looks equally important, so nothing does.

**Fix:** pick **one** hero moment and **one** "see it work" moment, visually demote everything else. Candidates to cut or collapse:

- Audience segments (`+page.svelte:846-864`) duplicates the Examples section above it — Authors/YouTubers/Podcasters/Course creators appear in both. Delete one.
- "Replace your scattered stack" (`:532-581`) and "Everything your project needs" (`:659-779`) are both "what BuildOS contains." Merge or cut one.

## Hero mockup splits focus (§2 hierarchy)

The hero card shows **two** rough-brief → structured-plan examples (Author + YouTube) stacked, plus a "Next move" bar with a second "Start in chat" CTA (`:519-525`) competing with the hero's primary CTA 60px above it. Per the card example in §2 of the guide: pick the **one** most important fact and make it loud.

**Fix:** one example (pick Author, since it's more visceral than "sponsor slot + B-roll"), larger, with the raw→structured transformation as the hero's whole visual. Remove the second CTA from inside the card.

## Decorative color on the data-model cards (§5)

`+page.svelte:680-777` — Projects=emerald, Goals=amber, Plans=indigo, Tasks=muted, Milestones=emerald, Documents=sky, Risks=red. Only Risks=red has meaning. The rest is "color for decoration," which the guide calls out explicitly ("If the answer is only 'it looks nice,' the color may be decorative noise"). It also breaks the convention you establish with Risks — a user could reasonably wonder if green vs amber means something.

**Fix:** make them all neutral (`text-muted-foreground`), keep Risks red. Let semantic color carry meaning.

## Eyebrow-label fatigue (§4 typography)

Almost every card in the page has a `text-[0.65rem] uppercase tracking-[0.18em]` eyebrow. I count **~30+** on the page. When every card has the same micro-label treatment, the pattern stops signaling and just adds noise. Plus you're using arbitrary `[0.65rem]` and `[0.8rem]` alongside `text-xs/sm/base/2xl/3xl/5xl` — the guide recommends ≤6 sizes for a landing page.

**Fix:** keep eyebrows only in the hero and the "3 Options" section (where Option 1/2/3 genuinely needs labeling). Drop them from Replace, How, Under-the-hood, Examples, Segments, Featured posts. Consolidate to `text-xs / text-sm / text-base / text-lg / text-3xl / text-5xl`.

## Secondary CTA is nearly invisible (§8 buttons)

Hero secondary is just `text-xs underline` "See how it works →" (`:432-436`). Per §8, primary + secondary sit together, and secondary should still read as a button. Right now it looks like a body-copy footnote next to a black pill.

**Fix:** make it a proper ghost button — `pressable rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold shadow-ink` (same shape you already use in the final CTA at `:1011-1016`). Consistency bonus.

## Smaller things worth fixing while you're in there

- Hero `<h1>` uses `leading-tight` (1.25). Guide recommends 1.1–1.2 for display. Try `leading-[1.1]`.
- "Flexible Structure" card (`:762-776`) is the only one of the 8 data-model cards with `shadow-ink` + `tx-strip`. If it's intentional emphasis, lean harder; if not, match the others.
- Two "Start in chat" buttons within ~400px of each other in the hero — keep one.

## Recommended order of operations

Highest leverage first:

1. **Cut or merge redundant sections** (Segments + Replace + Stack) → page goes from 9 sections to 6.
2. **Rework hero:** one example, tighter display type, real ghost-button secondary.
3. **Strip decorative color** from data-model icons.
4. **Consolidate the type scale** and kill ~70% of eyebrow labels.

Start with #1 and #2 — they compound. Fewer sections means the remaining ones can each earn a stronger treatment.

---

## Homepage variants audit — 2026-11-03

This review covers the current `/home-a`, `/home-b`, `/home-c`, and `/home-d` previews,
not the June homepage above. Implementation was authorized for D only. The live `/` route,
A–C, the shared navigation, draft handoff, and demo implementation were left intact.

### Rubric and baseline grades

A = strong and coherent; B = useful foundation with identifiable friction; C = substantial
revision needed. These are design judgments, not conversion measurements or a formal
accessibility certification. Contrast grades describe the ordinary text/action palette;
tiny scaled demo text and screenshot legibility are evaluated under typography/polish.

| Metric                   | Home A | Home B | Home C | Home D, before |
| ------------------------ | ------ | ------ | ------ | -------------- |
| Typography               | A      | A      | A      | B              |
| Hierarchy                | B      | A      | B      | C              |
| Spacing and density      | C      | A      | B      | C              |
| Color contrast           | A      | A      | A      | A              |
| Iconography              | A      | A      | A      | B              |
| Consistency              | B      | B      | B      | B              |
| Policy and claim clarity | B      | B      | B      | B              |
| Polish                   | B      | A      | B      | B              |
| Information clarity      | B      | A      | B      | B              |
| Overall look and feel    | B      | A      | B      | C              |

**A — The Desk.** Editorial confidence: serif display, restrained orange, crisp rules,
numbered sections, and a real project as evidence. Its weakness is proportion: the tall
project sheet leaves a large empty hero column, followed by repeated explanations, three
screenshots, and a live embed. At 1440px the complete page is 6,556px tall; at 390px it is
8,995px. Keep its material quality, shorten the project sheet, and choose one principal proof
sequence. The hardcoded 14-day trial should follow the billing flag. → P3+P4+P6+P20

**B — Try it.** Strongest immediate action: notes beside a project result, concrete example
choices, and an explicit explanation of signup → review → Send. It is the most compact
version (2,442px desktop / 3,886px phone). Improve the caption: the neighboring project is
an illustrative example, not a generated response to arbitrary typed input. State that before
the visitor types, keep a visible input label, and use billing-aware trial copy. A short
privacy/pricing explanation would help visitors with more questions. → P4+P6+P13

**C — Watch it work.** Strongest demonstration concept: one note becomes a project, then a
later note lands across projects. The dark stage gives the product a clear focal point.
However, the hero and second introduction delay the actual demo (around 850px down on
desktop), and the 640–680px transformed stage has tiny text on phones. Reduce the
introduction, offer a readable static result, and keep one draft entry. Its explicit scripted
replay disclosure is worth retaining. Update the hardcoded trial copy and give dark-mode
screenshots equivalent accessible descriptions. → P4+P6+P11+P19+P20

**D — Clear pitch.** The sales sequence is sensible: promise, evidence, problem, process,
benefits, pricing, objections, action. The implementation treats that sequence as eight
separate blocks with similar prominence. A 12-word headline, long supporting paragraph,
five-item feature strip, four problem quotes, two feature explanations, and an end-of-page
input make the route feel longer than its content warrants. The first personal input sits
near the bottom of a 5,466px desktop / 7,060px phone page. Keep D's complete offer and
billing-aware pricing; borrow A's restraint, B's action clarity, and C's honest demonstration.
→ P3+P4+P6+P9+P20

### Regions reviewed

Shared header and review switcher; hero and CTAs; example/demo; trust statements; problem
quotes; process and outcomes; real screenshots; pricing; FAQ; draft input; closing CTA/footer.
The public navigation's `/#loop` and `/#agents` links intentionally return to the live
homepage. Preview-specific navigation remains a separate follow-up if one variant is promoted.

### Tier 1 — labels, alignment, and trust

- **Hero:** shorten the headline to “Keep every project moving.” Name the audience once;
  explain notes → tasks/docs/next step in the supporting text. Main signup CTAs now use
  `START_PROJECT_CTA`, matching the public header/footer. → P4+P6
- **Geometry:** one content width/padding scale throughout D; align process, proof, pricing,
  and FAQ on the same two-column grid. The internal marketing shell uses `max-w-7xl` with
  `px-4 sm:px-6 lg:px-10` within the existing public sheet. → P3
- **Trust:** reduce five competing feature claims to three genuine reassurances. Use fixed
  Lucide icon boxes; neutral decorative icons, accent for action and the next step. → P4+P9
- **Privacy:** align the FAQ with `/privacy` and `docs/privacy/CLAIMS.md`, including both
  dictation audio and spoken-brief text in the up-to-30-day retention exception. Keep policy
  links adjacent. This checks consistency with the repository policy, not vendor compliance.
  → P6
- **Claims:** replace the sweeping ChatGPT/Notion comparison with a factual description of
  how integrations fit. Preserve early-access versus live-billing copy. → P6
- **Screenshot:** the inherited calendar image shows 10 AM while the example describes an
  afternoon move; it cannot support a precise “Thursday, 3 PM” proof claim. Use the actual
  chat request/update receipt instead. The screenshot has meaningful alt text in both themes
  and opens at full size; the adjacent prose is readable without inspecting image text. → P6+P19

### Tier 2 — hierarchy and density

- **Hero proof:** add `d/ProjectTransformation.svelte`, a static, semantic excerpt of the shared
  Fading Crown example. Both the input and result remain readable at normal text sizes,
  without waiting for a timeline. Label the excerpt and abbreviated result explicitly. → P4+P20
- **Input:** place the notes form directly after the proof. “Use my notes” anchors to it;
  “Continue with my notes” explains the next action, and the hint names signup, review, and
  Send. Signed-in visitors receive the appropriate chat wording. Existing draft preservation
  behavior is reused. → P6+P8+P13
- **Middle:** consolidate the problem/process/benefit explanation. Keep one inherited signup
  quote, clearly attributed as a description of a problem, not evidence of a customer result.
  Turn the four-card problem wall into one quiet quotation. → P4+P6
- **Pricing and FAQ:** preserve the complete offer, export/deletion information, phone answer,
  and pricing link, but use an aligned compact layout. Replace the duplicate final form with
  a simple closing signup action. → P3+P4+P6

### Tier 3 — interaction and performance

- **Walkthrough:** preserve C's existing demo behind a native disclosure. Dynamically import
  it on first open and unmount it on close. Label it as a scripted walkthrough before the
  controls. No animation or frame loop runs during the initial D visit. → P11+P13+P20
- **Focus:** the demo's “Your turn” focuses the nearby draft directly. Remove D's competing
  unconditional smooth scroll, which also respects reduced-motion preferences. → P11+P13
- **Contrast:** automated verification caught orange 14px step text at 4.21:1 on the tinted
  note panel. Use the neutral muted-foreground token for those step numbers. → P19

### Remaining opportunities

- B is the clearest input-first baseline; D is the more complete explanation-first option.
  Choose between them with actual visitor-to-signup and successful-first-project evidence.
  This task did not run a conversion experiment or add tracking.
- A specific customer outcome with permission and a verifiable attribution would be stronger
  evidence than another feature list or anonymous problem quote. Do not invent it. → P6
- The opt-in shared walkthrough still scales detailed project cards on phones. The new static
  example solves initial comprehension; a dedicated mobile walkthrough remains a separate
  C/D enhancement. → P1+P4+P11
- A–C still need billing-copy consistency and screenshot accessibility follow-ups. No A–C
  implementation was included in this D-only pass. → P6+P19

### Verification

- All four variants captured at 1440×1000 and 390×844, light and dark.
- D additionally checked at 320×740 and 768×1024; zero page-level horizontal overflow and
  zero broken screenshot assets across the eight width/theme combinations.
- With the walkthrough closed, D is now 3,832px tall at desktop (down from 5,466px, about
  30% shorter) and 6,061px at 390px phone width (down from 7,060px, about 14% shorter).
  These are page-height measurements, not load-time or conversion improvements.
- Official Svelte autofixer: zero issues or suggestions in both modified components.
- `pnpm --filter @buildos/web check` through `test-gate`: zero errors and warnings.
- Focused ESLint and Prettier checks passed.
- Axe WCAG A/AA checks on D's main content, including the expanded privacy FAQ, found no
  violations at desktop and phone widths in both themes after the step-number contrast fix.
  Some contrast checks were flagged for manual review; screenshots were also inspected.
  This is not a claim of complete accessibility conformance or shared-shell certification.
- Browser checks: one H1; deferred demo import; notes anchor; empty-input guidance; keyboard
  FAQ and walkthrough; chapter control; “Your turn” focus; teardown on close; notes preserved
  in the signup redirect. No browser runtime errors in that interaction pass.
- No signup completed, no model calls, no paid tests, and no deployment.
- Before/after captures and local verification scripts are in `output/playwright/home-audit/`.
  Full-page captures eagerly load screenshot assets for visual review; A's offscreen live
  embed is not a live-service availability test.

---

## Home D focused audit — 2026-11-03

This is an **audit of the revised D**, after the implementation documented above. It does
not replace the original baseline grades. No homepage code was changed during this pass.
The current overall grade is **B**: the visual language is coherent, but the example's
emphasis, the explanation of its output, and mobile pacing still need work.

### Current grades

A = strong; B = sound foundation with visible friction; C = substantial revision needed.
These are design judgments, not measured conversion outcomes.

| Metric                   | Grade | Assessment                                                                                                                                                                                                              |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography               | B     | The sans/serif pairing is distinctive and readable. The rough note is 20px on phones and 24px on larger screens, while useful task/next-step content is 14px; emphasis favors the input.                                |
| Hierarchy                | B     | The headline and primary action are clear. The example result and personal notes field arrive too late on phones; process and benefits compete for attention.                                                           |
| Spacing and density      | C     | Desktop is B, mobile is C. Large stacked sections and repeated explanations turn a restrained desktop layout into a long phone page.                                                                                    |
| Color contrast           | A     | Sampled text/action combinations have strong contrast in both themes. Small screenshot text remains a separate legibility issue.                                                                                        |
| Iconography              | A     | Consistent Lucide shapes, fixed geometry, and text labels. A few directional/state cues can be more precise.                                                                                                            |
| Consistency              | B     | Width, padding, surface tokens, and CTA styling are coherent. Walkthrough/FAQ disclosure indicators behave differently, and hero actions obscure their different destinations.                                          |
| Policy and claim clarity | A     | Billing states and privacy language agree with the repository's policy sources. The voice exception is included; the long FAQ paragraph could be easier to scan. This assesses copy consistency, not vendor compliance. |
| Polish                   | B     | The restrained paper/ink/orange treatment works. Tablet proportions, mobile proof imagery, and repeated section composition feel unfinished.                                                                            |
| Information clarity      | B     | The basic product promise is understandable. The abbreviated note does not explain all shown outputs, and the example is less directly relevant to the stated founder audience.                                         |
| Overall look and feel    | B     | A credible, calm foundation. A stronger demonstration and a shorter mobile sequence would improve it more than added visual effects.                                                                                    |

### Regions and measured evidence

Reviewed the shared header/review controls; hero and actions; static example; optional
walkthrough; trust row; notes form; process/problem quote/benefits; update screenshot;
pricing; FAQ; closing action; and shared footer. Captures use the local early-access state,
necessary-only consent, loaded fonts/images, a closed walkthrough, and collapsed FAQ.

| Viewport    | Page height | Example project title starts | Notes field starts | Horizontal overflow |
| ----------- | ----------: | ---------------------------: | -----------------: | ------------------- |
| 1440 × 1000 |     3,832px |                        401px |            1,100px | None                |
| 768 × 1024  |     5,206px |                        505px |            1,399px | None                |
| 390 × 844   |     6,061px |                        822px |            1,794px | None                |
| 320 × 740   |     6,671px |                        967px |            2,016px | None                |

Light and dark themes have the same measured geometry. These are document coordinates,
not scroll distances from an element into view. A working signup CTA is already visible
in the first phone viewport; the problem is delayed evidence and personal input, not a
missing action. The collapsed **Versions** chip still overlays content and is preview
chrome, excluded from the production design grade.

### Tier 1 — cheap, high-impact: labels, emphasis, and state

- **Example typography:** the long serif input dominates the smaller structured result.
  At 768px, the input wraps into seven lines in a roughly 253px text column. Keep the serif
  treatment, shorten the excerpt, try 18px on larger screens/16–18px on phones, and raise
  the next-step sentence to 16px with stronger weight. Keep project titles at 24px and
  metadata at 14px. Remove the large desktop gap created by pushing “Type it. Paste it.
  Talk it through.” to the panel bottom; it repeats an already established capability.
  Success: the project and next step attract attention before the note transcription.
  → P3+P4+P6
- **Hero actions:** “Start with one project” opens signup; “Use my notes” scrolls to the form.
  Their labels do not fully explain that distinction, and both use a right arrow. Make
  the notes route the primary action, with “Start with my notes” and a downward cue;
  retain a quieter “Create an account” route if both paths are needed. Keep the explicit
  signup → review → Send hint by the field. This is a proposed interaction priority,
  not evidence that the existing links are broken. → P6+P8+P9
- **Section naming:** “Now get yours out of your head,” “Less to hold in your head,” and
  “Make room for the work” repeat the same emotional benefit. Give the form a direct
  “Start with your notes” heading and the process a “How it works” heading; make pricing
  and questions identifiable while scanning headings alone. Keep one expressive closing
  line rather than repeating the premise throughout. → P4+P6
- **FAQ reading:** split the privacy answer into short paragraphs for project visibility,
  model training/retention, and the voice exception. Preserve the substance and adjacent
  policy link. Keep the current billing-aware price and opt-in subscription wording.
  → P6
- **Disclosure and image cues:** rotate the walkthrough chevron when open, matching FAQ
  behavior. Put a visible “View full size” affordance on the screenshot figure rather
  than making the prose carry that instruction. Preserve its accessible link name and
  new-tab notice. → P6+P9+P13

### Tier 2 — structural: proof and mobile pacing

- **Make the example traceable — highest priority.** The visible note mentions Maya's
  motivation and magic rules, but the result adds a query-letter task and a Chapter 13
  next step involving a beats document/ferry scene. Those items belong to the larger
  example, but a visitor cannot infer them from the excerpt. The abbreviation captions
  are honest; they do not make the transformation self-explanatory. Select an input and
  output pair where each displayed task/document/next step has a visible source. Keep
  the next step as the most prominent result. This is a demonstration clarity issue,
  not a claim that the product generated these details incorrectly. → P4+P6
- **Recompose the phone example.** The note and its padding fill the rest of the first
  390px viewport; the project title begins at 822px and useful result content comes
  after it. Use a compact two- or three-line input followed immediately by the project
  result, then the visitor's notes. Shorten content before shrinking text or adding a
  carousel. Suggested design budget at 390×844: show the next step within the first
  two viewports and bring the notes field to roughly 1,200px or earlier. Check 320px
  separately; these are proposed targets, not current results. → P1+P3+P4+P8
- **Merge the middle explanation.** “Less to hold in your head” occupies about 1,148px
  on a 390px phone: introduction, problem quote, three steps, and three more benefits.
  Combine this into three concise, evidenced ideas: capture the messy version, update
  the plan, return with context. Retain distinct daily-brief/integration capabilities
  as brief supporting details where relevant. The anonymous signup quote describes
  pain, not a successful customer outcome; it does not warrant another large block.
  Aim to remove repeated claims, not just reduce padding between them. → P4+P6
- **Show the updated state clearly.** The real 1040×178 chat screenshot is displayed at
  356×61 on a 390px phone. Its collapsed “Updated task” receipt confirms an action but
  does not expose the resulting schedule. Use a readable capture of an expanded
  receipt/task detail, or a clearly labeled HTML illustration with verified values.
  Keep the original full-size evidence accessible. Do not reintroduce the mismatched
  calendar image or imply a precise time that the capture does not demonstrate.
  → P4+P6+P19
- **Align the example with the audience.** “For founders and builders” introduces a
  fantasy-novel project. The example is legitimate, but business visitors must translate
  its value to their own work. If founders remain the primary audience, use one concise
  client launch/product launch example as the default and keep the novel as a secondary
  demonstration. If creative projects are equally central, broaden the audience line.
  Avoid adding a large example picker before establishing one clear demonstration.
  → P4+P6

### Tier 3 — polish and visual rhythm

- **Keep the visual identity.** Warm neutral surfaces, dark ink, a single orange action
  accent, and serif source notes already form a coherent system. Preserve these and
  the current icon family. The measured light-theme button contrast is 4.80:1; avoid
  lightening orange casually. Additional badges, gradients, or decorative icons would
  add competing emphasis. → P4+P9+P19
- **Vary composition by purpose.** Most desktop sections repeat a left headline and
  right content block with horizontal rules. Give the transformation the strongest
  treatment, keep the process compact, and let pricing/FAQ be functional. Preserve
  common edges and spacing while avoiding a row of equally prominent sales sections.
  → P3+P4
- **Keep one optional demonstration.** The lazy-loaded scripted walkthrough is the
  existing signature interaction. Its detailed cards still need a dedicated phone
  treatment if improved later; the static example must communicate the value without
  requiring playback. Preserve native disclosure, keyboard operation, and reduced
  motion behavior. → P1+P11+P13+P20
- **Preview controls:** the floating version switcher can obscure example text even when
  collapsed. Allow it to be fully dismissed for final reviews, and omit it when a
  variant is promoted. Shared navigation anchors should be checked at that promotion
  point. These are preview/shared-shell follow-ups, not reasons to redesign D. → P1+P8

### Recommended next implementation sequence

1. Curate a matching note/result pair and rebalance their typography.
2. Recompose the phone hero/example/form sequence around that content.
3. Merge duplicate process/benefit copy and give sections direct names.
4. Replace the tiny receipt with readable evidence of the resulting state.
5. Finish CTA/disclosure/FAQ polish, then recapture all four widths in both themes.

The proposed structure is: **promise + action → compact transformation → your notes →
three concise benefits with update evidence → pricing → FAQ → closing action**. Improve
the clarity of this sequence before adding decorative motion or another major section.

### Verification and evidence for this audit

- Fresh full-page and hero captures at 1440, 768, 390, and 320px, light and dark; no
  horizontal overflow in any of the eight combinations. Files and measurement scripts:
  `output/playwright/home-d-focused/`.
- Fresh computed-color samples in both themes: light supporting text 5.45:1, note
  caption 4.99:1, primary button 4.80:1, process number 4.60:1; dark equivalents 6.52:1,
  5.78:1, 6.41:1, and 6.42:1. Ratios use computed solid fills and alpha composition;
  they do not assess screenshot text, every interaction state, or texture variation.
- Official Svelte autofixer reported zero issues/suggestions for `HomeVariantD.svelte`
  and `d/ProjectTransformation.svelte`. Source reviewed against the live presentation.
- Privacy/billing review checks repository copy and conditionals; it is not a new
  production configuration or third-party policy verification.
- No UI edits, new model calls, paid tests, signup completion, or deployment in this
  audit pass. The previous implementation's validation is recorded separately above.

### Focused recommendations implemented — 2026-11-03

The user approved the focused audit recommendations. Home D now implements them:

- **Matching, audience-relevant example:** a short website-launch note explicitly names
  the homepage copy, pricing page, and launch notes that appear in the result. The example
  is labeled illustrative. Source notes are 16px on phones/18px above; the next step is
  16px semibold and precedes supporting details. → P4+P6
- **Earlier personal input:** the hero leads to the notes field with “Start with my notes”
  and a downward cue; activation focuses the field. The quieter action explicitly creates
  an account (or opens projects for a signed-in visitor). Trust statements follow the
  form; the optional walkthrough moves into the supporting proof section. → P3+P6+P8+P9
- **Shorter explanation:** the repeated problem quote and separate benefits list are
  consolidated into capture → update → return. Daily briefs remain in that sequence;
  optional AI integrations remain in pricing and the FAQ. Process, pricing, and FAQ now
  have direct headings. The palette and icon family are preserved. → P3+P4+P6
- **Readable, verified proof:** `d/ProjectUpdate.svelte` summarizes the recorded beta-reader
  change in native text: Aug 17 → Aug 24 and priority 2 → 1. Both prior values appear in
  `case-update-chat-light.jpg`; the result also appears in `case-update-task-dark.jpg`.
  The resulting due date and priority were rechecked through the public project graph
  endpoint on 2026-11-04 UTC. Full-size original chat/task captures remain linked. The
  writing-block schedule was not reused because its current public data did not support
  the precise afternoon time in the old sample constant. This changes D's proof, not
  shared example data or the underlying project. → P4+P6+P19
- **Interaction and policy polish:** both disclosure chevrons reflect open state; privacy
  and export answers use short paragraphs with their existing terms intact. The lazy
  walkthrough has an error boundary. D opts into complete preview-switcher dismissal,
  while A–C retain their existing collapse behavior. → P6+P9+P11+P13+P20

| Viewport    | Page height before → after | Notes field before → after |
| ----------- | -------------------------: | -------------------------: |
| 1440 × 1000 |            3,832 → 3,423px |              1,100 → 746px |
| 768 × 1024  |            5,206 → 4,341px |              1,399 → 924px |
| 390 × 844   |            6,061 → 5,036px |            1,794 → 1,072px |
| 320 × 740   |            6,671 → 5,391px |            2,016 → 1,164px |

At 390px, the next-step sentence begins at 747px, visible within the first 844px viewport.
The process section is 581px, down from 1,148px. These are layout measurements, not
conversion or loading-speed claims.

**Visual review:** all four widths recaptured in both themes; no page-level horizontal
overflow. Before/after captures use the same viewport sizes. The requested side-by-side
gallery is `output/playwright/home-d-refined/comparison.html`, with desktop/phone,
light/dark, first-impression/full-page views. Eight comparison PNGs sit alongside it;
the original before images remain in `output/playwright/home-d-focused/`.

**Validation:** official Svelte autofixer clean for all five changed components/routes;
web Svelte check passes with zero errors/warnings after adding the error boundary's
required area identifier. Keyboard primary action, empty-form guidance, FAQ, walkthrough,
chapter selection, return-to-notes focus, preview-control dismissal, teardown, deferred
import, and draft-to-signup handoff passed with no browser runtime errors. Axe found no
WCAG A/AA violations or incomplete checks in D's main content at 1440/390px in both themes,
including the expanded privacy answer; this remains a scoped automated check.
Focused ESLint and Prettier checks also pass for every changed component and route.

No account created, model request, paid test, production edit, or deployment. The homepage
remains a local `/home-d` preview. A dedicated redesign of the shared animated walkthrough's
phone cards and shared navigation changes remain separate from this D presentation pass.

### Independent review follow-up implemented — 2026-11-03

After the independent reviewer graded the revised page B, the user authorized its four
remaining recommendations. All four are now addressed:

- **Continuity:** the proof introduction explicitly connects the website illustration to
  the recorded novel workflow. “Back in the project” frames the saved task and its changed
  values as the work a visitor returns to. The original evidence remains linked and the
  website example remains labeled illustrative. No new customer outcome was invented.
  → P4+P6
- **Mobile pacing:** replace the three long explanations with a compact capture/update/
  return strip. Supporting text remains 16px. At 390px, the section drops from 581px to
  245px and the proof begins at 1,717px instead of 2,053px. → P3+P4+P6
- **Navigation:** Home D's desktop and mobile public navigation uses `#d-how` and `#d-proof`,
  labeled “How it works” and “See it in action.” Activation releases the mobile drawer's
  scroll lock, focuses the destination, and positions it below the header. Other routes
  retain the live homepage destinations. → P6+P13
- **Narrow proof layout:** date/priority columns use a 2:1 ratio and unbroken comparison
  rows. Both changes stay on one line at 320px. → P1

| Width  | Page height before → after | Workflow height before → after | Proof starts before → after |
| ------ | -------------------------: | -----------------------------: | --------------------------: |
| 1440px |            3,423 → 3,353px |                    297 → 259px |             1,351 → 1,313px |
| 768px  |            4,341 → 4,191px |                    377 → 259px |             1,609 → 1,491px |
| 390px  |            5,036 → 4,684px |                    581 → 245px |             2,053 → 1,717px |
| 320px  |            5,391 → 5,007px |                    581 → 245px |             2,145 → 1,809px |

**Independent follow-up grade: A overall.** The same reviewer inspected updated captures,
source, and measurements and marked all four findings resolved, with no material remaining
issue. Its navigation assessment also used the implementation agent's live-check evidence;
it did not repeat those interactions. A future founder-specific recorded example is an
optional persuasion improvement, not an outstanding implementation item from this pass.

**Verification:** fresh before/after desktop, tablet, 390px and 320px captures in both themes;
zero horizontal overflow. Keyboard navigation stays on `/home-d`, closes the mobile menu,
focuses the requested section, and lands at y=96 at 1440/390/320px. Date comparisons remain
one line at those widths. Home B retains its original public header links. No runtime errors
in these checks. Web Svelte check: zero errors/warnings; focused ESLint and Prettier pass.
Official autofixer: no issues in the three edited components; existing Navigation effect/
binding suggestions were reviewed and left outside this change. Scoped axe A/AA checks
have zero violations or incomplete items at 1440/390px, both themes, with privacy expanded.

**Comparisons:** `output/playwright/home-d-final-pass/comparison.html` and its ten PNGs show
this pass against the immediately preceding version, including the workflow/proof region,
full desktop/phone pages, and the 320px date detail. Original captures and measured geometry
are preserved in its `before/` and `after/` folders. The independent verdict is recorded in
`independent-followup.md`. No paid tests, signup completion, or deployment.

### Home D visual direction reset — 2026-11-03

The user rejected the prior iteration's visual sameness despite its favorable clarity
review. This direction supersedes that review as the design target: show the actual
product, restore Home C's animated explanation, and give each part a different visual role.
No new letter grade was assigned.

| Before                                        | After                                                                                                                       | Why                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uniform heading/body/summary sections         | Large mixed sans/serif hero, copper grid backdrop, charcoal demo, centered gallery, paper notes area, compact pricing strip | Distinguish sections through scale, composition, and surface treatment. → P3/P4/P19                                                                   |
| Reconstructed website and saved-task examples | Existing real project, task-board, calendar, and chat screenshots                                                           | Let visitors see what BuildOS looks like and inspect the original captures. → P6                                                                      |
| Home C animation hidden behind a disclosure   | Visible animated stage, loaded near the viewport                                                                            | Give the product's transformation a prominent role; reuse C's chapter controls, pause/resume, offscreen pause, and reduced-motion behavior. → P11/P20 |
| One static proof summary                      | Three selectable workspace views with explanatory copy                                                                      | Show different ways to work without stacking three similar sections. → P4/P6/P13                                                                      |
| Screenshots available only as evidence links  | Theme-matched screenshots with keyboard/touch panning and full-size links                                                   | Preserve readable details on phones and allow closer inspection. → P1/P13                                                                             |

**Implementation:** `HomeVariantD.svelte`, `d/AnimatedDemo.svelte`, and
`d/ProductScreen.svelte`. The shared navigation's D-only proof label is now “Inside BuildOS.”
Home C's animation source is reused without modification. Existing static illustration
components remain available but are no longer rendered on D. Pricing still follows the
billing flag; policy disclosures and the draft-to-signup handoff remain in place. Draft
copy now states that the notes come along through signup. The calendar view makes no
claim that the recorded writing block moved to an afternoon slot.

**Visual evidence:** `output/playwright/home-d-visual/` preserves the immediately preceding
D in `before/` and new browser captures in `after/`. Desktop, tablet, 390px, and 320px captures
in both themes show no document overflow. The screenshot regions intentionally scroll
horizontally on narrow screens. Full-page heights are 4,761 / 5,518 / 5,704 / 6,090px at those
widths; the added visible animation accounts for much of the increase. The first viewport
contains the actual product image on desktop and phones. `comparison.html` and its PNGs
show the old and new versions at equal scale.

**Scope:** local `/home-d` preview. No paid tests, model requests, completed signup, or deployment.

**Validation:** official Svelte autofixer reports no issues in the three D components or
Navigation (its existing effect/binding suggestions remain outside this label change).
The final web Svelte check passes with zero errors and zero warnings. Scoped ESLint and
formatting checks pass. Browser checks pass for all three gallery views,
keyboard screenshot panning, primary-action focus, empty-draft guidance, privacy disclosure,
notes preserved in the signup redirect, mobile/desktop header anchors, reduced-motion
chapter selection, and normal-motion play/pause/resume; no runtime errors were observed.
Axe A/AA checks at 1440/390px in both themes report zero violations after correcting the
notes eyebrow contrast. The grid backdrop and layered animation produce automated
contrast items requiring manual review; these are not claimed as a full accessibility
certification. Screenshot captions now use foreground ink, measuring 12.89:1 against the
darkest light-theme grid intersection. Browser captures were visually inspected. No changes were made to shared
animation internals or design-system tokens.
