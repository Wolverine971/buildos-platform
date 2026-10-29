// apps/mobile/tests/chunked-storage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createChunkedStorage } from '@/lib/chunked-storage';

function memoryStore(options: { failOnSetCount?: number } = {}) {
	const map = new Map<string, string>();
	let sets = 0;
	return {
		map,
		getItem: vi.fn(async (key: string) => map.get(key) ?? null),
		setItem: vi.fn(async (key: string, value: string) => {
			sets++;
			if (options.failOnSetCount && sets === options.failOnSetCount) {
				throw new Error('keychain full');
			}
			if (Buffer.byteLength(value, 'utf8') > 2048) throw new Error('value too large');
			map.set(key, value);
		}),
		removeItem: vi.fn(async (key: string) => {
			map.delete(key);
		})
	};
}

describe('createChunkedStorage', () => {
	it('round-trips a session larger than the keychain limit, including non-ASCII', async () => {
		const store = memoryStore();
		const storage = createChunkedStorage(store);
		const value = 'é'.repeat(3000) + JSON.stringify({ token: 'x'.repeat(5000) });
		await storage.setItem('sb-session', value);
		expect(await storage.getItem('sb-session')).toBe(value);
		expect(store.map.size).toBeGreaterThan(2);
	});

	it('keeps the previous value readable when a write fails midway', async () => {
		const store = memoryStore({ failOnSetCount: 6 });
		const storage = createChunkedStorage(store);
		await storage.setItem('k', 'first'.repeat(100));
		await expect(storage.setItem('k', 'second'.repeat(500))).rejects.toThrow('keychain full');
		expect(await storage.getItem('k')).toBe('first'.repeat(100));
	});

	it('removes every chunk on removeItem', async () => {
		const store = memoryStore();
		const storage = createChunkedStorage(store);
		await storage.setItem('k', 'v'.repeat(1500));
		await storage.removeItem('k');
		expect(store.map.size).toBe(0);
		expect(await storage.getItem('k')).toBeNull();
	});

	it('discards a corrupt manifest instead of throwing', async () => {
		const store = memoryStore();
		store.map.set('k', 'not json');
		const storage = createChunkedStorage(store);
		expect(await storage.getItem('k')).toBeNull();
		expect(store.map.has('k')).toBe(false);
	});
});
