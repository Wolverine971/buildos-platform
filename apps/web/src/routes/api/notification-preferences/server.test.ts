// apps/web/src/routes/api/notification-preferences/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from './+server';
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
			safeGetSession: vi.fn().mockResolvedValue({
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
		supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null })
				})
			})
		});

		const response = await GET(event);
		const json = await response.json();
		const preferences = json.data?.preferences ?? json.preferences;

		expect(supabase.from).toHaveBeenCalledWith('user_notification_preferences');
		expect(preferences.should_email_daily_brief).toBe(true);
		expect(preferences.should_sms_daily_brief).toBe(false);
	});

	it('should return defaults when no daily brief preferences exist', async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });

		const supabase = event.locals.supabase as any;
		supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
				})
			})
		});

		const response = await GET(event);
		const json = await response.json();
		const preferences = json.data?.preferences ?? json.preferences;

		expect(preferences.should_email_daily_brief).toBe(false);
		expect(preferences.should_sms_daily_brief).toBe(false);
	});

	it('should fetch global preferences without ?daily_brief parameter', async () => {
		const event = createMockRequestEvent({});
		const mockData = {
			push_enabled: true,
			in_app_enabled: true,
			email_enabled: false,
			sms_enabled: false,
			should_email_daily_brief: true,
			should_sms_daily_brief: false
		};

		const supabase = event.locals.supabase as any;
		supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null })
				})
			})
		});

		const response = await GET(event);
		const json = await response.json();

		const preferences = json.data?.preferences ?? json.preferences;
		expect(preferences).toBeDefined();
		expect(preferences?.push_enabled).toBe(true);
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockRequestEvent();
		event.locals.safeGetSession = vi.fn().mockResolvedValue({ user: null });

		const response = await GET(event);
		expect(response.status).toBe(401);
	});

	it('should handle database errors gracefully', async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });

		const supabase = event.locals.supabase as any;
		supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						maybeSingle: vi.fn().mockResolvedValue({
							data: null,
							error: { code: 'PGRST001', message: 'Database error' }
						})
					})
				})
			})
		});

		const response = await GET(event);
		expect(response.status).toBe(500);
	});
});

describe('PUT /api/notification-preferences', () => {
	it('should update user-level daily brief preferences with ?daily_brief=true', async () => {
		const body = {
			should_email_daily_brief: true,
			should_sms_daily_brief: false
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		// Mock multiple table calls
		supabase.from.mockImplementation((table: string) => {
			if (table === 'user_brief_preferences') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { is_active: true },
								error: null
							})
						}))
					}))
				};
			}
			if (table === 'notification_subscriptions') {
				return {
					upsert: vi.fn().mockResolvedValue({ error: null })
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

		const response = await PUT(event);
		const json = await response.json();

		// Check that brief preferences were checked and notification preferences were updated
		expect(json.success).toBe(true);
	});

	it('should validate phone verification when enabling SMS', async () => {
		const body = {
			should_email_daily_brief: false,
			should_sms_daily_brief: true // Trying to enable SMS
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		// Mock multiple table calls
		supabase.from.mockImplementation((table: string) => {
			if (table === 'user_sms_preferences') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { phone_number: '+15551234567', phone_verified: false },
								error: null
							})
						}))
					}))
				};
			}
			return createMockSupabase().from();
		});

		const response = await PUT(event);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.details?.requiresPhoneVerification).toBe(true);
		expect(json.error).toContain('not verified');
	});

	it('should allow SMS when phone is verified', async () => {
		const body = {
			should_email_daily_brief: false,
			should_sms_daily_brief: true
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		// Mock multiple table calls
		supabase.from.mockImplementation((table: string) => {
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
			if (table === 'user_brief_preferences') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { is_active: true },
								error: null
							})
						}))
					}))
				};
			}
			if (table === 'notification_subscriptions') {
				return {
					upsert: vi.fn().mockResolvedValue({ error: null })
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

		const response = await PUT(event);
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
		supabase.from.mockImplementation((table: string) => {
			if (table === 'user_sms_preferences') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { phone_number: null, phone_verified: false },
								error: null
							})
						}))
					}))
				};
			}
			return createMockSupabase().from();
		});

		const response = await PUT(event);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.details?.requiresPhoneSetup).toBe(true);
		expect(json.error).toContain('required');
	});

	it('should update global preferences without ?daily_brief parameter', async () => {
		const body = {
			push_enabled: true,
			in_app_enabled: false,
			email_enabled: true
		};
		const event = createMockRequestEvent({}, body);

		const supabase = event.locals.supabase as any;
		supabase.from.mockImplementation((table: string) => {
			if (table === 'notification_subscriptions') {
				return {
					upsert: vi.fn().mockResolvedValue({ error: null })
				};
			}
			return {
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: { ...body, user_id: 'test-user-id' },
							error: null
						})
					})
				})
			};
		});

		const response = await PUT(event);
		const json = await response.json();

		expect(json.success).toBe(true);
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockRequestEvent();
		event.locals.safeGetSession = vi.fn().mockResolvedValue({ user: null });

		const response = await PUT(event);
		expect(response.status).toBe(401);
	});

	it('should handle database errors during upsert', async () => {
		const body = {
			should_email_daily_brief: true,
			should_sms_daily_brief: false
		};
		const event = createMockRequestEvent({ daily_brief: 'true' }, body);

		const supabase = event.locals.supabase as any;
		supabase.from.mockImplementation((table: string) => {
			if (table === 'user_brief_preferences') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn().mockResolvedValue({
								data: { is_active: true },
								error: null
							})
						}))
					}))
				};
			}
			return {
				upsert: vi.fn(() => ({
					select: vi.fn(() => ({
						single: vi.fn().mockResolvedValue({
							data: null,
							error: { code: 'PGRST001', message: 'Database error' }
						})
					}))
				}))
			};
		});

		const response = await PUT(event);
		expect(response.status).toBe(500);
	});
});

describe('Integration: user_id filtering', () => {
	it('should query preferences by user_id only', async () => {
		const event = createMockRequestEvent({ daily_brief: 'true' });
		const supabase = event.locals.supabase as any;

		const eqSpy = vi.fn(() => ({
			maybeSingle: vi.fn().mockResolvedValue({
				data: { should_email_daily_brief: true },
				error: null
			})
		}));

		supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: eqSpy
			})
		});

		await GET(event);

		// Verify that eq was called once for user_id (no event_type filter)
		expect(eqSpy).toHaveBeenCalledWith('user_id', 'test-user-id');
	});

	it('should use maybeSingle for global preference queries', async () => {
		const event = createMockRequestEvent({});
		const supabase = event.locals.supabase as any;

		const maybeSingleSpy = vi.fn().mockResolvedValue({
			data: { push_enabled: true },
			error: null
		});

		supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: maybeSingleSpy
				})
			})
		});

		await GET(event);

		// Verify maybeSingle was called (handles case where no preferences exist)
		expect(maybeSingleSpy).toHaveBeenCalled();
	});
});
