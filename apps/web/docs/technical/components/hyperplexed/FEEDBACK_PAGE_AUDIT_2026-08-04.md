<!-- apps/web/docs/technical/components/hyperplexed/FEEDBACK_PAGE_AUDIT_2026-08-04.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-04; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Feedback Page Hyperplexed Audit — 2026-08-04

**Surface:** `/feedback`  
**Implementation:** `src/routes/feedback/+page.svelte`  
**Prior art:** `PUBLIC_WEB_FOUNDATION_AUDIT_2026-07-09.md` verified the route's public-shell layout at
390 and 1440 widths on 2026-07-15, but did not perform a region-by-region feedback-flow audit.

## Regions

1. Purpose and orientation header
2. Category selector
3. Optional experience rating
4. Feedback and reply fields
5. Submit, error, and success states
6. Supporting proof, examples, and alternate-contact sections

## Tier 1 — cheap, high-impact

- **Header and page shell:** three custom width/padding scales broke alignment with the public shell,
  while the centered hero made the left-aligned form feel like a separate page. Use the canonical
  public shell and one shared content edge. → P3
- **Labels and hierarchy:** “Your Feedback is everything” was awkward, overemphatic, and repeated the
  point made by the following copy. The form's required path was less visually explicit than the
  marketing headings below it. Rename the page around its job and give the four input steps a compact,
  consistent hierarchy. → P4+P5+P6
- **Category and rating controls:** category buttons were visually large without descriptive subtext;
  the star buttons did not render a selected fill state. Replace both with native radio groups in
  44px-safe, fixed-icon containers and make selection visible without relying on color alone. → P1+P9+P13
- **Motion and semantic color:** hover scaling, broad `transition-all`, and smooth success scrolling
  were not reduced-motion gated. Error and success content also needed the soft-tint foreground
  contract. Remove unnecessary movement, gate remaining color transitions, and pair tint surfaces
  with normal foreground text. → P11+P19

## Tier 2 — structural within the surface

- **Primary path:** the form was followed by three full marketing sections—“Why Feedback Matters,”
  testimonial-style examples, and alternate conversion paths—making a utility route feel like a
  landing page. Keep the form dominant and compress the useful trust/context copy into one quiet
  supporting rail. → P4+P6+P8
- **Form states:** the success state forced a smooth scroll after swapping the form, while field-level
  email feedback was not linked through the input primitive's error contract. Keep state changes in
  place, announce the success region, and route email help/errors through `TextInput`. → P11+P13
- **Implementation consistency:** icons bypassed the shared Lucide entry point, and the repeated cards
  mixed accent/muted treatments without a clear semantic reason. Use the wrapper and a restrained
  two-radius, one-card composition. → P2+P9

## Tier 3 — polish/signature

- No signature effect was added. This is a focused form surface; clarity, tactile native controls,
  and a calm Inkprint hierarchy are the earned polish. → P11+P13

## Shipped

- Rebuilt the route around one shell-aligned hero and one responsive form/support grid. The page now
  has a single purpose instead of four competing pitches. → P3+P4+P6+P8
- Added concise category descriptions, numbered micro-labels, native category/rating radio groups,
  explicit selected stars, fixed icon containers, 44px targets, and visible focus rings. → P1+P5+P9+P13
- Shortened the textarea prompt, exposed the minimum and live character count, moved email validation
  into the input primitive's linked helper/error treatment, and made submit full-width on phones. → P4+P6+P13
- Reworked error and success panels with Inkprint semantic tints and foreground pairing. Removed
  broad/scaling animations and the forced smooth scroll; remaining transitions opt out for reduced
  motion. → P11+P19
- Routed every route icon through `$lib/icons/lucide` and corrected stateful global regex flags in the
  existing client spam check so repeat submissions are evaluated consistently. → P9

## Verification

- ✅ Official Svelte autofixer: no issues or suggestions.
- ✅ Focused `svelte-check`: 0 errors and 0 warnings for the route and its imported surface.
- ✅ Focused component suite: 3 tests pass for required-state submission, native rating state, and
  linked email validation.
- ✅ Scoped ESLint and Prettier pass.
- ✅ Local Vite SSR/HMR accepted the rewritten route without a route compile error.
- 🔶 The full repository web check reaches diagnostics but is currently blocked by three unrelated
  TypeScript errors in `DocsIndex.svelte` and `DocsSidebar.svelte` (`Icon` used as a value). Those files
  were already changing outside this audit and were not modified here.
- 🔶 After-state desktop/iPhone light/dark screenshots remain owed. The configured in-app browser
  blocked the localhost URL under its URL-safety policy, so this pass did not claim visual capture.
