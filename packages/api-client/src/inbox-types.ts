// packages/api-client/src/inbox-types.ts
//
// The AI Inbox ("Assistant's Desk") as the API returns it. Mirrors, by hand:
//   - apps/web/src/lib/server/inbox.service.ts (ListInboxItemsResult, InboxCountResult)
//   - packages/shared-agent-ops/src/inbox-index.ts (InboxIndexRow)
//   - apps/web/src/lib/types/inbox-check-ins.ts (check-ins)
//   - apps/web/src/lib/components/inbox/InboxEmailUpdatesStrip.svelte (EmailUpdateEntry)
// A project cleanup's payload is the shared `ProjectCleanupView`.
import type { ProjectCleanupAutoApplied, ProjectCleanupView } from '@buildos/shared-types';

export type InboxSourceType =
	| 'agent_run'
	| 'project_suggestion'
	| 'project_review'
	| 'project_audit'
	| 'project_cleanup'
	| 'calendar_suggestion'
	| 'profile_fragment'
	| 'contact_merge_candidate'
	| 'integration_attention';

export type InboxItemStatus =
	| 'pending'
	| 'deciding'
	| 'decided'
	| 'blocked'
	| 'expired'
	| 'snoozed'
	| 'deferred';

export type InboxProjectMeta = {
	id: string;
	name: string | null;
	state_key?: string | null;
	updated_at?: string | null;
};

/** One row of GET /api/inbox (`include_payload=1` fills `source_payload`). */
export type InboxItem = {
	id: string;
	source_type: InboxSourceType;
	source_ref_id: string;
	source_status?: string | null;
	user_id?: string | null;
	project_id?: string | null;
	audience: 'user' | 'project_members';
	status: InboxItemStatus;
	title: string;
	summary?: string | null;
	risk_tier?: number | null;
	action_kinds: string[];
	blocked_reason?: string | null;
	snoozed_until?: string | null;
	expires_at?: string | null;
	decided_at?: string | null;
	created_at?: string;
	updated_at?: string;
	freshness_state?: string | null;
	freshness_note?: string | null;
	project?: InboxProjectMeta | null;
	can_decide?: boolean;
	decision_disabled_reason?: string | null;
	/** The source row; for `project_cleanup` a `ProjectCleanupView`. */
	source_payload?: Record<string, unknown> | null;
	source_context?: Record<string, unknown> | null;
};

export type InboxListParams = {
	status?: InboxItemStatus | 'all';
	projectId?: string;
	sourceType?: InboxSourceType;
	limit?: number;
	/** `full` re-derives stale rows (the web's Refresh); default `none` is the fast read. */
	repair?: 'none' | 'full';
	includePayload?: boolean;
};

export type InboxListResponse = {
	items: InboxItem[];
	total: number;
	heldTotal: number;
	repairedCount: number;
	backfilledCount: number;
};

/** GET /api/inbox/count. `total` includes check-in and email cards. */
export type InboxCountResponse = {
	total: number;
	by_status: Record<string, number>;
	by_source_type: Record<string, number>;
	by_project: Record<string, number>;
	account: number;
	truncated: boolean;
	check_ins: number;
	email_updates: number;
};

/** `approve|address|reject` (and aliases) on POST /api/inbox/decide. Snooze has its own call. */
export type InboxDecideAction = 'approve' | 'address' | 'reject';

export type InboxDecideRequest = {
	item_id: string;
	action: InboxDecideAction | 'snooze';
	/** `address` needs it: what the user did. */
	resolution_text?: string;
	note?: string;
	snooze_until?: string;
};

/** The single-item answer; fields beyond `item` depend on the source. */
export type InboxDecideResponse = {
	item?: InboxItem | null;
	snoozed_until?: string;
	alreadyDecided?: boolean;
	superseded?: boolean;
	degraded?: boolean;
	[key: string]: unknown;
};

/** POST /api/inbox/[id]/chat-session: a chat seeded with the item, ready to open. */
export type InboxChatSessionRequest = {
	/** For a cleanup card: the one item to talk through. */
	cleanup_item_id?: string;
	cleanup_record_id?: string;
};

export type InboxChatSessionResponse = {
	created: boolean;
	chat_session_id: string;
	context_type: 'global' | 'project' | 'calendar';
	entity_id: string | null;
	project_id: string | null;
	item: InboxItem;
};

// ---------------------------------------------------------------------------------------------
// Project cleanup (POST /api/onto/projects/[id]/cleanup and /note, /undo)
// ---------------------------------------------------------------------------------------------

