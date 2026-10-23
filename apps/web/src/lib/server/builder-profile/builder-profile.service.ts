// apps/web/src/lib/server/builder-profile/builder-profile.service.ts
//
// Builder profiles on the server: read the public page (one RPC that fails closed),
// load and save the owner's editor, publish, follow, ask to join, and count views and
// link taps. All writes use the admin client after the route has checked who is asking;
// the tables are read-only to signed-in users (see 20261024020000_builder_profiles.sql).

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeLinkUrl } from '$lib/builder-profile/links';
import type {
	BuilderAudience,
	BuilderEditorData,
	BuilderEditorLink,
	BuilderEditorPlacement,
	BuilderEditorProject,
	BuilderLinkKind,
	BuilderProfileResult,
	BuilderProfileSettings,
	BuilderProfileUpdateDraft,
	BuilderProfileView,
	BuilderProjectLevel
} from '$lib/builder-profile/types';

type Client = SupabaseClient<any>;

export const MAX_LINKS = 30;
export const MAX_PROJECTS = 24;
export const MAX_BIO = 280;
const ACTIVITY_MAX_AGE_MS = 20 * 60 * 60 * 1000;

export class BuilderProfileError extends Error {
	constructor(
		message: string,
		public status: 400 | 403 | 404 | 409 | 429 = 400
	) {
		super(message);
	}
}

// ---- Reading the page --------------------------------------------------------

/** The page as the current visitor sees it (anon or signed in, via their own client). */
export async function loadBuilderProfile(
	supabase: Client,
	handle: string
): Promise<BuilderProfileResult> {
	const { data, error } = await supabase.rpc('get_builder_profile', { p_handle: handle });
	if (error) throw error;
	return normalizeResult(data);
}

/** The page as a given user sees it (server on their behalf: agents, JSON). */
export async function loadBuilderProfileAs(
	admin: Client,
	handle: string,
	viewerId: string | null
): Promise<BuilderProfileResult> {
	const { data, error } = await admin.rpc('get_builder_profile', {
		p_handle: handle,
		p_viewer: viewerId
	});
	if (error) throw error;
	return normalizeResult(data);
}

function normalizeResult(data: unknown): BuilderProfileResult {
	const value = data as Partial<BuilderProfileView> | null;
	if (!value || value.found !== true) return { found: false };
	return {
		...value,
		links: value.links ?? [],
		projects: value.projects ?? [],
		writing: value.writing ?? [],
		builds_with: value.builds_with ?? []
	} as BuilderProfileView;
}

export interface BuilderTarget {
	user_id: string;
	username: string;
	status: 'draft' | 'published';
	activity_refreshed_at: string | null;
}

export async function resolveBuilderTarget(admin: Client, handle: string): Promise<BuilderTarget | null> {
	const { data, error } = await admin.rpc('builder_profile_target', { p_handle: handle });
	if (error) throw error;
	const row = (Array.isArray(data) ? data[0] : data) as BuilderTarget | undefined;
	return row?.user_id ? row : null;
}

export async function refreshActivity(admin: Client, userId: string): Promise<void> {
	const { error } = await admin.rpc('refresh_builder_profile_activity', { p_user_id: userId });
	if (error) throw error;
}

export function activityIsStale(refreshedAt: string | null | undefined, now = Date.now()): boolean {
	if (!refreshedAt) return true;
	const t = Date.parse(refreshedAt);
	return Number.isNaN(t) || now - t > ACTIVITY_MAX_AGE_MS;
}

// ---- Editor ------------------------------------------------------------------

async function ensureProfileRow(admin: Client, userId: string) {
	const { error } = await admin
		.from('builder_profiles')
		.upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
	if (error) throw error;
}

async function actorIdFor(admin: Client, userId: string): Promise<string | null> {
	const { data } = await admin
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	return (data as { id?: string } | null)?.id ?? null;
}

