// apps/mobile/src/components/today/pick-skips.ts
// The picks passed on with "Not this", kept for the day on the device so closing and
// reopening the app doesn't bring back what you already said no to. A memory copy answers
// at once; the stored copy fills it after a cold start. Newest skip last.
import { secureStorage } from '@/lib/secure-storage';

const memory = new Map<string, string[]>();
const storageKey = (date: string) => `today.skipped.${date}`;

export function cachedPickSkips(date: string): string[] {
	return memory.get(date) ?? [];
}

export async function loadPickSkips(date: string): Promise<string[]> {
	const cached = memory.get(date);
	if (cached) return cached;
	try {
		const saved: unknown = JSON.parse((await secureStorage.getItem(storageKey(date))) ?? '[]');
		const keys = Array.isArray(saved)
			? saved.filter((key): key is string => typeof key === 'string')
			: [];
		if (!memory.has(date)) memory.set(date, keys);
		return memory.get(date) ?? keys;
	} catch {
		return [];
	}
}

export function savePickSkips(date: string, keys: string[]): void {
	memory.set(date, keys);
	const write =
		keys.length > 0
			? secureStorage.setItem(storageKey(date), JSON.stringify(keys))
			: secureStorage.removeItem(storageKey(date));
	// A failed write only means the skips last until the app restarts.
	void Promise.resolve(write).catch(() => undefined);
}
