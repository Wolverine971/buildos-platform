<!-- docs/seo-audit-tacemus-2026-03-27.md -->

# SEO Audit: tacemus.com

**Date:** 2026-03-27
**Tool:** seobeast-audit

---

## Score: 47/100 — Grade: D

| Category        | Score  | Issues |
| --------------- | ------ | ------ |
| Technical SEO   | 62/100 | 11     |
| Content         | 58/100 | 12     |
| Performance     | 38/100 | 15     |
| Security        | 40/100 | 7      |
| Structured Data | 5/100  | 7      |
| AEO             | 62/100 | 9      |

---

## Critical

- **Broken JSON-LD: all 4 schema blocks render raw Svelte template code** (`{serializeJsonLd(...)}`) instead of valid JSON. Zero structured data reaches crawlers. _(Structured Data)_

- **Duplicate canonical tags:** `<link rel="canonical" href="https://tacemus.com">` AND `href="https://tacemus.com/"` — conflicting trailing slash from layout + page both emitting. _(Technical)_

- **Duplicate meta tags:** title, description, og:\*, twitter:\* all appear twice with different values. Layout and page both inject full SEO tag sets. _(Technical)_

- **Portfolio images unoptimized:** 4 PNGs totaling 6.17 MB (la-industrial 3.28 MB, cadre 1.90 MB, buildos 0.61 MB, 9takes 0.38 MB). Should be WebP/AVIF. _(Performance)_

- **No llms.txt** — AI assistants have no machine-readable summary of services, audience, or how to recommend Tacemus. _(AEO)_

- **Ultra-short paragraphs (6–35 words)** make the site nearly uncitable by AI engines. Need 80–200 word blocks. _(AEO)_

---

## High Priority

- **www vs non-www mismatch:** site redirects to www.tacemus.com but canonical, sitemap, and OG URLs all reference non-www. _(Technical)_

- **No meta description tag detected.** _(Content)_

- **H1 ("Make the invisible visible.") is a tagline, not descriptive.** Contains zero service keywords. Second H1 also detected. _(Content)_

- **Title leads with brand name** ("Tacemus | ..."). For a site without domain authority, keyword should come first. _(Content)_

- **6 render-blocking CSS files** (2 font stylesheets + 4 SvelteKit CSS) block first paint. No preload hints for any asset. _(Performance)_

- **Portfolio images missing `loading="lazy"`** — 6.17 MB loads eagerly even though images are below the fold. _(Performance)_

- **Images missing `srcset`** — single fixed resolution served to all devices. Image cache-control is max-age=0. _(Performance)_

- **No external citations or source links.** Claims like "10k+ monthly visitors" have no attribution. _(Content)_

- **FAQ answers are 1 sentence each** — too thin for rich snippet or AI citation value. Expand to 80–150 words. _(AEO)_

- **FAQPage schema deprecated for commercial sites** (Aug 2023). Will not produce Google rich results even if fixed. _(Structured Data)_

---

## Medium Priority

- **Missing security headers:** CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all absent. _(Security)_

- **No Service or LocalBusiness schema** — services and Maryland location are not machine-readable. _(Structured Data)_

- **Content duplicated within page** — services/process sections appear to render twice (mobile + desktop variants both in DOM). _(Content)_

- **~60 heading tags** with many decorative labels ("Fast", "Step 1"). Dilutes topical signals. Aim for 15–20 meaningful headings. _(Content)_

- **No visible author attribution on page.** DJ Wayne referenced only in (broken) schema markup. _(Content)_

- **No publication or last-updated date** anywhere on page. _(Content)_

- **Missing preconnect to cdn.fontshare.com** (font files). Only api.fontshare.com is preconnected. _(Performance)_

- **No definition-style sentence** ("Tacemus is a..."). AI models need a clean entity definition to index. _(AEO)_

- **Zero internal links to deeper content** (blog posts, case studies). No topical depth signals. _(Content)_

---

## Passing

- HTTPS enforced with HSTS max-age=63072000 (~2 years)
- HTTP → HTTPS redirect uses 308 Permanent Redirect
- robots.txt well-structured with AI crawlers explicitly allowed (OAI-SearchBot, ClaudeBot, PerplexityBot)
- Sitemap present with 10 URLs, referenced in robots.txt
- HTML5 doctype, lang="en", charset UTF-8, viewport meta
- SvelteKit SSR delivers ~1,200 words in static HTML — no JS needed
- All fonts use font-display: swap (no FOIT)
- Portfolio images have width/height attributes (CLS protected)
- Skip-to-content link present for accessibility
- All external links have rel="noopener noreferrer"
- Clean, short, lowercase URLs with hyphens
- No mixed content detected
- Contact info clearly present (email, location, book-a-call CTA)
- Social profile links present (LinkedIn, GitHub, Twitter/X)
- Brotli compression active on responses
- Zero external JavaScript loaded synchronously

---

## Top 3 Fixes by Impact

### 1. Fix broken JSON-LD + duplicate meta tags

The `{serializeJsonLd(...)}` expressions in `app.html` aren't being processed by SvelteKit. Move schema generation into `+layout.svelte` or `+page.svelte` using `<svelte:head>` with `{@html}`. Simultaneously deduplicate the meta tags so only one source emits per page.

### 2. Convert portfolio PNGs to WebP + add `loading="lazy"`

This single change drops page weight from ~6.2 MB to under 500 KB for images.

### 3. Create `/llms.txt` + expand paragraph lengths

Gives AI engines a structured summary and makes content actually citable. The current ultra-short copy is invisible to AI citation.
