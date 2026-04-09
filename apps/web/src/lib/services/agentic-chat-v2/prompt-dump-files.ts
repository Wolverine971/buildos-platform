// apps/web/src/lib/services/agentic-chat-v2/prompt-dump-files.ts
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_LOCAL_PROMPT_DUMP_RETENTION_DAYS = 5;
const DEFAULT_LOCAL_PROMPT_DUMP_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const LOW_SIGNAL_FIXTURE_MESSAGES = new Set([
	'organize unlinked docs',
	'show task help',
	'show tool help',
	'List documents',
	'list tasks',
	'List tasks',
	'recover quoted exec args',
	'recover help path fallback',
	'help me with tasks',
	'Tell me something'
]);

let lastLocalPromptDumpPruneAtMs = 0;

function parseBooleanEnv(value: string | undefined): boolean | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return null;
}

function parsePositiveIntEnv(value: string | undefined): number | null {
	if (typeof value !== 'string') return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatUtcDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function getRetentionCutoffDate(now: Date, retentionDays: number): string {
	const cutoff = new Date(now);
	cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
	return formatUtcDate(cutoff);
}

function readDatedFilename(name: string): string | null {
	const match = name.match(/(\d{4}-\d{2}-\d{2})/);
	return match?.[1] ?? null;
}

function isTestLikeEnv(env: NodeJS.ProcessEnv): boolean {
	return Boolean(env.VITEST) || env.NODE_ENV === 'test';
}

export function shouldWriteLocalPromptDump(params: {
	dev: boolean;
	sessionId: string;
	historyCount: number;
	message: string;
	env?: NodeJS.ProcessEnv;
}): boolean {
	const env = params.env ?? process.env;
	const explicitToggle = parseBooleanEnv(env.FASTCHAT_LOCAL_PROMPT_DUMPS);
	if (explicitToggle === false) return false;

	if (isTestLikeEnv(env) && explicitToggle !== true) {
		return false;
	}

	if (!params.dev && explicitToggle !== true) {
		return false;
	}

	const includeFixtures = parseBooleanEnv(env.FASTCHAT_LOCAL_PROMPT_DUMPS_INCLUDE_FIXTURES);
	if (includeFixtures === true) {
		return true;
	}

	const normalizedMessage = params.message.trim();
	const isSyntheticFixtureTurn =
		params.sessionId === 'session_1' &&
		params.historyCount === 0 &&
		LOW_SIGNAL_FIXTURE_MESSAGES.has(normalizedMessage);

	return !isSyntheticFixtureTurn;
}

export function pruneLocalPromptDumps(params: {
	dumpDir: string;
	now?: Date;
	env?: NodeJS.ProcessEnv;
	force?: boolean;
}): { removedCount: number; cutoffDate: string | null } {
	const env = params.env ?? process.env;
	const explicitToggle = parseBooleanEnv(env.FASTCHAT_LOCAL_PROMPT_DUMPS);
	if (explicitToggle === false) {
		return { removedCount: 0, cutoffDate: null };
	}

	const retentionDays =
		parsePositiveIntEnv(env.FASTCHAT_LOCAL_PROMPT_DUMP_RETENTION_DAYS) ??
		DEFAULT_LOCAL_PROMPT_DUMP_RETENTION_DAYS;
	if (retentionDays < 1) {
		return { removedCount: 0, cutoffDate: null };
	}

	const now = params.now ?? new Date();
	const pruneIntervalMs =
		parsePositiveIntEnv(env.FASTCHAT_LOCAL_PROMPT_DUMP_PRUNE_INTERVAL_MS) ??
		DEFAULT_LOCAL_PROMPT_DUMP_PRUNE_INTERVAL_MS;
	const nowMs = now.getTime();
	if (
		!params.force &&
		lastLocalPromptDumpPruneAtMs > 0 &&
		nowMs - lastLocalPromptDumpPruneAtMs < pruneIntervalMs
	) {
		return { removedCount: 0, cutoffDate: null };
	}

	lastLocalPromptDumpPruneAtMs = nowMs;
	const cutoffDate = getRetentionCutoffDate(now, retentionDays);
	let removedCount = 0;

	try {
		for (const entry of readdirSync(params.dumpDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const fullPath = join(params.dumpDir, entry.name);
			const datedFilename = readDatedFilename(entry.name);
			const candidateDate =
				datedFilename ?? formatUtcDate(new Date(statSync(fullPath).mtimeMs));
			if (candidateDate < cutoffDate) {
				unlinkSync(fullPath);
				removedCount += 1;
			}
		}
	} catch {
		return { removedCount: 0, cutoffDate };
	}

	return { removedCount, cutoffDate };
}
