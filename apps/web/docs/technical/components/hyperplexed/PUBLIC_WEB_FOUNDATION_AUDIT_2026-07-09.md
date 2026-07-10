<!-- apps/web/docs/technical/components/hyperplexed/PUBLIC_WEB_FOUNDATION_AUDIT_2026-07-09.md -->

# Public Web Foundation Audit — 2026-07-09

## Scope

Public shell and first-impression routes: home, pricing, about, contact, help, blogs, skills,
public author/project pages, registration metadata, legal copy, plus shared form primitives and
client-bundle configuration. The authenticated product was checked where a global shell or
primitive change could affect it.

## Baseline evidence

Production Lighthouse before this cleanup measured the home page at **66 mobile performance**,
**98 accessibility**, **77 best practices**, and **100 SEO**. Mobile LCP was 7.2 seconds, FCP was
2.4 seconds, TBT was 200 ms, and the page loaded 144 requests / roughly 928 KiB transferred.
Desktop performance was 99 with a 0.8-second LCP. This gap points to mobile main-thread and
request work rather than a universal server-rendering failure.

## Findings and disposition

### Tier 0 — trust, access, and architecture

1. **Pricing described an active trial and purchasable $20 offer while billing was disabled.**
   Search schema repeated the live-offer claim. **Shipped:** visible copy, FAQ, CTA, registration
   metadata, Help, About, Contact, Terms, Roadmap, investor copy, and Product/Application schema now
   derive from the billing feature flag or state clearly that billing is not live. The planned
   price remains visible without implying a charge. → P4+P6+P19
2. **The root layout owned `<main>`, while many route components added another `<main>`.** This
   created nested main landmarks on public and authenticated pages. **Shipped:** route-level
   landmarks were converted to neutral wrappers; the root shell is now the single main landmark.
   → P13
3. **Shared text inputs, selects, and textareas used the decorative border token for their only
   visible boundary.** Lighthouse identified insufficient non-text contrast. **Shipped:** enabled
   controls now use `border-border-strong`; focus styling remains accent-based. A textarea focus
   class typo was corrected at the same time. → P13+P19
4. **Anonymous public navigation eagerly created the Supabase browser client.** Static auth utility
   imports also made the dependency easier to pull into public chunks. **Shipped:** the client is
   created only for authenticated layout data; logout/refresh import it on demand.
5. **The `utils` manual chunk grouped route-local packages into a broad shared dependency.** The
   resulting chunk was about 100 KiB gzip in the production baseline. **Shipped:** the forced utils
   group was removed so Rollup can split by the actual import graph. The production manifest now
   reports only a 0.18 KiB / 0.16 KiB gzip natural helper chunk named `utils`; the anonymous home
   route's static graph does not contain the Supabase entry.
6. **The public landing page and authenticated dashboard shared the `/` route module.** Even though
   the server selected only one experience, the route boundary coupled public metadata, landing UI,
   dashboard data, and authenticated client dependencies. **Shipped:** `/` is now public-only and
   authenticated users are redirected early to `/dashboard`; `/dashboard` owns dashboard data/UI and
   redirects anonymous users to login with a dashboard return path. Navigation, login/register,
   Google OAuth, onboarding, checkout, admin exits, calendar back-links, robots rules, and onboarding
   shell behavior now use the same route contract. Query state is preserved when an authenticated
   request reaches `/`. The production root layout + home static JS graph fell from approximately
   146 KiB to 128 KiB gzip before dynamic imports (102→87 modules, about 12% less JS). The dashboard
   graph remains isolated at approximately 151 KiB gzip. Dashboard motion also gained a
   `prefers-reduced-motion` fallback. → P3+P11+P13

### Tier 1 — semantics and interaction

1. **The homepage skipped from H1 to H3.** **Shipped:** the section question is an H2. → P4+P13
2. **Blog and legacy skills filters exposed visual state without programmatic state.** Their search
   controls relied on placeholders. **Shipped:** named search controls, labeled filter groups,
   `aria-pressed`, decorative icon hiding, and 44px skill filter targets. → P7+P13
3. **Reduced-motion handling was missing in hash scrolling and a response pulse.** **Shipped:** hash
   navigation selects instant scrolling when requested and the pulse stops. → P11
4. **The pre-billing warning used a solid-background foreground token on a pale tint.** **Shipped:**
   normal foreground text is used on tints; the solid action retains the paired semantic
   foreground. This became reusable pattern P19.
5. **Several secondary links had undersized targets or unclear labels.** **Shipped:** homepage
   explainer/example links now describe their destination, meet the minimum target, and expose
   visible focus. → P6+P13

### Tier 2 — SEO and completeness

1. **The sitemap omitted the new `/skills` root.** **Shipped:** it is now part of the generated
   static URL set.
2. **Dynamic skill detail/domain/path routes and public `/p/*` pages are not yet generated into the
   sitemap.** **Deferred:** add a data-aware URL source with stable `lastmod` values; do not invent
   dates or expose unpublished public pages.
3. **The public author index lacks dedicated title/description/canonical metadata.** **Deferred:**
   provide author data to an SEO head at the route boundary, including indexability rules for empty
   authors.

## Next implementation sequence

1. **Reduce mobile home cost.** Audit image dimensions/formats, delay below-fold media, apply
   `content-visibility` where safe, and compare route chunks and Lighthouse after each change.
2. **Consolidate analytics and consent behavior.** Inventory Vercel analytics, Speed Insights,
   Meta Pixel, and any duplicate page-view paths; align loading with the desired consent policy.
3. **Finish dynamic SEO.** Add public skill and published `/p/*` sitemap sources, author-index SEO,
   and structured-data tests.
4. **Run the visual polish pass.** Desktop/mobile and light/dark verification for home, pricing,
   about, blogs, and skills; then normalize CTA hierarchy, radius drift, micro-type, and hidden
   product proof using P2/P4/P5/P8/P13.

## Release gates for this batch

- ✅ Prettier on touched web files.
- ✅ `pnpm --filter @buildos/web check` (0 errors, 0 warnings).
- ✅ `pnpm --filter @buildos/web lint` (0 errors; 218 pre-existing repository warnings).
- ✅ Production build and chunk inspection. The build still flags unrelated application chunks over
  1 MB, which remains product-route code-splitting work rather than a public-home regression.
- ✅ Local desktop + phone-width verification of home and pricing in light/dark: one main/one H1,
  zero horizontal overflow, pre-billing schema confirmed, and no browser console warnings/errors.

## Route split follow-up verification

- ✅ Focused root/dashboard server tests: 4 assertions across anonymous access, authenticated
  query-preserving redirects, protected dashboard access, and dashboard analytics loading.
- ✅ `pnpm --filter @buildos/web check` (0 errors, 0 warnings).
- ✅ `pnpm --filter @buildos/web lint` (0 errors; repository warning backlog remains).
- ✅ Production build and manifest traversal: public root static JS approximately 128 KiB gzip / 87
  modules; authenticated dashboard static JS approximately 151 KiB gzip / 93 modules.
- ✅ Local 1440×900 and 390×844 root verification: one main/one H1, zero horizontal overflow,
  canonical `https://build-os.com/`, index/follow robots, two JSON-LD blocks, no dashboard content.
- ✅ Anonymous `/dashboard` verification resolves to
  `/auth/login?redirect=%2Fdashboard`; authenticated root behavior is covered by the server test.
