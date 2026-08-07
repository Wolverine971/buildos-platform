// apps/worker/src/workers/agentic-chat/phase3Bootstrap.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { LLMUsageLogger } from '@buildos/smart-llm';
import type { AgenticChatWorkerCapacityEvidenceV1 } from './capacity';
import type { AgenticChatConsumerRuntimeHealth } from './consumerRuntime';
import {
	AgenticChatLlmUsageObserver,
	AgenticChatOpenRouterReadOnlyClient
} from './openRouterReadOnlyClient';
import { createAgenticChatPhase3Assembly } from './phase3Assembly';
import { type AgenticChatPhase3Config, loadAgenticChatPhase3Config } from './phase3Config';
import {
	type AgenticChatExecutionObservationRpcClient,
	SupabaseAgenticChatExecutionObservationAdapter
} from './executionObservation';

const OPENROUTER_HTTP_REFERER = 'https://build-os.com';
const OPENROUTER_APP_NAME = 'BuildOS Agentic Chat Worker';

type EnabledPhase3Config = Extract<AgenticChatPhase3Config, { enabled: true }>;

export type AgenticChatPhase3BootstrapState =
	| 'disabled'
	| 'ready'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'failed';

export type AgenticChatPhase3BootstrapHealth = {
	enabled: boolean;
	healthy: boolean;
	state: AgenticChatPhase3BootstrapState;
	reason?: string;
	runtime: AgenticChatConsumerRuntimeHealth | null;
};

export type AgenticChatPhase3BootstrapAssemblyPort = {
	runtime: {
		start(): Promise<void>;
		stop(): Promise<void>;
		wake(): Promise<void>;
		getHealth(): AgenticChatConsumerRuntimeHealth;
	};
	capacity: {
		collect(): Promise<AgenticChatWorkerCapacityEvidenceV1 | null>;
	};
};

export type AgenticChatPhase3BootstrapAssemblyFactoryInput = {
	client: SupabaseClient<Database>;
	config: EnabledPhase3Config;
	fetchImpl?: typeof fetch;
	onUsageError?: (error: unknown) => void;
};

export type AgenticChatPhase3BootstrapOptions = {
	client: SupabaseClient<Database>;
	environment?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	onUsageError?: (error: unknown) => void;
	createAssembly?: (
		input: AgenticChatPhase3BootstrapAssemblyFactoryInput
	) => AgenticChatPhase3BootstrapAssemblyPort;
};

export type AgenticChatPhase3BootstrapStartResult = 'disabled' | 'started';

/**
 * Build the Phase 3 operational boundary without publishing capacity or
 * changing web admission. Disabled configuration constructs no provider,
 * usage logger, assembly, queue, or background service.
 */
export function createAgenticChatPhase3Bootstrap(
	options: AgenticChatPhase3BootstrapOptions
): AgenticChatPhase3Bootstrap {
	const config = loadAgenticChatPhase3Config(options.environment);
	if (!config.enabled) return new AgenticChatPhase3Bootstrap(false, null);

	const createAssembly = options.createAssembly ?? createDefaultAssembly;
	const assembly = createAssembly({
		client: options.client,
		config,
		fetchImpl: options.fetchImpl,
		onUsageError: options.onUsageError
	});
	return new AgenticChatPhase3Bootstrap(true, assembly);
}

export class AgenticChatPhase3Bootstrap {
	private state: AgenticChatPhase3BootstrapState;
	private startPromise: Promise<AgenticChatPhase3BootstrapStartResult> | null = null;
	private stopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(
		private readonly enabled: boolean,
		private readonly assembly: AgenticChatPhase3BootstrapAssemblyPort | null
	) {
		if (enabled !== (assembly !== null)) {
			throw new Error('Agentic Chat bootstrap enabled state and assembly must agree');
		}
		this.state = enabled ? 'ready' : 'disabled';
	}

	start(): Promise<AgenticChatPhase3BootstrapStartResult> {
		if (!this.enabled) return Promise.resolve('disabled');
		if ((this.state === 'starting' || this.state === 'running') && this.startPromise) {
			return this.startPromise;
		}
		if (this.state !== 'ready') {
			return Promise.reject(
				new Error(`Agentic Chat bootstrap cannot start from ${this.state}`)
			);
		}

		this.state = 'starting';
		this.startPromise = this.startRuntime();
		return this.startPromise;
	}

