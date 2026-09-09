import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { trackPoolDisconnections } from './helpers/trackPoolDisconnections';

function fixture() {
	const pool = Object.assign(new EventEmitter(), { end: vi.fn(async () => undefined) });
	const close = trackPoolDisconnections(pool as unknown as Pool);
	return { pool, close };
}

describe('disposable PostgreSQL pool shutdown', () => {
	it('waits for every client after pool.end has already resolved', async () => {
		const { pool, close } = fixture();
		const first = new EventEmitter(),
			second = new EventEmitter();
		pool.emit('connect', first);
		pool.emit('connect', second);
		const stopped = vi.fn();
		const closing = close().then(stopped);
		await pool.end.mock.results[0].value;
		expect(stopped).not.toHaveBeenCalled();
		first.emit('end');
		await Promise.resolve();
		expect(stopped).not.toHaveBeenCalled();
		second.emit('end');
		await closing;
		expect(stopped).toHaveBeenCalledOnce();
	});
	it('handles clients disconnected before shutdown and an unused pool', async () => {
		const { pool, close } = fixture();
		const client = new EventEmitter();
		pool.emit('connect', client);
		client.emit('end');
		await close();
		await fixture().close();
	});
	it('includes a connection that finishes opening while pool.end is pending', async () => {
		const { pool, close } = fixture();
		const client = new EventEmitter();
		pool.end.mockImplementation(async () => {
			pool.emit('connect', client);
		});
		const stopped = vi.fn();
		const closing = close().then(stopped);
		await pool.end.mock.results[0].value;
		expect(stopped).not.toHaveBeenCalled();
		client.emit('end');
		await closing;
		expect(stopped).toHaveBeenCalledOnce();
	});
	it('does not suppress pool shutdown failures', async () => {
		const { pool, close } = fixture();
		pool.end.mockRejectedValue(new Error('shutdown failure'));
		await expect(close()).rejects.toThrow('shutdown failure');
	});
});
