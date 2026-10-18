// apps/worker/tests/agenticChatPendingReadSaves.test.ts
import { describe, expect, it } from 'vitest';
import { AgenticChatPendingReadSaves } from '../src/workers/agentic-chat/turn/pending-read-saves';

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('AgenticChatPendingReadSaves', () => {
	it('joins every tracked save and empties itself', async () => {
		const saves = new AgenticChatPendingReadSaves();
		const first = deferred();
		const second = deferred();
		saves.track(1, first.promise);
		saves.track(2, second.promise);
		expect(saves.size).toBe(2);
		let joined = false;
		const join = saves.join().then(() => {
			joined = true;
		});
		first.resolve();
		await Promise.resolve();
		expect(joined).toBe(false);
		second.resolve();
		await join;
		expect(joined).toBe(true);
		expect(saves.size).toBe(0);
	});

	it('throws the earliest tool call failure after every save settles, as a synchronous batch would', async () => {
		const saves = new AgenticChatPendingReadSaves();
		const later = deferred();
		const earlier = deferred();
		const pending = deferred();
		saves.track(5, later.promise);
		saves.track(2, earlier.promise);
		saves.track(7, pending.promise);
		later.reject(new Error('sequence 5 failed'));
		earlier.reject(new Error('sequence 2 failed'));
		let settled = false;
		const join = saves.join().catch((error: unknown) => {
			settled = true;
			return error;
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);
		pending.resolve();
		await expect(join).resolves.toMatchObject({ message: 'sequence 2 failed' });
	});

	it('settles without throwing and prefers a save failure as the turn error', async () => {
		const saves = new AgenticChatPendingReadSaves();
		const failed = deferred();
		saves.track(3, failed.promise);
		const other = new Error('later continuation error');
		expect(saves.turnError(other)).toBe(other);
		const ledgerError = new Error('ledger failed');
		failed.reject(ledgerError);
		await expect(saves.settle()).resolves.toBeUndefined();
		expect(() => saves.throwIfFailed()).toThrow(ledgerError);
		expect(saves.turnError(other)).toBe(ledgerError);
	});

	it('never leaves an unhandled rejection behind', async () => {
		const saves = new AgenticChatPendingReadSaves();
		saves.track(1, Promise.reject(new Error('ignored until a join')));
		await saves.settle();
		expect(saves.size).toBe(0);
	});
});
