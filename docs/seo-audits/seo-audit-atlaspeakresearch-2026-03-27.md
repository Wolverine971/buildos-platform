<!-- docs/seo-audits/seo-audit-atlaspeakresearch-2026-03-27.md -->

# SEO Audit: atlaspeakresearch.com

**Date:** 2026-03-27
**Tool:** seobeast-audit
**URL:** https://www.atlaspeakresearch.com/

---

## Overall Score: 52/100 — Grade: D

| Category                     | Score  | Issues |
| ---------------------------- | ------ | ------ |
| Technical SEO                | 72/100 | 14     |
| Content                      | 28/100 | 18     |
| Performance                  | 82/100 | 10     |
| Security                     | 72/100 | 5      |
| Structured Data              | 22/100 | 12     |
| AEO (AI Engine Optimization) | 48/100 | 11     |

---

## Critical

### Sitemap uses HTTP instead of HTTPS on all 59 URLs _(Technical)_

All `<loc>` entries use `http://` while the site enforces `https://`. Search engines must resolve a redirect for every URL, wasting crawl budget and risking indexing confusion.

### GPTBot and ClaudeBot fully blocked in robots.txt _(AEO)_

The two largest AI assistants cannot crawl, cite, or surface this site's research in AI-powered search. The blanket `Disallow` blocks ALL access — not just training.

### No JSON-LD structured data on 55+ report pages _(Structured Data)_

Every report has a title, date, author, and body text but zero JSON-LD markup. No Article, Organization, or WebSite schema anywhere except JobPosting on `/careers`. Zero chance of rich results in Google.

### No /about page (returns 404) _(Content / E-E-A-T)_

This is a YMYL-adjacent financial research site with no page explaining who produces the research, their credentials, or methodology. Google's Quality Rater Guidelines explicitly check "Who is responsible for this content?"

### No /contact page (returns 404) _(Content / E-E-A-T)_

No email, phone, address, or contact form. Google's raters check for "How to contact the website owner."

---

## High Priority

### Homepage title is just the brand name _(Technical)_

Current: `<title>Atlas Peak Research</title>`

Misses opportunity for keywords. Better: "Atlas Peak Research | Semiconductor & AI Infrastructure Investment Research"

### Homepage meta description is a tagline, not a description _(Technical)_

Current: `"Built by investors. Built for conviction."` — 8 words, zero keywords. Target 120–155 chars describing the site's offering.

### Report URLs use opaque hex IDs instead of keyword slugs _(Technical)_

`/report/015c2b` carries zero keyword signal. Recommended: `/report/turboquant-vs-nvfp4-015c2b`

### Extremely thin homepage content — ~15 words of prose _(Content)_

The page is 95% table metadata. Need 200–400 words explaining what Atlas Peak Research is, who it serves, and its methodology.

### No author attribution anywhere on the site _(Content)_

No analyst names, no bylines, no team page. For financial research, author identity and credentials are core E-E-A-T signals.

### No llms.txt file (returns 404) _(AEO)_

AI systems have no machine-readable summary of the site's purpose, content structure, or key pages.

### Duplicate/conflicting HTTP headers — Cloudflare + origin _(Security)_

`X-Frame-Options` sent as both `DENY` and `SAMEORIGIN` (contradictory). HSTS sent with both `max-age=63072000` and `max-age=3600`. Five headers duplicated total. Root cause: both Cloudflare and the origin server independently set security headers.

### Logo image missing width/height — CLS risk _(Performance)_

`<img class="brand-logo" src="...logo.svg">` has no dimensions. Browser cannot reserve space, contributing to layout shift.

### No Organization or WebSite JSON-LD schema _(Structured Data)_

Cannot establish a Knowledge Graph entity or qualify for sitelinks searchbox without these foundational schemas.

### H1 is a tagline, not a content descriptor _(Content)_

Current: "Built by investors. Built for conviction." — contains zero target keywords. Better: "Independent Equity Research Reports — Semiconductors, AI & More"

---

## Medium Priority

### Google-Extended blocked — prevents AI Overviews inclusion _(AEO)_

Standard Googlebot is allowed (organic search preserved), but blocking Google-Extended prevents the fastest-growing search surface in 2026.

### Double-hop redirect from non-www HTTP _(Technical)_

`http://atlaspeakresearch.com/` → `https://atlaspeakresearch.com/` → `https://www.atlaspeakresearch.com/` (2 hops instead of 1)

### Duplicate H1 on report pages _(Technical)_

Two `<h1>` elements: site brand in header + article title. The brand in the header should be a `<div>`, not `<h1>`.

### Pagination canonical points to page 1 _(Technical)_

`/?page=2` canonicalizes to `/` — reports on page 2+ may not get indexed. 7 of 57 reports are only on later pages.

### No external citations or outbound links _(Content)_

Zero links to SEC filings, company IR pages, or industry data. Research credibility depends on verifiable sourcing.

### No financial disclaimers or disclosures _(Content)_

A financial research site with no "not investment advice" disclaimer. Both an E-E-A-T and potential legal concern.

### No resource hints (preconnect, preload) _(Performance)_

Zero `<link rel="preconnect">` or `<link rel="preload">` tags. The render-blocking CSS file would benefit from preloading.

### 104 inline style attributes totaling ~6.9KB _(Performance)_

19 identical "popular-badge" inline styles (~170 bytes each). Should be a single CSS class.

### No BreadcrumbList schema on report pages _(Structured Data)_

