// apps/web/src/lib/services/admin/chat-session-flow-navigation.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealSessionFlowTarget } from './chat-session-flow-navigation';

const controls = () => ({
	isExpanded: vi.fn(() => false),
	expandEvent: vi.fn(),
	resetFilters: vi.fn()
});

beforeEach(() => {
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({ matches: false }))
	);
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('session flow navigation', () => {
	it('opens the activity drawer and exact tool, then scrolls its heading into view', async () => {
		document.body.innerHTML =
			'<details id="activity"><summary>BuildOS activity</summary><details id="goal"><summary tabindex="0">Create Goal</summary><div style="height:2000px">Large result</div><details><summary>Raw JSON</summary></details></details></details>';
		const tool = document.getElementById('goal') as HTMLDetailsElement;
		const heading = tool.querySelector('summary')!;
		await revealSessionFlowTarget({ kind: 'tool', domId: 'goal' }, controls());
		expect((document.getElementById('activity') as HTMLDetailsElement).open).toBe(true);
		expect(tool.open).toBe(true);
		expect(tool.querySelector('details')!.open).toBe(false);
		expect(heading.scrollIntoView).toHaveBeenCalledWith({
			behavior: 'smooth',
			block: 'start',
			inline: 'nearest'
		});
		expect(vi.mocked(heading.scrollIntoView).mock.instances[0]).toBe(heading);
		expect(document.activeElement).toBe(heading);
		expect(tool.dataset.flowSelected).toBe('true');
	});

	it('clears filters for an omitted audit event and opens its enclosing timeline sections', async () => {
		document.body.innerHTML =
			'<div id="old" data-flow-selected="true"></div><details id="timeline"><summary>Timeline</summary><details id="turn"><summary>Turn</summary></details></details>';
		const callbacks = controls();
		callbacks.resetFilters.mockImplementation(() => {
			document
				.getElementById('turn')!
				.insertAdjacentHTML('beforeend', '<div id="llm" tabindex="-1">LLM call</div>');
		});
		await revealSessionFlowTarget(
			{ kind: 'audit', domId: 'llm', auditEventId: 'llm:1' },
			callbacks
		);
		expect(callbacks.expandEvent).toHaveBeenCalledWith('llm:1');
		expect(callbacks.resetFilters).toHaveBeenCalledOnce();
		expect((document.getElementById('timeline') as HTMLDetailsElement).open).toBe(true);
		expect((document.getElementById('turn') as HTMLDetailsElement).open).toBe(true);
		expect(document.activeElement?.id).toBe('llm');
		expect(document.getElementById('old')!.hasAttribute('data-flow-selected')).toBe(false);
	});

	it('keeps an already expanded event open and respects reduced motion', async () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		document.body.innerHTML = '<div id="llm" tabindex="-1"></div>';
		const callbacks = controls();
		callbacks.isExpanded.mockReturnValue(true);
		await revealSessionFlowTarget(
			{ kind: 'audit', domId: 'llm', auditEventId: 'llm:1' },
			callbacks
		);
		expect(callbacks.expandEvent).not.toHaveBeenCalled();
		expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
			behavior: 'auto',
			block: 'start',
			inline: 'nearest'
		});
	});

	it('reveals collapsed messages and falls back to a recorded turn when an event is absent', async () => {
		document.body.innerHTML =
			'<div id="message" tabindex="-1"><details><summary>Expand message</summary>Long reply</details></div><div id="turn" tabindex="-1"></div>';
		await revealSessionFlowTarget({ kind: 'message', domId: 'message' }, controls());
		expect(document.querySelector('details')!.open).toBe(true);
		await revealSessionFlowTarget(
			{ kind: 'tool', domId: 'missing', fallbackDomId: 'turn' },
			controls()
		);
		expect(document.activeElement?.id).toBe('turn');
	});
});
