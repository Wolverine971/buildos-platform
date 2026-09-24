// apps/web/src/lib/privacy/retention-policy.ts
//
// The retention windows BuildOS states to users (Settings → Your data, /privacy).
// SQL enforces each one; `source` names the migration and the function or column
// where its interval lives. retention-policy.test.ts parses those SQL literals and
// fails when a window here disagrees, so change the SQL and this file together.

export type RetentionSource =
	| { kind: 'function_interval'; migration: string; fn: string }
	| { kind: 'function_default'; migration: string; fn: string; param: string }
	| { kind: 'column_default'; migration: string; table: string; column: string };

export interface RetentionWindow {
	/** Enforced window in days. */
	days: number;
	/** How the product says it. */
	label: string;
	source: RetentionSource;
}

export const RETENTION_WINDOWS = {
	/** chat_tool_executions: tool arguments and results, 30 days after the turn ends. */
	toolTraces: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'function_default',
			migration: '20260830010000_agentic_chat_track_i_hardening.sql',
			fn: 'cleanup_agentic_chat_sensitive_transcripts',
			param: 'p_retention_days'
		}
	},
	/** chat_prompt_snapshots: the assembled prompt of a turn, kept for debugging. */
	promptSnapshots: {
		days: 14,
		label: '14 days',
		source: {
			kind: 'function_default',
			migration: '20260830173250_agentic_chat_materialized_context_cache.sql',
			fn: 'cleanup_agentic_chat_prompt_artifacts',
			param: 'p_prompt_snapshot_retention_days'
		}
	},
	/** Soft-deleted projects, docs, tasks, voice notes, contacts: erased this long after deletion. */
	deletedItems: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190400_purge_soft_deleted_items.sql',
			fn: 'cleanup_privacy_deleted_project_items'
		}
	},
	/** onto_braindumps (History captures): erased this long after deletion. */
	deletedCaptures: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190600_privacy_gaps.sql',
			fn: 'cleanup_privacy_soft_deleted_braindumps'
		}
	},
	/**
	 * notification_events and notification_deliveries; in-app notifications once
	 * read or dismissed (unread ones stay until the person acts on them).
	 */
	notifications: {
		days: 90,
		label: '90 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190600_privacy_gaps.sql',
			fn: 'cleanup_privacy_notifications'
		}
	},
	/** webhook_events: Stripe event payloads, which include the customer email. */
	billingWebhookEvents: {
		days: 90,
		label: '90 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190600_privacy_gaps.sql',
			fn: 'cleanup_privacy_webhook_events'
		}
	},
	/** llm_usage_logs: model, tokens, cost. */
	aiUsage: {
		days: 400,
		label: '13 months',
		source: {
			kind: 'function_interval',
			migration: '20260924190000_privacy_retention.sql',
			fn: 'cleanup_privacy_llm_usage_logs'
		}
	},
	/** email_scan_checks: keyed message ids and a relevance score, no content. */
	emailScanLedger: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'column_default',
			migration: '20260924120000_email_scan_checks.sql',
			table: 'email_scan_checks',
			column: 'expires_at'
		}
	},
	/** email/calendar/profile/contact access audit logs: operation, outcome, counts. */
	accessAudit: {
		days: 180,
		label: '180 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190000_privacy_retention.sql',
			fn: 'cleanup_privacy_access_audits'
		}
	},
	/**
	 * calendar_analysis_events: title, start and end of the events a suggestion cites.
	 * Deleted with the suggestion (FK cascade) and never kept longer than this.
	 */
	calendarAnalysisEvents: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190500_calendar_analysis_minimal_events.sql',
			fn: 'cleanup_privacy_calendar_analysis_events'
		}
	},
	/** web_page_visits: page text fetched by background agent runs. */
	agentWebPages: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190000_privacy_retention.sql',
			fn: 'cleanup_privacy_web_page_evidence'
		}
	},
	/** user_data_exports: how long a finished export can be downloaded. */
	dataExportDownload: {
		days: 7,
		label: '7 days',
		source: {
			kind: 'function_interval',
			migration: '20260924190300_user_data_panel_and_exports.sql',
			fn: 'complete_user_data_export'
		}
	},
	/** account_deletion_requests.scheduled_for: the purge runs within this window. */
	accountDeletion: {
		days: 30,
		label: '30 days',
		source: {
			kind: 'column_default',
			migration: '20260716000000_account_deletion_and_legal_acceptance.sql',
			table: 'account_deletion_requests',
			column: 'scheduled_for'
		}
	}
} as const satisfies Record<string, RetentionWindow>;

export type RetentionWindowKey = keyof typeof RETENTION_WINDOWS;

/** Signed download links for a finished export (seconds). */
export const DATA_EXPORT_LINK_TTL_SECONDS = 60 * 60;

/** Export requests allowed per rolling 24 hours (request_user_data_export). */
export const DATA_EXPORT_REQUESTS_PER_DAY = 3;