export type CleanupDecisionRequest = {
	suggestion_id: string;
	action: 'approve' | 'dismiss' | 'address';
	expected_fingerprint?: string | null;
	reason?: 'not_relevant' | 'wrong_evidence' | 'intentional' | 'too_risky' | 'other';
	note?: string;
};

export type CleanupOutcomeResponse = {
	suggestion_id: string;
	ok: boolean;
	status:
		| 'applied'
		| 'failed'
		| 'rejected'
		| 'addressed'
		| 'changed'
		| 'already_decided'
		| 'error';
	message?: string;
	receipt?: string[];
};

export type CleanupDecideResponse = {
	outcomes: CleanupOutcomeResponse[];
	view: ProjectCleanupView | null;
};

export type CleanupNoteRequest = {
	cleanup_item_id: string;
	note: string;
	/** The fingerprints the card showed, so a changed item is not acted on blindly. */
	expected_fingerprints?: Record<string, string | null>;
};

export type CleanupNoteResponse = {
	decision: string;
	reply: string | null;
	agent_run_id: string | null;
	outcomes: CleanupOutcomeResponse[];
	view: ProjectCleanupView | null;
};

export type CleanupUndoResponse = { ok: boolean; view: ProjectCleanupView | null };

/** GET /api/inbox/done-for-you: safe changes made without asking this week. */
export type DoneForYouEntry = ProjectCleanupAutoApplied & {
	project_id: string;
	project_name: string | null;
	/** Calendar changes carry their own relative Undo path. */
	undo_url?: string;
};

export type DoneForYouResponse = { items: DoneForYouEntry[] };

// ---------------------------------------------------------------------------------------------
// Check-ins ("Did this happen?" / "Still on?")
// ---------------------------------------------------------------------------------------------

export type CheckInTask = { id: string; title: string; state_key: string; due_at: string };

export type CheckInGroup = {
	key: string;
	due_date: string;
	/** "Oct 7" */
	label: string;
	task_count: number;
	tasks: CheckInTask[];
};

export type CheckInProject = {
	project_id: string;
	project_name: string;
	project_state: string;
	project_updated_at: string | null;
	last_touched_at: string | null;
	last_touched_date: string | null;
	/** Quiet projects ask "Still on?" instead of each task. */
	quiet: boolean;
	overdue_count: number;
	oldest_due_date: string | null;
	newest_due_date: string | null;
	groups: CheckInGroup[];
	truncated: boolean;
};

export type CheckInsResponse = {
	projects: CheckInProject[];
	time_zone: string;
	today: string;
	card_count: number;
	task_count: number;
};

export type CheckInTaskSnapshot = { state_key: string; due_at: string | null; archived: boolean };

export type CheckInAnswer =
	| {
			task_id: string;
			answer: 'done' | 'move' | 'drop' | 'restore';
			due_at?: string;
			previous?: CheckInTaskSnapshot;
	  }
	| {
			project_id: string;
			project_answer: 'pause' | 'finish' | 'restore';
			previous_state?: string;
	  };

export type CheckInAnswerResult =
	| {
			kind: 'task';
			task_id: string;
			answer: string;
			ok: true;
			changed: boolean;
			task: CheckInTaskSnapshot;
			previous: CheckInTaskSnapshot;
	  }
	| {
			kind: 'project';
			project_id: string;
			project_answer: string;
			ok: true;
			changed: boolean;
			state_key: string;
			previous_state: string;
	  }
	| { kind: 'task'; task_id: string; answer: string; ok: false; status: number; error: string }
	| {
			kind: 'project';
			project_id: string;
			project_answer: string;
			ok: false;
			status: number;
			error: string;
	  };

export type CheckInAnswersResponse = {
	results: CheckInAnswerResult[];
	changed: number;
	failed: number;
};

// ---------------------------------------------------------------------------------------------
// Email updates ("From your email")
// ---------------------------------------------------------------------------------------------

export type EmailUpdateEntry = {
	id: string;
	project_id: string;
	project_name: string | null;
	action: 'create_task' | 'update_task';
	task_id?: string | null;
	proposal?: { title?: string; due_date?: string; state_key?: string };
	current?: { title: string; due_at: string | null; state_key: string | null } | null;
	title: string;
	why: string | null;
	email: {
		subject: string;
		from: string;
		account_email: string;
		received_at: string | null;
		subject_quote?: { start: number; end: number };
	};
	gmail_url: string | null;
	created_at: string;
};

export type EmailUpdatesResponse = { items: EmailUpdateEntry[] };

/** 200 even when `ok` is false; read `ok`. */
export type EmailUpdateDecisionResponse =
	| { ok: true; status: string; task_id?: string | null }
	| { ok: false; reason: string; message: string };
