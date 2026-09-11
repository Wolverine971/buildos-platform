// apps/worker/src/workers/agentic-chat/promptDump.ts
// Local diagnostics only. Capture at the HTTP boundary, after provider routing
// and tool filtering, so later rounds and reviewer prompts are represented too.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_DIRECTORY = resolve(__dirname, '../../../.prompt-dumps');
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPrunedAt = 0;

export type LocalPromptDumpIdentity = {
	sessionId: string;
	turnRunId: string;
	streamRunId: string;
	clientTurnId: string;
	executionGeneration: number;
	logicalProviderRound: number;
	providerRound: string;
	passRole: string;
	providerAttempt: number;
	routeId: string;
	usageLogId: string;
};

export function localPromptDumpsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	// An opt-in cannot enable dumps in production, tests, or a hosted Railway
	// service accidentally configured as development.
	return (
		env.NODE_ENV === 'development' &&
		!env.VITEST &&
		!env.RAILWAY_ENVIRONMENT_ID &&
		!env.RAILWAY_ENVIRONMENT_NAME &&
		!env.RAILWAY_SERVICE_ID &&
		/^(true|1|yes|on)$/i.test(env.AGENTIC_CHAT_LOCAL_PROMPT_DUMPS?.trim() ?? '')
	);
}

export type LocalPromptDump = {
	jsonFile: string;
	markdownFile: string;
	recordEvent(event: unknown): void;
	complete(outcome: Record<string, unknown>): void;
};

export function startLocalPromptDump(
	identity: LocalPromptDumpIdentity,
	serializedRequestBody: string,
	options: { env?: NodeJS.ProcessEnv; directory?: string; now?: number } = {}
): LocalPromptDump | null {
	const env = options.env ?? process.env;
	if (!localPromptDumpsEnabled(env)) return null;
	const configuredDirectory = env.AGENTIC_CHAT_LOCAL_PROMPT_DUMP_DIRECTORY?.trim();
	const directory =
		options.directory ??
		(configuredDirectory ? resolve(configuredDirectory) : DEFAULT_DIRECTORY);
	const now = options.now ?? Date.now();
	const timestamp = new Date(now).toISOString();
	const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
	const stem = [
		timestamp.replace(/:/g, '-'),
		safe(identity.turnRunId),
		`g${identity.executionGeneration}-r${identity.logicalProviderRound}`,
		safe(identity.passRole),
		`a${identity.providerAttempt}`,
		safe(identity.routeId),
		randomUUID()
	].join('--');
	const jsonFile = `${stem}.json`;
	const markdownFile = `${stem}.md`;
	try {
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		const request = JSON.parse(serializedRequestBody) as Record<string, unknown>;
		const events: unknown[] = [];
		const record = {
			version: 'agentic-chat-local-prompt-v1',
			capturedAt: timestamp,
			...identity,
			requestBodySha256: createHash('sha256').update(serializedRequestBody).digest('hex'),
			request,
			responseEvents: events,
			outcome: { status: 'pending' } as Record<string, unknown>
		};
		const write = () => {
			atomicWrite(join(directory, jsonFile), JSON.stringify(record, null, 2));
			atomicWrite(join(directory, markdownFile), renderDump(record));
		};
		// Persist before fetch: a crash or cancellation still leaves the request.
		write();
		atomicWrite(
			join(directory, 'latest.json'),
			JSON.stringify({ capturedAt: timestamp, ...identity, jsonFile, markdownFile }, null, 2)
		);
		atomicWrite(
			join(directory, 'latest.md'),
			`# Most recent model request\n\n${timestamp} · ${identity.passRole} · round ${identity.logicalProviderRound}\n\n` +
				`[Read prompt and outcome](./${markdownFile}) · [Request JSON](./${jsonFile})\n\n` +
				`Session: ${identity.sessionId}\n\nTurn: ${identity.turnRunId}\n`
		);
		try {
			prunePromptDumps(directory, now);
		} catch {
			warnDumpFailure();
		}
		let completed = false;
		return {
			jsonFile,
			markdownFile,
			recordEvent(event) {
				events.push(event);
			},
			complete(outcome) {
				if (completed) return;
				completed = true;
				record.outcome = { completedAt: new Date().toISOString(), ...outcome };
				try {
					write();
				} catch {
					warnDumpFailure();
				}
			}
		};
	} catch {
		warnDumpFailure();
		return null;
	}
}

function atomicWrite(path: string, content: string): void {
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporary, content + '\n', { mode: 0o600, flag: 'wx' });
		renameSync(temporary, path);
	} finally {
		try {
			unlinkSync(temporary);
		} catch {
			/* Renamed or never created. */
		}
	}
}

function prunePromptDumps(directory: string, now: number): void {
	if (lastPrunedAt && now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
	lastPrunedAt = now;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		// Only remove this writer's dated files; preserve latest pointers and
		// manually saved notes. Filename time is unaffected by outcome updates.
		if (!entry.isFile() || !/^\d{4}-\d{2}-\d{2}T.*--.*\.(json|md)$/.test(entry.name)) continue;
		const date = entry.name.slice(0, 24).replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
		if (Date.parse(date) < now - RETENTION_MS) unlinkSync(join(directory, entry.name));
	}
}

function renderDump(
	record: LocalPromptDumpIdentity & {
		capturedAt: string;
		requestBodySha256: string;
		request: Record<string, unknown>;
		responseEvents: unknown[];
		outcome: Record<string, unknown>;
	}
): string {
	const json = (value: unknown) => JSON.stringify(value, null, 2) ?? 'null';
	// Use a fence longer than any prompt fence so embedded code stays readable.
	const fence = (value: string) => {
		const length = Math.max(
			3,
			...Array.from(value.matchAll(/`+/g), (match) => match[0].length + 1)
		);
		const ticks = '`'.repeat(length);
		return `${ticks}\n${value}\n${ticks}`;
	};
	const { messages, ...settings } = record.request;
	return [
		`# ${record.passRole} · round ${record.logicalProviderRound} · attempt ${record.providerAttempt}`,
		`Captured: ${record.capturedAt}\n\nSession: ${record.sessionId}\n\nTurn: ${record.turnRunId}\n\nUsage log: ${record.usageLogId}\n\nRequest SHA-256: ${record.requestBodySha256}`,
		'## Outcome',
		fence(json(record.outcome)),
		'## Messages sent to the model (in order)',
		...(Array.isArray(messages) ? messages : []).flatMap((message, index) => {
			const { role, content, ...extra } = message;
			return [
				`### ${index + 1}. ${role}`,
				fence(typeof content === 'string' ? content : json(content)),
				...(Object.keys(extra).length ? [fence(json(extra))] : [])
			];
		}),
		'## Tools and request settings',
		fence(json(settings)),
		'## Response events',
		fence(json(record.responseEvents))
	].join('\n\n');
}

function warnDumpFailure(): void {
	// Do not log errors containing prompt contents, credentials, or signed URLs.
	console.warn('[Agentic Chat] Could not write local prompt dump; continuing the turn.');
}
