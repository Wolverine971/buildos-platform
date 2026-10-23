// apps/web/src/lib/server/people/access-history.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	describeAccessEvent,
	loadAccessHistory,
	parseAccessHistoryQuery,
	readAccessHistoryPage,
	type AccessEventRow
} from './access-history';

function row(overrides: Partial<AccessEventRow> = {}): AccessEventRow {
	return {
		id: 'e1',
		occurred_at: '2026-04-29T12:00:00Z',
		project_id: 'p1',
		project_name: 'Cadre',
		kind: 'member_joined',
		via: null,
		by_actor_id: null,
		by_name: null,
		by_is_you: false,
		subject_actor_id: 'a-phillip',
		subject_name: 'Phillip Velayo',
		subject_is_you: false,
		subject_label: null,
		before: null,
		after: { role_key: 'editor', access: 'write' },
		...overrides
	};
}

const you = { by_actor_id: 'a-dj', by_name: 'DJ Wayne', by_is_you: true };

describe('describeAccessEvent', () => {
	it('describes joins by invite, link, owner add, and unknown role', () => {
		expect(describeAccessEvent(row())).toBe('Phillip Velayo joined Cadre as Editor.');
		expect(describeAccessEvent(row({ via: 'invite' }))).toBe(
			'Phillip Velayo joined Cadre as Editor, from your invite.'
		);
		expect(
			describeAccessEvent(row({ via: 'invite_link', after: { role_key: 'viewer' } }))
		).toBe('Phillip Velayo joined Cadre as Viewer with the invite link.');
		expect(describeAccessEvent(row({ ...you }))).toBe(
			'You added Phillip Velayo to Cadre as Editor.'
		);
		expect(describeAccessEvent(row({ after: null }))).toBe('Phillip Velayo joined Cadre.');
	});

	it('describes removals and leaving', () => {
		expect(describeAccessEvent(row({ kind: 'member_removed', ...you }))).toBe(
			'You removed Phillip Velayo from Cadre.'
		);
		expect(describeAccessEvent(row({ kind: 'member_removed' }))).toBe(
			'Phillip Velayo was removed from Cadre.'
		);
		expect(describeAccessEvent(row({ kind: 'member_left' }))).toBe(
			'Phillip Velayo left Cadre.'
		);
	});

	it('describes role and agent changes', () => {
		expect(
			describeAccessEvent(
				row({
					kind: 'role_changed',
					...you,
					before: { role_key: 'editor' },
					after: { role_key: 'viewer' }
				})
			)
		).toBe('You changed Phillip Velayo’s role on Cadre from Editor to Viewer.');
		expect(
			describeAccessEvent(
				row({
					kind: 'agents_changed',
					...you,
					subject_name: 'Ian Miner',
					before: { agent_access: 'write' },
					after: { agent_access: 'read' }
				})
			)
		).toBe('You set Ian Miner’s agents to Read on Cadre.');
		expect(
			describeAccessEvent(
				row({ kind: 'agents_changed', ...you, after: { agent_access: 'off' } })
			)
		).toBe('You turned off Phillip Velayo’s agents on Cadre.');
		expect(
			describeAccessEvent(
				row({
					kind: 'agents_changed',
					by_actor_id: 'a-sam',
					by_name: 'Sam',
					subject_is_you: true,
					after: { agent_access: 'write' }
				})
			)
		).toBe('Sam set your agents to Write on Cadre.');
	});

	it('describes invites by their label, never inventing one', () => {
		const invite = {
			subject_actor_id: null,
			subject_name: null,
			subject_label: 'beau@example.com'
		};
		expect(describeAccessEvent(row({ kind: 'invite_sent', ...you, ...invite }))).toBe(
			'You invited beau@example.com to Cadre as Editor.'
		);
		expect(describeAccessEvent(row({ kind: 'invite_resent', ...you, ...invite }))).toBe(
			'You sent the invite to beau@example.com for Cadre again.'
		);
		expect(describeAccessEvent(row({ kind: 'invite_expired', ...invite }))).toBe(
			'An invite to beau@example.com for Cadre expired unanswered.'
		);
		expect(describeAccessEvent(row({ kind: 'invite_revoked', ...you, ...invite }))).toBe(
			'You withdrew the invite to beau@example.com for Cadre.'
		);
		expect(describeAccessEvent(row({ kind: 'invite_declined', ...invite }))).toBe(
			'beau@example.com declined the invite to Cadre.'
		);
		expect(
			describeAccessEvent(row({ kind: 'invite_expired', ...invite, subject_label: null }))
		).toBe('An invite to someone for Cadre expired unanswered.');
	});

	it('describes project agent settings and handoffs', () => {
		expect(
			describeAccessEvent(
				row({
					kind: 'restricted_changed',
					...you,
					project_name: '9takes',
					after: { restricted: true }
				})
			)
		).toBe('You turned on ‘Only agents you pick’ for 9takes.');
		expect(
			describeAccessEvent(
				row({ kind: 'editors_agents_write_changed', ...you, after: { on: false } })
			)
		).toBe('You turned off ‘Editors’ agents can make changes’ for Cadre.');
		expect(
			describeAccessEvent(
				row({
					kind: 'ownership_transferred',
					by_actor_id: 'a-dj',
					by_name: 'DJ Wayne',
					subject_name: 'Sam',
					project_name: '9takes'
				})
			)
		).toBe('DJ Wayne made Sam owner of 9takes.');
	});
});

