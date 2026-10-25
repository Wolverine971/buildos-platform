// apps/worker/src/workers/brief/builderFollowsBriefSection.ts
// Builder profiles (build-os.com/@handle) in the daily brief. Two short parts, both pure data
// and formatting: no model call, and never part of the LLM prompt.
// - "From People You Follow": weekly lines that people the user follows published since the
//   last brief. A line shows only if the author's public page would show it to this user
//   (the same rules as get_builder_profile in 20261024020000_builder_profiles.sql).
// - "Your Page": a nudge when the user's own page has drafted lines waiting.
import type { BuilderFollowsBriefLine, BuilderFollowsBriefSection } from './ontologyBriefTypes.js';

export const BUILDER_FOLLOWS_LINE_CAP = 6;
// Far more than a day of weekly lines; the cap above applies after the visibility checks.
const CANDIDATE_LIMIT = 60;
export const BUILDER_PAGE_DRAFTS_HREF = '/profile/page?section=updates';

type LooseResult = { data: unknown; error: { message: string } | null; count?: number | null };
interface LooseQuery extends PromiseLike<LooseResult> {
	select(columns: string, options?: { count?: 'exact'; head?: boolean }): LooseQuery;
	eq(column: string, value: string): LooseQuery;
	in(column: string, values: readonly string[]): LooseQuery;
	is(column: string, value: null): LooseQuery;
	gte(column: string, value: string): LooseQuery;
	order(column: string, options: { ascending: boolean }): LooseQuery;
	limit(count: number): LooseQuery;
}
/** The builder_* tables are not in the generated Database types yet, so they are read loosely. */
export interface BuilderFollowsBriefClient {
	from(table: string): LooseQuery;
}

type FollowRow = { target_user_id: string; project_id: string | null };
type UpdateRow = {
	id: string;
	user_id: string;
	project_id: string | null;
	body: string;
	decided_at: string;
	project: {
		name: string | null;
		kind: string | null;
		deleted_at: string | null;
		archived_at: string | null;
	} | null;
};
type PlacementRow = {
	user_id: string;
	project_id: string;
	level: string;
	public_name: string | null;
	audience: string;
};
type UserRow = { id: string; name: string | null; username: string | null };
type ActorRow = { id: string; user_id: string };
type MemberRow = { project_id: string; actor_id: string; role_key: string };

async function rows<T>(query: LooseQuery, label: string): Promise<T[]> {
	const { data, error } = await query;
	if (error) throw new Error(`${label}: ${error.message}`);
	return (data ?? []) as T[];
}

const unique = (values: string[]) => [...new Set(values)];
const pairKey = (userId: string, projectId: string) => `${userId}:${projectId}`;

/** Published lines from people (or single projects) the user follows, newest first. */
async function loadFollowedLines(
	client: BuilderFollowsBriefClient,
	userId: string,
	since: Date
): Promise<BuilderFollowsBriefLine[]> {
	const follows = await rows<FollowRow>(
		client
			.from('builder_follows')
			.select('target_user_id, project_id')
			.eq('follower_user_id', userId),
		'builder_follows'
	);
	if (follows.length === 0) return [];

	// A whole-person follow (project_id NULL) takes every line; a project follow takes only
	// that project's lines.
	const wholePerson = new Set<string>();
	const followedProjects = new Set<string>();
	for (const follow of follows) {
		if (follow.project_id)
			followedProjects.add(pairKey(follow.target_user_id, follow.project_id));
		else wholePerson.add(follow.target_user_id);
	}

	const updates = await rows<UpdateRow>(
		client
			.from('builder_profile_updates')
			.select(
				'id, user_id, project_id, body, decided_at, project:onto_projects(name, kind, deleted_at, archived_at)'
			)
			.in('user_id', unique(follows.map((follow) => follow.target_user_id)))
			.eq('status', 'published')
			.gte('decided_at', since.toISOString())
			.order('decided_at', { ascending: false })
			.limit(CANDIDATE_LIMIT),
		'builder_profile_updates'
	);
	const candidates = updates.filter((update) =>
		update.project_id
			? wholePerson.has(update.user_id) ||
				followedProjects.has(pairKey(update.user_id, update.project_id))
			: wholePerson.has(update.user_id)
	);
	if (candidates.length === 0) return [];

	const authorIds = unique(candidates.map((update) => update.user_id));
	const projectLines = candidates.filter((update) => update.project_id);
	const projectAuthorIds = unique(projectLines.map((update) => update.user_id));
	const projectIds = unique(projectLines.map((update) => update.project_id as string));
	const hasProjectLines = projectLines.length > 0;

	const [profiles, users, placements, actors] = await Promise.all([
		rows<{ user_id: string }>(
			client
				.from('builder_profiles')
				.select('user_id')
				.in('user_id', authorIds)
				.eq('status', 'published'),
			'builder_profiles'
		),
		rows<UserRow>(
			client.from('users').select('id, name, username').in('id', authorIds),
			'users'
		),
		hasProjectLines
			? rows<PlacementRow>(
					client
						.from('builder_profile_projects')
						.select('user_id, project_id, level, public_name, audience')
						.in('user_id', projectAuthorIds)
						.in('project_id', projectIds),
					'builder_profile_projects'
				)
			: Promise.resolve([] as PlacementRow[]),
		hasProjectLines
			? rows<ActorRow>(
					client
						.from('onto_actors')
						.select('id, user_id')
						.in('user_id', [userId, ...projectAuthorIds]),
					'onto_actors'
				)
			: Promise.resolve([] as ActorRow[])
	]);

	// Memberships of the reader and the project authors in live (not deleted) projects. They
	// answer both page rules for project lines: the author still owns the project, and a
	// collaborators-only card is visible because the reader shares a project with the author.
	const memberships =
		hasProjectLines && actors.length > 0
			? await rows<MemberRow>(
					client
						.from('onto_project_members')
						.select('project_id, actor_id, role_key, onto_projects!inner(deleted_at)')
						.in(
							'actor_id',
							actors.map((actor) => actor.id)
						)
						.is('removed_at', null)
						.is('onto_projects.deleted_at', null),
					'onto_project_members'
				)
			: [];

	const userByActor = new Map(actors.map((actor) => [actor.id, actor.user_id]));
	const membersByProject = new Map<string, Set<string>>();
	const owned = new Set<string>();
	for (const member of memberships) {
		const memberUserId = userByActor.get(member.actor_id);
		if (!memberUserId) continue;
		const members = membersByProject.get(member.project_id) ?? new Set<string>();
		members.add(memberUserId);
		membersByProject.set(member.project_id, members);
		if (member.role_key === 'owner') owned.add(pairKey(memberUserId, member.project_id));
	}
	const worksWithReader = new Set<string>();
	for (const members of membersByProject.values()) {
		if (!members.has(userId)) continue;
		for (const memberUserId of members) worksWithReader.add(memberUserId);
	}

	const published = new Set(profiles.map((profile) => profile.user_id));
	const userById = new Map(users.map((user) => [user.id, user]));
	const placementByPair = new Map(
		placements.map((placement) => [pairKey(placement.user_id, placement.project_id), placement])
	);

	const lines: BuilderFollowsBriefLine[] = [];
	for (const update of candidates) {
		if (!published.has(update.user_id)) continue;
		const author = userById.get(update.user_id);
		// No handle means no page to point at.
		const username = author?.username?.trim();
		if (!author || !username) continue;

		let projectLabel: string | null = null;
		if (update.project_id) {
			const pair = pairKey(update.user_id, update.project_id);
			const placement = placementByPair.get(pair);
			const project = update.project;
			// Weekly lines show only on live cards of projects the author still owns.
			if (!placement || placement.level !== 'live' || !owned.has(pair)) continue;
			if (!project || project.deleted_at || project.archived_at) continue;
			if ((project.kind ?? 'project') !== 'project') continue;
			if (placement.audience !== 'anyone' && !worksWithReader.has(update.user_id)) continue;
			projectLabel =
				placement.public_name?.trim() || project.name?.trim() || 'Untitled project';
		}

		// One bullet per line, even if the body has line breaks.
		const body = update.body.replace(/\s+/g, ' ').trim();
		if (!body) continue;
		lines.push({
			updateId: update.id,
			authorUserId: update.user_id,
			authorLabel: author.name?.trim() || `@${username}`,
			username,
			projectLabel,
			body,
			publishedAt: update.decided_at
		});
	}
	return lines;
}

