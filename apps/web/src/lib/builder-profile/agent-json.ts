// apps/web/src/lib/builder-profile/agent-json.ts
//
// What an agent gets for a builder page: build-os.com/@handle.json and the
// get_builder_profile MCP tool return this shape. It is the visitor's view as data,
// with a plain instruction for how to ask.

import type { BuilderProfileView } from './types';
import { stageLabel } from './format';

export interface BuilderProfileAgentJson {
	handle: string;
	name: string | null;
	headline: string | null;
	location: string | null;
	bio: string | null;
	url: string;
	now: string | null;
	links: { label: string | null; url: string; kind: string }[];
	projects: {
		id: string;
		name: string;
		pitch: string | null;
		stage: string;
		last_active_at: string | null;
		goals?: string[];
		next_milestone?: { title: string; due_at: string };
		this_week?: string;
		looking_for?: string;
		you_can?: string[];
		your_access?: 'member';
	}[];
	activity_last_year: { active_days: number; changes: number; with_agents_pct: number } | null;
	writing: { title: string; url: string }[];
	how_to_ask: string;
}

export function builderProfileUrl(origin: string, handle: string): string {
	return `${origin.replace(/\/$/, '')}/@${handle}`;
}

export function toAgentJson(view: BuilderProfileView, origin: string): BuilderProfileAgentJson {
	const handle = view.profile.handle;
	const yearAgo = (() => {
		const t = Date.parse(`${view.activity?.today ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
		return new Date(t - 365 * 86_400_000).toISOString().slice(0, 10);
	})();
	let activity: BuilderProfileAgentJson['activity_last_year'] = null;
	if (view.activity) {
		const days = view.activity.days.filter(([day]) => day > yearAgo);
		const changes = days.reduce((sum, [, c]) => sum + c, 0);
		const agents = days.reduce((sum, [, , a]) => sum + a, 0);
		activity = {
			active_days: days.filter(([, c]) => c > 0).length,
			changes,
			with_agents_pct: changes > 0 && view.activity.show_agent_split ? Math.round((100 * agents) / changes) : 0
		};
	}
	const hasLive = view.projects.some((p) => p.level === 'live');
	return {
		handle,
		name: view.profile.name ?? null,
		headline: view.profile.headline ?? null,
		location: view.profile.location ?? null,
		bio: view.profile.bio ?? null,
		url: builderProfileUrl(origin, handle),
		now: view.profile.now_text ?? null,
		links: view.links.map((l) => ({ label: l.label ?? null, url: l.url, kind: l.kind })),
		projects: view.projects.map((p) => {
			const item: BuilderProfileAgentJson['projects'][number] = {
				id: p.id,
				name: p.name,
				pitch: p.pitch ?? null,
				stage: stageLabel(p).toLowerCase(),
				last_active_at: p.last_active_at ?? null
			};
			if (p.level === 'live') {
				if (p.goals?.length) item.goals = p.goals;
				if (p.next_milestone) item.next_milestone = p.next_milestone;
				if (p.this_week) item.this_week = p.this_week;
				if (p.looking_for) item.looking_for = p.looking_for;
				if (p.viewer_is_member) item.your_access = 'member';
				else item.you_can = ['follow', 'ask_to_join'];
			}
			return item;
		}),
		activity_last_year: activity,
		writing: view.writing.map((w) => ({ title: w.title, url: `${origin.replace(/\/$/, '')}${w.url_path}` })),
		how_to_ask: hasLive
			? `To ask to join a project, call request_buildos_access with handle "${handle}" and the project name as project_hint, or have your person press "Ask to join" on the page. ${view.profile.name ?? 'The owner'} decides. Agents can ask; only people grant.`
			: `To ask for access, call request_buildos_access with handle "${handle}". The owner decides. Agents can ask; only people grant.`
	};
}
