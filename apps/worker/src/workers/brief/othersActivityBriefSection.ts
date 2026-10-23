// apps/worker/src/workers/brief/othersActivityBriefSection.ts
// "While you were away" in the daily brief: what other people, their agents, and your own
// agents changed on your projects and on projects shared with you since your last brief.
// Grouped by project, one line per person or agent with a few linked items.
// Everything here is plain data and formatting. The LLM only sees the short summary from
// formatOthersActivityForPrompt.
import { subDays, subHours } from 'date-fns';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type {
	OntoProjectWithRelations,
	OthersActivityActor,
	OthersActivityBriefSection,
	OthersActivityEntityKind,
	OthersActivityItem,
	OthersActivityProject,
	OthersActivityVerb
} from './ontologyBriefTypes.js';
import { isWorkspaceProjectRow } from './workspaceBriefSection.js';

export const OTHERS_ACTIVITY_CAPS = {
	PROJECTS_PER_GROUP: 5,
	ACTORS_PER_PROJECT: 4,
	ITEMS_PER_LINE: 3,
	ITEMS_KEPT_PER_ACTOR: 5,
	PROMPT_LINES: 8,
	/** Rows read per brief. Your own edits are filtered out in the query, so they can't crowd others out. */
	LOG_ROWS: 1000
} as const;

const REPORTED_KINDS: readonly OthersActivityEntityKind[] = [
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk'
];
const QUERIED_ACTIONS = ['created', 'updated', 'deleted', 'completed', 'state_changed'] as const;

// The state a kind reaches when it is finished. These are type_key-style state values, not prose.
const FINISHED_STATES: Partial<Record<OthersActivityEntityKind, readonly string[]>> = {
	task: ['done'],
	goal: ['achieved'],
	milestone: ['completed', 'achieved'],
	plan: ['completed']
};

const VERB_ORDER: readonly OthersActivityVerb[] = [
	'finished',
	'added',
	'updated',
	'moved',
	'removed'
];

const KIND_NOUNS: Record<OthersActivityEntityKind, [string, string]> = {
	task: ['task', 'tasks'],
	document: ['doc', 'docs'],
	goal: ['goal', 'goals'],
	plan: ['plan', 'plans'],
	milestone: ['milestone', 'milestones'],
	risk: ['risk', 'risks']
};

// Short names for agents whose provider we know. Mirrors the steward packet's caller labels.
const KNOWN_AGENT_NAMES: Record<string, string> = {
	'codex-cli': 'Codex',
	'codex-api': 'Codex',
	codex: 'Codex',
	'claude-code': 'Claude Code',
	claude: 'Claude',
	chatgpt: 'ChatGPT',
	'chatgpt-developer-mode': 'ChatGPT',
	'chatgpt-actions': 'ChatGPT',
	openclaw: 'OpenClaw'
};

export interface OthersActivityLogRow {
	project_id: string;
	entity_type: string;
	entity_id: string;
	action: string;
	before_data: unknown;
	after_data: unknown;
	created_at: string;
	changed_by: string;
	changed_by_actor_id: string | null;
	external_agent_caller_id: string | null;
}

export interface OthersActivityCaller {
	id: string;
	user_id: string;
	provider: string | null;
	metadata: unknown;
}

export interface OthersActivityProjectInfo {
	id: string;
	name: string;
	isShared: boolean;
	isWorkspace: boolean;
	/** onto_projects.created_by: an actor id (or a legacy user id). */
	createdBy: string | null;
}

export interface OthersActivityPerson {
	actorId: string | null;
	name: string | null;
}

