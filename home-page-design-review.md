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
