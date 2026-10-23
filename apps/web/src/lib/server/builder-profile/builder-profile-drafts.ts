// apps/web/src/lib/server/builder-profile/builder-profile-drafts.ts
//
// BuildOS drafts the owner's words; the owner approves them. Two drafts:
// * "Draft my page": a headline, a short bio and one pitch per picked project.
//   Returned as suggestions, never saved directly.
// * The weekly update: a Now line and one "this week" line per live project, from what
//   got done. Saved as drafted rows the owner publishes, edits or skips (in the editor,
//   and flagged in their daily brief).
// Raw task titles go to the model as input only; the prompt asks for general wording
// with no names of clients, prospects or other people.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuilderPageDraftSuggestion } from '$lib/builder-profile/types';
import { BuilderProfileError, loadOwnedProjects } from './builder-profile.service';

type Client = SupabaseClient<any>;

/** The slice of SmartLLMService these drafts use (keeps tests free of the real client). */
export interface DraftLLM {
	getJSONResponse<T = unknown>(options: {
		systemPrompt: string;
		userPrompt: string;
		userId?: string;
		profile?: 'fast' | 'balanced' | 'powerful' | 'maximum' | 'custom';
		temperature?: number;
		operationType?: string;
		projectId?: string;
	}): Promise<T>;
}

const PRIVACY_RULES = [
	'Never name clients, customers, prospects, family members, or any other person or company the user works for or with. Describe the kind of work instead.',
	'Never include private details: money owed or earned, health, legal matters, job searching, or anything about family life.',
	'Use only facts from the notes. Do not invent results, numbers, or dates.',
	'Write plainly, the way the person would say it. No hype, no buzzwords, no emoji, no hashtags. Do not mention AI unless the project itself is about AI.'
].join('\n- ');

