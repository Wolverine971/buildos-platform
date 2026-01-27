// apps/worker/src/workers/tree-agent/treeAgentWorker.ts
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	getDefaultToolNamesForContextType,
	getToolGuideForContextType,
	type TreeAgentContextType
} from './tools/treeAgentToolRegistry';
import {
	createTreeAgentToolContext,
	executeTreeAgentToolCalls,
	summarizeToolResults,
	type TreeAgentToolCall,
	type TreeAgentToolContext
} from './tools/treeAgentToolExecutor';

const TREE_AGENT_SCRATCHPAD_TYPE = 'document.tree_agent.scratchpad';
const TREE_AGENT_ARTIFACT_DOC_TYPE = 'document.tree_agent.artifact';
const DEFAULT_DOC_STATE = 'draft';
const MAX_PARALLEL_CHILDREN = 3;
const MAX_TOOL_CALLS_PER_PASS = 6;

type TreeAgentRunRow = {
	id: string;
	user_id: string;
	objective: string;
	status: string;
	root_node_id: string | null;
	workspace_project_id: string | null;
	metrics: Record<string, unknown> | null;
	// Context fields (Phase 2)
	scope?: 'global' | 'project' | 'multi_project';
	project_ids?: string[] | null;
};

type TreeAgentNodeRow = {
	id: string;
	run_id: string;
	parent_node_id: string | null;
	title: string;
	reason: string;
	success_criteria: unknown;
	status: string;
	role_state: string;
	scratchpad_doc_id: string | null;
	depth: number;
};

type TreeAgentJobMetadata = {
	run_id: string;
	root_node_id: string;
	workspace_project_id: string;
	budgets: { max_wall_clock_ms: number };
	context_type?: TreeAgentContextType;
	context_project_id?: string | null;
};

type TreeAgentResult = {
	kind: 'json' | 'document' | 'hybrid';
	summary: string;
	successAssessment?: { met: boolean; notes?: string };
	primaryArtifactId?: string;
	artifactIds: string[];
	documentIds: string[];
	jsonPayload?: Record<string, unknown>;
	scratchpadDocId?: string;
	scratchpadTail?: string;
};

type PlannerMode = 'execute' | 'plan';

type PlannerOutput = {
	mode: PlannerMode;
	modeReason: string;
	leafDecision?: {
		canExecuteDirectly: boolean;
		complexity: 'low' | 'medium' | 'high';
		blockers: string[];
	};
	plan?: {
		summary: string;
		bands: Array<{
			index: number;
			goal: string;
			parallelizable: boolean;
			steps: Array<{
				id: string;
				title: string;
				reason: string;
				successCriteria: string[];
				stepIndex: number;
			}>;
		}>;
	};
	scratchpad: {
		appendMarkdown: string;
		tailPreview: string;
	};
};

type ExecutorOutput = {
	actions?: Array<{
		kind: 'analysis' | 'tool_call' | 'document';
		note: string;
		toolName?: string;
		toolArgs?: Record<string, unknown>;
	}>;
	artifacts?: Array<{
		type: 'document' | 'json' | 'summary' | 'other';
		label: string;
		title?: string;
		documentMarkdown?: string;
		jsonPayload?: Record<string, unknown>;
		isPrimary?: boolean;
	}>;
	result: {
		kind: 'json' | 'document' | 'hybrid';
		summary: string;
		successAssessment?: { met: boolean; notes?: string };
		primaryArtifactLabel?: string;
		parentHint: {
			hintType: 'read_documents' | 'read_json';
			artifactLabels: string[];
		};
	};
	scratchpad: {
		appendMarkdown: string;
		tailPreview: string;
	};
};

type AggregatorOutput = {
	synthesis: {
		summary: string;
		keyFindings: string[];
		gaps: string[];
	};
	artifacts?: Array<{
		type: 'document' | 'json' | 'summary' | 'other';
		label: string;
		title?: string;
		documentMarkdown?: string;
		jsonPayload?: Record<string, unknown>;
		isPrimary?: boolean;
	}>;
	result: ExecutorOutput['result'];
	next: {
		shouldReplan: boolean;
		replanReason?: string;
	};
	scratchpad: {
		appendMarkdown: string;
		tailPreview: string;
	};
};

function nowIso() {
	return new Date().toISOString();
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tailPreviewFromEntry(entry: string): string {
	const lines = entry
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	const lastLine = lines.length ? lines[lines.length - 1] : 'Scratchpad updated';
	return lastLine.length > 160 ? `${lastLine.slice(0, 157)}...` : lastLine;
}

type TreeAgentRunContext = {
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	metricsObject: Record<string, unknown>;
	toolNames: string[];
	toolGuide: string;
};

function resolveRunContext(
	run: TreeAgentRunRow,
	metadata?: TreeAgentJobMetadata
): TreeAgentRunContext {
	const metricsObject = isJsonObject(run.metrics) ? { ...run.metrics } : {};

	// Priority: metadata fields (Phase 2) > metrics.context (legacy)
	let requestedType: 'global' | 'project' = 'global';
	let requestedProjectId: string | null = null;

	// Try metadata context fields first (from queue)
	if (metadata?.context_type) {
		requestedType = metadata.context_type === 'project' ? 'project' : 'global';
		requestedProjectId = metadata.context_project_id ?? null;
	}
	// Fall back to database scope/project_ids columns if available
	else if (run.scope && run.scope !== 'global') {
		requestedType = run.scope === 'project' ? 'project' : 'global';
		requestedProjectId =
			run.project_ids && run.project_ids.length > 0 ? run.project_ids[0] : null;
	}
	// Final fallback to metrics.context (for backward compatibility)
	else {
		const rawContext = isJsonObject(metricsObject.context) ? metricsObject.context : {};
		requestedType = rawContext.type === 'project' ? 'project' : 'global';
		requestedProjectId =
			typeof rawContext.project_id === 'string' && rawContext.project_id
				? rawContext.project_id
				: null;
	}

	const contextType =
		requestedType === 'project' && requestedProjectId
			? ('project' as const)
			: ('global' as const);
	const contextProjectId = contextType === 'project' ? requestedProjectId : null;
	const toolNames = getDefaultToolNamesForContextType(contextType);
	const toolGuide = getToolGuideForContextType(contextType, toolNames);

	return { contextType, contextProjectId, metricsObject, toolNames, toolGuide };
}

async function insertEvent(runId: string, nodeId: string, type: string, payload: unknown) {
	const adminSb = supabase as any;
	const { error } = await adminSb.from('tree_agent_events').insert({
		run_id: runId,
		node_id: nodeId,
		event_type: type,
		payload
	});
	if (error) {
		console.error('[TreeAgent] Failed to insert event', type, error.message);
	}
}

async function ensureActorId(userId: string): Promise<string> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', { p_user_id: userId });
	if (error || !data) {
		throw new Error(error?.message ?? 'Failed to resolve actor id');
	}
	return data;
}

