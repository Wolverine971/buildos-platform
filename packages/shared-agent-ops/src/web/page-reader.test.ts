// packages/shared-agent-ops/src/web/page-reader.test.ts
import { describe, expect, it } from 'vitest';
import { extractPageLinks, readHtmlPage } from './page-reader';

describe('readHtmlPage', () => {
	it('keeps text inside a whole-page ASP.NET <form> wrapper', () => {
		const html = `<html><body><form id="aspnetForm" method="post">
			<nav><a href="/home">Home</a></nav>
			<select name="lang"><option>Afrikaans</option><option>Español</option></select>
			<div class="content"><h1>Procurement and Contracts</h1>
			<p>${'MDOT publishes bid opportunities on eMMA. '.repeat(8)}</p></div>
		</form></body></html>`;
		const page = readHtmlPage(
			html,
			'https://www.mdot.maryland.gov/tso/pages/Index.aspx?PageId=11'
		);
		expect(page.text).toContain('Procurement and Contracts');
		expect(page.text).toContain('MDOT publishes bid opportunities');
		expect(page.text).not.toContain('Afrikaans');
		expect(page.text).not.toContain('Home');
	});

	it('prefers <main> over site chrome and falls back to all text for chrome-only pages', () => {
		const html = `<body><header>${'Menu item '.repeat(60)}</header><main><h2>Pricing</h2><p>${'Plus is $10 per seat. '.repeat(15)}</p></main></body>`;
		const page = readHtmlPage(html, 'https://example.com/pricing');
		expect(page.strategy).toBe('main');
		expect(page.text.startsWith('Pricing')).toBe(true);
		expect(page.text).not.toContain('Menu item');

		const shell = readHtmlPage(
			'<body><nav><a href="/a">Only navigation here</a></nav></body>',
			'https://example.com/'
		);
		expect(shell.text).toContain('Only navigation here');
	});

	it('does not execute or keep script bodies, and decodes entities', () => {
		const page = readHtmlPage(
			`<title>Tom &amp; Jerry</title><body><script>var secret = "x";</script><p>Fish &amp; chips&nbsp;daily</p></body>`,
			'https://example.com/'
		);
		expect(page.title).toBe('Tom & Jerry');
		expect(page.text).toBe('Fish & chips daily');
	});
});

describe('extractPageLinks', () => {
	it('resolves, dedupes, merges labels, adds context, and orders same-site first', () => {
		const html = `<body>
			<a href="https://other.org/x">External</a>
			<span>Claude Opus 5.5 (anthropic.com) 715 points</span>
			<a href="item?id=1">3 hours ago</a> | <a href="item?id=1">587&nbsp;comments</a>
			<a href="/logo.png">Logo</a><a href="mailto:a@b.c">Mail</a><a href="#top">Top</a>
			<a href="/pricing#plans" aria-label="Pricing page"></a>
		</body>`;
		const { links } = extractPageLinks(html, 'https://news.ycombinator.com/');
		expect(links.map((l) => l.url)).toEqual([
			'https://news.ycombinator.com/item?id=1',
			'https://news.ycombinator.com/pricing',
			'https://other.org/x'
		]);
		expect(links[0]!.label).toBe('3 hours ago | 587 comments');
		expect(links[0]!.context).toContain('Claude Opus 5.5');
		expect(links[1]!.label).toBe('Pricing page');
		expect(links[2]!.sameSite).toBe(false);
	});

	it('keeps words apart in card links that wrap block elements', () => {
		const { links } = extractPageLinks(
			'<a href="/docs/db"><div><h3>Database</h3><p>Supabase provides a full Postgres database</p></div></a>',
			'https://supabase.com/docs'
		);
		expect(links[0]!.label).toBe('Database Supabase provides a full Postgres database');
	});

	it('honors exclusions and the link cap', () => {
		const html = Array.from({ length: 5 }, (_, i) => `<a href="/p${i}">P${i}</a>`).join('');
		const result = extractPageLinks(html, 'https://example.com/', {
			maxLinks: 2,
			exclude: new Set(['https://example.com/p0'])
		});
		expect(result.links.map((l) => l.label)).toEqual(['P1', 'P2']);
		expect(result.truncated).toBe(2);
	});
});
