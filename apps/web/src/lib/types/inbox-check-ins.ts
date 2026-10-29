// apps/web/src/lib/types/inbox-check-ins.ts
// AI Inbox check-ins (tasker 149, lane A): "Did this happen?" for overdue tasks and
// "Still on?" for projects that went quiet. Shared by the server service, the routes
// and the inbox UI.

/** A project counts as quiet when nothing in it changed for this many days. */
export const CHECK_IN_QUIET_AFTER_DAYS = 45;
export const CHECK_IN_MAX_TASKS_PER_PROJECT = 40;
export const CHECK_IN_MAX_PROJECTS = 20;
export const CHECK_IN_MAX_ANSWERS = 60;
export const CHECK_IN_DEFAULT_TIME_ZONE = 'America/New_York';

export type CheckInTask = {
	id: string;
	title: string;
	state_key: string;
	due_at: string;
};

/** Overdue tasks that share a due day (civil date in the viewer's time zone). */
export type CheckInGroup = {
	key: string;
	/** YYYY-MM-DD in the requested time zone. */
	due_date: string;
	/** "Oct 7" (adds the year when it is not this year). */
	label: string;
	task_count: number;
	tasks: CheckInTask[];
};

export type CheckInProject = {
	project_id: string;
	project_name: string;
	project_state: string;
	project_updated_at: string | null;
	/** Newer of the project row and its latest task change. */
	last_touched_at: string | null;
	/** last_touched_at as YYYY-MM-DD in the requested time zone. */
	last_touched_date: string | null;
	/** Nothing changed for CHECK_IN_QUIET_AFTER_DAYS: ask "Still on?" instead of each task. */
	quiet: boolean;
	overdue_count: number;
	oldest_due_date: string | null;
	newest_due_date: string | null;
	/** Newest due day first. */
	groups: CheckInGroup[];
	/** Some overdue tasks were left out (per-project cap). */
	truncated: boolean;
};

export type CheckInsPayload = {
	projects: CheckInProject[];
	time_zone: string;
	/** YYYY-MM-DD today in time_zone. */
	today: string;
	/** One card per project (a quiet project is one card). */
	card_count: number;
	task_count: number;
};

export type CheckInTaskAnswerKind = 'done' | 'move' | 'drop' | 'restore';
export type CheckInProjectAnswerKind = 'pause' | 'finish' | 'restore';

/** What Undo puts back. */
export type CheckInTaskSnapshot = {
	state_key: string;
	due_at: string | null;
	archived: boolean;
};

export type CheckInTaskAnswer = {
	task_id: string;
	answer: CheckInTaskAnswerKind;
	/** move: the new due date (ISO instant, or YYYY-MM-DD for the user's civil day). */
	due_at?: string;
	/** restore: the values to put back (from an earlier result's `previous`). */
	previous?: CheckInTaskSnapshot;
};

export type CheckInProjectAnswer = {
	project_id: string;
	project_answer: CheckInProjectAnswerKind;
	/** restore: the state to put back. */
	previous_state?: string;
};

export type CheckInAnswer = CheckInTaskAnswer | CheckInProjectAnswer;

export type CheckInTaskResult =
	| {
			kind: 'task';
			task_id: string;
			answer: CheckInTaskAnswerKind;
			ok: true;
			/** False when the task already matched (nothing written). */
			changed: boolean;
			task: CheckInTaskSnapshot;
			previous: CheckInTaskSnapshot;
	  }
	| {
			kind: 'task';
			task_id: string;
			answer: CheckInTaskAnswerKind;
			ok: false;
			status: number;
			error: string;
	  };

export type CheckInProjectResult =
	| {
			kind: 'project';
			project_id: string;
			project_answer: CheckInProjectAnswerKind;
			ok: true;
			changed: boolean;
			state_key: string;
			previous_state: string;
	  }
	| {
			kind: 'project';
			project_id: string;
			project_answer: CheckInProjectAnswerKind;
			ok: false;
			status: number;
			error: string;
	  };

export type CheckInAnswerResult = CheckInTaskResult | CheckInProjectResult;

export type CheckInAnswersPayload = {
	results: CheckInAnswerResult[];
	/** Answers that changed something. */
	changed: number;
	failed: number;
};

export type CheckInChatPayload = {
	chat_session_id: string;
	context_type: 'project';
	entity_id: string;
	created: boolean;
};