async function ensureNodeScratchpad(params: {
	run: TreeAgentRunRow;
	node: TreeAgentNodeRow;
	actorId: string;
}) {
	const { run, node, actorId } = params;
	if (!run.workspace_project_id) {
		throw new Error('Run missing workspace_project_id');
	}
	if (node.scratchpad_doc_id) return node.scratchpad_doc_id;

	const adminSb = supabase as any;
	const { data: doc, error } = await adminSb
		.from('onto_documents')
		.insert({
			project_id: run.workspace_project_id,
			title: `Scratchpad: ${node.title.slice(0, 80)}`,
			type_key: TREE_AGENT_SCRATCHPAD_TYPE,
			state_key: DEFAULT_DOC_STATE,
			created_by: actorId,
			content: `# Scratchpad\n\nRun: ${run.id}\nNode: ${node.id}\n`,
			props: {
				doc_role: 'tree_agent_scratchpad',
				tree_agent_run_id: run.id,
				tree_agent_node_id: node.id,
				parent_node_id: node.parent_node_id,
				depth: node.depth
			}
		})
		.select('id')
		.single();

	if (error || !doc?.id) {
		throw new Error(error?.message ?? 'Failed to create node scratchpad');
	}

	await adminSb.from('tree_agent_nodes').update({ scratchpad_doc_id: doc.id }).eq('id', node.id);

	await insertEvent(run.id, node.id, 'tree.scratchpad_linked', { scratchpadDocId: doc.id });
	await insertEvent(run.id, node.id, 'tree.scratchpad_updated', {
		scratchpadDocId: doc.id,
		tailPreview: 'Scratchpad initialized',
		updatedAt: nowIso()
	});

	return doc.id;
}

async function appendScratchpad(docId: string, entry: string) {
	const adminSb = supabase as any;
	const { data: existing } = await adminSb
		.from('onto_documents')
		.select('content')
		.eq('id', docId)
		.maybeSingle();
	const nextContent = `${existing?.content ?? ''}\n${entry}`;
	await adminSb
		.from('onto_documents')
		.update({ content: nextContent, updated_at: nowIso() })
		.eq('id', docId);
}

async function loadScratchpadContent(docId: string): Promise<string> {
	const adminSb = supabase as any;
	const { data } = await adminSb
		.from('onto_documents')
		.select('content')
		.eq('id', docId)
		.maybeSingle();
	return (data?.content ?? '') as string;
}

async function updateNodeStatus(params: {
	runId: string;
	nodeId: string;
	status: string;
	role: string;
	message?: string;
}) {
	const { runId, nodeId, status, role, message } = params;
	const adminSb = supabase as any;
	await adminSb.from('tree_agent_nodes').update({ status, role_state: role }).eq('id', nodeId);
	await insertEvent(runId, nodeId, 'tree.node_status', {
		status,
		role,
		message: message ?? null
	});
}

async function appendScratchpadWithEvent(params: {
	runId: string;
	nodeId: string;
	docId: string;
	entry: string;
	tailPreview?: string;
}) {
	const { runId, nodeId, docId, entry, tailPreview } = params;
	await appendScratchpad(docId, entry);
	await insertEvent(runId, nodeId, 'tree.scratchpad_updated', {
		scratchpadDocId: docId,
		tailPreview: tailPreview ?? tailPreviewFromEntry(entry),
		updatedAt: nowIso()
	});
}

async function runToolBootstrap(params: {
	runId: string;
	nodeId: string;
	scratchpadDocId: string;
	toolContext: TreeAgentToolContext;
	toolCalls: TreeAgentToolCall[];
	phase: string;
}) {
	const { runId, nodeId, scratchpadDocId, toolContext, toolCalls, phase } = params;
	const startedAt = nowIso();
	for (const call of toolCalls) {
		await insertEvent(runId, nodeId, 'tree.tool_call_requested', {
			toolName: call.name,
			args: call.args,
			purpose: call.purpose ?? null,
			phase,
			startedAt
		});
	}

	const executed = await executeTreeAgentToolCalls({
		ctx: toolContext,
		toolCalls,
		maxCalls: toolCalls.length
	});
	const summaries = summarizeToolResults(executed.results);

	for (const summary of summaries) {
		await insertEvent(runId, nodeId, 'tree.tool_call_result', {
			toolName: summary.name,
			ok: summary.ok,
			summary: summary.summary,
			error: summary.error ?? null,
			phase,
			completedAt: nowIso()
		});
	}

	const contextLabel =
		toolContext.contextType === 'project' && toolContext.contextProjectId
			? `${toolContext.contextType}:${toolContext.contextProjectId}`
			: toolContext.contextType;
	const lines = summaries.map((s) =>
		s.ok ? `- ${s.name}: ${s.summary}` : `- ${s.name}: error (${s.error ?? 'unknown'})`
	);
	const entry = `\n## Tools (${phase}) — ${startedAt}\nContext: ${contextLabel}\n${lines.join('\n')}\n`;
	await appendScratchpadWithEvent({
		runId,
		nodeId,
		docId: scratchpadDocId,
		entry,
		tailPreview: `tools:${phase}:${summaries[0]?.name ?? 'none'}`
	});

	return { executed, summaries };
}

