// apps/web/src/routes/api/project-briefs/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const SESSION_USER_ID = 'session-user';

function createQuery(result: { data: unknown; error: unknown }) {
	const query: Record<string, any> = {};
	for (const method of ['select', 'eq', 'order', 'limit']) {
		query[method] = vi.fn(() => query);
	}
	query.maybeSingle = vi.fn(() => Promise.resolve(result));
	query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
		Promise.resolve(result).then(resolve, reject);
	return query;
}

describe('GET /api/project-briefs', () => {
	it('scopes to the session user and is never cacheable', async () => {
		const dailyBriefQuery = createQuery({
			data: { id: 'brief-1', brief_date: '2026-09-22' },
			error: null
		});
		const projectBriefQuery = createQuery({ data: [], error: null });
		const from = vi.fn((table: string) =>
			table === 'ontology_daily_briefs' ? dailyBriefQuery : projectBriefQuery
		);

		const response = await GET({
			url: new URL('http://localhost/api/project-briefs?date=2026-09-22&userId=other-user'),
			request: new Request('http://localhost/api/project-briefs'),
			locals: {
				supabase: { from },
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: SESSION_USER_ID } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.activeBriefId).toBe('brief-1');
		expect(dailyBriefQuery.eq).toHaveBeenCalledWith('user_id', SESSION_USER_ID);
		expect(dailyBriefQuery.eq).not.toHaveBeenCalledWith('user_id', 'other-user');
		expect(projectBriefQuery.eq).toHaveBeenCalledWith('daily_brief.user_id', SESSION_USER_ID);
		expect(response.headers.get('Cache-Control') ?? '').not.toContain('public');
		expect(response.headers.get('Cache-Control') ?? '').not.toContain('max-age=600');
	});
});