function glyphsOf(iconEmoji: unknown): string[] {
	const glyphs = (iconEmoji as { glyphs?: unknown } | null)?.glyphs;
	return Array.isArray(glyphs) ? glyphs.filter((g): g is string => typeof g === 'string').slice(0, 2) : [];
}

function readSettings(row: Record<string, any> | null, bio: string | null): BuilderProfileSettings {
	return {
		headline: row?.headline ?? null,
		location: row?.location ?? null,
		avatar_url: row?.avatar_url ?? null,
		now_text: row?.now_text ?? null,
		bio,
		show_build_log: row?.show_build_log !== false,
		build_log_includes_private: row?.build_log_includes_private === true,
		show_agent_split: row?.show_agent_split !== false,
		show_writing: row?.show_writing !== false,
		show_builds_with: row?.show_builds_with !== false,
		show_on_collaborator_pages: row?.show_on_collaborator_pages === true,
		weekly_drafts: row?.weekly_drafts !== false
	};
}

/** The projects a user owns (real projects, not the Workspace), newest activity first. */
export async function loadOwnedProjects(admin: Client, userId: string) {
	const actorId = await actorIdFor(admin, userId);
	if (!actorId) return [];
	const { data, error } = await admin
		.from('onto_project_members')
		.select(
			'project:onto_projects!inner(id, name, description, icon_emoji, facet_stage, state_key, kind, deleted_at, archived_at)'
		)
		.eq('actor_id', actorId)
		.eq('role_key', 'owner')
		.is('removed_at', null);
	if (error) throw error;
	return ((data ?? []) as any[])
		.map((row) => row.project)
		.filter(
			(p) => p && !p.deleted_at && !p.archived_at && (p.kind ?? 'project') === 'project'
		) as {
		id: string;
		name: string;
		description: string | null;
		icon_emoji: unknown;
		facet_stage: string | null;
		state_key: string | null;
	}[];
}