async function persistPlan(params: { runId: string; nodeId: string; plan: PlannerOutput['plan'] }) {
	const { runId, nodeId, plan } = params;
	if (!plan) return null;
	const adminSb = supabase as any;

	const { data: latest } = await adminSb
		.from('tree_agent_plans')
		.select('version')
		.eq('run_id', runId)
		.eq('node_id', nodeId)
		.order('version', { ascending: false })
		.limit(1)
		.maybeSingle();

	const nextVersion = typeof latest?.version === 'number' ? latest.version + 1 : 1;
	const planJson = {
		version: nextVersion,
		summary: plan.summary,
		bands: plan.bands
	};

	const { data: planRow, error } = await adminSb
		.from('tree_agent_plans')
		.insert({
			run_id: runId,
			node_id: nodeId,
			version: nextVersion,
			plan_json: planJson
		})
		.select('id')
		.single();
	if (error || !planRow?.id) {
		throw new Error(error?.message ?? 'Failed to persist plan');
	}

	await insertEvent(runId, nodeId, 'tree.plan_created', {
		planId: planRow.id,
		version: nextVersion,
		summary: plan.summary
	});

	for (const band of plan.bands) {
		await insertEvent(runId, nodeId, 'tree.plan_band_created', {
			planId: planRow.id,
			bandIndex: band.index,
			stepIds: band.steps.map((step) => step.id)
		});
	}

	return { id: planRow.id, version: nextVersion, planJson };
}

async function registerJsonArtifact(params: {
	runId: string;
	nodeId: string;
	label: string;
	jsonPayload: Record<string, unknown> | null;
	isPrimary?: boolean;
	artifactType?: 'json' | 'summary' | 'other';
}) {
	const { runId, nodeId, label, jsonPayload, isPrimary = false, artifactType = 'json' } = params;
	const adminSb = supabase as any;
	const { data: artifact, error } = await adminSb
		.from('tree_agent_artifacts')
		.insert({
			run_id: runId,
			node_id: nodeId,
			artifact_type: artifactType,
			label,
			json_payload: jsonPayload ?? {},
			is_primary: isPrimary
		})
		.select('id')
		.single();
	if (error || !artifact?.id) {
		throw new Error(error?.message ?? 'Failed to register json artifact');
	}
	return artifact.id as string;
}

async function persistArtifacts(params: {
	run: TreeAgentRunRow;
	node: TreeAgentNodeRow;
	actorId: string;
	artifacts: ExecutorOutput['artifacts'] | AggregatorOutput['artifacts'] | undefined;
}) {
	const { run, node, actorId, artifacts } = params;
	const artifactIds: string[] = [];
	const documentIds: string[] = [];
	const labelToArtifactId: Record<string, string> = {};
	const adminSb = supabase as any;

	for (const artifact of artifacts ?? []) {
		if (!artifact?.label) continue;
		const isPrimary = Boolean(artifact.isPrimary);

		if (artifact.type === 'document') {
			const docId = await createArtifactDocument({
				run,
				node,
				actorId,
				title: artifact.title ?? `Tree Agent Artifact (${artifact.label})`,
				content: artifact.documentMarkdown ?? ''
			});
			const artifactId = await registerDocumentArtifact({
				runId: run.id,
				nodeId: node.id,
				documentId: docId,
				label: artifact.label,
				isPrimary
			});
			await insertEvent(run.id, node.id, 'tree.artifact_created', {
				artifactId,
				artifactType: 'document',
				documentId: docId,
				label: artifact.label
			});
			artifactIds.push(artifactId);
			documentIds.push(docId);
			labelToArtifactId[artifact.label] = artifactId;
			continue;
		}

		const artifactType = artifact.type ?? 'json';
		const artifactId = await registerJsonArtifact({
			runId: run.id,
			nodeId: node.id,
			label: artifact.label,
			jsonPayload: artifact.jsonPayload ?? null,
			isPrimary,
			artifactType:
				artifactType === 'summary' ? 'summary' : artifactType === 'other' ? 'other' : 'json'
		});
		await insertEvent(run.id, node.id, 'tree.artifact_created', {
			artifactId,
			artifactType,
			label: artifact.label
		});
		artifactIds.push(artifactId);
		labelToArtifactId[artifact.label] = artifactId;
	}

	return { artifactIds, documentIds, labelToArtifactId };
}

function buildResultEnvelope(params: {
	outputResult: ExecutorOutput['result'];
	artifactIds: string[];
	documentIds: string[];
	labelToArtifactId: Record<string, string>;
	scratchpadDocId: string;
	scratchpadTail: string;
	jsonArtifacts?: Array<{ label: string; payload: Record<string, unknown> | null }>;
}): TreeAgentResult {
	const {
		outputResult,
		artifactIds,
		documentIds,
		labelToArtifactId,
		scratchpadDocId,
		scratchpadTail,
		jsonArtifacts
	} = params;

	const primaryArtifactId = outputResult.primaryArtifactLabel
		? labelToArtifactId[outputResult.primaryArtifactLabel]
		: undefined;

	const jsonPayload = jsonArtifacts?.length
		? (jsonArtifacts[0]?.payload ?? undefined)
		: undefined;

	return {
		kind: outputResult.kind,
		summary: outputResult.summary,
		successAssessment: outputResult.successAssessment,
		primaryArtifactId,
		artifactIds,
		documentIds,
		jsonPayload,
		scratchpadDocId,
		scratchpadTail
	};
}

function extractToolCalls(output: ExecutorOutput): TreeAgentToolCall[] {
	const calls: TreeAgentToolCall[] = [];
	for (const action of output.actions ?? []) {
		if (action.kind !== 'tool_call' || !action.toolName) continue;
		calls.push({
			name: action.toolName,
			args: action.toolArgs ?? {},
			purpose: action.note
		});
	}
	return calls;
}

