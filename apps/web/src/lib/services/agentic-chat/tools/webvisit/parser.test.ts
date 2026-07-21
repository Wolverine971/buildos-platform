// apps/web/src/lib/services/agentic-chat/tools/webvisit/parser.test.ts
import { describe, expect, it } from 'vitest';
import {
	extractPageMetadata,
	extractStructuredData,
	isSameRegistrableDomain,
	parseHtmlToText
} from './parser';

describe('web visit parser', () => {
	it('keeps multi-card pages together by preferring main over a single article card', () => {
		const html = `
			<html>
				<head><title>Training Schedule</title></head>
				<body>
					<header><nav>Home Classes Shop</nav></header>
					<main>
						<h1>Classes</h1>
						<article><h2>Foundation Precision | Cody, WY</h2><p>May 11-12, 2026</p></article>
						<article><h2>Advanced Precision | Cody, WY</h2><p>May 13-14, 2026</p></article>
					</main>
					<footer>Copyright</footer>
				</body>
			</html>
		`;

		const parsed = parseHtmlToText(html, {
			mode: 'reader',
			baseUrl: 'https://thecadretraining.com/classes'
		});

		expect(parsed.extraction_strategy).toBe('main');
		expect(parsed.content).toContain('Foundation Precision | Cody, WY');
		expect(parsed.content).toContain('Advanced Precision | Cody, WY');
		expect(parsed.content).not.toContain('Home Classes Shop');
	});

	it('still selects a dominant single article on article-shaped pages', () => {
		const articleBody = 'Precision fundamentals for a long-form class detail page. '.repeat(20);
		const html = `
			<html>
				<body>
					<main>
						<h1>Class Detail</h1>
						<article>
							<h2>Foundation Precision</h2>
							<p>${articleBody}</p>
						</article>
						<section>Related classes should not dominate the reader output.</section>
					</main>
				</body>
			</html>
		`;

		const parsed = parseHtmlToText(html, {
			mode: 'reader',
			baseUrl: 'https://example.com/classes/foundation'
		});

		expect(parsed.extraction_strategy).toBe('article');
		expect(parsed.content).toContain('Foundation Precision');
		expect(parsed.content).toContain('Precision fundamentals');
		expect(parsed.content).not.toContain('Related classes should not dominate');
	});

	it('extracts sanitized JSON-LD structured data', () => {
		const html = `
			<html>
				<head>
					<script type="application/ld+json">
						{
							"@context": "https://schema.org",
							"@type": "Event",
							"name": "Foundation Precision | Cody, WY",
							"startDate": "2026-05-11T15:00:00+00:00",
							"offers": {
								"@type": "Offer",
								"availability": "https://schema.org/InStock"
							}
						}
					</script>
				</head>
			</html>
		`;

		const structuredData = extractStructuredData(html);

		expect(structuredData).toHaveLength(1);
		expect(structuredData[0]).toMatchObject({
			type: 'Event',
			name: 'Foundation Precision | Cody, WY',
			startDate: '2026-05-11T15:00:00+00:00'
		});
		expect(structuredData[0]).not.toHaveProperty('@context');
		expect(structuredData[0].offers).toMatchObject({
			type: 'Offer',
			availability: 'https://schema.org/InStock'
		});
	});

	it('ignores a cross-site canonical URL that would poison another site cache', () => {
		const html = `
			<html>
				<head>
					<link rel="canonical" href="https://nytimes.com/real-story" />
				</head>
				<body><main><p>Attacker-controlled content.</p></main></body>
			</html>
		`;

		const metadata = extractPageMetadata(html, 'https://evil.example/post');

		expect(metadata.canonical_url).toBeUndefined();
		expect(metadata.meta.canonical_url).toBeUndefined();
	});

	it('honors a same-site canonical URL', () => {
		const html = `
			<html>
				<head>
					<link rel="canonical" href="https://www.example.com/story" />
				</head>
				<body><main><p>Legit content.</p></main></body>
			</html>
		`;

		const metadata = extractPageMetadata(html, 'https://example.com/story?utm=1');

		expect(metadata.canonical_url).toBe('https://www.example.com/story');
	});

	it('compares registrable domains for same-site checks', () => {
		expect(isSameRegistrableDomain('https://a.example.com/x', 'https://example.com/y')).toBe(
			true
		);
		expect(isSameRegistrableDomain('https://evil.com/x', 'https://nytimes.com/y')).toBe(false);
		expect(isSameRegistrableDomain('https://shop.example.co.uk', 'https://example.co.uk')).toBe(
			true
		);
		expect(isSameRegistrableDomain('https://a.co.uk', 'https://b.co.uk')).toBe(false);
		expect(isSameRegistrableDomain('https://a.example.com/x', 'https://b.example.com/y')).toBe(
			false
		);
		expect(
			isSameRegistrableDomain('https://victim.github.io/x', 'https://evil.github.io/y')
		).toBe(false);
	});

	it('flattens a 2MB page of unclosed <script> tags well under 500ms', () => {
		const pathological = `<html><body>${'<script>x'.repeat(240_000)}<p>done</p></body></html>`;
		expect(pathological.length).toBeGreaterThan(2_000_000);

		const start = Date.now();
		parseHtmlToText(pathological, { mode: 'reader', baseUrl: 'https://example.com/' });
		expect(Date.now() - start).toBeLessThan(500);
	});
});
