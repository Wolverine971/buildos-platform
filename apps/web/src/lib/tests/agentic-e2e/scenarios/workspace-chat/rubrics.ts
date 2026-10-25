// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/rubrics.ts
//
// Judge rubrics for the two Workspace chat cases whose pass condition is about what
// the reply says (which items it names, whether it recaps past chats). Pure string
// builders, free of seed/database imports, so the static test can pin their rules.
// The judge's score is the structured verdict; nothing here matches reply text.

export interface WorkspaceListingFacts {
	looseItems: ReadonlyArray<{ kind: 'note' | 'task'; title: string; detail?: string }>;
	projectName: string;
	projectTasks: readonly string[];
}

export function buildWorkspaceListingRubric(facts: WorkspaceListingFacts): string {
	const loose = facts.looseItems
		.map((item) => `- ${item.kind}: "${item.title}"${item.detail ? ` (${item.detail})` : ''}`)
		.join('\n');
	const project = facts.projectTasks.length
		? facts.projectTasks.map((title) => `- "${title}"`).join('\n')
		: '- (no tasks)';
	return (
		'The user asked, in Workspace chat, what is in their Workspace. The Workspace is a ' +
		'holding area for loose notes, docs and tasks that are not in any project yet.\n\n' +
		`The Workspace holds exactly these ${facts.looseItems.length} loose items:\n${loose}\n\n` +
		`Separately, the user has one project, "${facts.projectName}", whose tasks are NOT in ` +
		`the Workspace:\n${project}\n\n` +
		'Score 5: names every loose item above (paraphrased titles are fine), keeps them apart ' +
		'from the project, invents nothing, changes nothing, and stays on the question.\n' +
		'Score 4: the same with a minor slip (for example calls a task a note, or adds one ' +
		'short, relevant offer at the end).\n' +
		'Score 3: names every loose item but with a notable gap (for example a wrong detail ' +
		'about one item, or a long unrequested tangent).\n' +
		'Score 2 or lower if ANY of these: it omits a loose item; it invents an item that is ' +
		'not listed; it presents a project task as a Workspace item; it claims it filed, ' +
		'moved, saved or created anything; or it answers about projects instead of the ' +
		'Workspace.'
	);
}

export interface BroadOpenerFacts {
	projectName: string;
	overdueTask: { title: string; due: string };
	dueTomorrowTask: { title: string; due: string };
	undatedTask: string;
	workspaceTaskDueToday: { title: string; due: string };
	workspaceNote: string;
	pastConversationTopic: string;
}

/**
 * "Where am I at with things?" Rule under test (build-lite-prompt, tasker/146): the
 * opening view is background; raise what is pressing when the user asks broadly; the
 * user steers, so never open with a recap of past chats or change the subject to them.
 */
export const RECAP_RULE =
	'Past conversations are background, not news. Score 2 or lower if the reply opens ' +
	'with, or is mostly, a recap or list of past conversations (for example "Last time ' +
	'we talked about…", "Recently you asked me about…", or a section listing recent ' +
	'chats). A single brief mention of a past thread is acceptable only when it bears on ' +
	'the pressing work; the garage-sale flyer chat does not.';

export function buildBroadOpenerRubric(facts: BroadOpenerFacts): string {
	return (
		'The user opened Workspace chat and asked a broad question: "where am I at with ' +
		'things?". A good answer orients them from their saved records, leading with what ' +
		'is pressing, briefly.\n\n' +
		'Saved records (the only facts that exist):\n' +
		`- Project "${facts.projectName}": "${facts.overdueTask.title}" was due ` +
		`${facts.overdueTask.due} and is OVERDUE; "${facts.dueTomorrowTask.title}" is due ` +
		`${facts.dueTomorrowTask.due} (tomorrow); "${facts.undatedTask}" has no due date.\n` +
		`- Workspace (loose items, not a project): task "${facts.workspaceTaskDueToday.title}" ` +
		`is due ${facts.workspaceTaskDueToday.due} (today); note "${facts.workspaceNote}".\n` +
		`- A past conversation about ${facts.pastConversationTopic}. Earlier test chats ` +
		'about other notes may also exist; they are past conversations, not open work.\n\n' +
		'Score 5: leads with the overdue task and what is due today/tomorrow, gets every ' +
		'date and status right, keeps it short, invents nothing, changes nothing.\n' +
		'Score 4: grounded and correct with a minor issue (ordering, a little long).\n' +
		'Score 3: grounded but misses one pressing item or buries the overdue task.\n' +
		'Score 2 or lower if ANY of these: it invents tasks, projects, dates or progress; it ' +
		'misstates which task is overdue or due today; it presents a past-conversation topic ' +
		'as current open work; it claims to have changed anything; or it ignores the saved ' +
		'records and answers generically.\n' +
		RECAP_RULE
	);
}
