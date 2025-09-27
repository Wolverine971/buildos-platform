// src/routes/__tests__/authenticated-pages.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PageServerLoad } from './$types';

// Mock Supabase
const mockSupabase = {
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				order: vi.fn(() => ({
					gte: vi.fn(() => ({
						lte: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
						}))
					}))
				})),
				single: vi.fn(() => Promise.resolve({ data: null, error: null }))
			})),
			gte: vi.fn(() => ({
				lte: vi.fn(() => ({
					order: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
					}))
				}))
			})),
			in: vi.fn(() => Promise.resolve({ data: [], error: null })),
			limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
			order: vi.fn(() => ({
				gte: vi.fn(() => ({
					lte: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
					}))
				})),
				limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
			}))
		})),
		insert: vi.fn(() => ({
			select: vi.fn(() => ({
				single: vi.fn(() =>
					Promise.resolve({
						data: { id: 'test-id', slug: 'test-slug' },
						error: null
					})
				)
			}))
		}))
	}))
};

// Mock user for authenticated state
const mockUser = {
	id: 'test-user-id',
	email: 'test@example.com',
	user_metadata: { name: 'Test User' },
	app_metadata: {},
	aud: 'authenticated',
	created_at: new Date().toISOString()
};

// Mock session
const mockSession = {
	user: mockUser,
	access_token: 'test-token',
	refresh_token: 'test-refresh-token',
	expires_in: 3600,
	token_type: 'bearer',
	expires_at: Date.now() + 3600000
};

