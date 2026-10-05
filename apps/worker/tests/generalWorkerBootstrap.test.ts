// apps/worker/tests/generalWorkerBootstrap.test.ts
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
	const events: string[] = [];
	const signalHandlers = new Map<string, (...args: unknown[]) => unknown>();
	const server = {
		closeIdleConnections: vi.fn(),
		close: vi.fn()
	};
	const app = { listen: vi.fn() };
	const queue = {};

	return {
		app,
		events,
		server,
		signalHandlers,
		createGeneralWorkerApp: vi.fn(),
		getWorkerHealth: vi.fn(),
		queue,
		logProjectLoopProviderConfiguration: vi.fn(),
		logQueueConfiguration: vi.fn(),
		logWorkerError: vi.fn(),
		shutdownPostHog: vi.fn(),
		startScheduler: vi.fn(),
		startWorker: vi.fn(),
		shutdownWorker: vi.fn(),
		stopEventLoopMonitor: vi.fn()
	};
});

vi.mock('../src/app', () => ({
	createGeneralWorkerApp: harness.createGeneralWorkerApp
}));

vi.mock('../src/config/projectLoops', () => ({
	logProjectLoopProviderConfiguration: harness.logProjectLoopProviderConfiguration
}));

vi.mock('../src/config/queueConfig', () => ({
	logQueueConfiguration: harness.logQueueConfiguration
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: harness.logWorkerError
}));

vi.mock('../src/lib/posthog', () => ({
	shutdownPostHog: harness.shutdownPostHog
}));

vi.mock('../src/lib/workerOperationalHealth', () => ({
	WorkerEventLoopLagMonitor: class {
		getSnapshot(): { meanMs: number; p99Ms: number; maxMs: number } {
			return { meanMs: 0, p99Ms: 0, maxMs: 0 };
		}

		stop(): void {
			harness.stopEventLoopMonitor();
		}
	}
}));

vi.mock('../src/scheduler', () => ({
	startScheduler: harness.startScheduler
}));

vi.mock('../src/worker', () => ({
	getWorkerHealth: harness.getWorkerHealth,
	queue: harness.queue,
	startWorker: harness.startWorker,
	shutdownWorker: harness.shutdownWorker
}));

import { startGeneralWorkerProcess } from '../src/bootstrap';

const originalPort = process.env.PORT;
// Scheduled-work gate inputs (src/config/scheduledWork.ts). Each test starts from
// a deployed Railway worker unless it says otherwise.
const SCHEDULED_WORK_KEYS = [
	'WORKER_SCHEDULER_ENABLED',
	'RAILWAY_ENVIRONMENT_ID',
	'RAILWAY_ENVIRONMENT',
	'RAILWAY_ENVIRONMENT_NAME',
	'RAILWAY_SERVICE_ID'
] as const;
const originalScheduledWorkEnv = Object.fromEntries(
	SCHEDULED_WORK_KEYS.map((key) => [key, process.env[key]])
);
let processOnSpy: { mockRestore(): void };
let processExitSpy: { mockRestore(): void };
let consoleLogSpy: MockInstance<typeof console.log>;

beforeEach(() => {
	harness.events.length = 0;
	harness.signalHandlers.clear();
	process.env.PORT = '4107';
	for (const key of SCHEDULED_WORK_KEYS) delete process.env[key];
	process.env.RAILWAY_ENVIRONMENT_ID = 'railway-env-id';
	process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
	consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

	harness.createGeneralWorkerApp.mockReset().mockReturnValue(harness.app);
	harness.getWorkerHealth.mockReset();
	harness.logProjectLoopProviderConfiguration.mockReset();
	harness.logQueueConfiguration.mockReset();
	harness.logWorkerError.mockReset().mockResolvedValue(undefined);
	harness.shutdownPostHog.mockReset().mockImplementation(async () => {
		harness.events.push('posthog-stop');
	});
	harness.startScheduler.mockReset().mockImplementation(() => {
		harness.events.push('scheduler-start');
	});
	harness.startWorker.mockReset().mockImplementation(async () => {
		harness.events.push('worker-start');
	});
	harness.shutdownWorker.mockReset().mockImplementation(async () => {
		harness.events.push('worker-stop');
	});
	harness.stopEventLoopMonitor.mockReset().mockImplementation(() => {
		harness.events.push('monitor-stop');
	});
	harness.server.closeIdleConnections.mockReset().mockImplementation(() => {
		harness.events.push('http-idle-close');
	});
	harness.server.close.mockReset().mockImplementation((callback: () => void) => {
		harness.events.push('http-close');
		callback();
		return harness.server;
	});
	harness.app.listen
		.mockReset()
		.mockImplementation((_port: number, _host: string, callback: () => void) => {
			harness.events.push('http-listen');
			callback();
			return harness.server;
		});

	processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
		event: string | symbol,
		listener: (...args: unknown[]) => unknown
	) => {
		harness.signalHandlers.set(String(event), listener);
		return process;
	}) as typeof process.on);
	processExitSpy = vi.spyOn(process, 'exit').mockImplementation(((
		code?: string | number | null
	) => {
		harness.events.push(`exit:${code ?? ''}`);
		return undefined as never;
	}) as typeof process.exit);
});

