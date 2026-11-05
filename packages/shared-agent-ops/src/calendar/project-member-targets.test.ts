// packages/shared-agent-ops/src/calendar/project-member-targets.test.ts
import { describe, expect, it } from 'vitest';
import { filterToActiveProjectMembers } from './project-member-targets';

function client(tables: {
	actors: Array<{ id: string; user_id: string }>;
	project: { created_by: string } | null;
	members: Array<{ actor_id: string; removed_at: string | null }>;
}) {
	return {
		from(table: string) {
			const filters: Record<string, unknown> = {};
			const ins: Record<string, unknown[]> = {};
			const rows = () => {
				if (table === 'onto_actors') {
					return tables.actors.filter((row) => ins.user_id?.includes(row.user_id));
				}
				if (table === 'onto_project_members') {
					return tables.members.filter(
						(row) =>
							row.removed_at === filters.removed_at &&
							ins.actor_id?.includes(row.actor_id)
					);
				}
				return [];
			};
			const builder: any = {
				select: () => builder,
				eq: (column: string, value: unknown) => {
					filters[column] = value;
					return builder;
				},
				is: (column: string, value: unknown) => {
					filters[column] = value;
					return builder;
				},
				in: (column: string, values: unknown[]) => {
					ins[column] = values;
					return builder;
				},
				maybeSingle: async () => ({ data: tables.project, error: null }),
				then: (resolve: (value: unknown) => unknown) =>
					Promise.resolve({ data: rows(), error: null }).then(resolve)
			};
			return builder;
		}
	} as any;
}

describe('filterToActiveProjectMembers', () => {
	const actors = [
		{ id: 'a-owner', user_id: 'owner' },
		{ id: 'a-member', user_id: 'member' },
		{ id: 'a-removed', user_id: 'removed' },
		{ id: 'a-stranger', user_id: 'stranger' }
	];

	it('keeps the owner and active members only', async () => {
		const result = await filterToActiveProjectMembers(
			client({
				actors,
				project: { created_by: 'a-owner' },
				members: [
					{ actor_id: 'a-member', removed_at: null },
					{ actor_id: 'a-removed', removed_at: '2026-11-01T00:00:00Z' }
				]
			}),
			'project-1',
			['stranger', 'member', 'removed', 'owner', 'member']
		);
		expect(result).toEqual(['member', 'owner']);
	});

	it('returns nobody for a deleted or hidden project', async () => {
		const result = await filterToActiveProjectMembers(
			client({
				actors,
				project: null,
				members: [{ actor_id: 'a-member', removed_at: null }]
			}),
			'project-1',
			['member']
		);
		expect(result).toEqual([]);
	});
});
