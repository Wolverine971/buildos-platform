// apps/web/src/lib/builder-profile/types.ts
//
// Builder profiles: the public page at /@handle (spec:
// docs/specs/BUILDER_PROFILE_SPEC_2026-10-23.md). These types mirror what
// public.get_builder_profile returns, and what the editor in
// Profile > People & agents reads and writes.

export type BuilderAudience = 'anyone' | 'collaborators';
export type BuilderProjectLevel = 'listed' | 'live';
export type BuilderLinkKind = 'social' | 'link';
export type BuilderProfileStatus = 'draft' | 'published';

export interface BuilderProfileLink {
	id: string;
	kind: BuilderLinkKind;
	url: string;
	label?: string;
	note?: string;
	audience: BuilderAudience;
}

export interface BuilderProfileMilestone {
	title: string;
	due_at: string;
}

export interface BuilderProfileProjectCard {
	id: string;
	level: BuilderProjectLevel;
	name: string;
	pitch?: string;
	link_url?: string;
	stage?: string;
	state?: string;
	glyphs?: string[];
	audience: BuilderAudience;
	last_active_at?: string;
	goals?: string[];
	next_milestone?: BuilderProfileMilestone;
	looking_for?: string;
	this_week?: string;
	this_week_at?: string;
	/** Oldest first: [changes, by_agents] per week for the last 12 weeks. */
	weekly?: [number, number][];
	member_count?: number;
	viewer_is_member?: boolean;
	viewer_follows?: boolean;
}

export interface BuilderProfileActivity {
	includes_private: boolean;
	show_agent_split: boolean;
	/** YYYY-MM-DD in the owner's time zone. */
	today: string;
	/** [YYYY-MM-DD, changes, by_agents]; days with no activity are absent. */
	days: [string, number, number][];
}

export interface BuilderProfileWriting {
	title: string;
	summary?: string;
	url_path: string;
	published_at?: string;
}

export interface BuilderProfileCollaborator {
	handle: string;
	name?: string;
	headline?: string;
	avatar_url?: string;
}

export interface BuilderProfileStats {
	views_7d: number;
	views_28d: number;
	link_taps_28d: number;
	follows_28d: number;
	asks_28d: number;
	followers: number;
}

export interface BuilderProfileViewer {
	signed_in: boolean;
	is_owner: boolean;
	works_with: boolean;
	follows: boolean;
	ask_pending: boolean;
}

export interface BuilderProfileView {
	found: true;
	status: BuilderProfileStatus;
	viewer: BuilderProfileViewer;
	profile: {
		handle: string;
		name?: string;
		bio?: string;
		headline?: string;
		location?: string;
		avatar_url?: string;
		now_text?: string;
		now_updated_at?: string;
		member_since?: string;
		published_at?: string;
	};
	settings: {
		show_build_log: boolean;
		show_agent_split: boolean;
		show_writing: boolean;
		show_builds_with: boolean;
	};
	links: BuilderProfileLink[];
	projects: BuilderProfileProjectCard[];
	activity?: BuilderProfileActivity;
	writing: BuilderProfileWriting[];
	builds_with: BuilderProfileCollaborator[];
	/** Owner only. */
	stats?: BuilderProfileStats;
	/** Owner only. */
	activity_refreshed_at?: string;
}

export type BuilderProfileResult = BuilderProfileView | { found: false };

// ---- Editor ---------------------------------------------------------------

export interface BuilderProfileSettings {
	headline: string | null;
	location: string | null;
	avatar_url: string | null;
	now_text: string | null;
	bio: string | null;
	show_build_log: boolean;
	build_log_includes_private: boolean;
	show_agent_split: boolean;
	show_writing: boolean;
	show_builds_with: boolean;
	show_on_collaborator_pages: boolean;
	weekly_drafts: boolean;
}

export interface BuilderEditorLink {
	id?: string;
	kind: BuilderLinkKind;
	url: string;
	label: string | null;
	note: string | null;
	audience: BuilderAudience;
}

export interface BuilderEditorGoal {
	id: string;
	name: string;
}

/** One project the user owns, with its place on the page (or null = hidden). */
export interface BuilderEditorProject {
	project_id: string;
	name: string;
	description: string | null;
	glyphs: string[];
	stage: string | null;
	state: string | null;
	member_count: number;
	last_active_at: string | null;
	changes_year: number;
	by_agents_year: number;
	goals: BuilderEditorGoal[];
	next_milestone: BuilderProfileMilestone | null;
	placement: BuilderEditorPlacement | null;
}

export interface BuilderEditorPlacement {
	level: BuilderProjectLevel;
	public_name: string | null;
	pitch: string | null;
	looking_for: string | null;
	link_url: string | null;
	goal_ids: string[];
	show_next_milestone: boolean;
	this_week: string | null;
	audience: BuilderAudience;
	position: number;
}

export interface BuilderProfileUpdateDraft {
	id: string;
	project_id: string | null;
	project_name: string | null;
	body: string;
	status: 'drafted' | 'published' | 'skipped';
	week_of: string;
	created_at: string;
}

export interface BuilderEditorData {
	handle: string | null;
	name: string | null;
	status: BuilderProfileStatus;
	published_at: string | null;
	discoverability: 'none' | 'handle';
	settings: BuilderProfileSettings;
	links: BuilderEditorLink[];
	projects: BuilderEditorProject[];
	drafts: BuilderProfileUpdateDraft[];
	/** The photo on the user's Google sign-in, offered as a one-tap avatar. */
	sign_in_avatar_url: string | null;
}

/** What "Draft my page" suggests. Nothing is saved until the owner accepts it. */
export interface BuilderPageDraftSuggestion {
	headline: string | null;
	bio: string | null;
	pitches: { project_id: string; pitch: string }[];
}
