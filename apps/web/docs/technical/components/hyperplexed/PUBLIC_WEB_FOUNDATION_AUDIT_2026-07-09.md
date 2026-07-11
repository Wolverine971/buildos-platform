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
7. **The mobile homepage laid out and painted all seven sections immediately, statically imported a
   closed example modal, and eagerly fetched an agent logo more than 5,000px below the first
   viewport.** **Shipped:** the modal and full public-project preview now share an intent-preloaded
   dynamic-import path; the logo has explicit lazy/low-priority loading; and the five deep sections
   use measured desktop/mobile paint containment without removing their SSR content. Containment is
   applied inside the `#loop` and `#agents` targets so in-page links stay reliable, and initial hash
   loads are corrected after hydration with an instant, non-animated scroll. Root static JS fell
   from 127,834 to 123,164 bytes gzip (87→83 modules); initial static CSS fell by about 0.5 KiB gzip.
   The closed Modal chunk is absent from the initial root graph. → P11+P20+P21
8. **Five independent analytics systems loaded without one consent contract.** Vercel Analytics and
   Speed Insights were statically initialized, Ahrefs and Clarity started after three seconds,
   PostHog and the first-party daily visitor tracker wrote analytics state, and Meta Pixel loaded at
   idle with an unconditional no-JavaScript fallback. **Shipped:** one versioned, reversible
   preferences contract now separates product analytics from marketing measurement; optional tools
   stay off until the visitor chooses, and Global Privacy Control or Do Not Track keeps both off.
   Vercel's cookie-free Web Analytics and aggregate Speed Insights remain production-only operational
   measurement and now load from an idle dynamic import. Ahrefs and Clarity were removed as
   overlapping page/session trackers. PostHog retains automatic SPA page views and named funnel
   events but disables broad autocapture, session replay, surveys, product tours, feature flags,
   dead-click capture, Web Vitals capture, cookies, and external extension loading. Meta loads only
   after marketing consent; its no-JavaScript pixel was removed because it could not honor that
   choice. The privacy page now names the tools actually in use, and every footer exposes a
   44px-target `Privacy choices` control. → P6+P13+P19

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
2. **Dynamic skill detail/domain/path routes and public `/p/*` pages were absent from the sitemap.**
   **Shipped:** the generated static sitemap now includes the public and reviewed-preview skill
   gallery routes. A separate database-backed sitemap enumerates only live, public, published,
   indexable pages and their non-empty author indexes, using stored publication/update timestamps
   for `lastmod`. The endpoint fails closed with `503` when its source query fails rather than
   serving an authoritative-looking empty sitemap.
3. **The public author index lacked dedicated title/description/canonical metadata.** **Shipped:**
   author indexes now emit a route-specific title, description, canonical URL, social URL, and
   `CollectionPage`/`Person`/`ItemList` structured data. Empty author collections return `404`
   instead of creating thin indexable pages.

## Next implementation sequence

1. **Continue the visual polish pass.** Home and pricing geometry/hierarchy are shipped. Next,
   simplify Contact's page purpose and CTA order, then close the footer, blog-card, and skills
   metadata/tap-target findings using P2/P3/P4/P5/P6/P8/P11/P13.
2. **Re-run deployed performance evidence.** Capture fresh mobile Lighthouse results after the
   current public-web batches reach production and compare LCP, TBT, and request totals with the
   original 66-performance baseline.

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

## Mobile homepage performance follow-up — 2026-07-10

- ✅ Initial root JS: 127,834→123,164 bytes gzip and 87→83 static modules. Initial CSS:
  32,136→31,646 bytes gzip. The Modal chunk/CSS moved behind user intent.
- ✅ The below-fold OpenClaw image remains undecoded on a fresh 390×844 first viewport and loads
  only when its section becomes relevant; width/height prevent layout shift.
- ✅ Five deep sections use measured `content-visibility` containment. Initial document height is
  9,234px versus the 9,229px baseline, avoiding a meaningful scrollbar/geometry jump.
- ✅ Example-project activation loads the accessible modal and full public-project fixture; normal
  `#agents` clicks and direct `/#agents` loads both land with the target at viewport top.
- ✅ Local production preview verified at 1440×900 and 390×844 in light and dark: one main/one H1,
  zero horizontal overflow, stable first viewport, and no lost deferred content.
- ✅ `pnpm --filter @buildos/web check` (0 errors, 0 warnings), lint/guardrails (0 errors; 224
  repository warnings), Prettier, and the production Vite build pass. The build still reports its
  existing optional Sharp platform-dependency warning.