async function countDraftedUpdates(client: BuilderFollowsBriefClient, userId: string) {
	const { count, error } = await client
		.from('builder_profile_updates')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('status', 'drafted');
	if (error) throw new Error(`builder_profile_updates drafts: ${error.message}`);
	return count ?? 0;
}

/**
 * Loads both parts. Never throws: a failed read drops that part (fails closed) so the brief
 * still ships. Null when there is nothing to show.
 */
export async function fetchBuilderFollowsBriefSection(
	client: BuilderFollowsBriefClient,
	userId: string,
	since: Date
): Promise<BuilderFollowsBriefSection | null> {
	const [lines, draftedCount] = await Promise.all([
		loadFollowedLines(client, userId, since).catch((error) => {
			console.warn('[BuilderFollowsBrief] Skipping lines from people you follow:', error);
			return [] as BuilderFollowsBriefLine[];
		}),
		countDraftedUpdates(client, userId).catch((error) => {
			console.warn('[BuilderFollowsBrief] Skipping drafted-updates count:', error);
			return 0;
		})
	]);
	if (lines.length === 0 && draftedCount === 0) return null;
	return {
		lines: lines.slice(0, BUILDER_FOLLOWS_LINE_CAP),
		lineCount: lines.length,
		draftedCount
	};
}

/** Other people's text renders literally: no links, images, HTML or emphasis of their own. */
function escapeInlineMarkdown(text: string): string {
	return text.replace(/([\\`*_[\]<~])/g, '\\$1');
}

/**
 * "From People You Follow" and "Your Page". Deterministic, and empty when there is nothing to
 * show. Must render above "## Project Details", which the email cuts off.
 */
export function formatBuilderFollowsSection(
	section: BuilderFollowsBriefSection | null | undefined
): string {
	if (!section || (section.lines.length === 0 && section.draftedCount === 0)) return '';
	let markdown = '';
	if (section.lines.length > 0) {
		markdown += `## From People You Follow\n\n`;
		for (const line of section.lines) {
			const page = `/@${encodeURIComponent(line.username.toLowerCase())}`;
			const where = line.projectLabel ? escapeInlineMarkdown(line.projectLabel) : 'Now';
			markdown += `- [${escapeInlineMarkdown(line.authorLabel)}](${page}) · **${where}** — ${escapeInlineMarkdown(line.body)}\n`;
		}
		if (section.lineCount > section.lines.length) {
			markdown += `- ... and ${section.lineCount - section.lines.length} more\n`;
		}
		markdown += '\n';
	}
	if (section.draftedCount > 0) {
		const one = section.draftedCount === 1;
		markdown += `## Your Page\n\n`;
		markdown += `Your page has ${section.draftedCount} drafted ${one ? 'update' : 'updates'} waiting. [Publish, edit or skip ${one ? 'it' : 'them'}](${BUILDER_PAGE_DRAFTS_HREF}).\n\n`;
	}
	return markdown;
}
