// apps/web/src/lib/components/agent/agent-chat-modal-craft.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = (fileName: string) =>
	readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8');

describe('agent chat modal craft contracts', () => {
	it('leaves conversation scroll policy to the message list, not a modal effect', () => {
		const source = componentSource('AgentChatModal.svelte');

		// A count-driven snap-to-bottom in the modal fought the pinned-turn
		// layout (and yanked readers down when entity cards arrived).
		expect(source).not.toContain('scrollToBottomIfNeeded');
		expect(source).not.toContain('const messageCount');
		expect(source).toContain('messageListRef?.scrollToLatest()');
	});

	it('keeps the pressable token as the sole transition owner on pressable controls', () => {
		const pressableSurfaces = readdirSync(new URL('.', import.meta.url)).filter((fileName) =>
			fileName.endsWith('.svelte')
		);

		for (const fileName of pressableSurfaces) {
			const conflictingLines = componentSource(fileName)
				.split('\n')
				.filter(
					(line) =>
						line.includes('pressable') &&
						/\b(?:motion-reduce:)?transition(?:-[a-z]+)?\b/.test(line)
				);

			expect(conflictingLines, fileName).toEqual([]);
		}
	});

	it('preserves compact desktop controls while giving mobile chat actions 44px targets', () => {
		const headerSource = componentSource('AgentChatHeader.svelte');
		const composerSource = componentSource('AgentComposer.svelte');

		expect(headerSource.match(/h-11 w-11/g)).toHaveLength(4);
		expect(headerSource.match(/h-11 w-11 sm:h-7 sm:w-7/g)).toHaveLength(3);
		// Attach, attach-existing, stop, and one send/queue button.
		expect(composerSource.match(/h-11 w-11/g)).toHaveLength(4);
		expect(composerSource.match(/sm:h-8 sm:w-8/g)).toHaveLength(4);
	});

	it('keeps the context-shift cue compositor-safe and brief', () => {
		const headerSource = componentSource('AgentChatHeader.svelte');

		expect(headerSource).toContain(
			'animation: agent-context-shift 180ms cubic-bezier(0.23, 1, 0.32, 1);'
		);
		expect(headerSource).toContain(
			'animation: agent-context-shift-fade 120ms cubic-bezier(0.23, 1, 0.32, 1);'
		);
		expect(headerSource).not.toMatch(/\bfilter\s*:/);
		expect(headerSource).not.toContain('background-position');
		expect(headerSource).not.toContain('glimmerTimer');
	});

	it('keeps markdown-table overflow inside its dedicated measured scroller', () => {
		const messageListSource = componentSource('AgentMessageList.svelte');

		expect(messageListSource).toContain('{@attach observeAgentMarkdownTables}');
		expect(messageListSource).toContain('width: max-content;');
		expect(messageListSource).toContain('min-width: 100%;');
		expect(messageListSource).toContain(':first-child:nth-last-child(2)');
		expect(messageListSource).toContain("[data-scrollable='true'][data-at-end='false']");
	});
});
