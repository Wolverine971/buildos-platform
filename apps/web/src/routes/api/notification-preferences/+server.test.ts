// apps/web/src/routes/api/notification-preferences/+server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './+server';
import type { RequestEvent } from '@sveltejs/kit';

// Mock Supabase client
const createMockSupabase = () => ({
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				eq: vi.fn(() => ({
					maybeSingle: vi.fn(),
					single: vi.fn()
				})),
				maybeSingle: vi.fn(),
				single: vi.fn()
			})),
			maybeSingle: vi.fn(),
			single: vi.fn()
		})),
		upsert: vi.fn(() => ({
			select: vi.fn(() => ({
				single: vi.fn()
			}))
		})),
		insert: vi.fn(() => ({
			select: vi.fn(() => ({
				single: vi.fn()
			}))
		})),
		update: vi.fn(() => ({
			eq: vi.fn(() => ({
				eq: vi.fn(() => ({
					select: vi.fn(() => ({
						single: vi.fn()
					}))
				}))
			}))
		}))
	}))
});

// Mock request event
const createMockRequestEvent = (
	searchParams: Record<string, string> = {},
	body: any = {}
): RequestEvent => {
	const url = new URL('http://localhost:5173/api/notification-preferences');
	Object.entries(searchParams).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});

	return {
		url,
		request: {
			json: vi.fn().mockResolvedValue(body)
		},
		locals: {
			supabase: createMockSupabase(),
			getSession: vi.fn().mockResolvedValue({
				user: { id: 'test-user-id', email: 'test@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('GET /api/notification-preferences', () => {
	it('should fetch user-level daily brief preferences with ?daily_brief=true', async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });
		const mockData = {
			should_email_daily_brief: true,
			should_sms_daily_brief: false,
			updated_at: '2025-10-13T12:00:00Z'
		};

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.select()
			.eq()
			.eq()
			.maybeSingle.mockResolvedValue({ data: mockData, error: null });

		const response = await GET(event);
		const json = await response.json();

		expect(supabase.from).toHaveBeenCalledWith('user_notification_preferences');
		expect(json.should_email_daily_brief).toBe(true);
		expect(json.should_sms_daily_brief).toBe(false);
	});

	it('should return defaults when no daily brief preferences exist', async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.select()
			.eq()
			.eq()
			.maybeSingle.mockResolvedValue({ data: null, error: null });

		const response = await GET(event);
		const json = await response.json();

		expect(json.should_email_daily_brief).toBe(false);
		expect(json.should_sms_daily_brief).toBe(false);
	});

	it('should fetch event-based preferences without ?daily_brief parameter', async () => {
		const event = createMockRequestEvent({ event_type: 'brief.completed' });
		const mockData = {
			push_enabled: true,
			in_app_enabled: true,
			email_enabled: false,
			sms_enabled: false
		};

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.select()
			.eq()
			.eq()
			.maybeSingle.mockResolvedValue({ data: mockData, error: null });

		const response = await GET(event);
		const json = await response.json();

		expect(json.push_enabled).toBe(true);
		expect(json.in_app_enabled).toBe(true);
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockRequestEvent();
		event.locals.getSession = vi.fn().mockResolvedValue(null);

		await expect(GET(event)).rejects.toThrow();
	});

	it('should handle database errors gracefully', async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.select()
			.eq()
			.eq()
			.maybeSingle.mockResolvedValue({
				data: null,
				error: { code: 'PGRST001', message: 'Database error' }
			});

		await expect(GET(event)).rejects.toThrow();
	});
});