	stop(): Promise<void> {
		if (!this.enabled) return Promise.resolve();
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.stopRuntime();
		return this.stopPromise;
	}

	async wake(): Promise<boolean> {
		if (this.state !== 'running' || !this.assembly) return false;
		await this.assembly.runtime.wake();
		return true;
	}

	async collectCapacityEvidence(): Promise<AgenticChatWorkerCapacityEvidenceV1 | null> {
		if (this.state !== 'running' || !this.assembly) return null;
		try {
			if (!this.assembly.runtime.getHealth().healthy) return null;
			return await this.assembly.capacity.collect();
		} catch {
			return null;
		}
	}

	getHealth(): AgenticChatPhase3BootstrapHealth {
		if (!this.enabled) {
			return {
				enabled: false,
				healthy: true,
				state: 'disabled',
				reason: 'disabled',
				runtime: null
			};
		}

		const runtime = this.safeRuntimeHealth();
		if (this.state === 'running') {
			return runtime?.healthy
				? { enabled: true, healthy: true, state: this.state, runtime }
				: {
						enabled: true,
						healthy: false,
						state: this.state,
						reason: runtime?.reason ?? 'runtime_health_unavailable',
						runtime
					};
		}
		if (this.state === 'stopping' || this.state === 'stopped') {
			return {
				enabled: true,
				healthy: true,
				state: this.state,
				reason: this.state,
				runtime
			};
		}
		return {
			enabled: true,
			healthy: false,
			state: this.state,
			reason: this.state === 'failed' ? (this.lastError ?? 'bootstrap_failed') : this.state,
			runtime
		};
	}

	private async startRuntime(): Promise<AgenticChatPhase3BootstrapStartResult> {
		try {
			await this.requireAssembly().runtime.start();
			this.state = 'running';
			return 'started';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			throw error;
		}
	}

	private async stopRuntime(): Promise<void> {
		if (this.state === 'stopped') return;
		if (this.state === 'starting' && this.startPromise) {
			await this.startPromise.catch(() => undefined);
		}
		this.state = 'stopping';
		try {
			await this.requireAssembly().runtime.stop();
			this.state = 'stopped';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			throw error;
		}
	}

	private safeRuntimeHealth(): AgenticChatConsumerRuntimeHealth | null {
		try {
			return this.assembly?.runtime.getHealth() ?? null;
		} catch {
			return null;
		}
	}

	private requireAssembly(): AgenticChatPhase3BootstrapAssemblyPort {
		if (!this.assembly) throw new Error('Agentic Chat bootstrap assembly is unavailable');
		return this.assembly;
	}
}

function createDefaultAssembly(
	input: AgenticChatPhase3BootstrapAssemblyFactoryInput
): AgenticChatPhase3BootstrapAssemblyPort {
	const usageLogger = new LLMUsageLogger({ supabase: input.client });
	const executionObservations = new SupabaseAgenticChatExecutionObservationAdapter(
		input.client as unknown as AgenticChatExecutionObservationRpcClient
	);
	const providerClient = new AgenticChatOpenRouterReadOnlyClient(
		{
			usage: new AgenticChatLlmUsageObserver(usageLogger),
			executionObservations,
			onUsageError: input.onUsageError,
			onExecutionObservationError: input.onUsageError
		},
		{
			routes: input.config.provider.routes,
			httpReferer: OPENROUTER_HTTP_REFERER,
			appName: OPENROUTER_APP_NAME,
			fetchImpl: input.fetchImpl
		}
	);
	return createAgenticChatPhase3Assembly({
		client: input.client,
		providerClient,
		providerConfigured: true,
		internalUserIds: input.config.internalUserIds,
		consumerConfig: input.config.consumer,
		providerBudgetMs: input.config.providerBudgetMs,
		maxProviderRounds: input.config.maxProviderRounds,
		maxToolCalls: input.config.maxToolCalls,
		onExecutionObservationError: input.onUsageError
	});
}

function canonicalError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return message.trim().slice(0, 1_000) || 'Agentic Chat bootstrap failed';
}
