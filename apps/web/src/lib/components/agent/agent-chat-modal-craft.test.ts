// apps/web/src/lib/components/agent/agent-chat-modal-craft.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = (fileName: string) =>
	readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8');

describe('agent chat modal craft contracts', () => {
	it('tracks message count without tracking scroll-position state in the auto-scroll effect', () => {
		const source = componentSource('AgentChatModal.svelte');
		const effectStart = source.indexOf('// Auto-scroll only when new messages are added');
		const effectEnd = source.indexOf('// Keyboard avoiding for mobile', effectStart);
		const effectSource = source.slice(effectStart, effectEnd);

		expect(effectStart).toBeGreaterThan(-1);
		expect(effectSource).toContain('const count = messageCount;');
		expect(effectSource).toContain('untrack(scrollToBottomIfNeeded);');
		expect(effectSource).not.toContain('\n\t\t\tscrollToBottomIfNeeded();');
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
		expect(composerSource.match(/h-11 w-11/g)).toHaveLength(5);
		expect(composerSource.match(/sm:h-8 sm:w-8/g)).toHaveLength(5);
	});
});