export async function loadEditorData(params: {
	admin: Client;
	userId: string;
	signInAvatarUrl?: string | null;
}): Promise<BuilderEditorData> {
	const { admin, userId } = params;
	await ensureProfileRow(admin, userId);

	const [userResult, profileResult, linksResult, placementsResult, draftsResult, owned] =
		await Promise.all([
			admin
				.from('users')
				.select('username, name, bio, discoverability')
				.eq('id', userId)
				.maybeSingle(),
			admin.from('builder_profiles').select('*').eq('user_id', userId).maybeSingle(),
			admin
				.from('builder_profile_links')
				.select('id, kind, url, label, note, audience, position')
				.eq('user_id', userId)
				.order('position', { ascending: true }),
			admin.from('builder_profile_projects').select('*').eq('user_id', userId),
			admin
				.from('builder_profile_updates')
				.select('id, project_id, body, status, week_of, created_at')
				.eq('user_id', userId)
				.eq('status', 'drafted')
				.order('created_at', { ascending: false })
				.limit(20),
			loadOwnedProjects(admin, userId)
		]);
	for (const result of [userResult, profileResult, linksResult, placementsResult, draftsResult]) {
		if (result.error) throw result.error;
	}

	const profileRow = profileResult.data as Record<string, any> | null;
	if (activityIsStale(profileRow?.activity_refreshed_at)) {
		await refreshActivity(admin, userId).catch((error) =>
			console.error('[BuilderProfile] activity refresh failed', error)
		);
	}

	const ids = owned.map((p) => p.id);
	const [membersResult, goalsResult, milestonesResult, activityResult] = ids.length
		? await Promise.all([
				admin
					.from('onto_project_members')
					.select('project_id')
					.in('project_id', ids)
					.is('removed_at', null),
				admin
					.from('onto_goals')
					.select('id, project_id, name, state_key, created_at')
					.in('project_id', ids)
					.is('deleted_at', null)
					.order('created_at', { ascending: true }),
				admin
					.from('onto_milestones')
					.select('project_id, title, due_at, state_key')
					.in('project_id', ids)
					.is('deleted_at', null)
					.in('state_key', ['pending', 'in_progress'])
					.gte('due_at', new Date(Date.now() - 86_400_000).toISOString())
					.order('due_at', { ascending: true }),
				admin
					.from('builder_profile_activity_daily')
					.select('project_id, day, changes, by_agents')
					.eq('user_id', userId)
					.in('project_id', ids)
			])
		: [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

	const memberCounts = new Map<string, number>();
	for (const row of (membersResult.data ?? []) as { project_id: string }[]) {
		memberCounts.set(row.project_id, (memberCounts.get(row.project_id) ?? 0) + 1);
	}
	const goals = new Map<string, { id: string; name: string }[]>();
	for (const g of (goalsResult.data ?? []) as any[]) {
		if (g.state_key === 'abandoned') continue;
		const list = goals.get(g.project_id) ?? [];
		list.push({ id: g.id, name: g.name });
		goals.set(g.project_id, list);
	}
	const milestones = new Map<string, { title: string; due_at: string }>();
	for (const m of (milestonesResult.data ?? []) as any[]) {
		if (!milestones.has(m.project_id) && m.due_at) {
			milestones.set(m.project_id, { title: m.title, due_at: m.due_at });
		}
	}
	const activity = new Map<string, { last: string | null; changes: number; agents: number }>();
	const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
	for (const row of (activityResult.data ?? []) as any[]) {
		const entry = activity.get(row.project_id) ?? { last: null, changes: 0, agents: 0 };
		if (!entry.last || row.day > entry.last) entry.last = row.day;
		if (row.day > yearAgo) {
			entry.changes += row.changes;
			entry.agents += row.by_agents;
		}
		activity.set(row.project_id, entry);
	}
	const placements = new Map<string, BuilderEditorPlacement>();
	for (const row of (placementsResult.data ?? []) as any[]) {
		placements.set(row.project_id, {
			level: row.level,
			public_name: row.public_name,
			pitch: row.pitch,
			looking_for: row.looking_for,
			link_url: row.link_url,
			goal_ids: row.goal_ids ?? [],
			show_next_milestone: row.show_next_milestone !== false,
			this_week: row.this_week,
			audience: row.audience,
			position: row.position ?? 0
		});
	}

	const projects: BuilderEditorProject[] = owned.map((p) => {
		const act = activity.get(p.id);
		return {
			project_id: p.id,
			name: p.name,
			description: p.description,
			glyphs: glyphsOf(p.icon_emoji),
			stage: p.facet_stage,
			state: p.state_key,
			member_count: memberCounts.get(p.id) ?? 1,
			last_active_at: act?.last ? `${act.last}T12:00:00Z` : null,
			changes_year: act?.changes ?? 0,
			by_agents_year: act?.agents ?? 0,
			goals: goals.get(p.id) ?? [],
			next_milestone: milestones.get(p.id) ?? null,
			placement: placements.get(p.id) ?? null
		};
	});
	projects.sort((a, b) => {
		if (a.placement && b.placement) return a.placement.position - b.placement.position;
		if (a.placement) return -1;
		if (b.placement) return 1;
		return (b.last_active_at ?? '').localeCompare(a.last_active_at ?? '');
	});

	const projectNames = new Map(owned.map((p) => [p.id, p.name]));
	const drafts: BuilderProfileUpdateDraft[] = ((draftsResult.data ?? []) as any[]).map((d) => ({
		id: d.id,
		project_id: d.project_id,
		project_name: d.project_id ? (projectNames.get(d.project_id) ?? null) : null,
		body: d.body,
		status: d.status,
		week_of: d.week_of,
		created_at: d.created_at
	}));

	const userRow = userResult.data as Record<string, any> | null;
	return {
		handle: userRow?.username ?? null,
		name: userRow?.name ?? null,
		status: profileRow?.status === 'published' ? 'published' : 'draft',
		published_at: profileRow?.published_at ?? null,
		discoverability: userRow?.discoverability === 'handle' ? 'handle' : 'none',
		settings: readSettings(profileRow, userRow?.bio ?? null),
		links: ((linksResult.data ?? []) as any[]).map((l) => ({
			id: l.id,
			kind: l.kind,
			url: l.url,
			label: l.label,
			note: l.note,
			audience: l.audience
		})),
		projects,
		drafts,
		sign_in_avatar_url: params.signInAvatarUrl ?? null
	};
}

// ---- Saving ------------------------------------------------------------------

function cleanText(value: unknown, max: number, field: string): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') throw new BuilderProfileError(`${field} must be text`);
	const trimmed = value.replace(/\s+/g, ' ').trim();
	if (!trimmed) return null;
	if (trimmed.length > max) throw new BuilderProfileError(`${field} can be at most ${max} characters`);
	return trimmed;
}

