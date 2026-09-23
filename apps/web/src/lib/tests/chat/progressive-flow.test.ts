// apps/web/src/lib/tests/chat/progressive-flow.test.ts
import { describe, it, expect } from 'vitest';
import { CHAT_TOOL_DEFINITIONS } from '@buildos/agentic-chat-runtime/catalog';

function getToolName(tool: unknown): string {
	const candidate = tool as { name?: string; function?: { name?: string } };
	return candidate.name ?? candidate.function?.name ?? '';
}

function getToolDescription(tool: unknown): string {
	const candidate = tool as { description?: string; function?: { description?: string } };
	return candidate.description ?? candidate.function?.description ?? '';
}

describe('Progressive Disclosure Flow', () => {
	describe('Two-Tier Tool System', () => {
		it('exposes both list/search and detail tools', () => {
			const names = CHAT_TOOL_DEFINITIONS.map(getToolName).filter(Boolean);
			const descriptions = CHAT_TOOL_DEFINITIONS.map(getToolDescription);

			const listOrSearch = names.filter(
				(name) => name.startsWith('list_') || name.startsWith('search_')
			);
			const detail = names.filter(
				(name) => name.startsWith('get_') && name.endsWith('_details')
			);

			expect(listOrSearch.length).toBeGreaterThan(0);
			expect(detail.length).toBeGreaterThan(0);
			expect(listOrSearch).toContain('search_onto_tasks');
			expect(detail).toContain('get_onto_task_details');
			expect(
				descriptions.some((description) => /detail|full|complete/i.test(description))
			).toBe(true);
		});

		it('keeps ontology tools namespaced (onto)', () => {
			const names = CHAT_TOOL_DEFINITIONS.map(getToolName).filter(Boolean);
			const ontoSearch = names.filter((name) => name.startsWith('search_onto_'));
			const ontoDetail = names.filter((name) => name.startsWith('get_onto_'));

			expect(ontoSearch.length).toBeGreaterThan(0);
			expect(ontoDetail.length).toBeGreaterThan(0);
		});
	});
});