afterEach(() => {
	processOnSpy.mockRestore();
	processExitSpy.mockRestore();
	consoleLogSpy.mockRestore();
	if (originalPort === undefined) {
		delete process.env.PORT;
	} else {
		process.env.PORT = originalPort;
	}
	for (const key of SCHEDULED_WORK_KEYS) {
		const value = originalScheduledWorkEnv[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe('general worker process bootstrap', () => {
	it('starts the queue before the scheduler and HTTP listener', async () => {
		await startGeneralWorkerProcess();

		expect(harness.events).toEqual(['worker-start', 'scheduler-start', 'http-listen']);
		expect(harness.startWorker).toHaveBeenCalledWith({ scheduledWork: true });
		expect(harness.createGeneralWorkerApp).toHaveBeenCalledWith({
			eventLoopLagMonitor: expect.any(Object),
			getWorkerHealth: harness.getWorkerHealth,
			queue: harness.queue
		});
		expect(harness.app.listen).toHaveBeenCalledWith(4107, '0.0.0.0', expect.any(Function));
		expect([...harness.signalHandlers.keys()]).toEqual([
			'uncaughtException',
			'unhandledRejection',
			'SIGTERM',
			'SIGINT'
		]);
	});

	it('drains the queue and HTTP server before flushing telemetry on shutdown', async () => {
		await startGeneralWorkerProcess();

		const sigtermHandler = harness.signalHandlers.get('SIGTERM');
		expect(sigtermHandler).toBeDefined();
		sigtermHandler?.();

		await vi.waitFor(() => expect(processExitSpy).toHaveBeenCalledWith(0));
		expect(harness.events).toEqual([
			'worker-start',
			'scheduler-start',
			'http-listen',
			'worker-stop',
			'http-idle-close',
			'http-close',
			'posthog-stop',
			'monitor-stop',
			'exit:0'
		]);
	});

	it('reports startup failures, drains runtimes, and exits without opening HTTP', async () => {
		const startupError = new Error('queue unavailable');
		harness.startWorker.mockRejectedValueOnce(startupError);

		await startGeneralWorkerProcess();

		expect(harness.logWorkerError).toHaveBeenCalledWith(startupError, {
			operationType: 'worker_startup',
			severity: 'critical',
			metadata: { phase: 'start' }
		});
		expect(harness.startScheduler).not.toHaveBeenCalled();
		expect(harness.app.listen).not.toHaveBeenCalled();
		expect(harness.events).toEqual(['worker-stop', 'exit:1']);
	});
});

describe('general worker scheduled-work gate', () => {
	it('keeps a local worker off production crons, purges, and alerts by default', async () => {
		for (const key of SCHEDULED_WORK_KEYS) delete process.env[key];

		await startGeneralWorkerProcess();

		expect(harness.startWorker).toHaveBeenCalledWith({ scheduledWork: false });
		expect(harness.startScheduler).not.toHaveBeenCalled();
		expect(harness.events).toEqual(['worker-start', 'http-listen']);
		expect(scheduledWorkLogLines()).toEqual([
			expect.stringContaining('Scheduled work OFF (not a Railway deployment)')
		]);
		expect(scheduledWorkLogLines()[0]).toContain('WORKER_SCHEDULER_ENABLED=true');
	});

	it('starts the scheduler locally only on explicit opt-in', async () => {
		for (const key of SCHEDULED_WORK_KEYS) delete process.env[key];
		process.env.WORKER_SCHEDULER_ENABLED = 'true';

		await startGeneralWorkerProcess();

		expect(harness.startWorker).toHaveBeenCalledWith({ scheduledWork: true });
		expect(harness.events).toEqual(['worker-start', 'scheduler-start', 'http-listen']);
		expect(scheduledWorkLogLines()).toEqual([
			expect.stringContaining('Scheduled work ON (WORKER_SCHEDULER_ENABLED=true)')
		]);
	});

	it('starts the scheduler on Railway and logs the environment', async () => {
		await startGeneralWorkerProcess();

		expect(harness.startScheduler).toHaveBeenCalledTimes(1);
		expect(scheduledWorkLogLines()).toEqual([
			expect.stringContaining('Scheduled work ON (Railway environment "production")')
		]);
	});

	it('lets an explicit kill switch stop scheduled work on Railway', async () => {
		process.env.WORKER_SCHEDULER_ENABLED = 'false';

		await startGeneralWorkerProcess();

		expect(harness.startWorker).toHaveBeenCalledWith({ scheduledWork: false });
		expect(harness.startScheduler).not.toHaveBeenCalled();
	});
});

function scheduledWorkLogLines(): string[] {
	return consoleLogSpy.mock.calls
		.map((call) => String(call[0]))
		.filter((line) => line.includes('Scheduled work'));
}