function cleanAudience(value: unknown): BuilderAudience {
	return value === 'collaborators' ? 'collaborators' : 'anyone';
}

function weekOf(date = new Date()): string {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const day = d.getUTCDay();
	d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
	return d.toISOString().slice(0, 10);
}

/** A published line followers see in their brief (the Now line or a project's weekly line). */
async function recordPublishedLine(
	admin: Client,
	userId: string,
	projectId: string | null,
	body: string
) {
	const { error } = await admin.from('builder_profile_updates').insert({
		user_id: userId,
		project_id: projectId,
		body,
		status: 'published',
		source: 'owner',
		week_of: weekOf(),
		decided_at: new Date().toISOString()
	});
	if (error) console.error('[BuilderProfile] could not record published line', error);
}

const BOOLEAN_SETTINGS = [
	'show_build_log',
	'build_log_includes_private',
	'show_agent_split',
	'show_writing',
	'show_builds_with',
	'show_on_collaborator_pages',
	'weekly_drafts'
] as const;

export async function saveSettings(params: {
	admin: Client;
	userId: string;
	patch: Record<string, unknown>;
}): Promise<void> {
	const { admin, userId, patch } = params;
	await ensureProfileRow(admin, userId);
	const update: Record<string, unknown> = {};
	if ('headline' in patch) update.headline = cleanText(patch.headline, 120, 'Headline');
	if ('location' in patch) update.location = cleanText(patch.location, 80, 'Location');
	if ('avatar_url' in patch) {
		if (patch.avatar_url === null || patch.avatar_url === '') update.avatar_url = null;
		else {
			const url = normalizeLinkUrl(String(patch.avatar_url));
			if (!url || !url.startsWith('https://')) throw new BuilderProfileError('Photo must be an https link');
			update.avatar_url = url;
		}
	}
	let nowChanged: string | null = null;
	if ('now_text' in patch) {
		const next = cleanText(patch.now_text, 160, 'Now');
		const { data: current } = await admin
			.from('builder_profiles')
			.select('now_text')
			.eq('user_id', userId)
			.maybeSingle();
		if ((current as any)?.now_text !== next) {
			update.now_text = next;
			update.now_updated_at = next ? new Date().toISOString() : null;
			nowChanged = next;
		}
	}
	for (const key of BOOLEAN_SETTINGS) {
		if (key in patch) {
			if (typeof patch[key] !== 'boolean') throw new BuilderProfileError(`${key} must be true or false`);
			update[key] = patch[key];
		}
	}
	if (Object.keys(update).length > 0) {
		const { error } = await admin.from('builder_profiles').update(update).eq('user_id', userId);
		if (error) throw error;
	}
	if ('bio' in patch) {
		const bio = cleanText(patch.bio, MAX_BIO, 'Bio');
		const { error } = await admin.from('users').update({ bio }).eq('id', userId);
		if (error) throw error;
	}
	if (nowChanged) await recordPublishedLine(admin, userId, null, nowChanged);
}

