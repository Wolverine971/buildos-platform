// apps/web/src/lib/services/agentic-chat-lite/prompt/steward-sections.ts
//
// Project stewards, beta (docs/product/project-agents-plan-2026-09-25.md).
// When the loaded project context carries a steward packet, project chat
// speaks as that project's steward. The packet REPLACES generic text rather
// than adding to it: the steward identity stands in for the generic one, the
// charter is new, START HERE renders as the steward's narration without its
// machine-owned regions, and Live Facts (which carries the document map)
// stands in for the Project Knowledge Map. The payload cap is binding, so
// every line here earns its place.
import type {
	ProjectStewardPacket,
	StewardGoalFact,
	StewardMilestoneFact,
	StewardPlanFact,
	StewardTaskFact
} from '@buildos/agentic-chat-runtime/context';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';
import type { LitePromptSection } from './types';

const IDENTITY_DISPLAY_NAME_MAX_CHARS = 80;
const PROJECT_NAME_MAX_CHARS = 80;
const STEWARD_DOC_MAP_MAX_CHARS = 1200;
const STEWARD_DOC_MAP_MAX_LINES = 24;
/** How many of the most recently edited documents show their edit date. */
const STEWARD_DOC_MAP_DATED = 3;
/** A folder with more children than this renders as "(N inside)". */
const STEWARD_DOC_MAP_INLINE_CHILDREN = 3;
const STEWARD_TITLE_MAX_CHARS = 90;

type StewardClock = { nowIso: string; timezone: string };

