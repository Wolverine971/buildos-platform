// scripts/agentic/preflight.ts
import referenceData from './reference-data.json';
import { isMultiCalendarUserAllowed } from '../../packages/shared-agent-ops/src/calendar/google-calendar-feature';

/** Called only after the gate has established database isolation. No user data is copied. */
export async function prepareGateDatabase(env: Record<string, string>, request = fetch) {
	if (env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
		throw new Error('Gate database must be isolated');
	const headers = {
		apikey: env.PRIVATE_SUPABASE_SERVICE_KEY!,
		Authorization: `Bearer ${env.PRIVATE_SUPABASE_SERVICE_KEY}`,
		'Content-Type': 'application/json',
		Prefer: 'resolution=merge-duplicates'
	};
	async function rest(path: string, body?: unknown) {
		const response = await request(`${env.PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(15_000)
		});
		if (!response.ok)
			throw new Error(
				`Gate database preflight failed at ${path.split('?')[0]} (${response.status})`
			);
		const text = await response.text();
		return text ? JSON.parse(text) : null;
	}
	await rest('onto_facet_definitions?on_conflict=key', referenceData.definitions);
	await rest('onto_facet_values?on_conflict=facet_key,value', referenceData.values);
	const definitions = await rest('onto_facet_definitions?select=key,allowed_values,applies_to');
	const values = await rest('onto_facet_values?select=facet_key,value');
	for (const expected of referenceData.definitions) {
		const actual = definitions.find((row: { key: string }) => row.key === expected.key);
		if (
			!actual ||
			expected.allowed_values.some((value) => !actual.allowed_values.includes(value))
		) {
			throw new Error(`Gate reference data incomplete: ${expected.key}`);
		}
	}
	for (const expected of referenceData.values) {
		if (
			!values.some(
				(row: { facet_key: string; value: string }) =>
					row.facet_key === expected.facet_key && row.value === expected.value
			)
		) {
			throw new Error(
				`Gate reference value missing: ${expected.facet_key}/${expected.value}`
			);
		}
	}
	const invalid = await rest('rpc/validate_facet_values', {
		p_scope: 'project',
		p_facets: { context: 'client', scale: 'small', stage: 'planning' }
	});
	if (!Array.isArray(invalid) || invalid.length)
		throw new Error('Gate valid-facet RPC check failed');
	return {
		referenceVersion: referenceData.version,
		definitions: 3,
		values: 20,
		facetRpc: 'passed'
	};
}

export function assertGateCalendarConfiguration(env: Record<string, string>) {
	const missing = [
		'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
		'PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET',
		'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1'
	].filter((key) => !env[key]?.trim());
	if (missing.length)
		throw new Error(
			`Gate calendar setup incomplete: ${missing.join(', ')}. Connect a dedicated QA Google Calendar before rerunning; Case 10 is required.`
		);
	if (
		Buffer.byteLength(env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1!, 'utf8') < 32 ||
		env.PRIVATE_GOOGLE_CALENDAR_CLIENT_ID === env.PRIVATE_GOOGLE_CLIENT_ID
	) {
		throw new Error(
			'Gate calendar requires a valid encryption key and dedicated Calendar OAuth client'
		);
	}
}

/** Metadata only; a real read in Case 10 still has to prove complete coverage. */
export async function assertGateCalendarConnection(env: Record<string, string>, request = fetch) {
	if (env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
		throw new Error('Gate database must be isolated');
	const read = async (path: string) => {
		const response = await request(`${env.PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
			headers: {
				apikey: env.PRIVATE_SUPABASE_SERVICE_KEY!,
				Authorization: `Bearer ${env.PRIVATE_SUPABASE_SERVICE_KEY}`
			},
			signal: AbortSignal.timeout(15_000)
		});
		if (!response.ok)
			throw new Error(`Gate calendar metadata preflight failed (${response.status})`);
		return response.json();
	};
	const users = await read(
		`users?select=id&email=eq.${encodeURIComponent(env.AGENTIC_TEST_USER_EMAIL!)}`
	);
	if (users.length !== 1)
		throw new Error('Provision the dedicated gate user and connect its QA Google Calendar');
	if (!isMultiCalendarUserAllowed(users[0].id, env))
		throw new Error(
			'Gate calendar requires PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED=true and the gate user ID in PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS'
		);
	const connections = await read(
		`user_calendar_connections?select=id&user_id=eq.${users[0].id}&provider=eq.google_calendar&status=eq.active&deleted_at=is.null`
	);
	if (!connections.length)
		throw new Error('Gate user has no active QA Google Calendar connection');
	const sources = await read(
		`user_calendar_sources?select=id&user_id=eq.${users[0].id}&connection_id=in.(${connections.map((row: { id: string }) => row.id).join(',')})&read_enabled=eq.true&deleted_at=is.null&provider_deleted_at=is.null`
	);
	if (!sources.length) throw new Error('Gate user has no readable QA calendar source');
}

/**
 * Known per-run spend of a complete three-repetition gate by acting model, measured from
 * OpenRouter usage counters. The gate refuses any model outside the allowlist so a stale
 * cost estimate for one model can never authorize a run on a dearer one (2026-09-22:
 * $1.70 on unbiased/pareto against a $0.50 approval).
 */
export const GATE_MODEL_RUN_COST_USD: Record<string, number> = {
	'deepseek/deepseek-v4.1-flash': 0.29,
	'unbiased/pareto': 1.66
};
export const DEFAULT_GATE_ALLOWED_MODELS = ['deepseek/deepseek-v4.1-flash'];

export function assertGateModelAllowed(env: Record<string, string | undefined>): {
	model: string;
	knownRunCostUsd: number | null;
} {
	const model = env.AGENTIC_CHAT_OPENROUTER_MODEL?.trim() ?? '';
	if (!model) throw new Error('Gate env file must set AGENTIC_CHAT_OPENROUTER_MODEL explicitly.');
	const allowed = (env.AGENTIC_GATE_ALLOWED_MODELS ?? DEFAULT_GATE_ALLOWED_MODELS.join(','))
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	const knownRunCostUsd = GATE_MODEL_RUN_COST_USD[model] ?? null;
	if (!allowed.includes(model)) {
		const cost = knownRunCostUsd === null ? 'unknown' : `about $${knownRunCostUsd.toFixed(2)}`;
		throw new Error(
			`Gate refused acting model "${model}" (known three-repetition spend: ${cost}). Allowed: ${allowed.join(', ')}. To run it anyway with the user's explicit approval for that cost, set AGENTIC_GATE_ALLOWED_MODELS to include it.`
		);
	}
	return { model, knownRunCostUsd };
}