export function parseLinks(input: unknown): BuilderEditorLink[] {
	if (!Array.isArray(input)) throw new BuilderProfileError('Links must be a list');
	if (input.length > MAX_LINKS) throw new BuilderProfileError(`You can add up to ${MAX_LINKS} links`);
	return input.map((raw, index) => {
		const item = (raw ?? {}) as Record<string, unknown>;
		const url = normalizeLinkUrl(typeof item.url === 'string' ? item.url : '');
		if (!url) throw new BuilderProfileError(`Link ${index + 1} needs a web address that starts with https://`);
		const kind: BuilderLinkKind = item.kind === 'social' ? 'social' : 'link';
		return {
			kind,
			url,
			label: cleanText(item.label, 80, 'Link title'),
			note: cleanText(item.note, 120, 'Link note'),
			audience: cleanAudience(item.audience)
		};
	});
}

export async function replaceLinks(params: { admin: Client; userId: string; links: BuilderEditorLink[] }) {
	const { admin, userId, links } = params;
	const del = await admin.from('builder_profile_links').delete().eq('user_id', userId);
	if (del.error) throw del.error;
	if (links.length === 0) return;
	const { error } = await admin.from('builder_profile_links').insert(
		links.map((link, position) => ({ user_id: userId, ...link, id: undefined, position }))
	);
	if (error) throw error;
}

export interface PlacementInput extends Omit<BuilderEditorPlacement, 'position'> {
	project_id: string;
}

export function parsePlacements(input: unknown): PlacementInput[] {
	if (!Array.isArray(input)) throw new BuilderProfileError('Projects must be a list');
	if (input.length > MAX_PROJECTS) {
		throw new BuilderProfileError(`You can put up to ${MAX_PROJECTS} projects on your page`);
	}
	const seen = new Set<string>();
	return input.map((raw) => {
		const item = (raw ?? {}) as Record<string, unknown>;
		const projectId = typeof item.project_id === 'string' ? item.project_id : '';
		if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new BuilderProfileError('Unknown project');
		if (seen.has(projectId)) throw new BuilderProfileError('A project is listed twice');
		seen.add(projectId);
		const level: BuilderProjectLevel = item.level === 'live' ? 'live' : 'listed';
		const goalIds = Array.isArray(item.goal_ids)
			? item.goal_ids.filter((g): g is string => typeof g === 'string' && /^[0-9a-f-]{36}$/i.test(g))
			: [];
		if (goalIds.length > 3) throw new BuilderProfileError('Pick up to 3 goals per project');
		let linkUrl: string | null = null;
		if (typeof item.link_url === 'string' && item.link_url.trim()) {
			linkUrl = normalizeLinkUrl(item.link_url);
			if (!linkUrl) throw new BuilderProfileError('Project link needs a web address that starts with https://');
		}
		return {
			project_id: projectId,
			level,
			public_name: cleanText(item.public_name, 80, 'Public name'),
			pitch: cleanText(item.pitch, 200, 'Pitch'),
			looking_for: cleanText(item.looking_for, 200, 'Looking for'),
			link_url: linkUrl,
			goal_ids: goalIds,
			show_next_milestone: item.show_next_milestone !== false,
			this_week: cleanText(item.this_week, 220, 'This week'),
			audience: cleanAudience(item.audience)
		};
	});
}