- ✅ Repaired raw comparison notation in two skill eval Markdown fixtures that the Markdown/Svelte
  pipeline interpreted as invalid element syntax; this was an unrelated production-build blocker.
- ⬜ Fresh deployed mobile Lighthouse is still required to compare LCP/TBT/request totals against
  the original 66-performance baseline.

## Analytics and consent follow-up — 2026-07-10

- ✅ First-visit production preview loads only Vercel Analytics and Speed Insights. PostHog, the
  first-party `/api/visitors` request, and Meta Pixel remain absent until their matching choice.
- ✅ Product-analytics-only loads one PostHog configuration/event path plus the first-party daily
  visit. Meta, Ahrefs, Clarity, PostHog dead-click capture, and PostHog Web Vitals are absent.
- ✅ Marketing measurement loads Meta Pixel only after opt-in. `Use necessary only` revokes both
  optional categories, clears first-party analytics identifiers, and remains saved after reload.
- ✅ The preferences panel and footer control were verified at 390×844 and 1440×900 in light and
  dark mode: zero horizontal overflow, panel fully within the viewport, visible focus, and 44px
  controls. The only browser warning was Meta rejecting localhost under its domain traffic rules.
- ✅ Focused consent tests (2), touched-file ESLint (0 errors, 0 warnings), Prettier,
  `pnpm check` (0 errors, 0 warnings), and the production Vite build pass. The build retains the
  known optional Sharp platform-dependency warning.
- ✅ The public root's static graph is 127,750 bytes gzip / 86 modules, including the visible
  preferences UI, versus 123,164 bytes / 83 modules before consent controls. The Vercel packages,
  PostHog SDK, visitor service, and Meta's external script all remain outside that static graph; the
  roughly 4.5 KiB increase is the privacy-control UI and orchestration cost.

## Dynamic SEO follow-up — 2026-07-10

- ✅ The static sitemap covers the public and reviewed-preview skill gallery routes. Robots now
  advertises both the static sitemap and the database-backed `/sitemap-public-pages.xml` child
  sitemap.
- ✅ The public-page sitemap filters for `published` + `live` + `public` + indexable rows, includes
  canonical nested and supported legacy URLs, deduplicates author indexes, paginates source reads,
  and uses only stored timestamps for `lastmod`.
- ✅ Source-query failure returns `503` with retry guidance and no cache; successful XML uses a
  one-hour shared cache with stale-while-revalidate so crawlers do not force a database read on
  every request.
- ✅ A real local author index (`/p/dj-wayne`) was verified with the route-specific title,
  description, canonical URL, index/follow directive, Open Graph URL, and `CollectionPage`
  structured data containing its two published pages.
- ✅ Focused sitemap/author-route tests pass (10 assertions); touched-file ESLint is clean;
  Prettier, `pnpm check` (0 errors, 0 warnings), and the production Vite/Vercel build pass. The build
  retains the repository's known optional Sharp platform-dependency warning.

## Visual polish follow-up — home and pricing — 2026-07-10

- ✅ Home and pricing now use the public shell's `max-w-7xl` and `px-2 sm:px-4 lg:px-6` geometry,
  so their content edges align with navigation and footer at phone and desktop widths. → P3
- ✅ Pricing retains the truthful pre-billing status while removing repeated versions of the same
  warning. The plan now leads with five product-defining capabilities and demotes integrations,
  export, and support to quieter included metadata. → P4+P6
- ✅ Pricing FAQ cards use a bounded two-column desktop reading measure and compact phone padding;
  the closing CTA now uses the same restrained Inkprint hierarchy as the rest of the public site
  instead of a full-width solid accent band. → P2+P3+P4
- ✅ The homepage agent-skip link now meets the 44px/focus/reduced-motion control contract, and
  already-small bidirectional labels no longer receive an extra opacity reduction. → P4+P11+P13
- ✅ Live verification passed at 390×844 and 1440×900 in light and dark mode: one main/one H1,
  zero horizontal overflow, a 44px agent-skip target, and a two-column desktop FAQ. Touched-file
  ESLint, Prettier, `pnpm check` (0 errors, 0 warnings), and the production Vite/Vercel build pass.
  The build retains the repository's known optional Sharp platform-dependency warning.
- ⬜ Larger judgment-heavy changes remain separate: homepage proof deduplication/visible product
  preview, Contact content reordering, About copy deduplication, footer consolidation, and the
  blog/skills density fixes from the read-only route audit.
