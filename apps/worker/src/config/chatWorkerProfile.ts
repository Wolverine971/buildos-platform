/**
 * Railway and other production launches must opt into the strict profile.
 * Local development/tests retain the Phase 3 defaults unless they explicitly
 * exercise that profile.
 */
export function requireDedicatedChatWorkerProductionProfile(environment: NodeJS.ProcessEnv): void {
	if (!isHostedProduction(environment)) return;
	if (environment.AGENTIC_CHAT_WORKER_PROFILE !== 'production') {
		throw new Error(
			'AGENTIC_CHAT_WORKER_PROFILE=production is required for a hosted dedicated chat worker'
		);
	}
}

function isHostedProduction(environment: NodeJS.ProcessEnv): boolean {
	return Boolean(
		environment.NODE_ENV === 'production' ||
			environment.RAILWAY_ENVIRONMENT_ID ||
			environment.RAILWAY_ENVIRONMENT_NAME ||
			environment.RAILWAY_SERVICE_ID
	);
}
