// packages/shared-types/src/tree-agent.types.ts
/**
 * Tree Agent types: event contract, plans, and result envelopes.
 *
 * These types intentionally do not depend on generated Database types so we can
 * iterate on the contract before the DB types are regenerated.
 */

import type { Json } from './database.types';

// ============================================================================
// Core enums (string unions mirror DB enums)
// ============================================================================

export type TreeAgentRunStatus =
	| 'queued'
	| 'running'
	| 'waiting_on_user'
	| 'completed'
	| 'stopped'
	| 'canceled'
	| 'failed';

export type TreeAgentNodeStatus =
	| 'planning'
	| 'delegating'
	| 'executing'
	| 'waiting'
	| 'aggregating'
	| 'completed'
	| 'failed'
	| 'blocked';

export type TreeAgentRoleState = 'planner' | 'executor';

export type TreeAgentArtifactType = 'document' | 'json' | 'summary' | 'other';

// ============================================================================
// Plans and steps
// ============================================================================

export interface TreeAgentSuccessAssessment {
	met: boolean;
	notes?: string;
}

export interface TreeAgentStep {
	id: string;
	title: string;
	reason: string;
	successCriteria: string[];
	bandIndex: number;
	stepIndex: number;
}

export interface TreeAgentBand {
	index: number;
	stepIds: string[];
}

export interface TreeAgentPlan {
	id: string;
	version: number;
	summary?: string;
	bands: TreeAgentBand[];
	steps: TreeAgentStep[];
}

// ============================================================================
// Result envelope (parent/child contract)
// ============================================================================

export type TreeAgentResultKind = 'json' | 'document' | 'hybrid';

export interface TreeAgentResult {
	kind: TreeAgentResultKind;
	summary: string;
	successAssessment?: TreeAgentSuccessAssessment;
	primaryArtifactId?: string;
	artifactIds: string[];
	documentIds: string[];
	jsonPayload?: Record<string, unknown>;
	scratchpadDocId?: string;
	scratchpadTail?: string;
}

// ============================================================================
// Events
// ============================================================================

export const TREE_AGENT_EVENT_TYPES = [
	'tree.run_started',
	'tree.node_created',
	'tree.node_status',
	'tree.node_completed',
	'tree.node_failed',
	'tree.plan_created',
	'tree.plan_band_created',
	'tree.step_created',
	'tree.step_status',
	'tree.node_delegated',
	'tree.scratchpad_linked',
	'tree.scratchpad_updated',
	'tree.tool_call_requested',
	'tree.tool_call_result',
	'tree.tools_manifest',
	'tree.context_warning',
	'tree.artifact_created',
	'tree.node_result',
	'tree.parent_hint',
	'tree.node_aggregated',
	'tree.replan_requested'
] as const;

export type TreeAgentEventType = (typeof TREE_AGENT_EVENT_TYPES)[number];

export interface TreeAgentEventBase {
	runId: string;
	nodeId: string;
	seq: number;
	createdAt: string;
}

export interface TreeRunStartedEvent extends TreeAgentEventBase {
	type: 'tree.run_started';
	payload: {
		objective: string;
		contextType?: string;
		contextProjectId?: string | null;
		context_type?: string;
		context_project_id?: string | null;
	};
}

export interface TreeNodeCreatedEvent extends TreeAgentEventBase {
	type: 'tree.node_created';
	payload: {
		parentNodeId?: string;
		title: string;
		reason: string;
		successCriteria: string[];
		depth: number;
		bandIndex: number;
		stepIndex: number;
	};
}

export interface TreeNodeStatusEvent extends TreeAgentEventBase {
	type: 'tree.node_status';
	payload: {
		status: TreeAgentNodeStatus;
		role: TreeAgentRoleState;
		message?: string;
		progress?: number;
	};
}

export interface TreeNodeCompletedEvent extends TreeAgentEventBase {
	type: 'tree.node_completed';
	payload: {
		outcome: 'success' | 'partial' | 'no_op';
		metrics?: Record<string, number>;
	};
}

export interface TreeNodeFailedEvent extends TreeAgentEventBase {
	type: 'tree.node_failed';
	payload: {
		error: string;
		retryable: boolean;
	};
}

export interface TreePlanCreatedEvent extends TreeAgentEventBase {
	type: 'tree.plan_created';
	payload: {
		planId: string;
		version: number;
		summary?: string;
	};
}

export interface TreePlanBandCreatedEvent extends TreeAgentEventBase {
	type: 'tree.plan_band_created';
	payload: {
		planId: string;
		bandIndex: number;
		stepIds: string[];
	};
}

export interface TreeStepCreatedEvent extends TreeAgentEventBase {
	type: 'tree.step_created';
	payload: TreeAgentStep;
}

