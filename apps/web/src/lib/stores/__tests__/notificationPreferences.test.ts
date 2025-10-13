// apps/web/src/lib/stores/__tests__/notificationPreferences.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
	notificationPreferencesStore,
	type DailyBriefNotificationPreferences
} from '../notificationPreferences';

// Mock fetch
global.fetch = vi.fn();

describe('notificationPreferencesStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		notificationPreferencesStore.reset();
	});

	afterEach(() => {
		notificationPreferencesStore.reset();
	});

	describe('initial state', () => {
		it('should have correct initial state', () => {
			const state = get(notificationPreferencesStore);

			expect(state.preferences).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.isSaving).toBe(false);
			expect(state.error).toBeNull();
		});
	});

	describe('load', () => {
		it('should load preferences successfully', async () => {
			const mockPreferences: DailyBriefNotificationPreferences = {
				should_email_daily_brief: true,
				should_sms_daily_brief: false,
				updated_at: '2025-10-13T12:00:00Z'
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ preferences: mockPreferences })
			});

			await notificationPreferencesStore.load();

			const state = get(notificationPreferencesStore);
			expect(state.preferences).toEqual(mockPreferences);
			expect(state.isLoading).toBe(false);
			expect(state.error).toBeNull();
			expect(global.fetch).toHaveBeenCalledWith(
				'/api/notification-preferences?daily_brief=true'
			);
		});

		it('should use defaults when preferences are null', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ preferences: null })
			});

			await notificationPreferencesStore.load();

			const state = get(notificationPreferencesStore);
			expect(state.preferences).toEqual({
				should_email_daily_brief: false,
				should_sms_daily_brief: false
			});
		});

		it('should set error on failed load', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 500
			});

			await notificationPreferencesStore.load();

			const state = get(notificationPreferencesStore);
			expect(state.preferences).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.error).toBe('Failed to load notification preferences');
		});

		it('should set isLoading during load', async () => {
			let loadingState: boolean | null = null;

			(global.fetch as any).mockImplementation(() => {
				// Capture loading state during fetch
				loadingState = get(notificationPreferencesStore).isLoading;
				return Promise.resolve({
					ok: true,
					json: async () => ({
						preferences: {
							should_email_daily_brief: true,
							should_sms_daily_brief: false
						}
					})
				});
			});

			await notificationPreferencesStore.load();

			expect(loadingState).toBe(true); // Was loading during fetch
			expect(get(notificationPreferencesStore).isLoading).toBe(false); // Not loading after
		});

		it('should handle network errors', async () => {
			(global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

			await notificationPreferencesStore.load();

			const state = get(notificationPreferencesStore);
			expect(state.error).toBe('Network error');
			expect(state.isLoading).toBe(false);
		});
	});

	describe('save', () => {
		it('should save preferences successfully', async () => {
			const newPreferences = {
				should_email_daily_brief: true,
				should_sms_daily_brief: true
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preference: {
						...newPreferences,
						updated_at: '2025-10-13T12:00:00Z'
					}
				})
			});

			await notificationPreferencesStore.save(newPreferences);

			const state = get(notificationPreferencesStore);
			expect(state.preferences).toEqual({
				...newPreferences,
				updated_at: '2025-10-13T12:00:00Z'
			});
			expect(state.isSaving).toBe(false);
			expect(state.error).toBeNull();
		});

		it('should send PUT request with correct body', async () => {
			const newPreferences = {
				should_email_daily_brief: false,
				should_sms_daily_brief: true
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ preference: newPreferences })
			});

			await notificationPreferencesStore.save(newPreferences);

			expect(global.fetch).toHaveBeenCalledWith('/api/notification-preferences', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(newPreferences)
			});
		});

		it('should handle phone setup required error', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: async () => ({
					requiresPhoneSetup: true,
					error: 'Phone number required'
				})
			});

			await expect(
				notificationPreferencesStore.save({ should_sms_daily_brief: true })
			).rejects.toThrow(
				'Phone number required. Please set up your phone number in Settings first.'
			);

			const state = get(notificationPreferencesStore);
			expect(state.error).toContain('Phone number required');
		});

		it('should handle phone verification required error', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: async () => ({
					requiresPhoneVerification: true,
					error: 'Phone not verified'
				})
			});

			await expect(
				notificationPreferencesStore.save({ should_sms_daily_brief: true })
			).rejects.toThrow('Phone number not verified');

			const state = get(notificationPreferencesStore);
			expect(state.error).toContain('not verified');
		});

		it('should handle opt-out error', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: async () => ({
					requiresOptIn: true,
					error: 'User opted out'
				})
			});

			await expect(
				notificationPreferencesStore.save({ should_sms_daily_brief: true })
			).rejects.toThrow('opted out of SMS notifications');
		});

		it('should handle brief activation required error', async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: async () => ({
					requiresBriefActivation: true,
					error: 'Brief generation not active'
				})
			});

			await expect(
				notificationPreferencesStore.save({ should_email_daily_brief: true })
			).rejects.toThrow('Daily brief generation is not active');
		});

		it('should set isSaving during save', async () => {
			let savingState: boolean | null = null;

			(global.fetch as any).mockImplementation(() => {
				savingState = get(notificationPreferencesStore).isSaving;
				return Promise.resolve({
					ok: true,
					json: async () => ({
						preference: {
							should_email_daily_brief: true,
							should_sms_daily_brief: false
						}
					})
				});
			});

			await notificationPreferencesStore.save({
				should_email_daily_brief: true
			});

			expect(savingState).toBe(true); // Was saving during fetch
			expect(get(notificationPreferencesStore).isSaving).toBe(false); // Not saving after
		});
	});

	describe('toggleEmail', () => {
		it('should toggle email from false to true', async () => {
			// First set up initial state
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preferences: {
						should_email_daily_brief: false,
						should_sms_daily_brief: false
					}
				})
			});

			await notificationPreferencesStore.load();

			// Then toggle
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preference: {
						should_email_daily_brief: true,
						should_sms_daily_brief: false
					}
				})
			});

			await notificationPreferencesStore.toggleEmail();

			const state = get(notificationPreferencesStore);
			expect(state.preferences?.should_email_daily_brief).toBe(true);
		});

		it('should toggle email from true to false', async () => {
			// First set up initial state
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preferences: {
						should_email_daily_brief: true,
						should_sms_daily_brief: false
					}
				})
			});

			await notificationPreferencesStore.load();

			// Then toggle
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preference: {
						should_email_daily_brief: false,
						should_sms_daily_brief: false
					}
				})
			});

			await notificationPreferencesStore.toggleEmail();

			const state = get(notificationPreferencesStore);
			expect(state.preferences?.should_email_daily_brief).toBe(false);
		});

		it('should load preferences first if not loaded', async () => {
			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						preferences: {
							should_email_daily_brief: false,
							should_sms_daily_brief: false
						}
					})
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						preference: {
							should_email_daily_brief: true,
							should_sms_daily_brief: false
						}
					})
				});

			await notificationPreferencesStore.toggleEmail();

			expect(global.fetch).toHaveBeenCalledTimes(2); // load + save
		});
	});

	describe('toggleSMS', () => {
		it('should toggle SMS from false to true', async () => {
			// First set up initial state
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preferences: {
						should_email_daily_brief: false,
						should_sms_daily_brief: false
					}
				})
			});

			await notificationPreferencesStore.load();

			// Then toggle
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preference: {
						should_email_daily_brief: false,
						should_sms_daily_brief: true
					}
				})
			});

			await notificationPreferencesStore.toggleSMS();

			const state = get(notificationPreferencesStore);
			expect(state.preferences?.should_sms_daily_brief).toBe(true);
		});
	});

	describe('utility methods', () => {
		it('should return default preferences', () => {
			const defaults = notificationPreferencesStore.getDefaults();

			expect(defaults).toEqual({
				should_email_daily_brief: false,
				should_sms_daily_brief: false
			});
		});

		it('should clear error', async () => {
			// Set up error state
			(global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

			await notificationPreferencesStore.load();

			const errorState = get(notificationPreferencesStore);
			expect(errorState.error).toBeTruthy();

			// Clear error
			notificationPreferencesStore.clearError();

			expect(get(notificationPreferencesStore).error).toBeNull();
		});

		it('should reset to initial state', async () => {
			// Load some preferences
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					preferences: {
						should_email_daily_brief: true,
						should_sms_daily_brief: true
					}
				})
			});

			await notificationPreferencesStore.load();
			const loadedState = get(notificationPreferencesStore);
			expect(loadedState.preferences?.should_email_daily_brief).toBe(true);

			// Reset
			notificationPreferencesStore.reset();

			const state = get(notificationPreferencesStore);
			expect(state.preferences).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.isSaving).toBe(false);
			expect(state.error).toBeNull();
		});
	});
});
