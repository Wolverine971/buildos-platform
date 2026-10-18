// apps/web/src/lib/server/chat-session-enrichment.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchEntityLookups } from './chat-entity-lookups';
import { enrichSessionEntities } from './chat-session-enrichment';

const PROJECT = 'a1000000-0000-4000-8000-000000000001';
const DOC = 'a2000000-0000-4000-8000-000000000001';

describe('restore entity lookup costs', () => {
	it('shares the focus, timeline and pending-target lookup', async () => {
		const from = vi.fn((table: string) => ({
			select: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({
				data:
					table === 'onto_documents'
						? [{ id: DOC, title: 'Current title', project_id: PROJECT }]
						: [{ id: PROJECT, name: 'Current project' }],
				error: null
			})
		}));
		const result = await enrichSessionEntities({
			supabase: { from },
			projectFocus: {
				projectId: PROJECT,
				projectName: 'Old project',
				focusType: 'document',
				focusEntityId: DOC,
				focusEntityName: 'Old title'
			},
			items: [
				{
					id: 'tool:1',
					entityRefs: [{ kind: 'document', id: DOC, projectId: PROJECT }],
					kind: 'tool'
				}
			] as any,
			pending: {
				version: 1,
				contract: {
					version: 1,
					source: 'declared',
					outcomes: [
						{
							id: 'write',
							action: 'update',
							entityKind: 'document',
							targetIds: [DOC],
							requiredFields: ['edits'],
							minimumSuccessfulEffects: 1
						}
					]
				},
				contextType: 'project',
				projectId: PROJECT,
				originatingTurnRunId: 'turn',
				createdAt: '2026-10-18T00:00:00Z',
				finishedReason: 'mutation_unfulfilled'
			} as any
		});
		expect(from.mock.calls.map(([table]) => table).sort()).toEqual([
			'onto_documents',
			'onto_projects'
		]);
		expect(result.projectFocus?.focusEntityName).toBe('Current title');
		expect(result.timelineItems[0]?.entityRefs[0]?.title).toBe('Current title');
		expect(result.pendingChange?.items).toEqual(['Update doc "Current title"']);
	});

	it('chunks long URL filters and never exceeds three concurrent title reads', async () => {
		let active = 0,
			maximum = 0;
		const batchSizes: number[] = [];
		const from = vi.fn(() => {
			let ids: string[] = [];
			return {
				select() {
					return this;
				},
				in(_column: string, values: string[]) {
					ids = values;
					batchSizes.push(ids.length);
					return this;
				},
				async limit() {
					maximum = Math.max(maximum, ++active);
					await Promise.resolve();
					active--;
					return {
						data: ids.map((id) => ({ id, title: id, project_id: PROJECT })),
						error: null
					};
				}
			};
		});
		const lookups = await fetchEntityLookups({
			supabase: { from },
			idsByKind: new Map([
				['document', new Set(Array.from({ length: 205 }, (_, i) => `doc-${i}`))],
				['task', new Set(['task-1'])]
			])
		});
		expect(batchSizes).toEqual([100, 100, 5, 1]);
		expect(maximum).toBe(3);
		expect(lookups.size).toBe(206);
	});
});