export interface TreeStepStatusEvent extends TreeAgentEventBase {
	type: 'tree.step_status';
	payload: {
		stepId: string;
		status: TreeAgentNodeStatus;
	};
}

export interface TreeNodeDelegatedEvent extends TreeAgentEventBase {
	type: 'tree.node_delegated';
	payload: {
		stepId: string;
		childNodeId: string;
	};
}

export interface TreeScratchpadLinkedEvent extends TreeAgentEventBase {
	type: 'tree.scratchpad_linked';
	payload: { scratchpadDocId: string };
}

export interface TreeScratchpadUpdatedEvent extends TreeAgentEventBase {
	type: 'tree.scratchpad_updated';
	payload: {
		scratchpadDocId: string;
		tailPreview?: string;
		updatedAt: string;
	};
}

export interface TreeToolCallRequestedEvent extends TreeAgentEventBase {
	type: 'tree.tool_call_requested';
	payload: {
		toolName: string;
		args?: Json | null;
		purpose?: string | null;
		phase?: string | null;
		startedAt?: string;
	};
}

export interface TreeToolCallResultEvent extends TreeAgentEventBase {
	type: 'tree.tool_call_result';
	payload: {
		toolName: string;
		ok: boolean;
		summary?: string;
		error?: string | null;
		phase?: string | null;
		completedAt?: string;
	};
}

export interface TreeToolsManifestEvent extends TreeAgentEventBase {
	type: 'tree.tools_manifest';
	payload: {
		context_type: string;
		context_project_id?: string | null;
		tool_count: number;
		tool_names: string[];
	};
}

export interface TreeContextWarningEvent extends TreeAgentEventBase {
	type: 'tree.context_warning';
	payload: {
		requestedContextType?: string;
		requestedProjectId?: string | null;
		message: string;
	};
}

export interface TreeArtifactCreatedEvent extends TreeAgentEventBase {
	type: 'tree.artifact_created';
	payload: {
		artifactId: string;
		artifactType: TreeAgentArtifactType;
		documentId?: string;
		label?: string;
	};
}

export interface TreeNodeResultEvent extends TreeAgentEventBase {
	type: 'tree.node_result';
	payload: { result: TreeAgentResult };
}

export interface TreeParentHintEvent extends TreeAgentEventBase {
	type: 'tree.parent_hint';
	payload: {
		parentNodeId: string;
		hintType: 'read_documents' | 'read_json';
		artifactIds: string[];
		documentIds: string[];
	};
}

export interface TreeNodeAggregatedEvent extends TreeAgentEventBase {
	type: 'tree.node_aggregated';
	payload: {
		childIds: string[];
		summary: string;
		successAssessment?: TreeAgentSuccessAssessment;
	};
}

export interface TreeReplanRequestedEvent extends TreeAgentEventBase {
	type: 'tree.replan_requested';
	payload: {
		reason: string;
		basedOnChildIds?: string[];
	};
}

export type TreeAgentEvent =
	| TreeRunStartedEvent
	| TreeNodeCreatedEvent
	| TreeNodeStatusEvent
	| TreeNodeCompletedEvent
	| TreeNodeFailedEvent
	| TreePlanCreatedEvent
	| TreePlanBandCreatedEvent
	| TreeStepCreatedEvent
	| TreeStepStatusEvent
	| TreeNodeDelegatedEvent
	| TreeScratchpadLinkedEvent
	| TreeScratchpadUpdatedEvent
	| TreeToolCallRequestedEvent
	| TreeToolCallResultEvent
	| TreeToolsManifestEvent
	| TreeContextWarningEvent
	| TreeArtifactCreatedEvent
	| TreeNodeResultEvent
	| TreeParentHintEvent
	| TreeNodeAggregatedEvent
	| TreeReplanRequestedEvent;

// ============================================================================
// Event row + normalization helpers
// ============================================================================

export interface TreeAgentEventRow {
	id: string;
	run_id: string;
	node_id: string;
	seq: number | string | null;
	event_type: string;
	payload: Json;
	created_at: string;
}

export function isTreeAgentEventType(value: string): value is TreeAgentEventType {
	return (TREE_AGENT_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Best-effort normalization from a DB row into the typed event contract.
 * Callers should still handle null if the row is malformed.
 */
export function normalizeTreeAgentEvent(row: TreeAgentEventRow): TreeAgentEvent | null {
	if (!isTreeAgentEventType(row.event_type)) return null;
	const seq =
		typeof row.seq === 'string' ? Number.parseInt(row.seq, 10) : row.seq ?? NaN;
	if (!Number.isFinite(seq)) return null;

	const base: TreeAgentEventBase = {
		runId: row.run_id,
		nodeId: row.node_id,
		seq,
		createdAt: row.created_at
	};

	return {
		...base,
		type: row.event_type,
		payload: (row.payload ?? {}) as Record<string, unknown>
	} as TreeAgentEvent;
}
