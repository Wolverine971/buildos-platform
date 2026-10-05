// apps/web/src/lib/components/table-surfaces/chat-table-save.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderAgentMarkdown } from '$lib/components/agent/agent-chat-markdown';
import { chatTableSaveButtons } from './chat-table-save';

function flush() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('chatTableSaveButtons', () => {
	it('adds "Save as table" to rendered chat tables and hands over their cells', async () => {
		const root = document.createElement('div');
		root.innerHTML = renderAgentMarkdown(
			'Here you go:\n\n| Company | Salary |\n|---|---|\n| Acme | $150k |'
		);
		const onSave = vi.fn();
		const cleanup = chatTableSaveButtons(onSave)(root) as () => void;

		const button = root.querySelector<HTMLButtonElement>('[data-save-as-table]');
		expect(button?.textContent).toBe('Save as table');
		button!.click();
		expect(onSave).toHaveBeenCalledWith({
			headers: ['Company', 'Salary'],
			rows: [['Acme', '$150k']]
		});

		// Streamed-in tables get the button too.
		const later = document.createElement('div');
		later.innerHTML = renderAgentMarkdown('| A |\n|---|\n| 1 |');
		root.append(later);
		await flush();
		expect(root.querySelectorAll('[data-save-as-table]')).toHaveLength(2);

		cleanup();
	});
});
