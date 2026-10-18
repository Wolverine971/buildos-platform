// apps/worker/tests/agenticChatAbortable.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { abortable } from '../src/workers/agentic-chat/shared/abortable-deadline';

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

afterEach(() => {
	process.off('unhandledRejection', onUnhandled);
	unhandled.length = 0;
});

describe('abortable', () => {
	// `abortable(start(), signal)` evaluates `start()` before checking the
	// signal. On an aborted signal the call throws at once and nothing else
	// holds the started promise; its later rejection must not become an
	// unhandled rejection, which exits the worker with every turn on it.
	it('handles the rejection of a promise it refuses on an already-aborted signal', async () => {
		process.on('unhandledRejection', onUnhandled);
		const controller = new AbortController();
		controller.abort(new Error('turn stopped'));
		let rejectLater!: (error: unknown) => void;
		const started = new Promise<void>((_resolve, reject) => {
			rejectLater = reject;
		});

		expect(() => abortable(started, controller.signal)).toThrow('turn stopped');
		rejectLater(new Error('save aborted'));
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(unhandled).toEqual([]);
	});

	it('still rejects with the signal reason when the signal aborts while waiting', async () => {
		const controller = new AbortController();
		const pending = abortable(new Promise<void>(() => undefined), controller.signal);
		controller.abort(new Error('lease lost'));
		await expect(pending).rejects.toThrow('lease lost');
	});

	it('passes the promise result through when the signal never aborts', async () => {
		const controller = new AbortController();
		await expect(abortable(Promise.resolve(7), controller.signal)).resolves.toBe(7);
		await expect(
			abortable(Promise.reject(new Error('rpc failed')), controller.signal)
		).rejects.toThrow('rpc failed');
	});
});