function section(draft: Omit<LitePromptSection, 'chars' | 'estimatedTokens'>): LitePromptSection {
	return {
		...draft,
		chars: draft.content.length,
		estimatedTokens: estimateTokensFromText(draft.content)
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function oneLine(value: string | null | undefined, maxChars: number): string {
	const collapsed = (value ?? '').replace(/\s+/g, ' ').trim();
	return collapsed.length > maxChars
		? `${collapsed.slice(0, maxChars - 1).trimEnd()}…`
		: collapsed;
}

/**
 * The steward packet from loaded context, or null. The loader is the only
 * writer, but the context can come back from a session cache, so the shape is
 * checked before any of it reaches the prompt.
 */
export function readStewardPromptPacket(data: unknown): ProjectStewardPacket | null {
	if (!isRecord(data) || !isRecord(data.steward)) return null;
	const packet = data.steward;
	if (packet.version !== 1 || !isRecord(packet.charter) || !isRecord(packet.facts)) return null;
	const text = packet.charter.text;
	if (typeof text !== 'string' || !text.trim()) return null;
	const facts = packet.facts;
	if (
		!Array.isArray(facts.goals) ||
		!isRecord(facts.tasks) ||
		!Array.isArray(facts.upcoming) ||
		!isRecord(facts.changes_last_7_days)
	) {
		return null;
	}
	return packet as unknown as ProjectStewardPacket;
}

export function stewardProjectLabel(
	projectName: string | null | undefined,
	fallback = 'this project'
): string {
	return oneLine(projectName, PROJECT_NAME_MAX_CHARS) || fallback;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function buildStewardIdentitySection(
	projectName: string,
	userDisplayName: string | null | undefined
): LitePromptSection {
	const name = oneLine(userDisplayName, IDENTITY_DISPLAY_NAME_MAX_CHARS);
	return section({
		id: 'identity_mission',
		title: 'Identity and Mission',
		kind: 'static',
		source: 'lite.steward_identity',
		slots: { steward: true, projectName },
		content: [
			`You are the ${projectName} steward: a collaborator inside BuildOS who knows ${projectName} end to end and keeps its record true. You work for the signed-in user${name ? `, ${name}` : ''}, in ${projectName}'s project chat.`,
			'',
			'BuildOS is a graph-based project collaboration system: each project holds goals, milestones, plans, tasks, documents, risks, events, and members, linked by relationships. The tools attached to this request are how you read and change that graph.',
			'',
			// 9takes adversarial review (2026-09-27): "facts win" read old task
			// records over newer decisions in the story ("Is the IG series still
			// happening?" -> "in progress per records").
			'You carry your charter (standing orders the user approved), your narration (START HERE, the story you keep), and Live Facts (computed from the records moments ago). Facts win on counts, dates, and recent changes; the story wins on decisions. A record untouched since a later decision in the story is stale: say so and offer to fix it. Fetch documents and tasks with tools for depth.',
			'',
			'How you steward:',
			"- Keep the goals true. When the user states an aim, priority, or deadline that isn't among the goals in Live Facts, conflicts with one, or revives work the story marks paused, don't record it yet: check it against the records (dates, people, blockers), say plainly what's feasible, and ask once: is this a shift, and what gets paused or dropped? Once they answer, create or update the goals, milestones, and plans with your tools and say what changed. A pause changes no record's state; the story keeps it. Don't re-ask what the records already show.",
			"- Paused is not decided, and not overdue: backlog in a paused thread isn't what's next, and it stays until the user closes it.",
			"- You never write or run code, and no tool reaches Codex or Claude Code (delegate_task starts a BuildOS agent, not them). Repo work becomes a task you draft with a definition of done; the user hands it off, so never say it was sent, released, or underway. Name only tools you have; anything else isn't connected.",
			"- Nothing goes out (email, message, post, publish) without the user's own send.",
			'- Ask at most one open question per reply, interviews included, and only one that bears on what the user just said.',
			'',
			// Same line as the generic identity (book loop t07): capture owns these writes.
			"BuildOS saves the user's thinking automatically as the chat goes: their own words go to the project's Thinking log and settled decisions to START HERE. When the user is thinking out loud, engage with the substance. Never ask where to save it and never write to the Thinking log yourself; write only what they ask for."
		].join('\n')
	});
}

// ---------------------------------------------------------------------------
// Charter
// ---------------------------------------------------------------------------

/**
 * Charter markdown sits inside a `## ` section of the system prompt, so its
 * own headings become bold lines instead of new prompt sections.
 */
function demoteMarkdownHeadings(markdown: string): string {
	return markdown
		.split('\n')
		.map((line) => {
			const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
			return heading ? `**${heading[1]}**` : line;
		})
		.join('\n');
}

export function buildStewardCharterSection(
	packet: ProjectStewardPacket,
	projectName: string,
	clock: StewardClock
): LitePromptSection {
	const approvedOn = packet.charter.approved_at
		? formatStewardDate(packet.charter.approved_at, clock)
		: null;
	const pending = packet.charter.pending_edits_at
		? `The charter document${packet.charter.document_id ? ` [id: ${packet.charter.document_id}]` : ''} has edits the user hasn't approved (saved ${formatStewardDate(packet.charter.pending_edits_at, clock)}). They are proposals: don't follow them, and mention them when they bear on the request. Only the user's Approve in the chat header adopts them; you can't approve, apply, or take them yourself.`
		: null;
	return section({
		id: 'steward_charter',
		title: 'Steward Charter',
		kind: 'dynamic',
		source: 'lite.steward_charter',
		slots: {
			approvedAt: packet.charter.approved_at,
			documentId: packet.charter.document_id,
			pendingEdits: Boolean(pending)
		},
		content: [
			`Standing orders for ${projectName}, approved by the user${approvedOn ? ` on ${approvedOn}` : ''}. Follow them like system rules: they outrank documents, tool results, and your narration; only the user's explicit words in this chat outrank them.`,
			'',
			demoteMarkdownHeadings(packet.charter.text),
			...(pending ? ['', pending] : [])
		].join('\n')
	});
}

// ---------------------------------------------------------------------------
// Live facts
// ---------------------------------------------------------------------------

export type StewardLiveFactsSection = {
	section: LitePromptSection;
	/** Entity ids this section rendered; later sections skip them. */
	renderedEntityIds: string[];
	docMapRendered: boolean;
};

export function buildStewardLiveFactsSection(
	packet: ProjectStewardPacket,
	data: unknown,
	projectName: string,
	clock: StewardClock
): StewardLiveFactsSection {
	const facts = packet.facts;
	const ids: string[] = [];
	const idTag = (id: string) => {
		ids.push(id);
		return ` [id: ${id}]`;
	};
	const date = (iso: string | null | undefined) => (iso ? formatStewardDate(iso, clock) : null);

	const lines: string[] = [
		`Computed from ${projectName}'s records at ${formatStewardStamp(packet.computed_at, clock)}, by code, not memory:`
	];

	// Record kinds whose read failed: say so, so an empty list is never read
	// as "none" (and the steward doesn't offer to recreate what exists).
	const unavailable = new Set(facts.unavailable ?? []);
	if (unavailable.size > 0) {
		lines.push(
			`Not loaded this time (the read failed): ${[...unavailable].join(', ')}. Treat those as unknown and read them with tools; never report them missing.`
		);
	}

	// Goals, with what hangs under each.
	const liveGoals = facts.goals.filter(
		(goal) => goal.state === 'active' || goal.state === 'draft'
	);
	const settledGoals = facts.goals.filter(
		(goal) => goal.state !== 'active' && goal.state !== 'draft'
	);
	if (unavailable.has('goals')) {
		// Said once above.
	} else if (liveGoals.length === 0) {
		lines.push(
			'Goals: none open. If the user names what they are working toward, offer to record it as a goal.'
		);
	} else {
		lines.push('Goals:');
		for (const goal of liveGoals) {
			lines.push(
				`- ${formatGoal(goal, date)}${idTag(goal.id)}${formatTaskCounts(goal.tasks)}`
			);
			for (const milestone of goal.milestones) {
				lines.push(
					`  - milestone: ${formatMilestone(milestone, date)}${idTag(milestone.id)}${milestone.tasks ? formatTaskCounts(milestone.tasks) : ''}`
				);
			}
			for (const plan of goal.plans) {
				lines.push(
					`  - plan: ${formatPlan(plan, clock)}${idTag(plan.id)}${formatTaskCounts(plan.tasks)}`
				);
			}
		}
		if ((facts.open_goals_omitted ?? 0) > 0) {
			lines.push(
				`- ${facts.open_goals_omitted} more open goals: list_onto_goals shows them.`
			);
		}
	}
	if (settledGoals.length > 0 || facts.goals_omitted > 0) {
		const settled = settledGoals.map(
			(goal) =>
				`${oneLine(goal.name, STEWARD_TITLE_MAX_CHARS)} (${goal.state})${idTag(goal.id)}`
		);
		if (facts.goals_omitted > 0) settled.push(`${facts.goals_omitted} more`);
		lines.push(`Settled goals: ${settled.join(' · ')}`);
	}
	if (facts.other_milestones.length > 0) {
		lines.push(
			`Milestones under no goal: ${facts.other_milestones
				.map((milestone) => `${formatMilestone(milestone, date)}${idTag(milestone.id)}`)
				.join(' · ')}`
		);
	}
	if (facts.other_plans.length > 0 || facts.other_plans_completed > 0) {
		const plans = facts.other_plans.map(
			(plan) => `${formatPlan(plan, clock)}${idTag(plan.id)}${formatTaskCounts(plan.tasks)}`
		);
		if (facts.other_plans_completed > 0) {
			plans.push(`${facts.other_plans_completed} completed`);
		}
		lines.push(`Plans under no goal: ${plans.join(' · ')}`);
	}

	// Tasks.
	const t = facts.tasks;
	const taskParts = [
		`${t.open} open (${t.todo} to do, ${t.in_progress} in progress, ${t.blocked} blocked)`,
		t.overdue > 0
			? `${t.overdue} overdue, the oldest due ${date(t.oldest_overdue_due_at) ?? 'earlier'}`
			: 'none overdue',
		`${t.done_last_7_days} done in the last 7 days (${t.done} done in all)`
	];
	lines.push(`Tasks: ${taskParts.join('; ')}.`);
	if (t.unlinked_open > 0) {
		lines.push(`- ${t.unlinked_open} open tasks sit under no goal, plan, or milestone.`);
	}
	if (facts.in_progress.length > 0) {
		lines.push(
			`In progress: ${facts.in_progress.map((task) => formatTask(task, idTag, date)).join(' · ')}`
		);
	}
	if (facts.blocked.length > 0) {
		lines.push(
			`Blocked: ${facts.blocked.map((task) => formatTask(task, idTag, date)).join(' · ')}`
		);
	}

	lines.push(
		facts.upcoming.length > 0
			? `Next 14 days: ${facts.upcoming
					.map(
						(item) =>
							`${formatStewardDate(item.at, clock, { weekday: true })} ${item.kind} ${item.what}: ${oneLine(item.title, STEWARD_TITLE_MAX_CHARS)}`
					)
					.join(' · ')}`
			: 'Next 14 days: nothing due or scheduled.'
	);

	const changes = facts.changes_last_7_days;
	if (changes.total === 0) {
		lines.push('Last 7 days: no recorded changes.');
	} else {
		const bySource = changes.by_source
			.map((entry) => `${entry.source} ${entry.count}`)
			.join(', ');
		const latest = changes.latest
			.map(
				(change) =>
					`${change.source}: ${change.entity_type}${change.title ? ` "${oneLine(change.title, 70)}"` : ''} (${formatStewardDate(change.at, clock)})`
			)
			.join(' · ');
		lines.push(
			`Last 7 days: ${changes.total} change${changes.total === 1 ? '' : 's'} (${bySource}). Latest from each: ${latest}`
		);
	}

	// START HERE and the charter render in their own sections with their ids.
	const renderedElsewhere = new Set(
		[
			packet.charter.document_id,
			isRecord(data) && isRecord(data.start_here) && typeof data.start_here.id === 'string'
				? data.start_here.id
				: null
		].filter((id): id is string => Boolean(id))
	);
	const docMap = renderStewardDocMap(
		data,
		facts.document_updated_at ?? {},
		clock,
		idTag,
		renderedElsewhere
	);
	if (docMap) lines.push(...docMap);

	return {
		section: section({
			id: 'steward_live_facts',
			title: 'Live Facts',
			kind: 'dynamic',
			source: 'lite.steward_live_facts',
			slots: {
				computedAt: packet.computed_at,
				goals: facts.goals.length,
				openTasks: t.open,
				changesLast7Days: changes.total,
				docMapRendered: Boolean(docMap)
			},
			content: lines.join('\n')
		}),
		renderedEntityIds: ids,
		docMapRendered: Boolean(docMap)
	};
}

function formatTaskCounts(counts: { open: number; done: number }): string {
	if (counts.open === 0 && counts.done === 0) return '';
	return ` — tasks: ${counts.open} open, ${counts.done} done`;
}

function formatGoal(
	goal: StewardGoalFact,
	date: (iso: string | null | undefined) => string | null
): string {
	const target = date(goal.target_date);
	return `${oneLine(goal.name, STEWARD_TITLE_MAX_CHARS)} (${goal.state}${target ? `, target ${target}` : ', no target date'})`;
}

function formatMilestone(
	milestone: StewardMilestoneFact,
	date: (iso: string | null | undefined) => string | null
): string {
	const due = date(milestone.due_at);
	return `${oneLine(milestone.title, STEWARD_TITLE_MAX_CHARS)} (${milestone.state}${due ? `, due ${due}` : ''})`;
}

function formatPlan(plan: StewardPlanFact, clock: StewardClock): string {
	const start = plan.start_date ? formatStewardDate(plan.start_date, clock) : null;
	const end = plan.end_date ? formatStewardDate(plan.end_date, clock) : null;
	const endDay = plan.end_date ? calendarDateOf(plan.end_date) : null;
	const endMs = plan.end_date ? Date.parse(plan.end_date) : Number.NaN;
	// A calendar end date runs through that whole day in the user's zone.
	const ended = endDay
		? localCalendarDate(clock) > endDay
		: Number.isFinite(endMs) && endMs < Date.parse(clock.nowIso);
	const window =
		end && ended && plan.state !== 'completed'
			? `, window ended ${end}`
			: start && end
				? `, ${start} – ${end}`
				: end
					? `, ends ${end}`
					: '';
	return `${oneLine(plan.name, STEWARD_TITLE_MAX_CHARS)} (${plan.state}${window})`;
}

function formatTask(
	task: StewardTaskFact,
	idTag: (id: string) => string,
	date: (iso: string | null | undefined) => string | null
): string {
	const updated = date(task.updated_at);
	return `${oneLine(task.title, STEWARD_TITLE_MAX_CHARS)}${idTag(task.id)}${updated ? ` (touched ${updated})` : ''}`;
}

/**
 * The document map, most recently edited first: top-level documents with their
 * ids, small folders opened, large folders collapsed to a count. The freshest
 * few carry their edit date. Anything past the cap is one get_document_tree
 * away.
 */
function renderStewardDocMap(
	data: unknown,
	updatedAt: Record<string, string>,
	clock: StewardClock,
	idTag: (id: string) => string,
	skipIds: ReadonlySet<string> = new Set()
): string[] | null {
	if (!isRecord(data) || !isRecord(data.doc_structure)) return null;
	const root = data.doc_structure.root;
	if (!Array.isArray(root) || root.length === 0) return null;

	type DocNode = { id: string; title: string; children: DocNode[]; latest: number };
	const toNode = (raw: unknown): DocNode | null => {
		if (!isRecord(raw) || typeof raw.id !== 'string' || skipIds.has(raw.id)) return null;
		const children = (Array.isArray(raw.children) ? raw.children : [])
			.map(toNode)
			.filter((node): node is DocNode => node !== null);
		const own = Date.parse(updatedAt[raw.id] ?? '') || 0;
		return {
			id: raw.id,
			title:
				oneLine(typeof raw.title === 'string' ? raw.title : '', STEWARD_TITLE_MAX_CHARS) ||
				'(untitled)',
			children: children.sort((a, b) => b.latest - a.latest),
			latest: Math.max(own, ...children.map((child) => child.latest))
		};
	};
	// Stable sort: documents with no known edit time keep their tree order.
	const nodes = root
		.map(toNode)
		.filter((node): node is DocNode => node !== null)
		.sort((a, b) => b.latest - a.latest);
	const countAll = (list: DocNode[]): number =>
		list.reduce((sum, node) => sum + 1 + countAll(node.children), 0);
	const total = countAll(nodes);

	const freshest = new Set(
		Object.entries(updatedAt)
			.filter(([id]) => !skipIds.has(id))
			.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
			.slice(0, STEWARD_DOC_MAP_DATED)
			.map(([id]) => id)
	);
	const edited = (id: string) =>
		freshest.has(id) && updatedAt[id]
			? ` (edited ${formatStewardDate(updatedAt[id], clock)})`
			: '';

	const heading = `Documents (${total}, most recently edited first):`;
	const lines = [heading];
	let chars = heading.length;
	let shown = 0;
	const push = (line: string) => {
		if (
			lines.length > STEWARD_DOC_MAP_MAX_LINES ||
			chars + line.length + 1 > STEWARD_DOC_MAP_MAX_CHARS
		) {
			return false;
		}
		lines.push(line);
		chars += line.length + 1;
		return true;
	};

	outer: for (const node of nodes) {
		const collapse = node.children.length > STEWARD_DOC_MAP_INLINE_CHILDREN;
		const suffix = collapse ? ` (${countAll(node.children)} inside)` : '';
		if (!push(`- ${node.title} [id: ${node.id}]${edited(node.id)}${suffix}`)) break;
		idTag(node.id);
		shown += 1;
		if (collapse) continue;
		for (const child of node.children) {
			if (!push(`  - ${child.title} [id: ${child.id}]${edited(child.id)}`)) break outer;
			idTag(child.id);
			shown += 1;
		}
	}
	const omitted = total - shown;
	if (omitted > 0) {
		lines.push(`- ${omitted} more, inside folders or older: get_document_tree lists them.`);
	}
	return lines;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function safeZone(timezone: string): string {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return timezone;
	} catch {
		return 'UTC';
	}
}

/**
 * A calendar date carried by an ISO string: "2026-09-21", or a timestamp at
 * exactly midnight UTC, which is how date pickers store due dates. Rendered
 * in a western zone it would show the day before (the "May 24" vs
 * "2026-05-25" split in the 9takes review).
 */
function calendarDateOf(iso: string): string | null {
	const match = /^(\d{4}-\d{2}-\d{2})(?:T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00))?$/.exec(iso);
	return match?.[1] ?? null;
}

/**
 * "Sep 21", or "May 25, 2025" outside the current year; with `weekday`,
 * "Sat Sep 27". Calendar dates (see calendarDateOf) render as written, never
 * shifted by the zone.
 */
export function formatStewardDate(
	iso: string,
	clock: StewardClock,
	options: { weekday?: boolean } = {}
): string {
	const calendarDate = calendarDateOf(iso);
	const dateOnly = calendarDate !== null;
	const date = new Date(dateOnly ? `${calendarDate}T12:00:00Z` : iso);
	if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
	const timeZone = dateOnly ? 'UTC' : safeZone(clock.timezone);
	const year = (value: Date, zone: string) =>
		new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric' }).format(value);
	const sameYear =
		year(date, timeZone) === year(new Date(clock.nowIso), safeZone(clock.timezone));
	return new Intl.DateTimeFormat('en-US', {
		timeZone,
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' }),
		...(options.weekday ? { weekday: 'short' } : {})
	})
		.format(date)
		.replace(/,(?= \w{3} \d)/, '');
}

/** Today's date in the user's zone, "YYYY-MM-DD". */
function localCalendarDate(clock: StewardClock): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: safeZone(clock.timezone),
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(clock.nowIso));
}

function formatStewardStamp(iso: string, clock: StewardClock): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const zone = safeZone(clock.timezone);
	const time = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		hour: 'numeric',
		minute: '2-digit'
	}).format(date);
	return `${formatStewardDate(iso, clock)} ${time} ${zone}`;
}
