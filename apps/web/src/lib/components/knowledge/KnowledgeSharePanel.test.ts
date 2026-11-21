// apps/web/src/lib/components/knowledge/KnowledgeSharePanel.test.ts
// @vitest-environment jsdom
import { KNOWLEDGE_PREDICATE_MAP } from '@buildos/shared-agent-ops/knowledge';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import KnowledgeSharePanel from './KnowledgeSharePanel.svelte';

afterEach(cleanup);

it('keeps the LinkedIn connection date out of the shareable details picker', async () => {
	expect(KNOWLEDGE_PREDICATE_MAP.has('connected_on')).toBe(true);
	render(KnowledgeSharePanel, {
		part: 'who',
		entityId: 'person',
		entityName: 'Ada',
		sharing: {
			projects: [{ project_id: 'p1', project_name: 'Work', members: [] }],
			shares: []
		},
		predicates: ['email', 'connected_on'],
		onChanged: vi.fn()
	});
	await fireEvent.click(screen.getByRole('button', { name: /Who can see this/ }));
	await fireEvent.click(screen.getByRole('button', { name: /Share more with/ }));
	await fireEvent.click(screen.getByRole('radio', { name: 'Pick details' }));
	const offered = screen.getAllByRole<HTMLInputElement>('checkbox').map((input) => input.value);
	expect(offered).toEqual(['email']);
});
