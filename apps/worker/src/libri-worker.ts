// Dedicated Libri Railway process. This entrypoint must never import the
// general worker, scheduler, or any non-Libri processor tree.
import 'dotenv/config';
import {
	loadLibriWorkerConfig,
	requireDedicatedLibriWorkerProductionProfile
} from './config/libriWorkerProfile';
import { type LibriWorkerService, createLibriWorkerService } from './lib/libriWorkerService';
import { WorkerEventLoopLagMonitor } from './lib/workerOperationalHealth';
import { LibriWorkerBootstrap } from './workers/libri/bootstrap';
import { createLibriDatabase } from './workers/libri/database';

const PROCESS_SHUTDOWN_TIMEOUT_MS = 28_000;

requireDedicatedLibriWorkerProductionProfile(process.env);
const config = loadLibriWorkerConfig(process.env);
const database = createLibriDatabase(requireEnvironment(process.env, 'LIBRI_DATABASE_URL'), {
	caCertificate: requireEnvironment(process.env, 'LIBRI_DATABASE_CA_CERT')
});
const bootstrap = new LibriWorkerBootstrap(database, config);
const service = createLibriWorkerService({
	bootstrap,
	eventLoopLagMonitor: new WorkerEventLoopLagMonitor(),
	port: resolvePort(process.env.PORT),
	serviceName: 'libri-worker',
	release: resolveRelease(process.env)
});

installProcessHandlers(service);

void service.start().catch((error) => {
	console.error('Failed to start dedicated Libri worker:', error);
	void shutdownAndExit(service, 'startup', 1);
});

function installProcessHandlers(ownedService: LibriWorkerService): void {
	process.on('SIGTERM', () => void shutdownAndExit(ownedService, 'SIGTERM', 0));
	process.on('SIGINT', () => void shutdownAndExit(ownedService, 'SIGINT', 0));
	process.on('uncaughtException', (error) => {
		console.error('Uncaught exception in dedicated Libri worker:', error);
		void shutdownAndExit(ownedService, 'uncaughtException', 1);
	});
	process.on('unhandledRejection', (reason) => {
		console.error('Unhandled rejection in dedicated Libri worker:', reason);
		void shutdownAndExit(ownedService, 'unhandledRejection', 1);
	});
}

let shutdownPromise: Promise<never> | null = null;

function shutdownAndExit(
	ownedService: LibriWorkerService,
	reason: string,
	exitCode: number
): Promise<never> {
	if (shutdownPromise) return shutdownPromise;
	shutdownPromise = (async () => {
		console.log(`${reason} received; draining dedicated Libri worker...`);
		const hardKill = setTimeout(() => {
			console.error(`Dedicated Libri worker drain exceeded ${PROCESS_SHUTDOWN_TIMEOUT_MS}ms`);
			process.exit(1);
		}, PROCESS_SHUTDOWN_TIMEOUT_MS);
		hardKill.unref();
		try {
			await ownedService.stop();
		} catch (error) {
			console.error('Dedicated Libri worker drain failed:', error);
		} finally {
			clearTimeout(hardKill);
			process.exit(exitCode);
		}
	})();
	return shutdownPromise;
}

function resolvePort(value: string | undefined): number {
	const port = Number(value ?? '3001');
	if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
		throw new Error('PORT must be an integer between 1 and 65535');
	}
	return port;
}

function resolveRelease(environment: NodeJS.ProcessEnv): string {
	return (
		environment.RAILWAY_GIT_COMMIT_SHA?.trim() ||
		environment.SOURCE_REVISION?.trim() ||
		environment.npm_package_version?.trim() ||
		'unknown'
	);
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
	const value = environment[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}