function formatToolResultsForPrompt(
	toolCalls: TreeAgentToolCall[],
	results: Array<{ name: string; ok: boolean; result?: unknown; error?: string }>
) {
	return toolCalls
		.map((call, idx) => {
			const result = results[idx];
			if (!result) return `- ${call.name}: no result`;
			if (!result.ok) return `- ${call.name}: error (${result.error ?? 'unknown'})`;
			const payload = JSON.stringify(result.result ?? {}, null, 2);
			const trimmed = payload.length > 2000 ? `${payload.slice(0, 2000)}...` : payload;
			return `- ${call.name}: ok\n${trimmed}`;
		})
		.join('\n');
}

async function callPlannerLLM(params: {
	llm: SmartLLMService;
	run: TreeAgentRunRow;
	node: TreeAgentNodeRow;
	scratchpad: string;
	userId: string;
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	onUsage?: (event: {
		model: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
	}) => void | Promise<void>;
}) {
	const { llm, run, node, scratchpad, userId, contextType, contextProjectId } = params;
	const systemPrompt = `You are the Tree Agent Planner.
Return ONLY valid JSON with this schema:
{
  "mode": "execute"|"plan",
  "modeReason": string,
  "leafDecision": { "canExecuteDirectly": boolean, "complexity": "low"|"medium"|"high", "blockers": string[] },
  "plan": {
    "summary": string,
    "bands": [{ "index": number, "goal": string, "parallelizable": boolean, "steps": [{ "id": string, "title": string, "reason": string, "successCriteria": string[], "stepIndex": number }] }]
  },
  "scratchpad": { "appendMarkdown": string, "tailPreview": string }
}

Rules:
- If mode is "plan", include plan.bands and steps.
- Bands execute sequentially; steps inside a band run in parallel.
- Keep step ids stable if replanning.
- Always include scratchpad updates.`;

	const contextBlock = `Context: ${contextType}${contextProjectId ? ` (${contextProjectId})` : ''}`;
	const criteria = Array.isArray(node.success_criteria) ? node.success_criteria : [];
	const userPrompt = `Objective: ${run.objective}
Node: ${node.title}
Reason: ${node.reason}
Success Criteria:
${criteria.map((c: string) => `- ${c}`).join('\n') || '- none'}
Depth: ${node.depth}
${contextBlock}

Scratchpad (latest):
${scratchpad.slice(-6000)}

Respond with JSON only.`;

	return llm.getJSONResponse<PlannerOutput>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'other',
		metadata: { tree_agent_run_id: run.id, tree_agent_node_id: node.id },
		onUsage: params.onUsage
	});
}

async function callExecutorLLM(params: {
	llm: SmartLLMService;
	run: TreeAgentRunRow;
	node: TreeAgentNodeRow;
	scratchpad: string;
	userId: string;
	toolGuide: string;
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	toolResultsBlock?: string;
	allowToolCalls: boolean;
	onUsage?: (event: {
		model: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
	}) => void | Promise<void>;
}) {
	const {
		llm,
		run,
		node,
		scratchpad,
		userId,
		toolGuide,
		contextType,
		contextProjectId,
		toolResultsBlock,
		allowToolCalls
	} = params;

	const systemPrompt = `You are the Tree Agent Executor.
Return ONLY valid JSON with this schema:
{
  "actions": [{ "kind": "analysis"|"tool_call"|"document", "note": string, "toolName"?: string, "toolArgs"?: object }],
  "artifacts": [{ "type": "document"|"json"|"summary"|"other", "label": string, "title"?: string, "documentMarkdown"?: string, "jsonPayload"?: object, "isPrimary"?: boolean }],
  "result": {
    "kind": "json"|"document"|"hybrid",
    "summary": string,
    "successAssessment"?: { "met": boolean, "notes"?: string },
    "primaryArtifactLabel"?: string,
    "parentHint": { "hintType": "read_documents"|"read_json", "artifactLabels": string[] }
  },
  "scratchpad": { "appendMarkdown": string, "tailPreview": string }
}

Available tools:
${toolGuide}

Rules:
- Use only available tools.
- ${allowToolCalls ? 'If tools are needed, include tool_call actions.' : 'Do NOT include tool_call actions.'}
- Always include scratchpad updates.
- If you create document artifacts, include title + documentMarkdown.`;

	const contextBlock = `Context: ${contextType}${contextProjectId ? ` (${contextProjectId})` : ''}`;
	const criteria = Array.isArray(node.success_criteria) ? node.success_criteria : [];
	const toolBlock = toolResultsBlock
		? `
Tool Results:
${toolResultsBlock}
`
		: '';

	const userPrompt = `Objective: ${run.objective}
Node: ${node.title}
Reason: ${node.reason}
Success Criteria:
${criteria.map((c: string) => `- ${c}`).join('\n') || '- none'}
Depth: ${node.depth}
${contextBlock}
${toolBlock}
Scratchpad (latest):
${scratchpad.slice(-6000)}

Respond with JSON only.`;

	return llm.getJSONResponse<ExecutorOutput>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'other',
		metadata: { tree_agent_run_id: run.id, tree_agent_node_id: node.id },
		onUsage: params.onUsage
	});
}