describe('Authenticated Pages', () => {
	describe('Homepage (/) - Dashboard', () => {
		it('should load with authenticated user data', async () => {
			const { load } = await import('../+page.server');

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser })
				},
				depends: vi.fn()
			} as any);

			expect(result).toEqual({
				user: mockUser
			});
		});

		it('should handle error gracefully and return null user', async () => {
			const { load } = await import('../+page.server');

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockRejectedValue(new Error('Auth error'))
				},
				depends: vi.fn()
			} as any);

			expect(result).toEqual({
				user: null
			});
		});

		it('should call depends with correct dependency', async () => {
			const { load } = await import('../+page.server');
			const dependsMock = vi.fn();

			await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser })
				},
				depends: dependsMock
			} as any);

			expect(dependsMock).toHaveBeenCalledWith('app:auth');
		});
	});

	describe('/projects page', () => {
		it('should load with authenticated user', async () => {
			const { load } = await import('../projects/+page.server');

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser })
				},
				depends: vi.fn()
			} as any);

			expect(result).toEqual({
				user: mockUser
			});
		});

		it('should redirect unauthenticated users', async () => {
			const { load } = await import('../projects/+page.server');

			await expect(
				load({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({ user: null })
					},
					depends: vi.fn()
				} as any)
			).rejects.toThrow();
		});

		it('should create a new project successfully', async () => {
			const { actions } = await import('../projects/+page.server');
			const formData = new FormData();

			await expect(
				actions.createProject({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
						supabase: mockSupabase
					},
					request: {
						formData: vi.fn().mockResolvedValue(formData)
					}
				} as any)
			).rejects.toThrow(); // Should throw redirect on success
		});

		it('should handle project creation failure', async () => {
			const { actions } = await import('../projects/+page.server');
			const formData = new FormData();

			const failingSupabase = {
				from: vi.fn(() => ({
					insert: vi.fn(() => ({
						select: vi.fn(() => ({
							single: vi.fn(() =>
								Promise.resolve({
									data: null,
									error: new Error('Database error')
								})
							)
						}))
					}))
				}))
			};

			const result = await actions.createProject({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase: failingSupabase
				},
				request: {
					formData: vi.fn().mockResolvedValue(formData)
				}
			} as any);

			expect(result?.status).toBe(500);
		});
	});

	describe('/briefs page', () => {
		it('should load with user and URL parameters', async () => {
			const { load } = await import('../briefs/+page.server');

			const result = await load({
				parent: vi.fn().mockResolvedValue({ user: mockUser }),
				url: {
					searchParams: {
						get: vi.fn((key) => {
							if (key === 'date') return '2024-01-15';
							if (key === 'view') return 'week';
							return null;
						})
					}
				}
			} as any);

			expect(result).toEqual({
				user: mockUser,
				initialDate: '2024-01-15',
				initialView: 'week'
			});
		});

		it('should handle missing URL parameters', async () => {
			const { load } = await import('../briefs/+page.server');

			const result = await load({
				parent: vi.fn().mockResolvedValue({ user: mockUser }),
				url: {
					searchParams: {
						get: vi.fn(() => null)
					}
				}
			} as any);

			expect(result).toEqual({
				user: mockUser,
				initialDate: null,
				initialView: 'single'
			});
		});

		it('should load without user (unauthenticated)', async () => {
			const { load } = await import('../briefs/+page.server');

			const result = await load({
				parent: vi.fn().mockResolvedValue({ user: null }),
				url: {
					searchParams: {
						get: vi.fn(() => null)
					}
				}
			} as any);

			expect(result).toEqual({
				user: null,
				initialDate: null,
				initialView: 'single'
			});
		});
	});

	describe('/history page', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('should load with contribution data for authenticated user', async () => {
			const { load } = await import('../history/+page.server');

			// Create a comprehensive mock that handles all the complex chaining
			const createChainableMock = (finalData: any) => {
				const chainable: any = {
					select: vi.fn(() => chainable),
					eq: vi.fn(() => chainable),
					gte: vi.fn(() => chainable),
					lte: vi.fn(() => chainable),
					or: vi.fn(() => chainable),
					order: vi.fn(() => chainable),
					limit: vi.fn(() => Promise.resolve(finalData)),
					in: vi.fn(() => Promise.resolve(finalData)),
					single: vi.fn(() => Promise.resolve(finalData))
				};
				return chainable;
			};

			const mockSupabaseWithBraindumps = {
				from: vi.fn((table) => {
					if (table === 'brain_dumps') {
						// Return chainable mock with different data depending on usage
						return createChainableMock({
							data: [
								{
									id: 'bd-1',
									user_id: mockUser.id,
									title: 'Test Braindump',
									content: 'Test content',
									updated_at: '2024-01-01T10:00:00.000Z',
									project_id: null
								}
							],
							error: null
						});
					}
					if (table === 'brain_dump_links') {
						return createChainableMock({ data: [], error: null });
					}
					if (table === 'projects') {
						return createChainableMock({ data: [], error: null });
					}
					return createChainableMock({ data: [], error: null });
				})
			};

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase: mockSupabaseWithBraindumps
				},
				url: {
					searchParams: {
						get: vi.fn((key) => {
							if (key === 'year') return '2024';
							return null;
						})
					}
				}
			} as any);

			expect(result).toHaveProperty('contributionData');
			expect(result).toHaveProperty('dayBraindumps');
			expect(result).toHaveProperty('recentBraindumps');
			expect(result).toHaveProperty('availableYears');
			// Just check that filters exist and have the expected structure
			expect(result.filters).toHaveProperty('selectedYear');
			expect(result.filters).toHaveProperty('searchQuery');
			expect(result.filters).toHaveProperty('selectedDay');
			expect(result.filters).toHaveProperty('currentYear');
			expect(result.filters).toHaveProperty('braindumpId');
		});

		it('should redirect unauthenticated users', async () => {
			const { load } = await import('../history/+page.server');

			await expect(
				load({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({ user: null }),
						supabase: mockSupabase
					},
					url: {
						searchParams: {
							get: vi.fn(() => null)
						}
					}
				} as any)
			).rejects.toThrow();
		});

		it('should handle search query parameter', async () => {
			const { load } = await import('../history/+page.server');

			const mockSupabaseWithSearch = {
				from: vi.fn(() => ({
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							order: vi.fn(() => ({
								limit: vi.fn(() =>
									Promise.resolve({
										data: [{ updated_at: '2024-01-01T00:00:00.000Z' }],
										error: null
									})
								),
								gte: vi.fn(() => ({
									lte: vi.fn(() => ({
										or: vi.fn(() => ({
											limit: vi.fn(() =>
												Promise.resolve({ data: [], error: null })
											)
										}))
									}))
								}))
							})),
							gte: vi.fn(() => ({
								lte: vi.fn(() => ({
									or: vi.fn(() => Promise.resolve({ data: [], error: null }))
								}))
							})),
							or: vi.fn(() => ({
								gte: vi.fn(() => ({
									lte: vi.fn(() => ({
										limit: vi.fn(() =>
											Promise.resolve({ data: [], error: null })
										)
									}))
								}))
							}))
						})),
						in: vi.fn(() => Promise.resolve({ data: [], error: null }))
					}))
				}))
			};

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase: mockSupabaseWithSearch
				},
				url: {
					searchParams: {
						get: vi.fn((key) => {
							if (key === 'search') return 'test query';
							return null;
						})
					}
				}
			} as any);

			expect(result.filters.searchQuery).toBe('test query');
		});

		it('should handle specific day parameter', async () => {
			const { load } = await import('../history/+page.server');

			// Create a comprehensive mock that handles all the complex chaining
			const createChainableMock = (finalData: any) => {
				const chainable: any = {
					select: vi.fn(() => chainable),
					eq: vi.fn(() => chainable),
					gte: vi.fn(() => chainable),
					lte: vi.fn(() => chainable),
					or: vi.fn(() => chainable),
					order: vi.fn(() => chainable),
					limit: vi.fn(() => Promise.resolve(finalData)),
					in: vi.fn(() => Promise.resolve(finalData)),
					single: vi.fn(() => Promise.resolve(finalData))
				};
				return chainable;
			};

			const mockSupabaseWithDay = {
				from: vi.fn((table) => {
					if (table === 'brain_dumps') {
						return createChainableMock({
							data: [
								{
									id: 'day-bd-1',
									user_id: mockUser.id,
									title: 'Day Braindump',
									content: 'Day content',
									updated_at: '2024-01-15T10:00:00.000Z',
									project_id: null
								}
							],
							error: null
						});
					}
					if (table === 'brain_dump_links') {
						return createChainableMock({ data: [], error: null });
					}
					if (table === 'projects') {
						return createChainableMock({ data: [], error: null });
					}
					return createChainableMock({ data: [], error: null });
				})
			};

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase: mockSupabaseWithDay
				},
				url: {
					searchParams: {
						get: vi.fn((key) => {
							if (key === 'day') return '2024-01-15';
							return null;
						})
					}
				}
			} as any);

			expect(result.filters.selectedDay).toBe('2024-01-15');
			expect(result.dayBraindumps).toBeDefined();
			expect(result.dayBraindumps.length).toBeGreaterThan(0);
		});

		it('should handle errors gracefully and return default data', async () => {
			const { load } = await import('../history/+page.server');

			const errorSupabase = {
				from: vi.fn(() => {
					throw new Error('Database connection failed');
				})
			};

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase: errorSupabase
				},
				url: {
					searchParams: {
						get: vi.fn(() => null)
					}
				}
			} as any);

			expect(result.contributionData).toEqual({ contributions: [], stats: {} });
			expect(result.dayBraindumps).toEqual([]);
			expect(result.recentBraindumps).toEqual([]);
			expect(result.availableYears).toContain(new Date().getFullYear());
		});
	});
});
