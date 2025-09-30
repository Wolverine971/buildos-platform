// src/routes/api/admin/users/server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

describe('Admin Users API - Security Fixes', () => {
	let mockSupabase: any;
	let mockRequest: Request;
	let mockLocals: any;

	beforeEach(() => {
		// Mock Supabase client
		mockSupabase = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			delete: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			or: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			range: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: null, error: null })
		};

		mockLocals = {
			supabase: mockSupabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'admin-user-id', is_admin: true }
			})
		};
	});

	describe('SQL Injection Prevention', () => {
		it('should sanitize search parameters to prevent SQL injection', async () => {
			const maliciousSearch = "admin%' OR '1'='1";
			const url = new URL(`http://localhost/api/admin/users?search=${maliciousSearch}`);

			mockRequest = new Request(url);

			// Mock the query chain
			const mockData = { data: [], error: null, count: 0 };
			mockSupabase.range.mockResolvedValue(mockData);
			mockSupabase.select.mockReturnValue(mockSupabase);

			// Import and execute the GET handler
			const { GET } = await import('./+server');
			await GET({ request: mockRequest, url, locals: mockLocals } as any);

			// Verify that the search parameter was sanitized
			const orCall = mockSupabase.or.mock.calls[0]?.[0];
			expect(orCall).toBeDefined();
			// The % should be escaped to \%
			expect(orCall).toContain('\\%');
			// Should not contain raw SQL injection attempt
			expect(orCall).not.toMatch(/OR\s+'1'\s*=\s*'1'/i);
		});

		it('should escape special characters: %, _, \\', async () => {
			const testCases = [
				{ input: 'test%value', expected: 'test\\%value' },
				{ input: 'test_value', expected: 'test\\_value' },
				{ input: 'test\\value', expected: 'test\\\\value' }
			];

			for (const testCase of testCases) {
				const url = new URL(`http://localhost/api/admin/users?search=${testCase.input}`);
				mockRequest = new Request(url);

				const mockData = { data: [], error: null, count: 0 };
				mockSupabase.range.mockResolvedValue(mockData);

				const { GET } = await import('./+server');
				await GET({ request: mockRequest, url, locals: mockLocals } as any);

				const orCall =
					mockSupabase.or.mock.calls[mockSupabase.or.mock.calls.length - 1]?.[0];
				expect(orCall).toContain(testCase.expected);
			}
		});
	});

	describe('Privilege Escalation Prevention', () => {
		it('should only allow whitelisted fields in user updates', async () => {
			const maliciousUpdates = {
				name: 'John Doe',
				email: 'hacker@example.com', // Should be blocked
				user_id: 'different-user-id', // Should be blocked
				created_at: '2020-01-01', // Should be blocked
				is_admin: true // Should be allowed (whitelisted)
			};

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates: maliciousUpdates })
			});

			const mockData = { data: { id: 'target-user-id' }, error: null };
			mockSupabase.single.mockResolvedValue(mockData);

			const { PATCH } = await import('./+server');
			await PATCH({ request: mockRequest, locals: mockLocals } as any);

			// Verify that only whitelisted fields were passed to update
			const updateCall = mockSupabase.update.mock.calls[0]?.[0];
			expect(updateCall).toBeDefined();

			// Allowed fields should be present
			expect(updateCall).toHaveProperty('name');
			expect(updateCall).toHaveProperty('is_admin');

			// Blocked fields should NOT be present
			expect(updateCall).not.toHaveProperty('email');
			expect(updateCall).not.toHaveProperty('user_id');
			expect(updateCall).not.toHaveProperty('created_at');
		});

		it('should return error if no valid fields to update', async () => {
			const invalidUpdates = {
				email: 'hacker@example.com', // Not whitelisted
				user_id: 'different-user-id' // Not whitelisted
			};

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates: invalidUpdates })
			});

			const { PATCH } = await import('./+server');
			const response = await PATCH({ request: mockRequest, locals: mockLocals } as any);

			const body = await response.json();
			expect(response.status).toBe(400);
			expect(body.error).toContain('No valid fields to update');
		});

		it('should allow all whitelisted fields', async () => {
			const validUpdates = {
				name: 'John Doe',
				bio: 'Updated bio',
				is_admin: true,
				completed_onboarding: true
			};

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates: validUpdates })
			});

			const mockData = { data: { id: 'target-user-id' }, error: null };
			mockSupabase.single.mockResolvedValue(mockData);

			const { PATCH } = await import('./+server');
			await PATCH({ request: mockRequest, locals: mockLocals } as any);

			const updateCall = mockSupabase.update.mock.calls[0]?.[0];

			// All whitelisted fields should be present
			expect(updateCall).toHaveProperty('name', 'John Doe');
			expect(updateCall).toHaveProperty('bio', 'Updated bio');
			expect(updateCall).toHaveProperty('is_admin', true);
			expect(updateCall).toHaveProperty('completed_onboarding', true);

			// Should have exactly 4 fields
			expect(Object.keys(updateCall)).toHaveLength(4);
		});

		it('should require admin authentication', async () => {
			// Mock non-admin user
			mockLocals.safeGetSession = vi.fn().mockResolvedValue({
				user: { id: 'regular-user-id', is_admin: false }
			});

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates: { name: 'Test' } })
			});

			const { PATCH } = await import('./+server');
			const response = await PATCH({ request: mockRequest, locals: mockLocals } as any);

			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body.error).toContain('Admin access required');
		});
	});

	describe('Admin Users Table Sync', () => {
		it('should update admin_users table when is_admin is modified to true', async () => {
			const updates = { is_admin: true };

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates })
			});

			const mockData = { data: { id: 'target-user-id', is_admin: true }, error: null };
			mockSupabase.single.mockResolvedValue(mockData);

			const { PATCH } = await import('./+server');
			await PATCH({ request: mockRequest, locals: mockLocals } as any);

			// Verify insert to admin_users was called
			expect(mockSupabase.insert).toHaveBeenCalled();
			const insertCall = mockSupabase.insert.mock.calls[0]?.[0];
			expect(insertCall).toHaveProperty('user_id', 'target-user-id');
			expect(insertCall).toHaveProperty('granted_by', 'admin-user-id');
		});

		it('should remove from admin_users table when is_admin is modified to false', async () => {
			const updates = { is_admin: false };

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates })
			});

			const mockData = { data: { id: 'target-user-id', is_admin: false }, error: null };
			mockSupabase.single.mockResolvedValue(mockData);

			const { PATCH } = await import('./+server');
			await PATCH({ request: mockRequest, locals: mockLocals } as any);

			// Verify delete from admin_users was called
			expect(mockSupabase.delete).toHaveBeenCalled();
			expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'target-user-id');
		});

		it('should not modify admin_users if is_admin not in updates', async () => {
			const updates = { name: 'John Doe', bio: 'Test bio' };

			mockRequest = new Request('http://localhost/api/admin/users', {
				method: 'PATCH',
				body: JSON.stringify({ userId: 'target-user-id', updates })
			});

			const mockData = { data: { id: 'target-user-id' }, error: null };
			mockSupabase.single.mockResolvedValue(mockData);

			// Reset mocks to count calls
			mockSupabase.insert.mockClear();
			mockSupabase.delete.mockClear();

			const { PATCH } = await import('./+server');
			await PATCH({ request: mockRequest, locals: mockLocals } as any);

			// Verify neither insert nor delete to admin_users was called
			expect(mockSupabase.insert).not.toHaveBeenCalled();
			expect(mockSupabase.delete).not.toHaveBeenCalled();
		});
	});
});