async function callAggregatorLLM(params: {
	llm: SmartLLMService;
	run: TreeAgentRunRow;
	node: TreeAgentNodeRow;
	scratchpad: string;
	userId: string;
	childrenSummary: string;
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	onUsage?: (event: {
		model: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
	}) => void | Promise<void>;
}) {
	const { llm, run, node, scratchpad, userId, childrenSummary, contextType, contextProjectId } =
		params;

	const systemPrompt = `You are the Tree Agent Aggregator.
Return ONLY valid JSON with this schema:
{
  "synthesis": { "summary": string, "keyFindings": string[], "gaps": string[] },
  "artifacts": [{ "type": "document"|"json"|"summary"|"other", "label": string, "title"?: string, "documentMarkdown"?: string, "jsonPayload"?: object, "isPrimary"?: boolean }],
  "result": {
    "kind": "json"|"document"|"hybrid",
    "summary": string,
    "successAssessment"?: { "met": boolean, "notes"?: string },
    "primaryArtifactLabel"?: string,
    "parentHint": { "hintType": "read_documents"|"read_json", "artifactLabels": string[] }
  },
  "next": { "shouldReplan": boolean, "replanReason"?: string },
  "scratchpad": { "appendMarkdown": string, "tailPreview": string }
}

Rules:
- Always include scratchpad updates.
- Use child results to synthesize; cite key evidence in synthesis.`;

	const contextBlock = `Context: ${contextType}${contextProjectId ? ` (${contextProjectId})` : ''}`;
	const criteria = Array.isArray(node.success_criteria) ? node.success_criteria : [];
	const userPrompt = `Objective: ${run.objective}
Node: ${node.title}
Reason: ${node.reason}
Success Criteria:
${criteria.map((c: string) => `- ${c}`).join('\n') || '- none'}
Depth: ${node.depth}
${contextBlock}

Child Results:
${childrenSummary}

Scratchpad (latest):
${scratchpad.slice(-6000)}

Respond with JSON only.`;

	return llm.getJSONResponse<AggregatorOutput>({
		systemPrompt,
		userPrompt,
		userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'other',
		metadata: { tree_agent_run_id: run.id, tree_agent_node_id: node.id },
		onUsage: params.onUsage
	});
}

async function createArtifactDocument(params: {
	run: TreeAgentRunRow;
	node: TreeAgentNodeRow;
	actorId: string;
	title: string;
	content: string;
}) {
	const { run, node, actorId, title, content } = params;
	if (!run.workspace_project_id) {
		throw new Error('Run missing workspace_project_id');
	}
	const adminSb = supabase as any;
	const { data: doc, error } = await adminSb
		.from('onto_documents')
		.insert({
			project_id: run.workspace_project_id,
			title,
			type_key: TREE_AGENT_ARTIFACT_DOC_TYPE,
			state_key: DEFAULT_DOC_STATE,
			created_by: actorId,
			content,
			props: {
				doc_role: 'tree_agent_artifact',
				tree_agent_run_id: run.id,
				tree_agent_node_id: node.id,
				parent_node_id: node.parent_node_id,
				depth: node.depth
			}
		})
		.select('id')
		.single();

	if (error || !doc?.id) {
		throw new Error(error?.message ?? 'Failed to create artifact document');
	}
	return doc.id;
}

async function registerDocumentArtifact(params: {
	runId: string;
	nodeId: string;
	documentId: string;
	label: string;
	isPrimary?: boolean;
}) {
	const { runId, nodeId, documentId, label, isPrimary = true } = params;
	const adminSb = supabase as any;
	const { data: artifact, error } = await adminSb
		.from('tree_agent_artifacts')
		.insert({
			run_id: runId,
			node_id: nodeId,
			artifact_type: 'document',
			label,
			document_id: documentId,
			is_primary: isPrimary
		})
		.select('id')
		.single();

	if (error || !artifact?.id) {
		throw new Error(error?.message ?? 'Failed to register document artifact');
	}
	return artifact.id as string;
}

async function completeNode(params: {
	runId: string;
	nodeId: string;
	result: TreeAgentResult;
	status?: 'completed' | 'failed';
}) {
	const { runId, nodeId, result, status = 'completed' } = params;
	const adminSb = supabase as any;
	const endedAt = nowIso();
	await adminSb
		.from('tree_agent_nodes')
		.update({ status, role_state: 'executor', result, ended_at: endedAt })
		.eq('id', nodeId);
	await insertEvent(runId, nodeId, 'tree.node_result', { result });
	await insertEvent(runId, nodeId, 'tree.node_completed', { outcome: 'success' });
}

async function createChildNode(params: {
	run: TreeAgentRunRow;
	parentNodeId: string;
	step: {
		id: string;
		title: string;
		reason: string;
		successCriteria: string[];
		bandIndex: number;
		stepIndex: number;
	};
	depth: number;
}) {
	const { run, parentNodeId, step, depth } = params;
	const adminSb = supabase as any;
	const { data: node, error } = await adminSb
		.from('tree_agent_nodes')
		.insert({
			run_id: run.id,
			parent_node_id: parentNodeId,
			title: step.title,
			reason: step.reason,
			success_criteria: step.successCriteria,
			band_index: step.bandIndex,
			step_index: step.stepIndex,
			depth,
			status: 'planning',
			role_state: 'planner',
			context: { stepId: step.id }
		})
		.select('*')
		.single();

	if (error || !node?.id) {
		throw new Error(error?.message ?? 'Failed to create child node');
	}

	await insertEvent(run.id, node.id, 'tree.node_created', {
		parentNodeId,
		title: step.title,
		reason: step.reason,
		successCriteria: step.successCriteria,
		depth,
		bandIndex: step.bandIndex,
		stepIndex: step.stepIndex
	});
	await insertEvent(run.id, parentNodeId, 'tree.step_created', step);
	await insertEvent(run.id, parentNodeId, 'tree.node_delegated', {
		stepId: step.id,
		childNodeId: node.id
	});

	return node as TreeAgentNodeRow;
}

function normalizePlannerOutput(raw: PlannerOutput | null): PlannerOutput | null {
	if (!raw || typeof raw !== 'object') return null;
	if (raw.mode !== 'execute' && raw.mode !== 'plan') return null;
	return raw;
}

function normalizeExecutorOutput(raw: ExecutorOutput | null): ExecutorOutput | null {
	if (!raw || typeof raw !== 'object') return null;
	if (!raw.result || typeof raw.result.summary !== 'string') return null;
	return raw;
}

function normalizeAggregatorOutput(raw: AggregatorOutput | null): AggregatorOutput | null {
	if (!raw || typeof raw !== 'object') return null;
	if (!raw.result || typeof raw.result.summary !== 'string') return null;
	return raw;
}

