// apps/worker/src/workers/agentic-chat/phase3Config.ts

import {
	type AgenticChatConsumerConfig,
	DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
	normalizeInternalUserIds,
	validateAgenticChatConsumerConfig
} from './consumer';

export type AgenticChatPhase3Config = {
	enabled: boolean;
	internalUserIds: readonly string[];
	consumer: AgenticChatConsumerConfig;
};

/**
 * Parse the Phase 3 startup envelope without mutating process state.
 *
 * Worker execution is disabled by default. Enabling it requires an explicit
 * canonical-UUID allowlist so a deploy cannot accidentally become a public
 * cohort. The allowlist is intentionally data, not an email/domain heuristic.
 */
export function loadAgenticChatPhase3Config(
	environment: NodeJS.ProcessEnv = process.env
): AgenticChatPhase3Config {
	const enabled = parseBoolean(environment.AGENTIC_CHAT_WORKER_ENABLED, false);
	const internalUserIds = parseInternalUserIds(environment.AGENTIC_CHAT_INTERNAL_USER_IDS);
	if (enabled && internalUserIds.length === 0) {
		throw new Error(
			'AGENTIC_CHAT_INTERNAL_USER_IDS must contain at least one canonical UUID when the Agentic Chat worker is enabled'
		);
	}

	const consumer: AgenticChatConsumerConfig = {
		concurrency: parsePositiveInteger(
			environment.CHAT_CONCURRENCY,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.concurrency,
			'CHAT_CONCURRENCY'
		),
		pollIntervalMs: parsePositiveInteger(
			environment.CHAT_POLL_INTERVAL_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.pollIntervalMs,
			'CHAT_POLL_INTERVAL_MS'
		),
		workerTimeoutMs: parsePositiveInteger(
			environment.CHAT_WORKER_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.workerTimeoutMs,
			'CHAT_WORKER_TIMEOUT_MS'
		),
		stalledTimeoutMs: parsePositiveInteger(
			environment.CHAT_STALLED_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.stalledTimeoutMs,
			'CHAT_STALLED_TIMEOUT_MS'
		),
		drainTimeoutMs: parsePositiveInteger(
			environment.CHAT_DRAIN_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.drainTimeoutMs,
			'CHAT_DRAIN_TIMEOUT_MS'
		)
	};
	validateAgenticChatConsumerConfig(consumer);

	return { enabled, internalUserIds, consumer };
}

export function isAgenticChatInternalUser(
	config: Pick<AgenticChatPhase3Config, 'internalUserIds'>,
	userId: string
): boolean {
	return config.internalUserIds.includes(userId.toLowerCase());
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value.trim() === '') return fallback;
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new Error('AGENTIC_CHAT_WORKER_ENABLED must be exactly true or false');
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
	if (value === undefined || value.trim() === '') return fallback;
	if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`${name} must be a positive safe integer`);
	}
	return parsed;
}

function parseInternalUserIds(value: string | undefined): string[] {
	if (value === undefined || value.trim() === '') return [];
	try {
		return normalizeInternalUserIds(value.split(',').map((entry) => entry.trim()));
	} catch (error) {
		if (error instanceof Error && error.message.includes('duplicates')) throw error;
		throw new Error('AGENTIC_CHAT_INTERNAL_USER_IDS must be a comma-separated canonical UUID list');
	}
}