export interface BuildOthersActivityInput {
	userId: string;
	logs: OthersActivityLogRow[];
	projects: OthersActivityProjectInfo[];
	/** By user id. */
	people: Map<string, OthersActivityPerson>;
	/** By caller id. */
	callers: Map<string, OthersActivityCaller>;
	/** Current titles by entity id, used when the log row has none. */
	titles: Map<string, string>;
	windowStart: Date;
	windowLabel: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isReportedKind(value: string): value is OthersActivityEntityKind {
	return (REPORTED_KINDS as readonly string[]).includes(value);
}

function isFinishedState(kind: string, state: unknown): boolean {
	if (typeof state !== 'string' || !isReportedKind(kind)) return false;
	return FINISHED_STATES[kind]?.includes(state) ?? false;
}

/**
 * What a log row did to its item, from the row's structured fields. The log has no
 * 'completed' action: finishing a task is an 'updated' row whose state_key moved to done.
 */
export function classifyLogChange(row: {
	entity_type: string;
	action: string;
	before_data: unknown;
	after_data: unknown;
}): OthersActivityVerb | null {
	const after = asRecord(row.after_data);
	const before = asRecord(row.before_data);
	switch (row.action) {
		case 'deleted':
			return 'removed';
		case 'completed':
			return 'finished';
		case 'created':
			return isFinishedState(row.entity_type, after?.state_key) ? 'finished' : 'added';
		case 'updated':
		case 'state_changed': {
			if (
				isFinishedState(row.entity_type, after?.state_key) &&
				typeof before?.state_key === 'string' &&
				!isFinishedState(row.entity_type, before.state_key)
			) {
				return 'finished';
			}
			if (after && ('tree_move' in after || 'moved_from_project_id' in after)) return 'moved';
			return 'updated';
		}
		default:
			return null;
	}
}

/** "Codex", "Claude Code", or the name the agent was connected under. */
export function resolveAgentName(caller: Pick<OthersActivityCaller, 'provider' | 'metadata'>): {
	name: string;
	known: boolean;
} {
	const metadata = asRecord(caller.metadata) ?? {};
	// OAuth clients name themselves; their profile id is not reliable (Codex shows up as
	// claude-browser), so the client's own name wins.
	const clientName = asText(metadata.client_name);
	if (clientName) {
		const known = KNOWN_AGENT_NAMES[clientName.toLowerCase().replace(/\s+/g, '-')];
		return { name: (known ?? clientName).slice(0, 40), known: true };
	}
	const provider = asText(caller.provider);
	if (provider && KNOWN_AGENT_NAMES[provider]) {
		return { name: KNOWN_AGENT_NAMES[provider], known: true };
	}
	const installation = asText(metadata.installation_name);
	if (installation) return { name: installation.slice(0, 40), known: false };
	if (provider) return { name: provider.replace(/[-_]+/g, ' ').slice(0, 40), known: false };
	return { name: 'agent', known: false };
}

/** "Your Codex", "Sam's Claude Code", "Your agent (Wayne Strategies website)". */
export function formatAgentLabel(params: {
	caller: Pick<OthersActivityCaller, 'provider' | 'metadata'>;
	isYours: boolean;
	ownerName: string | null;
}): string {
	const { name, known } = resolveAgentName(params.caller);
	const owner = params.isYours ? 'Your' : `${params.ownerName ?? 'A collaborator'}'s`;
	if (known) return `${owner} ${name}`;
	if (name === 'agent') return `${owner} agent`;
	return `${owner} agent (${name})`;
}

function truncateTitle(title: string): string {
	return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

function resolveItemTitle(
	row: OthersActivityLogRow,
	kind: OthersActivityEntityKind,
	titles: Map<string, string>
): string {
	const after = asRecord(row.after_data);
	const before = asRecord(row.before_data);
	const fromLog =
		asText(after?.title) ??
		asText(after?.name) ??
		asText(before?.title) ??
		asText(before?.name);
	const title = fromLog ?? titles.get(row.entity_id) ?? `Untitled ${KIND_NOUNS[kind][0]}`;
	return truncateTitle(title);
}

function verbRank(verb: OthersActivityVerb): number {
	return VERB_ORDER.indexOf(verb);
}

/** A removed item stays removed; otherwise the most telling verb wins (finished over added over updated). */
function mergeVerb(current: OthersActivityVerb, next: OthersActivityVerb): OthersActivityVerb {
	if (current === 'removed' || next === 'removed') return 'removed';
	return verbRank(next) < verbRank(current) ? next : current;
}

function actorGroupRank(actor: OthersActivityActor): number {
	if (actor.kind === 'person') return 0;
	return actor.isYourAgent ? 2 : 1;
}

function isProjectOwner(
	project: OthersActivityProjectInfo,
	userId: string,
	person: OthersActivityPerson | undefined
): boolean {
	if (!project.createdBy) return false;
	return project.createdBy === userId || project.createdBy === person?.actorId;
}

/**
 * Group the window's log rows into projects → people/agents → items. Rows by the brief's
 * own user are dropped unless an agent made them ("Your Codex").
 */
export function buildOthersActivityBriefSection(
	input: BuildOthersActivityInput
): OthersActivityBriefSection | null {
	const projectsById = new Map(input.projects.map((project) => [project.id, project]));
	type ActorAccumulator = {
		actor: Omit<OthersActivityActor, 'counts' | 'itemCount' | 'items' | 'lastChangedAt'>;
		items: Map<string, OthersActivityItem>;
	};
	const byProject = new Map<string, Map<string, ActorAccumulator>>();

	for (const row of input.logs) {
		const project = projectsById.get(row.project_id);
		if (!project || !isReportedKind(row.entity_type)) continue;
		const caller = row.external_agent_caller_id
			? input.callers.get(row.external_agent_caller_id)
			: undefined;
		// A row from an agent we can't look up still isn't the user's own hand.
		const isAgent = Boolean(row.external_agent_caller_id);
		if (!isAgent && row.changed_by === input.userId) continue;

		const verb = classifyLogChange(row);
		if (!verb) continue;
		const kind = row.entity_type;

		let key: string;
		let actor: ActorAccumulator['actor'];
		if (isAgent) {
			const ownerUserId = caller?.user_id ?? row.changed_by;
			const isYours = ownerUserId === input.userId;
			const label = formatAgentLabel({
				caller: caller ?? { provider: null, metadata: null },
				isYours,
				ownerName: input.people.get(ownerUserId)?.name ?? null
			});
			// Two connections of the same agent (Claude Code on a laptop and on a server)
			// read as one line: the reader can't tell them apart anyway.
			key = `agent:${ownerUserId}:${label}`;
			actor = {
				key,
				kind: 'agent',
				label,
				isYourAgent: isYours,
				isProjectOwner: false
			};
		} else {
			const person = input.people.get(row.changed_by);
			key = `person:${row.changed_by}`;
			actor = {
				key,
				kind: 'person',
				label: person?.name ?? 'A collaborator',
				isYourAgent: false,
				isProjectOwner: project.isShared && isProjectOwner(project, row.changed_by, person)
			};
		}

		const actors = byProject.get(project.id) ?? new Map<string, ActorAccumulator>();
		byProject.set(project.id, actors);
		const accumulator = actors.get(key) ?? { actor, items: new Map() };
		actors.set(key, accumulator);

		const existing = accumulator.items.get(row.entity_id);
		if (existing) {
			existing.verb = mergeVerb(existing.verb, verb);
			if (row.created_at > existing.changedAt) existing.changedAt = row.created_at;
		} else {
			accumulator.items.set(row.entity_id, {
				kind,
				id: row.entity_id,
				title: resolveItemTitle(row, kind, input.titles),
				verb,
				changedAt: row.created_at
			});
		}
	}

	const projects: OthersActivityProject[] = [];
	for (const [projectId, actorMap] of byProject) {
		const project = projectsById.get(projectId)!;
		const actors: OthersActivityActor[] = Array.from(actorMap.values()).map(
			({ actor, items }) => {
				const all = Array.from(items.values());
				const counts: OthersActivityActor['counts'] = {};
				for (const item of all) {
					const byKind = (counts[item.verb] ??= {});
					byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
				}
				const sorted = all.sort(
					(a, b) =>
						verbRank(a.verb) - verbRank(b.verb) ||
						b.changedAt.localeCompare(a.changedAt)
				);
				return {
					...actor,
					counts,
					itemCount: all.length,
					items: sorted.slice(0, OTHERS_ACTIVITY_CAPS.ITEMS_KEPT_PER_ACTOR),
					lastChangedAt: all.reduce(
						(latest, item) => (item.changedAt > latest ? item.changedAt : latest),
						''
					)
				};
			}
		);
		actors.sort((a, b) => actorGroupRank(a) - actorGroupRank(b) || b.itemCount - a.itemCount);
		projects.push({
			projectId,
			projectName: project.isWorkspace ? 'Workspace' : project.name || 'Untitled project',
			isShared: project.isShared,
			isWorkspace: project.isWorkspace,
			actors,
			itemCount: actors.reduce((sum, actor) => sum + actor.itemCount, 0)
		});
	}

	if (projects.length === 0) return null;
	projects.sort((a, b) => Number(a.isShared) - Number(b.isShared) || b.itemCount - a.itemCount);
	return {
		windowStart: input.windowStart.toISOString(),
		windowLabel: input.windowLabel,
		projects
	};
}

/**
 * The window starts at the last brief, clamped to between 12 hours and 7 days back.
 * With no earlier brief it is the last 24 hours.
 */
export function resolveOthersActivityWindow(
	previousBriefCompletedAt: string | null,
	now: Date
): { start: Date; label: string } {
	const previous = previousBriefCompletedAt ? new Date(previousBriefCompletedAt) : null;
	if (!previous || Number.isNaN(previous.getTime())) {
		return { start: subHours(now, 24), label: 'in the last 24 hours' };
	}
	const latest = subHours(now, 12);
	const earliest = subDays(now, 7);
	if (previous < earliest) return { start: earliest, label: 'in the last week' };
	return { start: previous > latest ? latest : previous, label: 'since your last brief' };
}

// ============================================================================
// FORMATTING
// ============================================================================

function escapeMarkdownLinkLabel(label: string): string {
	return label.replace(/([\\[\]*_`])/g, '\\$1');
}

function itemHref(projectId: string, item: OthersActivityItem): string {
	if (item.kind === 'task') return `/projects/${projectId}/tasks/${item.id}`;
	if (item.kind === 'document') return `/projects/${projectId}/documents/${item.id}`;
	return `/projects/${projectId}`;
}

function projectHref(project: OthersActivityProject): string {
	return project.isWorkspace ? '/projects' : `/projects/${project.projectId}`;
}

function countPhrase(kind: OthersActivityEntityKind, count: number): string {
	const [singular, plural] = KIND_NOUNS[kind];
	return `${count} ${count === 1 ? singular : plural}`;
}

/** "finished 1 task, added 3 tasks and 1 doc, updated 2 docs". */
export function summarizeActorCounts(counts: OthersActivityActor['counts']): string {
	const phrases: string[] = [];
	for (const verb of VERB_ORDER) {
		const byKind = counts[verb];
		if (!byKind) continue;
		const kinds = REPORTED_KINDS.filter((kind) => (byKind[kind] ?? 0) > 0).map((kind) =>
			countPhrase(kind, byKind[kind]!)
		);
		if (kinds.length > 0) phrases.push(`${verb} ${kinds.join(' and ')}`);
	}
	return phrases.join(', ');
}

function formatItem(projectId: string, item: OthersActivityItem): string {
	if (item.verb === 'removed') return `~~${escapeMarkdownLinkLabel(item.title)}~~`;
	const link = `[${escapeMarkdownLinkLabel(item.title)}](${itemHref(projectId, item)})`;
	return item.verb === 'finished' ? `✅ ${link}` : link;
}

function formatActorLine(project: OthersActivityProject, actor: OthersActivityActor): string {
	const name = `**${escapeMarkdownLinkLabel(actor.label)}**${actor.isProjectOwner ? ' (owner)' : ''}`;
	const shown = actor.items.slice(0, OTHERS_ACTIVITY_CAPS.ITEMS_PER_LINE);
	const items = shown.map((item) => formatItem(project.projectId, item));
	const more = actor.itemCount - shown.length;
	if (more > 0) items.push(`and ${more} more`);
	return `- ${name} ${summarizeActorCounts(actor.counts)}: ${items.join(', ')}\n`;
}

function formatProjectBlock(project: OthersActivityProject, headingLevel: string): string {
	let block = `${headingLevel} [${escapeMarkdownLinkLabel(project.projectName)}](${projectHref(project)})\n`;
	const shown = project.actors.slice(0, OTHERS_ACTIVITY_CAPS.ACTORS_PER_PROJECT);
	for (const actor of shown) block += formatActorLine(project, actor);
	const hidden = project.actors.length - shown.length;
	if (hidden > 0) {
		block += `- ...and ${hidden} more ${hidden === 1 ? 'person or agent' : 'people and agents'}\n`;
	}
	return `${block}\n`;
}

function formatProjectGroup(projects: OthersActivityProject[], headingLevel: string): string {
	const shown = projects.slice(0, OTHERS_ACTIVITY_CAPS.PROJECTS_PER_GROUP);
	let group = shown.map((project) => formatProjectBlock(project, headingLevel)).join('');
	const hidden = projects.length - shown.length;
	if (hidden > 0) {
		group += `_${hidden} more project${hidden === 1 ? '' : 's'} had changes._\n\n`;
	}
	return group;
}

/**
 * The brief section. Empty when nobody else (and none of your agents) changed anything.
 * Place it above "## Project Details": the email cuts the brief off at that heading.
 */
export function formatOthersActivitySection(
	section: OthersActivityBriefSection | null | undefined
): string {
	if (!section || section.projects.length === 0) return '';
	const owned = section.projects.filter((project) => !project.isShared);
	const shared = section.projects.filter((project) => project.isShared);

	let markdown = `## While you were away\n\n`;
	markdown += `_What other people and agents changed ${section.windowLabel}._\n\n`;
	markdown += formatProjectGroup(owned, '###');
	if (shared.length > 0) {
		markdown += `### Shared with you\n\n`;
		markdown += formatProjectGroup(shared, '####');
	}
	return markdown;
}

/** A few plain lines for the executive summary prompt; empty when there is nothing. */
export function formatOthersActivityForPrompt(
	section: OthersActivityBriefSection | null | undefined
): string {
	if (!section || section.projects.length === 0) return '';
	const lines: string[] = [];
	for (const project of section.projects) {
		const parts = project.actors.slice(0, 3).map((actor) => {
			const titles = actor.items
				.slice(0, 2)
				.map((item) => item.title)
				.join('; ');
			return `${actor.label}${actor.isProjectOwner ? ' (owner)' : ''} ${summarizeActorCounts(actor.counts)}${titles ? ` (${titles})` : ''}`;
		});
		const scope = project.isShared ? ' [shared with the user]' : '';
		lines.push(`- ${project.projectName}${scope}: ${parts.join('; ')}`);
		if (lines.length >= OTHERS_ACTIVITY_CAPS.PROMPT_LINES) break;
	}
	return lines.join('\n');
}

// ============================================================================
// LOADING
// ============================================================================

function buildTitleLookup(projectsData: OntoProjectWithRelations[]): Map<string, string> {
	const titles = new Map<string, string>();
	const add = (id: string, title: unknown) => {
		const text = asText(title);
		if (text) titles.set(id, text);
	};
	for (const data of projectsData) {
		for (const task of data.tasks) add(task.id, task.title);
		for (const doc of data.documents) add(doc.id, doc.title);
		for (const goal of data.goals) add(goal.id, goal.name);
		for (const plan of data.plans) add(plan.id, plan.name);
		for (const milestone of data.milestones) add(milestone.id, milestone.title);
		for (const risk of data.risks) add(risk.id, risk.title);
	}
	return titles;
}

/**
 * Load "While you were away" for one brief. Never throws: a failure leaves the
 * section out of the brief.
 */
export async function fetchOthersActivityBriefSection(
	supabase: TypedSupabaseClient,
	params: {
		userId: string;
		projectsData: OntoProjectWithRelations[];
		briefDate: string;
		now?: Date;
	}
): Promise<OthersActivityBriefSection | null> {
	const { userId, projectsData, briefDate } = params;
	const now = params.now ?? new Date();
	if (projectsData.length === 0) return null;

	try {
		const { data: previousBrief, error: previousError } = await supabase
			.from('ontology_daily_briefs')
			.select('generation_completed_at')
			.eq('user_id', userId)
			.eq('generation_status', 'completed')
			.lt('brief_date', briefDate)
			.order('brief_date', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (previousError) throw new Error(`previous brief: ${previousError.message}`);
		const window = resolveOthersActivityWindow(
			previousBrief?.generation_completed_at ?? null,
			now
		);

		const { data: logRows, error: logError } = await supabase
			.from('onto_project_logs')
			.select(
				'project_id, entity_type, entity_id, action, before_data, after_data, created_at, changed_by, changed_by_actor_id, external_agent_caller_id'
			)
			.in(
				'project_id',
				projectsData.map((data) => data.project.id)
			)
			.in('entity_type', [...REPORTED_KINDS])
			.in('action', [...QUERIED_ACTIONS])
			// Other people's rows, plus any row an agent made (yours included).
			.or(`changed_by.neq.${userId},external_agent_caller_id.not.is.null`)
			.gte('created_at', window.start.toISOString())
			.order('created_at', { ascending: false })
			.limit(OTHERS_ACTIVITY_CAPS.LOG_ROWS);
		if (logError) throw new Error(`activity logs: ${logError.message}`);
		const logs = (logRows ?? []) as OthersActivityLogRow[];
		if (logs.length === 0) return null;

		const callerIds = Array.from(
			new Set(logs.map((row) => row.external_agent_caller_id).filter(Boolean))
		) as string[];
		const callers = new Map<string, OthersActivityCaller>();
		if (callerIds.length > 0) {
			const { data: callerRows, error: callerError } = await supabase
				.from('external_agent_callers')
				.select('id, user_id, provider, metadata')
				.in('id', callerIds);
			if (callerError) throw new Error(`agent callers: ${callerError.message}`);
			for (const caller of callerRows ?? []) callers.set(caller.id, caller);
		}

		const peopleIds = new Set<string>();
		for (const row of logs) {
			if (row.changed_by && row.changed_by !== userId) peopleIds.add(row.changed_by);
		}
		for (const caller of callers.values()) {
			if (caller.user_id !== userId) peopleIds.add(caller.user_id);
		}
		const people = new Map<string, OthersActivityPerson>();
		if (peopleIds.size > 0) {
			const { data: actorRows, error: actorError } = await supabase
				.from('onto_actors')
				.select('id, user_id, name')
				.in('user_id', Array.from(peopleIds));
			if (actorError) throw new Error(`actors: ${actorError.message}`);
			for (const actor of actorRows ?? []) {
				if (!actor.user_id || people.has(actor.user_id)) continue;
				people.set(actor.user_id, { actorId: actor.id, name: asText(actor.name) });
			}
		}

		return buildOthersActivityBriefSection({
			userId,
			logs,
			projects: projectsData.map((data) => ({
				id: data.project.id,
				name: data.project.name,
				isShared: data.isShared,
				isWorkspace: isWorkspaceProjectRow(data.project),
				createdBy: data.project.created_by ?? null
			})),
			people,
			callers,
			titles: buildTitleLookup(projectsData),
			windowStart: window.start,
			windowLabel: window.label
		});
	} catch (error) {
		console.warn('[OthersActivityBrief] Skipping "While you were away":', error);
		return null;
	}
}