async function runWithConcurrency<T, R>(
	items: T[],
	limit: number,
	handler: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = [];
	const queue = [...items];
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (queue.length) {
			const item = queue.shift() as T;
			const result = await handler(item);
			results.push(result);
		}
	});
	await Promise.all(workers);
	return results;
}

async function collectChildSummaries(params: {
	runId: string;
	children: Array<{ nodeId: string; result?: TreeAgentResult }>;
}) {
	const { runId, children } = params;
	const adminSb = supabase as any;
	const childIds = children.map((c) => c.nodeId);
	const resultsMap = new Map(children.map((c) => [c.nodeId, c.result]));

	const { data: nodes } = await adminSb
		.from('tree_agent_nodes')
		.select('id, title, result')
		.in('id', childIds);

	const summaries: Array<{
		nodeId: string;
		title: string;
		result: TreeAgentResult | null;
		documents: Array<{ id: string; title: string; content: string | null }>;
	}> = [];

	for (const node of nodes ?? []) {
		const result = (node.result as TreeAgentResult | null) ?? resultsMap.get(node.id) ?? null;
		const docIds = result?.documentIds ?? [];
		const documents =
			docIds.length > 0
				? ((
						await adminSb
							.from('onto_documents')
							.select('id, title, content')
							.in('id', docIds)
					).data ?? [])
				: [];

		summaries.push({
			nodeId: node.id,
			title: node.title ?? 'Child Node',
			result,
			documents
		});
	}

	const summaryText = summaries
		.map((child) => {
			const resultSummary = child.result?.summary ?? 'No result';
			const docSnippets = child.documents
				.map((doc: { id: string; title: string; content: string | null }) => {
					const content = doc.content ?? '';
					const trimmed =
						content.length > 2000 ? `${content.slice(0, 2000)}...` : content;
					return `Document: ${doc.title} (${doc.id})\n${trimmed}`;
				})
				.join('\n');
			return `Child ${child.title} (${child.nodeId})\nResult: ${resultSummary}\n${docSnippets}`;
		})
		.join('\n\n');

	return summaryText;
}

