// apps/web/src/lib/server/model-incidents.ts
//
// Admin reads of `llm_call_incidents` (stalled and failed model calls). The table
// is service-role only and not in the generated database types yet, so reads go
// through an untyped view of the admin client and are shaped by
// `ModelIncidentRow`. Every read of a person's incident is logged by the caller
// (`logAdminChatContentAccess`, privacy claim K4).
import type { SupabaseClient } from '@supabase/supabase-js';
import { error, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	MODEL_INCIDENT_LIST_COLUMNS,
	type ModelIncidentRow
} from '$lib/services/admin/model-incidents/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The list's window and filters, read from the page URL. */
export type ModelIncidentFilters = {
	days: number;
	kind: 'stall' | 'error' | null;
	lane: string | null;
	passRole: string | null;
	provider: string | null;
};

const DAY_CHOICES = [1, 3, 7, 14] as const;
export const MODEL_INCIDENT_DAY_CHOICES = DAY_CHOICES;
const LIST_LIMIT = 500;

const shortText = (value: string | null) => {
	const text = value?.trim();
	return text && text.length <= 120 ? text : null;
};

export function modelIncidentFiltersFromUrl(url: URL): ModelIncidentFilters {
	const days = Number(url.searchParams.get('days'));
	const kind = url.searchParams.get('kind');
	return {
		days: (DAY_CHOICES as readonly number[]).includes(days) ? days : 7,
		kind: kind === 'stall' || kind === 'error' ? kind : null,
		lane: shortText(url.searchParams.get('lane')),
		passRole: shortText(url.searchParams.get('pass_role')),
		provider: shortText(url.searchParams.get('provider'))
	};
}

type AdminUser = { id: string };

/** The signed-in admin, or a redirect. Page loads run beside the admin layout, so each checks. */
export async function requireModelIncidentAdmin(locals: App.Locals): Promise<AdminUser> {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');
	if (!user.is_admin) throw redirect(303, '/today');
	return { id: user.id };
}

function incidentTable() {
	// Untyped: the table is not in the generated types yet.
	return (createAdminSupabaseClient() as unknown as SupabaseClient).from('llm_call_incidents');
}

export async function listModelIncidents(
	filters: ModelIncidentFilters
): Promise<{ rows: ModelIncidentRow[]; truncated: boolean }> {
	const since = new Date(Date.now() - filters.days * 86_400_000).toISOString();
	let query = incidentTable()
		.select(MODEL_INCIDENT_LIST_COLUMNS)
		.gte('created_at', since)
		.order('created_at', { ascending: false })
		.limit(LIST_LIMIT + 1);
	if (filters.kind) query = query.eq('kind', filters.kind);
	if (filters.lane) query = query.eq('lane', filters.lane);
	if (filters.passRole) query = query.eq('pass_role', filters.passRole);
	if (filters.provider) query = query.eq('provider', filters.provider);
	const { data, error: queryError } = await query;
	if (queryError)
		throw error(500, `Could not load model incidents (${queryError.code ?? 'error'})`);
	const rows = (data ?? []) as unknown as ModelIncidentRow[];
	return { rows: rows.slice(0, LIST_LIMIT), truncated: rows.length > LIST_LIMIT };
}

export async function getModelIncident(id: string): Promise<ModelIncidentRow> {
	if (!UUID.test(id)) throw error(404, 'Incident not found');
	const { data, error: queryError } = await incidentTable()
		.select('*')
		.eq('id', id)
		.maybeSingle();
	if (queryError) throw error(500, `Could not load the incident (${queryError.code ?? 'error'})`);
	if (!data) throw error(404, 'Incident not found (incidents are kept for 14 days)');
	return data as unknown as ModelIncidentRow;
}

/** Other incidents from the same turn, oldest first, for the detail page. */
export async function listTurnSiblings(row: ModelIncidentRow): Promise<ModelIncidentRow[]> {
	if (!row.turn_run_id) return [];
	const { data } = await incidentTable()
		.select(MODEL_INCIDENT_LIST_COLUMNS)
		.eq('turn_run_id', row.turn_run_id)
		.neq('id', row.id)
		.order('created_at', { ascending: true })
		.limit(20);
	return (data ?? []) as unknown as ModelIncidentRow[];
}

/** Emails for the people whose calls these were, so the admin can tell rows apart. */
export async function incidentUserEmails(
	userIds: Array<string | null>
): Promise<Record<string, string>> {
	const ids = [...new Set(userIds.filter((id): id is string => !!id))];
	if (!ids.length) return {};
	const { data } = await createAdminSupabaseClient()
		.from('users')
		.select('id, email')
		.in('id', ids.slice(0, 200));
	return Object.fromEntries((data ?? []).map((user) => [user.id, user.email ?? user.id]));
}
