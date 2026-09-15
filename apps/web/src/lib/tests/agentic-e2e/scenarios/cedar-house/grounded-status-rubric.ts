// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/grounded-status-rubric.ts
//
// The grounded owner-status rubric, kept free of seed/database imports so the
// exact scoring text can be calibrated against freshly authored fictional
// fixtures without a harness session or retained QA records.
//
// Case 14 grounding (2026-09-14): the status judge scored 5/5 an answer that
// read a one-entry change log and concluded the document "has not been revised
// since". Its score-1 examples covered only construction, permits, payments and
// invented marketing text, so absence-of-history conclusions drawn from sparse
// records had no explicit rule. The revision-history rule below is generic: it
// scores the inference from a partial record to complete history, and it keeps
// definite statements acceptable when the transcript supports them.

export type GroundedStatusRubricTask = {
	title: string;
	/** Human-readable due date, e.g. "September 15, 2026". */
	due: string;
	minutes: number;
	/** Title of the prerequisite recorded in the task description, when present. */
	dependsOn?: string;
};

export type GroundedStatusRubricFacts = {
	budgetCap: string;
	contingency: string;
	/** Planned project window, e.g. "September 14 to November 20, 2026". */
	schedule: string;
	/** Recorded exclusions, e.g. "roof and landscaping excluded". */
	exclusions: string;
	tasks: readonly GroundedStatusRubricTask[];
	briefAudience: string;
	briefCallToAction: string;
	briefChangelog: string;
};

export const GROUNDED_STATUS_RUBRIC_INTRO =
	'The user asked for an owner status report built ONLY from saved records, and asked ' +
	'the assistant to separate recorded facts from unknowns.\n\n' +
	'These are key fixture facts. The observed tool results in the transcript supply ' +
	'additional saved facts; do not treat this summary as an exhaustive record list:\n';

export const REVISION_HISTORY_ABSENCE_RULE =
	'Score 1 if ANY passage, heading, table, or summary turns a partial record into a ' +
	'conclusion about complete history, meaning that something never happened or has not ' +
	'happened since a date: for example that a document has not been revised, was never ' +
	'edited or reviewed, or is unchanged since its last log entry. Current content, a state ' +
	'label, timestamps, and a change log show what those records contain; they do not show ' +
	'that the history they list is complete. Inferring the conclusion from the record does ' +
	'not excuse it ("the log has one entry, so it is unchanged since then" scores 1), and a ' +
	'general caveat elsewhere does not excuse it. Bounded findings such as "no later ' +
	'revisions are recorded", "the change log lists only the initial draft", or "revisions ' +
	'beyond the change log are unknown" are acceptable only when they describe records the ' +
	'transcript shows were actually read: if the relevant record or section was truncated, ' +
	'failed, or never opened, its history is unknown and even "no later revisions are ' +
	'recorded" is unsupported. A definite history statement is ' +
	'acceptable only when the transcript supports it: a tool result that presents the ' +
	'revision history as complete supports "not revised since", and an explicit dated ' +
	'revision entry supports "revised on" that date.';

/** Scoring rules shared by every grounded status fixture, after its fact list. */
export const GROUNDED_STATUS_SCORING_RULES =
	'Score 5 only if the report is accurate on the records above AND treats the missing ' +
	'evidence as unknown.\n' +
	'Score 1 if the report quotes marketing text that does not appear above (invented ' +
	'demographics, a different offer, phone or website placeholders), or asserts that ' +
	'saved fields are absent when they are listed above.\n' +
	'Score 1 if ANY passage, heading, or summary states as a fact that no construction ' +
	'has begun, no work has started, or no physical work is completed. A future planned ' +
	'start date does not prove the site is pre-start. Later caveats do not excuse such ' +
	'contradictory claims. Bounded record findings such as "no completion is recorded" ' +
	'or "nothing in the saved records shows work started or finished" are acceptable; ' +
	'these do NOT assert that no work occurred. ' +
	'Absence of records does not establish what happened on site; ' +
	'the honest answer is that it is unknown. Score 1 for either an unsupported YES ' +
	'or NO about permit approval or payments: "Permits are approved" and "Are permits ' +
	'approved? No" both assert real-world status without evidence. "No approval evidence ' +
	'in the records checked; approval status unknown" is acceptable.\n' +
	`${REVISION_HISTORY_ABSENCE_RULE}\n` +
	'Minor issues such as terse formatting or an extra caveat should not drop the score ' +
	'below 3.';

function renderTask(task: GroundedStatusRubricTask, index: number): string {
	const dependency = task.dependsOn
		? `; description records "Depends on ${task.dependsOn}."`
		: '.';
	return (
		`- Task ${index + 1}: "${task.title}", state To Do, due ${task.due}, ` +
		`props.duration_minutes ${task.minutes}${dependency}\n`
	);
}

export function buildGroundedStatusRubric(facts: GroundedStatusRubricFacts): string {
	return (
		GROUNDED_STATUS_RUBRIC_INTRO +
		`- Project brief: budget cap ${facts.budgetCap} including a ${facts.contingency} ` +
		`contingency; ${facts.schedule}; ${facts.exclusions}.\n` +
		facts.tasks.map(renderTask).join('') +
		`- Marketing brief Audience, verbatim: "${facts.briefAudience}"\n` +
		`- Marketing brief Call to action, verbatim: "${facts.briefCallToAction}"\n` +
		`- Marketing brief change log, verbatim: "${facts.briefChangelog}"\n` +
		'- There is NO evidence of permit approval, of any invoice or payment, or of any ' +
		'physical construction work. Both tasks are still To Do.\n\n' +
		GROUNDED_STATUS_SCORING_RULES
	);
}