Visual breadcrumbs exist (Home > Type > Ticker > Title) but are not marked up with BreadcrumbList JSON-LD.

### Sitemap missing lastmod on homepage and /careers _(Technical)_

### No social media profile links anywhere _(Content)_

---

## Passing

- HTTPS enforced with proper HTTP → HTTPS 301 redirect
- Brotli compression enabled (85% compression ratio)
- All scripts deferred — zero render-blocking JS in `<head>`
- Single CSS file (29KB uncompressed, ~7KB gzipped)
- System font stack — zero web font loading, no FOIT/FOUT
- Server-side rendered — full content in initial HTML payload
- HTTP/2 via Cloudflare CDN, ~87ms TTFB
- Static assets cached with immutable + 1-year max-age
- HTML `lang="en"`, charset UTF-8, valid doctype
- Viewport meta tag correctly configured
- Skip navigation link for accessibility
- Semantic HTML (header, main, nav, footer, scoped table)
- Canonical tags present and correct on all tested pages
- Meta robots: `index, follow` on all public pages
- robots.txt well-structured with sitemap reference
- RSS feed available at `/feed.xml`
- PerplexityBot and standard Googlebot allowed
- Report content quality excellent for AI citation — thesis-first structure, 80–200 word paragraphs, definition-rich sentences, "Bottom Line" direct answers
- Regular content updates — reports spanning full month
- SVG logo only 605 bytes
- CSP present and well-configured (no `unsafe-eval`)
- Referrer-Policy: `strict-origin-when-cross-origin`

---

## Top 5 Fixes (Highest ROI)

1. **Create /about page** with team bios, credentials, and methodology
2. **Add JSON-LD structured data** — Article schema on every report page, Organization + WebSite schemas on homepage
3. **Fix sitemap protocol** (HTTP → HTTPS) and **rewrite homepage title + meta description** with target keywords
4. **Unblock GPTBot/ClaudeBot for search** (keep training blocks) and **create llms.txt**
5. **Add keyword slugs to report URLs** (keep hex ID as suffix for backwards compatibility)

---

## Category Deep Dives

### Technical SEO (72/100)

**What's strong:** Canonical tags, meta robots directives, robots.txt configuration, HTTPS enforcement, RSS feed, favicon/manifest, case-insensitive URL handling (308 redirect to lowercase).

**What needs work:** Sitemap protocol mismatch, opaque report URLs, homepage title/description optimization, duplicate H1 tags, trailing-slash duplicate content (200 instead of 301), double-hop non-www redirect, pagination canonical strategy.

### Content (28/100)

**What's strong:** Report content quality is excellent — 57 reports with publication dates, search/filter functionality, view counts as social proof, regular updates through March 2026, "Popular" badges for discovery.

**What needs work:** The homepage is essentially a data table with no prose. No About page, no Contact page, no author attribution, no external citations, no financial disclaimers, no social links. The H1 is a tagline. For a YMYL financial research site, the E-E-A-T foundation is almost entirely absent.

### Performance (82/100)

**What's strong:** Exceptionally lightweight build. Zero render-blocking scripts, single small CSS file, system fonts (no web font loading), SSR, Brotli compression, immutable static asset caching, Cloudflare CDN with ~87ms TTFB, minimal DOM (~453 elements). No third-party scripts loaded on homepage.

**What needs work:** Logo missing width/height (CLS risk), no resource hints, inline styles that should be CSS classes, HTML cache-control too aggressive (max-age=0), Cloudflare challenge script is synchronous.

### Security (72/100)

**What's strong:** HTTPS active, HTTP→HTTPS redirect, CSP well-configured (no `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`), Referrer-Policy set correctly, CORP and COOP headers present.

**What needs work:** All five security headers are duplicated between Cloudflare and the origin server. The `X-Frame-Options` conflict (DENY vs SAMEORIGIN) is the worst — browser behavior is undefined per spec. HSTS has conflicting max-age values (2 years vs 1 hour). Fix by setting headers at exactly one layer.

_Note: Security headers do not directly affect search rankings beyond HTTPS._

### Structured Data (22/100)

**What's strong:** JobPosting schema on `/careers` is structurally sound with proper MonetaryAmount, valid employmentType, and well-formed PostalAddress.

**What needs work:** Only one page on the entire site has structured data. The 55+ report pages — the core product — have zero JSON-LD. No Organization schema (cannot build Knowledge Graph entity), no WebSite schema (no sitelinks searchbox eligibility), no Article schema (no rich results), no BreadcrumbList (despite visual breadcrumbs existing). Report pages use microdata (Schema.org/Article + BreadcrumbList) but Google explicitly prefers JSON-LD.

### AEO — AI Engine Optimization (48/100)

**What's strong:** Report content is near-ideal for AI citation. Thesis-first "Bottom Line" structure, definition-rich sentences, 80–200 word paragraphs (optimal extraction length), self-contained answer blocks. Full SSR means AI crawlers can parse content without JS. PerplexityBot and standard Googlebot are allowed. Internal linking between reports, tickers, and sectors supports topic clustering.

**What needs work:** GPTBot and ClaudeBot are fully blocked — the site is invisible to ChatGPT Search and Claude. No llms.txt file. Google-Extended blocked (prevents AI Overviews). No structured data for AI systems to programmatically identify author, date, or content type. Homepage has minimal citable content (~150 words). The irony: the content is perfectly structured for AI citation, but the access controls prevent AI systems from ever seeing it.