describe('readAccessHistoryPage', () => {
	it('keeps valid rows, drops unknown kinds and broken rows, and passes the cursor', () => {
		const page = readAccessHistoryPage({
			events: [
				{ ...row(), by_is_you: false },
				{ ...row({ id: 'e2' }), kind: 'something_new' },
				{ id: 'e3' },
				null
			],
			next_before: '2026-04-29T12:00:00Z',
			next_before_id: 'e1'
		});
		expect(page.events).toEqual([
			{
				id: 'e1',
				occurred_at: '2026-04-29T12:00:00Z',
				project_id: 'p1',
				project_name: 'Cadre',
				kind: 'member_joined',
				text: 'Phillip Velayo joined Cadre as Editor.',
				by_you: false
			}
		]);
		expect(page.next_before).toBe('2026-04-29T12:00:00Z');
		expect(page.next_before_id).toBe('e1');
	});

	it('reads an empty or malformed result as an empty page', () => {
		expect(readAccessHistoryPage(null)).toEqual({
			events: [],
			next_before: null,
			next_before_id: null
		});
	});
});

describe('parseAccessHistoryQuery', () => {
	const parse = (query: string) => parseAccessHistoryQuery(new URLSearchParams(query));
	const id = '05087b15-f725-4e83-860b-10e14e736e67';

	it('defaults and clamps the limit', () => {
		expect(parse('')).toEqual({
			ok: true,
			query: { limit: 50, before: null, beforeId: null, projectId: null }
		});
		expect(parse('limit=999')).toMatchObject({ ok: true, query: { limit: 200 } });
	});

	it('rejects bad values', () => {
		expect(parse('limit=0').ok).toBe(false);
		expect(parse('limit=abc').ok).toBe(false);
		expect(parse('before=not-a-date').ok).toBe(false);
		expect(parse(`before_id=${id}`).ok).toBe(false);
		expect(parse('before=2026-10-01T00:00:00Z&before_id=nope').ok).toBe(false);
		expect(parse('project_id=nope').ok).toBe(false);
	});

	it('accepts a cursor and a project', () => {
		expect(parse(`before=2026-10-01T00:00:00Z&before_id=${id}&project_id=${id}`)).toEqual({
			ok: true,
			query: { limit: 50, before: '2026-10-01T00:00:00Z', beforeId: id, projectId: id }
		});
	});
});

describe('loadAccessHistory', () => {
	it('calls the server-only reader with the user id and only the args it has', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: { events: [] }, error: null });
		const result = await loadAccessHistory({ rpc }, 'user-1', {
			limit: 20,
			before: null,
			beforeId: null,
			projectId: 'p1'
		});
		expect(rpc).toHaveBeenCalledWith('list_project_access_events', {
			p_user_id: 'user-1',
			p_limit: 20,
			p_project_id: 'p1'
		});
		expect(result).toEqual({
			ok: true,
			page: { events: [], next_before: null, next_before_id: null }
		});
	});

	it('returns the RPC error', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValue({ data: null, error: { code: '22023', message: 'bad' } });
		const result = await loadAccessHistory({ rpc }, 'user-1', {
			limit: 50,
			before: null,
			beforeId: null,
			projectId: null
		});
		expect(result).toEqual({ ok: false, error: { code: '22023', message: 'bad' } });
	});
});