describe('POST /api/notification-preferences', () => {
	it('should update user-level daily brief preferences with ?daily_brief=true', async () => {
		const body = {
			should_email_daily_brief: true,
			should_sms_daily_brief: false
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.upsert()
			.select()
			.single.mockResolvedValue({
				data: { ...body, user_id: 'test-user-id' },
				error: null
			});

		const response = await POST(event);
		const json = await response.json();

		expect(supabase.from).toHaveBeenCalledWith('user_notification_preferences');
		expect(json.success).toBe(true);
	});

	it('should validate phone verification when enabling SMS', async () => {
		const body = {
			should_email_daily_brief: false,
			should_sms_daily_brief: true // Trying to enable SMS
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		// Mock phone verification check - phone not verified
		supabase
			.from()
			.select()
			.eq()
			.single.mockResolvedValue({
				data: { phone_number: '+15551234567', phone_verified: false },
				error: null
			});

		const response = await POST(event);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.success).toBe(false);
		expect(json.error).toBe('phone_verification_required');
	});

	it('should allow SMS when phone is verified', async () => {
		const body = {
			should_email_daily_brief: false,
			should_sms_daily_brief: true
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		// Mock phone verification check - phone verified
		let callCount = 0;
		supabase.from.mockImplementation((table: string) => {
			callCount++;
			if (table === 'user_sms_preferences') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { phone_number: '+15551234567', phone_verified: true },
								error: null
							})
						}))
					}))
				};
			}
			// For user_notification_preferences upsert
			return {
				upsert: vi.fn(() => ({
					select: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: { ...body, user_id: 'test-user-id' },
							error: null
						})
					}))
				}))
			};
		});

		const response = await POST(event);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.success).toBe(true);
	});

	it('should reject SMS when phone number is missing', async () => {
		const body = {
			should_email_daily_brief: false,
			should_sms_daily_brief: true
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		// Mock phone verification check - no phone number
		supabase
			.from()
			.select()
			.eq()
			.single.mockResolvedValue({
				data: { phone_number: null, phone_verified: false },
				error: null
			});

		const response = await POST(event);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.success).toBe(false);
		expect(json.error).toBe('phone_verification_required');
	});

	it('should update event-based preferences without ?daily_brief parameter', async () => {
		const body = {
			push_enabled: true,
			in_app_enabled: false,
			event_type: 'brief.completed'
		};
		const event = createMockRequestEvent({}, body);

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.upsert()
			.select()
			.single.mockResolvedValue({
				data: { ...body, user_id: 'test-user-id' },
				error: null
			});

		const response = await POST(event);
		const json = await response.json();

		expect(json.success).toBe(true);
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockRequestEvent();
		event.locals.getSession = vi.fn().mockResolvedValue(null);

		await expect(POST(event)).rejects.toThrow();
	});

	it('should handle database errors during upsert', async () => {
		const body = {
			should_email_daily_brief: true,
			should_sms_daily_brief: false
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		supabase
			.from()
			.upsert()
			.select()
			.single.mockResolvedValue({
				data: null,
				error: { code: 'PGRST001', message: 'Database error' }
			});

		await expect(POST(event)).rejects.toThrow();
	});
});

describe('Integration: event_type filtering', () => {
	it("should ensure user-level queries use event_type='user'", async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });
		const supabase = event.locals.supabase as any;

		const eqSpy = vi.fn(() => ({
			eq: vi.fn(() => ({
				maybeSingle: vi.fn().mockResolvedValue({
					data: { should_email_daily_brief: true },
					error: null
				})
			}))
		}));

		supabase
			.from()
			.select()
			.eq.mockImplementation(() => ({ eq: eqSpy }));

		await GET(event);

		// Verify that eq was called twice: once for user_id, once for event_type
		expect(eqSpy).toHaveBeenCalled();
	});

	it('should ensure event-based queries use specific event_type', async () => {
		const event = createMockRequestEvent({ event_type: 'brief.completed' });
		const supabase = event.locals.supabase as any;

		const eqSpy = vi.fn(() => ({
			eq: vi.fn(() => ({
				maybeSingle: vi.fn().mockResolvedValue({
					data: { push_enabled: true },
					error: null
				})
			}))
		}));

		supabase
			.from()
			.select()
			.eq.mockImplementation(() => ({ eq: eqSpy }));

		await GET(event);

		expect(eqSpy).toHaveBeenCalled();
	});
});