async function runNode(params: {
	llm: SmartLLMService;
	run: TreeAgentRunRow;
	nodeId: string;
	actorId: string;
	toolContext: TreeAgentToolContext;
	toolGuide: string;
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	onUsage: (event: {
		model: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
	}) => Promise<void> | void;
	budgetDeadlineMs: number;
	replanCount?: number;
}): Promise<TreeAgentResult> {
	const {
		llm,
		run,
		nodeId,
		actorId,
		toolContext,
		toolGuide,
		contextType,
		contextProjectId,
		onUsage,
		budgetDeadlineMs,
		replanCount = 0
	} = params;
	const adminSb = supabase as any;

	if (Date.now() > budgetDeadlineMs) {
		throw new Error('budget_exceeded');
	}

	const { data: nodeRow, error: nodeError } = await adminSb
		.from('tree_agent_nodes')
		.select('*')
		.eq('id', nodeId)
		.single();
	if (nodeError || !nodeRow) {
		throw new Error(nodeError?.message ?? 'Node not found');
	}

	const node = nodeRow as TreeAgentNodeRow;
	const scratchpadId = await ensureNodeScratchpad({ run, node, actorId });
	const scratchpadContent = await loadScratchpadContent(scratchpadId);

	await updateNodeStatus({
		runId: run.id,
		nodeId: node.id,
		status: 'planning',
		role: 'planner',
		message: 'planner_start'
	});

	const plannerRaw = await callPlannerLLM({
		llm,
		run,
		node,
		scratchpad: scratchpadContent,
		userId: run.user_id,
		contextType,
		contextProjectId,
		onUsage
	});
	const planner = normalizePlannerOutput(plannerRaw);

	if (planner?.scratchpad?.appendMarkdown) {
		await appendScratchpadWithEvent({
			runId: run.id,
			nodeId: node.id,
			docId: scratchpadId,
			entry: `\n## Planner (${nowIso()})\n${planner.scratchpad.appendMarkdown}`,
			tailPreview: planner.scratchpad.tailPreview
		});
	}

	const shouldPlan = planner?.mode === 'plan' && planner.plan?.bands?.length;
	if (!shouldPlan) {
		await updateNodeStatus({
			runId: run.id,
			nodeId: node.id,
			status: 'executing',
			role: 'executor',
			message: 'leaf_execute'
		});

		const executorFirst = normalizeExecutorOutput(
			await callExecutorLLM({
				llm,
				run,
				node,
				scratchpad: scratchpadContent,
				userId: run.user_id,
				toolGuide,
				contextType,
				contextProjectId,
				allowToolCalls: true,
				onUsage
			})
		);

		if (!executorFirst) {
			throw new Error('Executor response invalid');
		}

		const toolCalls = extractToolCalls(executorFirst).slice(0, MAX_TOOL_CALLS_PER_PASS);
		let finalOutput = executorFirst;
		let toolResultsBlock = '';

		if (toolCalls.length) {
			const { executed } = await runToolBootstrap({
				runId: run.id,
				nodeId: node.id,
				scratchpadDocId: scratchpadId,
				toolContext,
				toolCalls,
				phase: 'executor_tools'
			});
			toolResultsBlock = formatToolResultsForPrompt(toolCalls, executed.results);

			const executorSecond = normalizeExecutorOutput(
				await callExecutorLLM({
					llm,
					run,
					node,
					scratchpad: scratchpadContent,
					userId: run.user_id,
					toolGuide,
					contextType,
					contextProjectId,
					toolResultsBlock,
					allowToolCalls: false,
					onUsage
				})
			);
			if (executorSecond) {
				finalOutput = executorSecond;
			}
		}

		if (finalOutput.scratchpad?.appendMarkdown) {
			await appendScratchpadWithEvent({
				runId: run.id,
				nodeId: node.id,
				docId: scratchpadId,
				entry: `\n## Executor (${nowIso()})\n${finalOutput.scratchpad.appendMarkdown}`,
				tailPreview: finalOutput.scratchpad.tailPreview
			});
		}

		const artifactPersisted = await persistArtifacts({
			run,
			node,
			actorId,
			artifacts: finalOutput.artifacts
		});

		const resultEnvelope = buildResultEnvelope({
			outputResult: finalOutput.result,
			artifactIds: artifactPersisted.artifactIds,
			documentIds: artifactPersisted.documentIds,
			labelToArtifactId: artifactPersisted.labelToArtifactId,
			scratchpadDocId: scratchpadId,
			scratchpadTail: finalOutput.scratchpad?.tailPreview ?? ''
		});

		await insertEvent(run.id, node.id, 'tree.parent_hint', {
			parentNodeId: node.parent_node_id,
			hintType: finalOutput.result.parentHint.hintType,
			artifactIds: finalOutput.result.parentHint.artifactLabels
				.map((label) => artifactPersisted.labelToArtifactId[label])
				.filter(Boolean),
			documentIds: artifactPersisted.documentIds
		});

		await completeNode({ runId: run.id, nodeId: node.id, result: resultEnvelope });
		return resultEnvelope;
	}

	// Plan + delegate to children
	await updateNodeStatus({
		runId: run.id,
		nodeId: node.id,
		status: 'delegating',
		role: 'planner',
		message: 'plan_delegated'
	});

	await persistPlan({ runId: run.id, nodeId: node.id, plan: planner?.plan });

	const bands = (planner?.plan?.bands ?? []).slice().sort((a, b) => a.index - b.index);
	const allChildResults: Array<{ nodeId: string; result?: TreeAgentResult }> = [];

	for (const band of bands) {
		if (Date.now() > budgetDeadlineMs) {
			throw new Error('budget_exceeded');
		}

		const steps = band.steps ?? [];
		const childNodes = [];
		for (const step of steps) {
			const stepIndex =
				typeof step.stepIndex === 'number' ? step.stepIndex : steps.indexOf(step);
			const child = await createChildNode({
				run,
				parentNodeId: node.id,
				step: {
					id: step.id || randomUUID(),
					title: step.title,
					reason: step.reason,
					successCriteria: step.successCriteria ?? [],
					bandIndex: band.index,
					stepIndex
				},
				depth: node.depth + 1
			});
			childNodes.push(child);
		}

		const childResults = await runWithConcurrency(
			childNodes,
			MAX_PARALLEL_CHILDREN,
			async (child) => {
				const result = await runNode({
					llm,
					run,
					nodeId: child.id,
					actorId,
					toolContext,
					toolGuide,
					contextType,
					contextProjectId,
					onUsage,
					budgetDeadlineMs,
					replanCount: 0
				});
				return { nodeId: child.id, result };
			}
		);
		allChildResults.push(...childResults);
	}

	await updateNodeStatus({
		runId: run.id,
		nodeId: node.id,
		status: 'aggregating',
		role: 'executor',
		message: 'aggregate_children'
	});

	const childrenSummary = await collectChildSummaries({
		runId: run.id,
		children: allChildResults
	});
	const aggregatorRaw = await callAggregatorLLM({
		llm,
		run,
		node,
		scratchpad: scratchpadContent,
		userId: run.user_id,
		childrenSummary,
		contextType,
		contextProjectId,
		onUsage
	});
	const aggregator = normalizeAggregatorOutput(aggregatorRaw);

	if (!aggregator) {
		throw new Error('Aggregator response invalid');
	}

	if (aggregator.scratchpad?.appendMarkdown) {
		await appendScratchpadWithEvent({
			runId: run.id,
			nodeId: node.id,
			docId: scratchpadId,
			entry: `\n## Aggregator (${nowIso()})\n${aggregator.scratchpad.appendMarkdown}`,
			tailPreview: aggregator.scratchpad.tailPreview
		});
	}

	const artifactPersisted = await persistArtifacts({
		run,
		node,
		actorId,
		artifacts: aggregator.artifacts
	});

	const resultEnvelope = buildResultEnvelope({
		outputResult: aggregator.result,
		artifactIds: artifactPersisted.artifactIds,
		documentIds: artifactPersisted.documentIds,
		labelToArtifactId: artifactPersisted.labelToArtifactId,
		scratchpadDocId: scratchpadId,
		scratchpadTail: aggregator.scratchpad?.tailPreview ?? ''
	});

	await insertEvent(run.id, node.id, 'tree.parent_hint', {
		parentNodeId: node.parent_node_id,
		hintType: aggregator.result.parentHint.hintType,
		artifactIds: aggregator.result.parentHint.artifactLabels
			.map((label) => artifactPersisted.labelToArtifactId[label])
			.filter(Boolean),
		documentIds: artifactPersisted.documentIds
	});

	await completeNode({ runId: run.id, nodeId: node.id, result: resultEnvelope });

	if (aggregator.next?.shouldReplan && replanCount < 1) {
		await insertEvent(run.id, node.id, 'tree.replan_requested', {
			reason: aggregator.next.replanReason ?? 'replan_requested',
			basedOnChildIds: allChildResults.map((c) => c.nodeId)
		});
		return runNode({
			llm,
			run,
			nodeId: node.id,
			actorId,
			toolContext,
			toolGuide,
			contextType,
			contextProjectId,
			onUsage,
			budgetDeadlineMs,
			replanCount: replanCount + 1
		});
	}

	return resultEnvelope;
}

