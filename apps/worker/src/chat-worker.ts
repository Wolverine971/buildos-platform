// Load environment variables before constructing the Supabase client or chat
// bootstrap. This entrypoint intentionally owns no scheduler or general queue.
import 'dotenv/config';
import { supabase } from './lib/supabase';
import { type ChatWorkerService, createChatWorkerService } from './lib/chatWorkerService';
import { WorkerEventLoopLagMonitor } from './lib/workerOperationalHealth';
import { createAgenticChatBootstrap } from './workers/agentic-chat/bootstrap';
import { requireDedicatedChatWorkerProductionProfile } from './config/chatWorkerProfile';

const PROCESS_SHUTDOWN_TIMEOUT_MS = 28_000;

requireDedicatedChatWorkerProductionProfile(process.env);

const service = createChatWorkerService({
	bootstrap: createAgenticChatBootstrap({ client: supabase }),
	eventLoopLagMonitor: new WorkerEventLoopLagMonitor(),
	port: resolvePort(process.env.PORT),
	serviceName: 'agentic-chat-worker',
	release: resolveRelease(process.env)
});

installProcessHandlers(service);

void service.start().catch((error) => {
	console.error('Failed to start dedicated Agentic Chat worker:', error);
	void shutdownAndExit(service, 'startup', 1);
});

function installProcessHandlers(ownedService: ChatWorkerService): void {
	process.on('SIGTERM', () => void shutdownAndExit(ownedService, 'SIGTERM', 0));
	process.on('SIGINT', () => void shutdownAndExit(ownedService, 'SIGINT', 0));
	process.on('uncaughtException', (error) => {
		console.error('Uncaught exception in dedicated Agentic Chat worker:', error);
		void shutdownAndExit(ownedService, 'uncaughtException', 1);
	});
	process.on('unhandledRejection', (reason) => {
		console.error('Unhandled rejection in dedicated Agentic Chat worker:', reason);
		void shutdownAndExit(ownedService, 'unhandledRejection', 1);
	});
}

let shutdownPromise: Promise<never> | null = null;

function shutdownAndExit(
	ownedService: ChatWorkerService,
	reason: string,
	exitCode: number
): Promise<never> {
	if (shutdownPromise) return shutdownPromise;
	shutdownPromise = (async () => {
		console.log(`${reason} received; draining dedicated Agentic Chat worker...`);
		const hardKill = setTimeout(() => {
			console.error(
				`Dedicated Agentic Chat worker drain exceeded ${PROCESS_SHUTDOWN_TIMEOUT_MS}ms`
			);
			process.exit(1);
		}, PROCESS_SHUTDOWN_TIMEOUT_MS);
		hardKill.unref();
		try {
			await ownedService.stop();
		} catch (error) {
			console.error('Dedicated Agentic Chat worker drain failed:', error);
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
