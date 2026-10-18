// scripts/agentic/llm-incidents.ts
//
// Read stalled and failed model calls captured by the chat worker
// (`llm_call_incidents`, provider/openrouter/call-capture.ts). Free and read-only:
// service-key GETs, no model calls, nothing written to the database.
//
//   pnpm agentic:incidents                 # the last 7 days, newest first
//   pnpm agentic:incidents --days 1 --kind stall
//   pnpm agentic:incidents <incident id>   # writes a readable page and prints its path
//
// Pages go to .prompt-dumps/incidents/ (gitignored): the timeline, the longest
// silence, how a stalled request eventually ended, OpenRouter's record of the
// generation, what came back, and what was sent (email, calendar and web results
// are stored as content-free traces). Opening an incident is an admin read of a
// person's chat content, so it is recorded in `security_events` first
// (admin.chat_content.read, privacy claim K4), unless the row is the reader's own
// (INCIDENTS_ACTOR_USER_ID in apps/web/.env). Local pages older than 14 days, the
// table's own window, are deleted on every run.
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { renderIncident, renderIncidentList } from './llm-incidents-render';

const root = fileURLToPath(new URL('../../', import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_COLUMNS = [
	'id',
	'created_at',
	'lane',
	'kind',
	'reason',
	'pass_role',
	'model_requested',
	'model_used',
	'provider',
	'http_status',
	'duration_ms',
	'eventual'
].join(',');

const PAGE_RETENTION_MS = 14 * 86_400_000;

function database() {
	const path = resolve(root, 'apps/web/.env');
	if (!existsSync(path)) throw new Error('Missing apps/web/.env');
	const env = parse(readFileSync(path));
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PRIVATE_SUPABASE_SERVICE_KEY;
	if (!url || !key) {
		throw new Error('apps/web/.env needs PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY');
	}
	const actor = UUID.test(env.INCIDENTS_ACTOR_USER_ID ?? '')
		? env.INCIDENTS_ACTOR_USER_ID!
		: null;
	const get = async (query: string): Promise<Array<Record<string, unknown>>> => {
		const response = await fetch(`${url}/rest/v1/${query}`, {
			headers: { apikey: key, Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(30_000)
		});
		const body = await response.text();
		if (!response.ok)
			throw new Error(`llm_call_incidents → ${response.status}: ${body.slice(0, 200)}`);
		return JSON.parse(body) as Array<Record<string, unknown>>;
	};
	/** One `security_events` row for opening a person's incident; throws when it is not written. */
	const logRead = async (incidentId: string, targetUserId: string | null): Promise<void> => {
		if (targetUserId && targetUserId === actor) return;
		const response = await fetch(`${url}/rest/v1/security_events`, {
			method: 'POST',
			headers: {
				apikey: key,
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json',
				Prefer: 'return=minimal'
			},
			body: JSON.stringify({
				event_type: 'admin.chat_content.read',
				category: 'admin',
				outcome: 'success',
				severity: 'low',
				actor_type: 'admin',
				actor_user_id: actor,
				target_type: 'llm_call_incident',
				target_id: incidentId,
				metadata: {
					route: 'scripts/agentic/llm-incidents',
					target_user_ids: targetUserId ? [targetUserId] : [],
					target_user_count: targetUserId ? 1 : 0,
					rows: { llm_call_incidents: 1 },
					operator: userInfo().username
				}
			}),
			signal: AbortSignal.timeout(30_000)
		});
		if (!response.ok) {
			throw new Error(
				`Could not record the read (security_events → ${response.status}); not opening it`
			);
		}
	};
	return { get, logRead };
}

/** Pages hold prompts; they last no longer than the rows they came from. */
function pruneOldPages(directory: string): void {
	if (!existsSync(directory)) return;
	for (const name of readdirSync(directory)) {
		if (!name.endsWith('.md')) continue;
		const file = resolve(directory, name);
		if (Date.now() - statSync(file).mtimeMs > PAGE_RETENTION_MS) unlinkSync(file);
	}
}

async function main() {
	const args = process.argv.slice(2);
	const { get, logRead } = database();
	const directory = resolve(root, '.prompt-dumps/incidents');
	pruneOldPages(directory);
	const id = args.find((arg) => UUID.test(arg));
	if (id) {
		const [row] = await get(`llm_call_incidents?select=*&id=eq.${id}`);
		if (!row) throw new Error(`No incident ${id}`);
		await logRead(id, typeof row.user_id === 'string' ? row.user_id : null);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		const file = resolve(directory, `${id}.md`);
		writeFileSync(file, renderIncident(row) + '\n', { mode: 0o600 });
		chmodSync(file, 0o600);
		console.log(file);
		return;
	}
	const flag = (name: string) => {
		const index = args.indexOf(name);
		return index >= 0 ? args[index + 1] : undefined;
	};
	const days = Number(flag('--days') ?? 7);
	if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');
	const kind = flag('--kind');
	if (kind && kind !== 'stall' && kind !== 'error') throw new Error('--kind is stall or error');
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const rows = await get(
		`llm_call_incidents?select=${LIST_COLUMNS}` +
			`&created_at=gte.${encodeURIComponent(since)}` +
			(kind ? `&kind=eq.${kind}` : '') +
			'&order=created_at.desc&limit=200'
	);
	console.log(renderIncidentList(rows));
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