export async function processTreeAgentJob(job: ProcessingJob<TreeAgentJobMetadata>) {
	const { run_id: runId, root_node_id: rootNodeId } = job.data;
	const adminSb = supabase as any;

	await job.log(`Tree Agent run ${runId} started`);

	const { data: run, error: runError } = await adminSb
		.from('tree_agent_runs')
		.select('*')
		.eq('id', runId)
		.single();
	if (runError || !run) {
		await job.log(`Run not found: ${runError?.message ?? 'missing'}`);
		return { success: false, runId, message: 'Run not found' };
	}

	const runRow = run as TreeAgentRunRow;
	const actorId = await ensureActorId(runRow.user_id);

	const { data: rootNode, error: rootNodeError } = await adminSb
		.from('tree_agent_nodes')
		.select('*')
		.eq('id', rootNodeId)
		.single();
	if (rootNodeError || !rootNode) {
		await job.log(`Root node not found: ${rootNodeError?.message ?? 'missing'}`);
		return { success: false, runId, message: 'Root node not found' };
	}

	const root = rootNode as TreeAgentNodeRow;
	const rootScratchpadId = await ensureNodeScratchpad({ run: runRow, node: root, actorId });

	await insertEvent(runId, root.id, 'tree.node_status', {
		status: 'planning',
		role: 'planner',
		message: 'worker_started'
	});

	const typedSb = supabase as unknown as SupabaseClient<Database>;
	const runContext = resolveRunContext(runRow, job.data);
	let contextType: TreeAgentContextType = runContext.contextType;
	let contextProjectId = runContext.contextProjectId;
	let toolNames = runContext.toolNames;
	let toolGuide = runContext.toolGuide;

	// Log context resolution for observability
	await job.log(
		`Tree Agent context resolved: type=${contextType}, projectId=${contextProjectId ?? 'none'}, toolCount=${toolNames.length}`
	);

	let toolContext = await createTreeAgentToolContext({
		supabase: typedSb,
		actorId,
		userId: runRow.user_id,
		runId,
		workspaceProjectId: runRow.workspace_project_id,
		contextType,
		contextProjectId,
		toolNames
	});

	// If a project context is invalid, degrade gracefully to global.
	if (
		contextType === 'project' &&
		contextProjectId &&
		!toolContext.allowedProjects.has(contextProjectId)
	) {
		await insertEvent(runId, root.id, 'tree.context_warning', {
			requestedContextType: contextType,
			requestedProjectId: contextProjectId,
			message: 'context_project_not_accessible_fallback_to_global'
		});
		contextType = 'global';
		contextProjectId = null;
		toolNames = getDefaultToolNamesForContextType(contextType);
		toolGuide = getToolGuideForContextType(contextType, toolNames);
		toolContext = await createTreeAgentToolContext({
			supabase: typedSb,
			actorId,
			userId: runRow.user_id,
			runId,
			workspaceProjectId: runRow.workspace_project_id,
			contextType,
			contextProjectId,
			toolNames
		});
	}

	const toolManifest = {
		context_type: contextType,
		context_project_id: contextProjectId,
		tool_count: toolNames.length,
		tool_names: toolNames
	};
	const toolGuidePreview = toolGuide.split('\n').slice(0, 12).join('\n');
	const nextMetrics = {
		...runContext.metricsObject,
		context: { type: contextType, project_id: contextProjectId },
		tool_manifest: toolManifest,
		tool_guide_preview: toolGuidePreview
	};
	await adminSb.from('tree_agent_runs').update({ metrics: nextMetrics }).eq('id', runId);
	await insertEvent(runId, root.id, 'tree.tools_manifest', toolManifest);

	const bootstrapCalls: TreeAgentToolCall[] = [
		{
			name: 'list_onto_projects',
			args: { limit: 8 },
			purpose: 'Discover accessible projects for context'
		}
	];
	await runToolBootstrap({
		runId,
		nodeId: root.id,
		scratchpadDocId: rootScratchpadId,
		toolContext,
		toolCalls: bootstrapCalls,
		phase: 'bootstrap'
	});

	const llm = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Tree Agent'
	});

	const metricsObject: Record<string, unknown> = { ...(nextMetrics as Record<string, unknown>) };
	const baseTokens =
		typeof metricsObject.tokens_total === 'number' ? metricsObject.tokens_total : 0;
	const baseCost =
		typeof metricsObject.cost_total_usd === 'number' ? metricsObject.cost_total_usd : 0;

	let tokensTotal = baseTokens;
	let costTotal = baseCost;
	let updatedMetrics: Record<string, unknown> = { ...metricsObject };

	const onUsage = async (event: {
		model: string;
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		inputCost: number;
		outputCost: number;
		totalCost: number;
	}) => {
		tokensTotal += event.totalTokens ?? 0;
		costTotal += event.totalCost ?? 0;
		updatedMetrics = {
			...(updatedMetrics as Record<string, unknown>),
			tokens_total: tokensTotal,
			cost_total_usd: costTotal,
			last_model: event.model
		};
		await adminSb.from('tree_agent_runs').update({ metrics: updatedMetrics }).eq('id', runId);
	};

	const budgetMs =
		typeof job.data?.budgets?.max_wall_clock_ms === 'number'
			? job.data.budgets.max_wall_clock_ms
			: 60 * 60 * 1000;
	const budgetDeadlineMs = Date.now() + budgetMs;

	let rootResult: TreeAgentResult;
	try {
		rootResult = await runNode({
			llm,
			run: runRow,
			nodeId: root.id,
			actorId,
			toolContext,
			toolGuide,
			contextType,
			contextProjectId,
			onUsage,
			budgetDeadlineMs
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Tree Agent failed';
		await insertEvent(runId, root.id, 'tree.node_failed', { error: message, retryable: false });
		await adminSb
			.from('tree_agent_runs')
			.update({
				status: message === 'budget_exceeded' ? 'stopped' : 'failed',
				completed_at: nowIso(),
				metrics: {
					...(updatedMetrics as Record<string, unknown>),
					stop_reason: { type: 'error', detail: message }
				}
			})
			.eq('id', runId);
		await job.log(`Tree Agent run ${runId} failed: ${message}`);
		return { success: false, runId, message };
	}

	await adminSb
		.from('tree_agent_runs')
		.update({
			status: 'completed',
			completed_at: nowIso(),
			metrics: {
				...(updatedMetrics as Record<string, unknown>),
				last_root_result: rootResult
			}
		})
		.eq('id', runId);

	await job.log(`Tree Agent run ${runId} completed`);
	return { success: true, runId, rootResult };
}
