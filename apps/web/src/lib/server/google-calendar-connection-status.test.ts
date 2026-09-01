// apps/web/src/lib/server/google-calendar-connection-status.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	hasUsableGoogleCalendarConnection,
	resolveGoogleCalendarBackend
} from './google-calendar-connection-status';

describe('hasUsableGoogleCalendarConnection', () => {
	it('recognizes a source-aware connection when the legacy token row is absent', async () => {
		await expect(
			hasUsableGoogleCalendarConnection({
				userId: 'user-1',
				capability: 'read',
				legacy: { hasStoredConnection: vi.fn().mockResolvedValue(false) },
				sourceAware: {
					hasActiveTarget: vi.fn().mockResolvedValue(true)
				}
			})
		).resolves.toBe(true);
	});

	it('keeps a healthy legacy connection visible when source-aware lookup fails', async () => {
		await expect(
			hasUsableGoogleCalendarConnection({
				userId: 'user-1',
				capability: 'analysis',
				legacy: { hasStoredConnection: vi.fn().mockResolvedValue(true) },
				sourceAware: {
					hasActiveTarget: vi.fn().mockRejectedValue(new Error('migration unavailable'))
				}
			})
		).resolves.toBe(true);
	});

	it('requires the requested capability instead of treating any source as usable', async () => {
		await expect(
			resolveGoogleCalendarBackend({
				userId: 'user-1',
				capability: 'analysis',
				legacy: { hasStoredConnection: vi.fn().mockResolvedValue(false) },
				sourceAware: { hasActiveTarget: vi.fn().mockResolvedValue(false) }
			})
		).resolves.toEqual({
			backend: null,
			connected: false,
			legacyConnected: false,
			sourceAwareConnected: false
		});
	});

	it('prefers the source-aware backend when both models are usable', async () => {
		await expect(
			resolveGoogleCalendarBackend({
				userId: 'user-1',
				capability: 'write',
				legacy: { hasStoredConnection: vi.fn().mockResolvedValue(true) },
				sourceAware: { hasActiveTarget: vi.fn().mockResolvedValue(true) }
			})
		).resolves.toMatchObject({ backend: 'source-aware', connected: true });
	});
});
