// apps/worker/src/bootstrap.ts
import type { Server } from 'node:http';

import { createGeneralWorkerApp } from './app';
import { logProjectLoopProviderConfiguration } from './config/projectLoops';
import { logQueueConfiguration } from './config/queueConfig';
import { logWorkerError } from './lib/errorLogger';
import { shutdownPostHog } from './lib/posthog';
import { WorkerEventLoopLagMonitor } from './lib/workerOperationalHealth';
import { startScheduler } from './scheduler';
import { getWorkerHealth, shutdownWorker, startWorker } from './worker';

const DEFAULT_PORT = 3001;
const CRASH_DRAIN_TIMEOUT_MS = 5_000;
const HTTP_CLOSE_TIMEOUT_MS = 2_000;
const HARD_SHUTDOWN_TIMEOUT_MS = 28_000;

/**
 * Start the single Railway process that owns the general HTTP API, queue
 * consumer, and scheduler. Agentic Chat has a separate entrypoint.
 */
export async function startGeneralWorkerProcess(): Promise<void> {
	logStartupConfiguration();

	const port = parsePort(process.env.PORT);
	const eventLoopLagMonitor = new WorkerEventLoopLagMonitor();
	const app = createGeneralWorkerApp({ eventLoopLagMonitor, getWorkerHealth });
	let server: Server | null = null;
	let shuttingDown = false;

	const crashExit = async (label: string): Promise<void> => {
		try {
			const timer = new Promise((resolve) => setTimeout(resolve, CRASH_DRAIN_TIMEOUT_MS));
			await Promise.race([shutdownWorker(), timer]);
		} catch (error) {
			console.error(`Failed to stop worker runtimes during ${label} shutdown:`, error);
		} finally {
			process.exit(1);
		}
	};

	const gracefulShutdown = async (signal: string): Promise<void> => {
		if (shuttingDown) {
			console.log(`⏩ ${signal} received again, forcing exit`);
			process.exit(0);
		}
		shuttingDown = true;
		console.log(`${signal} received, shutting down gracefully...`);

		const hardKill = setTimeout(() => {
			console.error(
				`⛔ Graceful shutdown timed out after ${HARD_SHUTDOWN_TIMEOUT_MS}ms, forcing exit`
			);
			process.exit(1);
		}, HARD_SHUTDOWN_TIMEOUT_MS);
		hardKill.unref();

		try {
			const workerShutdown: Promise<{ error: unknown | null }> = shutdownWorker().then(
				() => ({ error: null }),
				(error: unknown) => ({ error })
			);

			await closeHttpServer(server);

			const shutdownResult = await workerShutdown;
			if (shutdownResult.error !== null) throw shutdownResult.error;

			await shutdownPostHog();
		} catch (error) {
			console.error('❌ Error during graceful shutdown:', error);
		} finally {
			clearTimeout(hardKill);
			eventLoopLagMonitor.stop();
			process.exit(0);
		}
	};

	process.on('uncaughtException', (error) => {
		console.error('🚨 CRITICAL: Uncaught Exception', error);
		console.error('Stack:', error.stack);
		void logWorkerError(error, {
			operationType: 'worker_uncaught_exception',
			severity: 'critical',
			metadata: { source: 'process.on' }
		}).finally(() => {
			void crashExit('uncaughtException');
		});
	});

	process.on('unhandledRejection', (reason, promise) => {
		console.error('🚨 CRITICAL: Unhandled Rejection');
		console.error('Promise:', promise);
		console.error('Reason:', reason);
		void logWorkerError(reason, {
			operationType: 'worker_unhandled_rejection',
			severity: 'critical',
			metadata: { source: 'process.on' }
		}).finally(() => {
			void crashExit('unhandledRejection');
		});
	});

	process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
	process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

	try {
		await startWorker();
		startScheduler();
		server = app.listen(port, '0.0.0.0', () => {
			console.log(`🚀 API server running on port ${port}`);
			console.log(`📊 Queue dashboard: http://localhost:${port}/queue/stats`);
			console.log(`❤️ Health check: http://localhost:${port}/health`);
		});
	} catch (error) {
		console.error('Failed to start server:', error);
		try {
			await logWorkerError(error, {
				operationType: 'worker_startup',
				severity: 'critical',
				metadata: { phase: 'start' }
			});
		} catch (logError) {
			console.error('Failed to persist worker startup error:', logError);
		} finally {
			await crashExit('startup');
		}
	}
}

function closeHttpServer(server: Server | null): Promise<void> {
	return new Promise((resolve) => {
		if (!server) return resolve();
		const httpCloseTimeout = setTimeout(resolve, HTTP_CLOSE_TIMEOUT_MS);
		httpCloseTimeout.unref();
		server.closeIdleConnections();
		server.close(() => {
			clearTimeout(httpCloseTimeout);
			resolve();
		});
	});
}

function parsePort(value: string | undefined): number {
	return Number.parseInt(value || String(DEFAULT_PORT), 10);
}

function logStartupConfiguration(): void {
	console.log('🚀 Application starting...');
	logQueueConfiguration();
	logProjectLoopProviderConfiguration();
	console.log('📧 Email Configuration:');
	console.log(
		`   → USE_WEBHOOK_EMAIL: "${process.env.USE_WEBHOOK_EMAIL}" (type: ${typeof process.env.USE_WEBHOOK_EMAIL})`
	);
	console.log(
		`   → Is webhook enabled: ${process.env.USE_WEBHOOK_EMAIL === 'true' ? 'YES' : 'NO'}`
	);
	console.log(`   → Webhook URL configured: ${process.env.BUILDOS_WEBHOOK_URL ? 'YES' : 'NO'}`);
	console.log(`   → SMTP configured: ${process.env.SMTP_HOST ? 'YES' : 'NO'}`);
}
