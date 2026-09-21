// apps/web/src/routes/api/brief-preferences/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

describe('GET /api/brief-preferences', () => {
	it('returns inactive defaults without persisting an opt-in', async () => {
		const insert = vi.fn();
		const from = vi.fn((table: string) => {
			if (table === 'users') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { timezone: 'Europe/Athens' },
								error: null
							})
						}))
					}))
				};
			}

			return {
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
					}))
				})),
				insert
			};
		});
		const event = {
			locals: {
				supabase: { from },
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: 'user-1', email: 'user@example.com' }
				})
			}
		} as unknown as RequestEvent;

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.preferences).toEqual({
			frequency: 'daily',
			day_of_week: 1,
			time_of_day: '09:00:00',
			is_active: false,
			timezone: 'Europe/Athens'
		});
		expect(insert).not.toHaveBeenCalled();
	});
});