export async function replacePlacements(params: {
	admin: Client;
	userId: string;
	placements: PlacementInput[];
}) {
	const { admin, userId, placements } = params;
	const owned = new Set((await loadOwnedProjects(admin, userId)).map((p) => p.id));
	for (const p of placements) {
		if (!owned.has(p.project_id)) {
			throw new BuilderProfileError('You can only put projects you own on your page', 403);
		}
	}
	const { data: existing, error: existingError } = await admin
		.from('builder_profile_projects')
		.select('project_id, this_week')
		.eq('user_id', userId);
	if (existingError) throw existingError;
	const previous = new Map(((existing ?? []) as any[]).map((r) => [r.project_id, r.this_week]));

	const keep = placements.map((p) => p.project_id);
	const removed = [...previous.keys()].filter((id) => !keep.includes(id));
	if (removed.length) {
		const { error } = await admin
			.from('builder_profile_projects')
			.delete()
			.eq('user_id', userId)
			.in('project_id', removed);
		if (error) throw error;
	}
	if (placements.length === 0) return;

	const now = new Date().toISOString();
	const rows = placements.map((p, position) => {
		const changedLine = p.this_week && p.this_week !== previous.get(p.project_id);
		return {
			user_id: userId,
			...p,
			position,
			...(changedLine ? { this_week_at: now } : {}),
			...(!p.this_week ? { this_week_at: null } : {})
		};
	});
	const { error } = await admin
		.from('builder_profile_projects')
		.upsert(rows, { onConflict: 'user_id,project_id' });
	if (error) {
		if ((error as any).code === '22023') throw new BuilderProfileError(error.message);
		if ((error as any).code === '42501') throw new BuilderProfileError(error.message, 403);
		throw error;
	}
	for (const p of placements) {
		if (p.level === 'live' && p.this_week && p.this_week !== previous.get(p.project_id)) {
			await recordPublishedLine(admin, userId, p.project_id, p.this_week);
		}
	}
}

export async function setPublished(params: { admin: Client; userId: string; publish: boolean }) {
	const { admin, userId, publish } = params;
	await ensureProfileRow(admin, userId);
	if (publish) {
		const { data: user } = await admin.from('users').select('username').eq('id', userId).maybeSingle();
		if (!(user as any)?.username) {
			throw new BuilderProfileError('Pick a handle first. Your page lives at build-os.com/@handle.', 409);
		}
		// A published page is findable by its handle, so people can ask from it.
		const { error: findError } = await admin
			.from('users')
			.update({ discoverability: 'handle' })
			.eq('id', userId)
			.eq('discoverability', 'none');
		if (findError) throw findError;
	}
	const { error } = await admin
		.from('builder_profiles')
		.update(
			publish
				? { status: 'published', published_at: new Date().toISOString() }
				: { status: 'draft' }
		)
		.eq('user_id', userId);
	if (error) throw error;
	if (publish) await refreshActivity(admin, userId);
}

// ---- Visitors: follow, ask, events -----------------------------------------------

export async function follow(params: {
	admin: Client;
	viewerId: string;
	handle: string;
	projectId: string | null;
	on: boolean;
}): Promise<{ following: boolean }> {
	const { admin, viewerId, handle, projectId, on } = params;
	const target = await resolveBuilderTarget(admin, handle);
	if (!target || target.status !== 'published') throw new BuilderProfileError('Page not found', 404);
	if (target.user_id === viewerId) throw new BuilderProfileError('You can’t follow yourself');

	if (!on) {
		let query = admin
			.from('builder_follows')
			.delete()
			.eq('follower_user_id', viewerId)
			.eq('target_user_id', target.user_id);
		query = projectId ? query.eq('project_id', projectId) : query.is('project_id', null);
		const { error } = await query;
		if (error) throw error;
		return { following: false };
	}

	if (projectId) {
		const view = await loadBuilderProfileAs(admin, handle, viewerId);
		const card = view.found ? view.projects.find((p) => p.id === projectId) : null;
		if (!card || card.level !== 'live') throw new BuilderProfileError('That project isn’t on this page', 404);
	}
	const { data, error } = await admin
		.from('builder_follows')
		.insert({ follower_user_id: viewerId, target_user_id: target.user_id, project_id: projectId })
		.select('id');
	if (error && (error as any).code !== '23505') throw error;
	if (!error && data?.length) {
		await admin
			.rpc('bump_builder_profile_stat', { p_user_id: target.user_id, p_kind: 'follow' })
			.then(({ error: bumpError }) => bumpError && console.error(bumpError));
	}
	return { following: true };
}

