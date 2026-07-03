// packages/shared-types/src/project-audits.types.ts
//
// Durable complete project audit packets. These are report artifacts, not
// mutation proposals; concrete follow-up actions remain project_suggestions.

import type { Json } from './database.types';

export type ProjectAuditStatus =
	| 'queued'
	| 'running'
	| 'ready'
	| 'reviewed'
	| 'superseded'
	| 'archived'
	| 'failed';

export type ProjectAuditTriggerReason = 'scheduled' | 'burst' | 'critical_change' | 'manual';

export type ProjectAuditDepth = 'standard' | 'deep';

export type ProjectAuditDeliveryConfidence = 'green' | 'yellow' | 'red' | 'unknown';

export type ProjectAuditSizeClass =
	| 'below_baseline'
	| 'small_eligible'
	| 'medium'
	| 'large'
	| 'strategic';

export type ProjectAuditDimensionKey =
	| 'intent_clarity'
	| 'documentation_quality'
	| 'plan_integrity'
	| 'execution_health'
	| 'drift_scope_control'
	| 'risk_decision_quality'
	| 'dependency_readiness'
	| 'evidence_freshness';

export type ProjectAuditRating = 'green' | 'yellow' | 'red' | 'unknown';

export type ProjectAuditTriggerDecision =
	| 'queued'
	| 'deferred_quiet_period'
	| 'skipped_ineligible'
	| 'skipped_no_activity'
	| 'skipped_cooldown'
	| 'skipped_active_run'
	| 'skipped_duplicate'
	| 'manual_required';

export type ProjectAuditSuggestionRole =
	| 'recommended_action'
	| 'risk_follow_up'
	| 'cleanup'
	| 'decision_point';

export interface ProjectAuditEvidenceRef {
	entity_type:
		| 'project'
		| 'goal'
		| 'document'
		| 'task'
		| 'milestone'
		| 'risk'
		| 'calendar_event'
		| 'project_log'
		| 'audit'
		| 'suggestion'
		| 'external'
		| 'unknown';
	entity_id?: string;
	label: string;
	reason?: string;
	excerpt?: string;
	updated_at?: string;
}

export interface ProjectAuditDimension {
	key: ProjectAuditDimensionKey;
	name: string;
	rating: ProjectAuditRating;
	summary: string;
	evidence_refs: ProjectAuditEvidenceRef[];
	uncertainty?: string | null;
	recommendations?: string[];
}

export interface ProjectAuditRecommendation {
	title: string;
	summary: string;
	role?: ProjectAuditSuggestionRole;
	priority?: 'low' | 'medium' | 'high';
	target_entity_type?: string;
	target_entity_id?: string;
	evidence_refs?: ProjectAuditEvidenceRef[];
}

export interface ProjectAuditMaturitySnapshot {
	project_age_days: number | null;
	active_or_planning: boolean;
	activity_day_count: number;
	has_goal_or_substantial_description: boolean;
	content_thresholds_met: number;
	content_threshold_flags: {
		active_documents: boolean;
		substantial_document: boolean;
		non_deleted_tasks: boolean;
		goals_milestones_or_success_criteria: boolean;
		dated_commitment: boolean;
		total_entities: boolean;
	};
	entity_counts: {
		documents: number;
		tasks: number;
		goals: number;
		milestones: number;
		risks: number;
		plans: number;
		events: number;
		total: number;
	};
	ineligible_reasons: string[];
	manual_bypass: boolean;
}

export interface ProjectAuditTriggerSnapshot {
	trigger_reason: ProjectAuditTriggerReason;
	evaluated_at: string;
	eligible: boolean;
	project_size_class: ProjectAuditSizeClass;
	maturity_snapshot: ProjectAuditMaturitySnapshot;
	burst_score?: number | null;
	changed_entity_count?: number | null;
	major_change_count?: number | null;
	quiet_until?: string | null;
	cooldown_until?: string | null;
	last_audit_id?: string | null;
	reason_summary: string;
}

export interface ProjectAudit {
	id: string;
	project_id: string;
	user_id: string;
	loop_run_id: string | null;
	chat_session_id: string | null;
	status: ProjectAuditStatus;
	trigger_reason: ProjectAuditTriggerReason;
	audit_depth: ProjectAuditDepth;
	delivery_confidence: ProjectAuditDeliveryConfidence;
	project_size_class: Exclude<ProjectAuditSizeClass, 'below_baseline'>;
	project_thesis: string | null;
	summary: string;
	top_findings: Json;
	top_actions: Json;
	change_summary: Json;
	dimensions: ProjectAuditDimension[] | Json;
	risks: Json;
	open_questions: Json;
	evidence_refs: ProjectAuditEvidenceRef[] | Json;
	recommendations: ProjectAuditRecommendation[] | Json;
	generated_suggestion_count: number;
	unresolved_suggestion_count: number;
	trigger_snapshot: ProjectAuditTriggerSnapshot | Json;
	project_snapshot_fingerprint: string | null;
	model_used: string | null;
	cost_usd: number | null;
	error_message: string | null;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
	reviewed_at: string | null;
	archived_at: string | null;
	superseded_by: string | null;
	updated_at: string;
}

export interface ProjectAuditTriggerEvaluation {
	id: string;
	project_id: string;
	user_id: string;
	evaluated_at: string;
	decision: ProjectAuditTriggerDecision;
	trigger_reason: ProjectAuditTriggerReason;
	eligible: boolean;
	project_size_class: ProjectAuditSizeClass;
	maturity_snapshot: ProjectAuditMaturitySnapshot | Json;
	burst_score: number | null;
	changed_entity_count: number | null;
	major_change_count: number | null;
	last_audit_id: string | null;
	quiet_until: string | null;
	cooldown_until: string | null;
	reason_summary: string;
	created_audit_id: string | null;
	created_loop_run_id: string | null;
	created_at: string;
}

export interface ProjectAuditSuggestion {
	id: string;
	audit_id: string;
	suggestion_id: string;
	role: ProjectAuditSuggestionRole;
	created_at: string;
}