function clip(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const text = value.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
	if (!text) return null;
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,;:\s]+$/, '')}…`;
}

// ---- Draft my page ------------------------------------------------------------------

export async function draftPage(params: {
	llm: DraftLLM;
	admin: Client;
	userId: string;
	projectIds: string[];
}): Promise<BuilderPageDraftSuggestion> {
	const { llm, admin, userId } = params;
	const owned = await loadOwnedProjects(admin, userId);
	const wanted = new Set(params.projectIds);
	const projects = owned.filter((p) => wanted.has(p.id)).slice(0, 8);

	const { data: user } = await admin.from('users').select('name, bio').eq('id', userId).maybeSingle();
	const { data: goals } = projects.length
		? await admin
				.from('onto_goals')
				.select('project_id, name')
				.in(
					'project_id',
					projects.map((p) => p.id)
				)
				.is('deleted_at', null)
				.limit(40)
		: { data: [] };
	const goalsByProject = new Map<string, string[]>();
	for (const g of (goals ?? []) as { project_id: string; name: string }[]) {
		const list = goalsByProject.get(g.project_id) ?? [];
		if (list.length < 3) list.push(g.name);
		goalsByProject.set(g.project_id, list);
	}

	const input = {
		name: (user as any)?.name ?? null,
		current_bio: (user as any)?.bio ?? null,
		projects: projects.map((p) => ({
			project_id: p.id,
			name: p.name,
			description: (p.description ?? '').slice(0, 500),
			goals: goalsByProject.get(p.id) ?? [],
			stage: p.facet_stage
		}))
	};

	const systemPrompt = [
		'You draft the public page of someone who builds things, from their own project notes.',
		'Return JSON only: {"headline": string, "bio": string, "pitches": [{"project_id": string, "pitch": string}]}.',
		'- headline: up to 8 words, what they do or build (for example "Founder, BuildOS" or "Writer and podcast producer").',
		'- bio: one or two sentences in the first person, up to 240 characters, specific to their projects.',
		'- pitches: one per project in the input, one sentence each, up to 140 characters, saying what the project is for so a stranger gets it.',
		`- ${PRIVACY_RULES}`
	].join('\n');

	const result = await llm.getJSONResponse<{
		headline?: unknown;
		bio?: unknown;
		pitches?: { project_id?: unknown; pitch?: unknown }[];
	}>({
		systemPrompt,
		userPrompt: JSON.stringify(input, null, 2),
		userId,
		profile: 'fast',
		temperature: 0.4,
		operationType: 'builder_profile_draft_page'
	});

	const allowed = new Set(projects.map((p) => p.id));
	return {
		headline: clip(result?.headline, 80),
		bio: clip(result?.bio, 240),
		pitches: (Array.isArray(result?.pitches) ? result.pitches : [])
			.map((p) => ({
				project_id: typeof p?.project_id === 'string' ? p.project_id : '',
				pitch: clip(p?.pitch, 160) ?? ''
			}))
			.filter((p) => allowed.has(p.project_id) && p.pitch)
	};
}

// ---- Weekly update ------------------------------------------------------------------

function mondayOf(date = new Date()): string {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return d.toISOString().slice(0, 10);
}

/**
 * Drafts this week's Now line and one line per live project with something done.
 * Replaces any drafts still waiting. Returns how many drafts were written (0 = nothing
 * moved this week, so nothing to say).
 */
export async function draftWeeklyUpdates(params: {
	llm: DraftLLM;
	admin: Client;
	userId: string;
	now?: Date;
}): Promise<{ created: number }> {
	const { llm, admin, userId } = params;
	const now = params.now ?? new Date();
	const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();

	const { data: placements, error } = await admin
		.from('builder_profile_projects')
		.select('project_id, level, public_name, pitch, project:onto_projects!inner(name, deleted_at, archived_at)')
		.eq('user_id', userId);
	if (error) throw error;
	const onPage = ((placements ?? []) as any[]).filter(
		(p) => p.project && !p.project.deleted_at && !p.project.archived_at
	);
	if (onPage.length === 0) return { created: 0 };
	const ids = onPage.map((p) => p.project_id);

	const [{ data: done }, { data: activity }] = await Promise.all([
		admin
			.from('onto_tasks')
			.select('project_id, title, updated_at')
			.in('project_id', ids)
			.eq('state_key', 'done')
			.is('deleted_at', null)
			.gte('updated_at', since)
			.order('updated_at', { ascending: false })
			.limit(80),
		admin
			.from('builder_profile_activity_daily')
			.select('project_id, changes')
			.eq('user_id', userId)
			.in('project_id', ids)
			.gte('day', since.slice(0, 10))
	]);
	const doneByProject = new Map<string, string[]>();
	for (const t of (done ?? []) as { project_id: string; title: string }[]) {
		const list = doneByProject.get(t.project_id) ?? [];
		if (list.length < 12) list.push(String(t.title ?? '').slice(0, 140));
		doneByProject.set(t.project_id, list);
	}
	const changesByProject = new Map<string, number>();
	for (const row of (activity ?? []) as { project_id: string; changes: number }[]) {
		changesByProject.set(row.project_id, (changesByProject.get(row.project_id) ?? 0) + row.changes);
	}

	const projects = onPage.map((p) => ({
		project_id: p.project_id,
		name: p.public_name || p.project.name,
		pitch: p.pitch ?? null,
		live: p.level === 'live',
		done_this_week: doneByProject.get(p.project_id) ?? [],
		changes_this_week: changesByProject.get(p.project_id) ?? 0
	}));
	const anyMovement = projects.some((p) => p.done_this_week.length > 0 || p.changes_this_week > 0);
	if (!anyMovement) return { created: 0 };

	const systemPrompt = [
		'You draft a weekly update for someone\'s public builder page, from what they finished this week.',
		'Return JSON only: {"now": string | null, "projects": [{"project_id": string, "line": string}]}.',
		'- now: one short sentence, up to 140 characters, present tense, what they are focused on right now (for example "Building project sharing in BuildOS."). Null if nothing moved.',
		'- projects: only for projects with "live": true and at least one item in done_this_week. One sentence each, past tense, up to 180 characters, what moved this week in general terms. Combine items; never copy a task title word for word.',
		`- ${PRIVACY_RULES}`
	].join('\n');

	const result = await llm.getJSONResponse<{
		now?: unknown;
		projects?: { project_id?: unknown; line?: unknown }[];
	}>({
		systemPrompt,
		userPrompt: JSON.stringify({ week_ending: now.toISOString().slice(0, 10), projects }, null, 2),
		userId,
		profile: 'fast',
		temperature: 0.4,
		operationType: 'builder_profile_weekly_draft'
	});

	const liveWithDone = new Set(
		projects.filter((p) => p.live && p.done_this_week.length > 0).map((p) => p.project_id)
	);
	const weekOf = mondayOf(now);
	const rows: { user_id: string; project_id: string | null; body: string; week_of: string }[] = [];
	const nowLine = clip(result?.now, 160);
	if (nowLine) rows.push({ user_id: userId, project_id: null, body: nowLine, week_of: weekOf });
	for (const item of Array.isArray(result?.projects) ? result.projects : []) {
		const projectId = typeof item?.project_id === 'string' ? item.project_id : '';
		const line = clip(item?.line, 220);
		if (line && liveWithDone.has(projectId) && !rows.some((r) => r.project_id === projectId)) {
			rows.push({ user_id: userId, project_id: projectId, body: line, week_of: weekOf });
		}
	}
	if (rows.length === 0) return { created: 0 };

	const cleared = await admin
		.from('builder_profile_updates')
		.delete()
		.eq('user_id', userId)
		.eq('status', 'drafted');
	if (cleared.error) throw cleared.error;
	const inserted = await admin
		.from('builder_profile_updates')
		.insert(rows.map((r) => ({ ...r, status: 'drafted', source: 'drafted' })));
	if (inserted.error) throw inserted.error;
	return { created: rows.length };
}

/** Publish (optionally edited) or skip one drafted line. */
export async function decideDraft(params: {
	admin: Client;
	userId: string;
	draftId: string;
	action: 'publish' | 'skip';
	body?: string | null;
}): Promise<void> {
	const { admin, userId, draftId, action } = params;
	const { data: draft, error } = await admin
		.from('builder_profile_updates')
		.select('id, project_id, body, status')
		.eq('id', draftId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw error;
	if (!draft || (draft as any).status !== 'drafted') {
		throw new BuilderProfileError('That draft is gone. Refresh to see what is waiting.', 404);
	}
	const now = new Date().toISOString();
	if (action === 'skip') {
		const { error: skipError } = await admin
			.from('builder_profile_updates')
			.update({ status: 'skipped', decided_at: now })
			.eq('id', draftId);
		if (skipError) throw skipError;
		return;
	}

	const limit = (draft as any).project_id ? 220 : 160;
	const body = clip(params.body ?? (draft as any).body, limit);
	if (!body) throw new BuilderProfileError('Write something first, or skip it.');
	const { error: publishError } = await admin
		.from('builder_profile_updates')
		.update({ status: 'published', body, decided_at: now })
		.eq('id', draftId);
	if (publishError) throw publishError;

	if ((draft as any).project_id) {
		const { error: applyError } = await admin
			.from('builder_profile_projects')
			.update({ this_week: body, this_week_at: now })
			.eq('user_id', userId)
			.eq('project_id', (draft as any).project_id);
		if (applyError) throw applyError;
	} else {
		const { error: applyError } = await admin
			.from('builder_profiles')
			.update({ now_text: body, now_updated_at: now })
			.eq('user_id', userId);
		if (applyError) throw applyError;
	}
}