export type AskOutcome = 'sent' | 'already_waiting' | 'unavailable' | 'declined_recently' | 'rate_limited';

export async function askToJoin(params: {
	supabase: Client;
	admin: Client;
	viewerId: string;
	handle: string;
	projectId: string;
	note: string | null;
}): Promise<AskOutcome> {
	const { supabase, admin, viewerId, handle, projectId } = params;
	const view = await loadBuilderProfileAs(admin, handle, viewerId);
	if (!view.found || view.status !== 'published') throw new BuilderProfileError('Page not found', 404);
	if (view.viewer.is_owner) throw new BuilderProfileError('This is your page');
	const card = view.projects.find((p) => p.id === projectId);
	if (!card || card.level !== 'live') throw new BuilderProfileError('That project isn’t on this page', 404);
	if (card.viewer_is_member) throw new BuilderProfileError('You’re already in this project', 409);

	const note = params.note?.trim().slice(0, 400) || null;
	const { data, error } = await supabase.rpc('create_people_request', {
		p_handle: view.profile.handle,
		p_role: 'viewer',
		p_project_hint: card.name,
		p_note: note ? `From your page, about ${card.name}: ${note}` : `Asked from your page to join ${card.name}.`
	});
	if (error) throw error;
	const result = (data ?? {}) as { status?: string; already_pending?: boolean };
	switch (result.status) {
		case 'pending': {
			if (result.already_pending) return 'already_waiting';
			const target = await resolveBuilderTarget(admin, handle);
			if (target) {
				await admin
					.rpc('bump_builder_profile_stat', { p_user_id: target.user_id, p_kind: 'ask' })
					.then(({ error: bumpError }) => bumpError && console.error(bumpError));
			}
			return 'sent';
		}
		case 'declined_recently':
			return 'declined_recently';
		case 'rate_limited':
			return 'rate_limited';
		default:
			return 'unavailable';
	}
}

export async function recordEvent(params: {
	admin: Client;
	handle: string;
	kind: 'view' | 'link_tap';
	viewerId: string | null;
}): Promise<boolean> {
	const target = await resolveBuilderTarget(params.admin, params.handle);
	if (!target || target.status !== 'published') return false;
	if (params.viewerId && params.viewerId === target.user_id) return false;
	const { error } = await params.admin.rpc('bump_builder_profile_stat', {
		p_user_id: target.user_id,
		p_kind: params.kind
	});
	if (error) throw error;
	return true;
}

// ---- Old author index (/p/{slug_prefix}) -------------------------------------------

/**
 * The published builder page that replaces an author index at /p/{slug}: the slug is
 * either the author's public-page prefix (from their name) or their handle.
 */
export async function builderHandleForAuthorSlug(admin: Client, slug: string): Promise<string | null> {
	const direct = await resolveBuilderTarget(admin, slug).catch(() => null);
	if (direct?.status === 'published') return direct.username;

	const { data: page } = await admin
		.from('onto_public_pages')
		.select('published_by, created_by')
		.eq('slug_prefix', slug)
		.is('deleted_at', null)
		.limit(1)
		.maybeSingle();
	const actorId = (page as any)?.published_by ?? (page as any)?.created_by;
	if (!actorId) return null;
	const { data: actor } = await admin.from('onto_actors').select('user_id').eq('id', actorId).maybeSingle();
	const userId = (actor as any)?.user_id;
	if (!userId) return null;
	const { data: user } = await admin.from('users').select('username').eq('id', userId).maybeSingle();
	const username = (user as any)?.username;
	if (!username) return null;
	const target = await resolveBuilderTarget(admin, username).catch(() => null);
	return target?.status === 'published' ? target.username : null;
}
