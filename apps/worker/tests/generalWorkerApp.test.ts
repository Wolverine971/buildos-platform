// apps/worker/tests/generalWorkerApp.test.ts
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Application } from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { createGeneralWorkerApp } from '../src/app';
import type { GeneralWorkerRuntimeLifecycleHealth } from '../src/lib/generalWorkerRuntimeLifecycle';
import smsScheduledRoutes from '../src/routes/sms/scheduled';
import type { GeneralWorkerHttpQueue } from '../src/routes/queue/queuePort';

const originalWorkerToken = process.env.PRIVATE_RAILWAY_WORKER_TOKEN;

afterEach(() => {
	if (originalWorkerToken === undefined) {
		delete process.env.PRIVATE_RAILWAY_WORKER_TOKEN;
	} else {
		process.env.PRIVATE_RAILWAY_WORKER_TOKEN = originalWorkerToken;
	}
});

describe('general worker HTTP composition', () => {
	it('registers the complete route contract after decomposition', () => {
		const appRoutes = registeredRoutes(createTestApp());
		const smsRoutes = registeredRoutes(smsScheduledRoutes);

		expect(appRoutes).toEqual([
			'GET /api/email-tracking/:trackingId',
			'GET /health',
			'GET /jobs/:jobId',
			'GET /queue/stale-stats',
			'GET /queue/stats',
			'GET /users/:userId/jobs',
			'POST /classify/ontology',
			'POST /queue/braindump/process',
			'POST /queue/brief',
			'POST /queue/chat/classify',
			'POST /queue/cleanup',
			'POST /queue/onboarding'
		]);
		expect(smsRoutes).toEqual([
			'GET /user/:userId',
			'PATCH /:id/update',
			'POST /:id/cancel',
			'POST /:id/regenerate'
		]);
	});

	it('keeps health public and propagates caller correlation IDs', async () => {
		const correlationId = '11111111-2222-4333-8444-555555555555';
		const response = await request('/health', {
			headers: { 'x-correlation-id': correlationId }
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('x-correlation-id')).toBe(correlationId);
		expect(await response.json()).toMatchObject({
			status: 'healthy',
			service: 'daily-brief-worker',
			runtimeState: 'running',
			checks: {
				database: { connected: true, consecutiveClaimFailures: 0 },
				eventLoopLag: { meanMs: 1, p99Ms: 2, maxMs: 3 }
			}
		});
	});

	it('protects queue inspection routes with the worker bearer token', async () => {
		process.env.PRIVATE_RAILWAY_WORKER_TOKEN = 'worker-secret';

		const response = await request('/queue/stats');

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('registers the ontology route behind the shared auth boundary', async () => {
		process.env.PRIVATE_RAILWAY_WORKER_TOKEN = 'worker-secret';

		const response = await request('/classify/ontology', {
			method: 'POST',
			headers: {
				authorization: 'Bearer worker-secret',
				'content-type': 'application/json'
			},
			body: JSON.stringify({})
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'entityType, entityId, userId, and classificationSource are required'
		});
	});

	it('preserves the malformed JSON response contract before route admission', async () => {
		const response = await request('/queue/onboarding', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{'
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
	});
});

async function request(path: string, init?: RequestInit): Promise<Response> {
	const app = createTestApp();
	const server = app.listen(0, '127.0.0.1');

	try {
		await once(server, 'listening');
		const address = server.address() as AddressInfo;
		return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
	} finally {
		await closeServer(server);
	}
}

function createTestApp(): Application {
	return createGeneralWorkerApp({
		eventLoopLagMonitor: {
			getSnapshot: () => ({ meanMs: 1, p99Ms: 2, maxMs: 3 })
		},
		getWorkerHealth: () => healthyWorkerState(),
		queue: {} as GeneralWorkerHttpQueue
	});
}

type RouteLayer = {
	route?: {
		path: string;
		methods: Record<string, boolean>;
	};
};

type RouterWithStack = {
	_router?: { stack: RouteLayer[] };
	stack?: RouteLayer[];
};

function registeredRoutes(router: unknown): string[] {
	const expressRouter = router as RouterWithStack;
	const layers = expressRouter._router?.stack ?? expressRouter.stack ?? [];
	return layers
		.flatMap((layer) => {
			if (!layer.route) return [];
			return Object.entries(layer.route.methods)
				.filter(([, enabled]) => enabled)
				.map(([method]) => `${method.toUpperCase()} ${layer.route?.path}`);
		})
		.sort();
}

function closeServer(server: Server): Promise<void> {
	if (!server.listening) return Promise.resolve();
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

function healthyWorkerState(): GeneralWorkerRuntimeLifecycleHealth {
	return {
		healthy: true,
		state: 'running',
		queue: {
			healthy: true,
			startedAt: '2026-08-26T12:00:00.000Z',
			lastSuccessfulClaimAt: '2026-08-26T12:00:00.000Z',
			lastPollSuccessAt: '2026-08-26T12:00:00.000Z',
			consecutiveClaimFailures: 0,
			processingBatch: false,
			draining: false
		}
	};
}
