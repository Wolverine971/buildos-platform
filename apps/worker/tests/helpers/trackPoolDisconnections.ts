import type { Pool } from 'pg';

// Register before the first query. pg-pool can resolve end() after removing its
// idle clients but before those clients emit 'end'. A disposable server must not
// be stopped while those sockets are still closing. Do not swallow pool errors.
export function trackPoolDisconnections(pool: Pool): () => Promise<void> {
	const connections = new Set<Promise<void>>();
	pool.on('connect', (client) => {
		const disconnected = new Promise<void>((resolve) => {
			client.once('end', () => {
				connections.delete(disconnected);
				resolve();
			});
		});
		connections.add(disconnected);
	});
	return async () => {
		await pool.end();
		await Promise.all(connections);
	};
}
