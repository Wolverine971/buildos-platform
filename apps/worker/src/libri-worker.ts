// Dedicated Libri Railway process. This entrypoint must never import the
// general worker, scheduler, or any non-Libri processor tree.
import 'dotenv/config';
import {
	type LibriWorkerConfig,
	loadLibriOcrRuntimeConfig,
	loadLibriWorkerConfig,
	requireDedicatedLibriWorkerProductionProfile
} from './config/libriWorkerProfile';
import { type LibriWorkerService, createLibriWorkerService } from './lib/libriWorkerService';
import { WorkerEventLoopLagMonitor } from './lib/workerOperationalHealth';
import { LibriWorkerBootstrap } from './workers/libri/bootstrap';
import { createLibriAssetBroker } from './workers/libri/assetBroker';
import { type LibriDatabasePort, createLibriDatabase } from './workers/libri/database';
import {
	LibriMaintenanceConsumer,
	createSyntheticLibriMaintenanceProcessor
} from './workers/libri/maintenanceConsumer';
import { createLibriOcrProcessor } from './workers/libri/ocrProcessor';
import { createOpenRouterLibriOcrProvider } from './workers/libri/ocrProvider';

const PROCESS_SHUTDOWN_TIMEOUT_MS = 28_000;

requireDedicatedLibriWorkerProductionProfile(process.env);
const config = loadLibriWorkerConfig(process.env);
const database = createLibriDatabase(requireEnvironment(process.env, 'LIBRI_DATABASE_URL'), {
	caCertificate: requireEnvironment(process.env, 'LIBRI_DATABASE_CA_CERT')
});
const consumer = createConsumer(config, database, process.env);
const bootstrap = new LibriWorkerBootstrap(database, config, consumer);
const service = createLibriWorkerService({
	bootstrap,
	eventLoopLagMonitor: new WorkerEventLoopLagMonitor(),
	port: resolvePort(process.env.PORT),
	serviceName: 'libri-worker',
	release: resolveRelease(process.env)
});

installProcessHandlers(service);

void startDedicatedLibriWorker().catch((error) => {
	console.error('Failed to start dedicated Libri worker:', error);
	void shutdownAndExit(service, 'startup', 1);
});

async function startDedicatedLibriWorker(): Promise<void> {
	if (config.admissionDispatchEnabled) {
		await database.probe();
		if (!config.canaryAdmissionId) {
			throw new Error('Enabled Libri admission dispatch requires one admission UUID');
		}
		const receipt = await database.dispatchOcrAdmission({
			admissionId: config.canaryAdmissionId
		});
		console.log('Libri OCR admission dispatch completed', {
			admissionId: receipt.admissionId,
			runId: receipt.runId,
			manifestSha256: receipt.manifestSha256,
			created: receipt.created,
			jobCount: receipt.jobs.length
		});
	}
	await service.start();
}

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

function resolveWorkerId(environment: NodeJS.ProcessEnv): string {
	const identity =
		environment.RAILWAY_REPLICA_ID?.trim() ||
		environment.RAILWAY_DEPLOYMENT_ID?.trim() ||
		String(process.pid);
	return `libri-worker:${identity}`.slice(0, 200);
}

function createConsumer(
	config: LibriWorkerConfig,
	database: LibriDatabasePort,
	environment: NodeJS.ProcessEnv
): LibriMaintenanceConsumer {
	const shared = {
		lifecycle: database,
		workerId: resolveWorkerId(environment),
		config: { concurrency: config.concurrency },
		claimStepIds: config.canaryStepId ? [config.canaryStepId] : undefined,
		claimDeadlineMs: config.canaryExpiresAtMs ?? undefined
	};
	if (config.queueEnabled && config.activationMode === 'ocr_canary') {
		const ocr = loadLibriOcrRuntimeConfig(environment);
		const processor = createLibriOcrProcessor(
			{
				costLedger: database,
				assetGrants: database,
				assetBroker: createLibriAssetBroker({
					endpointUrl: ocr.assetBrokerUrl,
					bearerToken: ocr.assetBrokerToken,
					timeoutMs: ocr.assetBrokerTimeoutMs
				}),
				execution: database,
				provider: createOpenRouterLibriOcrProvider({
					apiKey: ocr.openRouterApiKey,
					allowedModels: [ocr.model],
					httpReferer: 'https://build-os.com',
					appName: 'BuildOS Libri'
				})
			},
			{
				model: ocr.model,
				maxOutputTokens: ocr.maxOutputTokens,
				reservedMicrousd: ocr.reservedMicrousd
			}
		);
		return new LibriMaintenanceConsumer({
			...shared,
			processor,
			claimQueueTypes: ['libri_ingest'],
			processorManagesCompletion: true
		});
	}
	return new LibriMaintenanceConsumer({
		...shared,
		processor: createSyntheticLibriMaintenanceProcessor()
	});
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
	const value = environment[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}
