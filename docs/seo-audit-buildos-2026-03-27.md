<!-- docs/seo-audit-buildos-2026-03-27.md -->

# SEO Audit: build-os.com

**Date:** 2026-03-27
**Tool:** seobeast-audit
**Overall Score:** 62/100 (Grade: D)

## Category Scores

| Category        | Score  | Issues |
| --------------- | ------ | ------ |
| Technical SEO   | 74/100 | 10     |
| Content         | 61/100 | 12     |
| Performance     | 62/100 | 12     |
| Security        | 52/100 | 6      |
| Structured Data | 61/100 | 12     |
| AEO             | 61/100 | 8      |

## Critical Issues

1. **robots.txt blocks /\_app/** — All SvelteKit CSS/JS blocked from Googlebot (Technical)
2. **9 H1 tags on homepage** — Destroys heading hierarchy & topical signal (Content)
3. **H1/Title keyword mismatch** — "messy ideas" vs "brain dumps" (Content)
4. **7 synchronous render-blocking CSS files** (236KB main bundle) (Performance)
5. **No LCP image preload** or fetchpriority="high" on hero (Performance)
6. **Body content not in static HTML** — AI crawlers see ~50 words (AEO)
7. **Meta description dynamically injected**, invisible to non-JS crawlers (AEO)
8. **No WebPage/HomePage schema** — Only site-level schemas exist (Structured Data)
9. **AggregateOffer misuse** — Single plan wrapped as aggregate (Structured Data)
10. **JSON-LD bare array** — Needs @graph wrapper for reliable parsing (Structured Data)

## High Priority Issues

1. /blogs JSON-LD is empty "{}" — invalid structured data (Technical)
2. Sitemap lastmod stale (2025-12-19) — page updated 2026-03-24 (Technical)
3. URL slug typo: "agentic-vrs-context-engineering" (should be "vs") (Technical)
4. HSTS missing includeSubDomains & preload directives (Technical)
5. Zero social proof — no testimonials, reviews, or user counts (Content)
6. Title tag is brand-first — unknown brand consumes keyword space (Content)
7. Heading hierarchy collapsed — H2s orphaned under 9 competing H1s (Content)
8. document.write() in inline script for Meta Pixel (Performance)
9. No `<link rel="preconnect">` for any third-party origin (Performance)
10. 236KB CSS bundle possibly served uncompressed (Performance)
11. Hero logo PNG — no WebP/AVIF variant, no fetchpriority (Performance)
12. SoftwareApplication missing aggregateRating — no star rich results (Structured Data)
13. Organization logo missing width/height for Knowledge Panel (Structured Data)
14. No FAQ schema — strong positioning content uncitable for Q&A queries (AEO)
15. llms.txt root summary is unstructured plain text (AEO)
16. 5 missing security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (Security)

## Medium Priority Issues

1. All pages share a single OG image — social previews indistinguishable (Technical)
2. Sitemap includes thin blog category index pages (Technical)
3. robots.txt /profile missing trailing slash — overbroad block (Technical)
4. No pricing shown on homepage despite $20/month in schema (Content)
5. No FAQ or question-format headings for featured snippets (Content)
6. Blog date format non-ISO: "2025-6-26" instead of "2025-06-26" (Content)
7. Founder bio in schema but not visually anchored with headshot/link (Content)
8. 41 modulepreload hints competing for browser fetch slots (Performance)
9. HTML max-age=0 — no CDN edge caching for public pages (Performance)
10. 28 inline SVGs inflating DOM and initial payload (Performance)
11. No Person schema for founder DJ Wayne (Structured Data)
12. SoftwareApplication missing screenshot & softwareVersion (Structured Data)
13. SearchAction target /blogs?q= may be too narrow for sitelinks (Structured Data)
14. No /llms-full.txt companion for detailed AI context (AEO)
15. HSTS missing includeSubDomains (Security)

## Passing

- HTTPS enforced with 308 redirect, www to non-www canonical
- Canonical tags present, absolute HTTPS, match page URLs
- meta robots "index, follow" on all pages
- `<html lang="en">`, charset UTF-8, viewport meta, HTML5 doctype
- Sitemap.xml present, valid XML, 33 URLs, referenced in robots.txt
- All AI crawlers explicitly whitelisted (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot)
- llms.txt present with H1, ## sections, and page links
- 3 JSON-LD schemas (Organization, WebSite, SoftwareApplication) with @id cross-refs
- OG tags complete (type, url, title, description, image with dimensions)
- Twitter Card summary_large_image with @build_os handle
- Analytics deferred on interaction (Ahrefs, Clarity, Meta Pixel)
- All `<img>` tags have explicit width/height — no CLS from images
- Immutable assets served with max-age=31536000, Cache-Control: immutable
- Brotli compression active on HTML
- No deprecated FAQPage or HowTo schemas
- Privacy, Terms, About, Contact all linked from footer
- Skip-to-main-content accessibility link present
- SvelteKit SSR active (x-sveltekit-page header present)
