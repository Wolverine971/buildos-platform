import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	options: {} as { abortGraceMs?: number; drainTimeout?: number }
}));
vi.mock('../src/lib/supabaseQueue', () => ({
	SupabaseQueue: class {
		constructor(options: typeof mocks.options) {
			mocks.options = options;
		}
	}
}));
import '../src/lib/queue';

it('gives interrupted project loops time to persist queued state during shutdown', () => {
	expect(mocks.options.abortGraceMs).toBeGreaterThanOrEqual(3000);
});

it('reserves abort grace inside the existing 22-second shutdown budget', () => {
	expect(
		(mocks.options.drainTimeout ?? 22000) + (mocks.options.abortGraceMs ?? 0)
	).toBeLessThanOrEqual(22000);
});
