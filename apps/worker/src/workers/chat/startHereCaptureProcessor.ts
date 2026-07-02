// apps/worker/src/workers/chat/startHereCaptureProcessor.ts
import { randomUUID } from 'node:crypto';
import type {
	AgentCallScope,
	ChangeSet,
	Database,
	Json,
	ProposedChange,
	RunResult
} from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { logWorkerError } from '../../lib/errorLogger';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { ensureActorId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import { ensureProjectStartHereDocument } from '@buildos/shared-agent-ops/ontology/start-here.service';
import {
	appendStartHereAuthoredSectionUpdates,
	sanitizeStartHereAuthoredMarkdown,
	stripStartHereManagedRegions,
	START_HERE_AUTHORED_SECTION_NAMES,
	type StartHereAuthoredSectionName,
	type StartHereAuthoredSectionUpdate
} from '@buildos/shared-agent-ops/ontology/start-here';
import { stageGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { syncInboxItemForAgentRun } from '@buildos/shared-agent-ops';

type CaptureCandidate = {
	section: StartHereAuthoredSectionName;
	markdown: string;
	rationale: string;
};

type CaptureResponse = {
	updates?: CaptureCandidate[];
};

type ChatMessage = {
	role: string;
	content: string;
	created_at: string | null;
};

type AgentRunInsert = Database['public']['Tables']['agent_runs']['Insert'];

const START_HERE_CAPTURE_SYSTEM_PROMPT = `You extract durable project orientation facts for a BuildOS START HERE document.

Return proposed updates only when the chat contains explicit, durable project context. Be conservative.

Allowed sections:
- What this is
- Non-goals
- Current state
- Decisions
- Vocabulary and mental model
- Open questions

Capture:
- explicit decisions and rationale
- explicit non-goals or rejected directions
- stable vocabulary or mental-model definitions
- current-state summaries that will still help future agents orient
- open questions the project should track

Do not capture:
- ordinary task chatter
- private reasoning
- tool output boilerplate
- transient status unless it changes project orientation
- anything that contradicts the user's explicit intent

Return JSON only:
{
  "updates": [
    {
      "section": "Decisions",
      "markdown": "- **Decision** - rationale. _(YYYY-MM-DD)_",
      "rationale": "Why this belongs in START HERE"
    }
  ]
}`;

function truncate(value: string, maxChars: number): string {
	const trimmed = value.trim();
	return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function isAllowedSection(value: unknown): value is StartHereAuthoredSectionName {
	return (
		typeof value === 'string' &&
		(START_HERE_AUTHORED_SECTION_NAMES as readonly string[]).includes(value)
	);
}

function normalizeCandidate(value: unknown): CaptureCandidate | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (!isAllowedSection(record.section)) return null;
	if (typeof record.markdown !== 'string' || !record.markdown.trim()) return null;
	const sanitized = sanitizeStartHereAuthoredMarkdown(record.markdown);
	if (!sanitized) return null;
	return {
		section: record.section,
		markdown: truncate(sanitized, 900),
		rationale:
			typeof record.rationale === 'string' && record.rationale.trim()
				? truncate(record.rationale, 300)
				: 'Durable project orientation captured from chat.'
	};
}

function normalizeUpdates(response: CaptureResponse): CaptureCandidate[] {
	if (!Array.isArray(response.updates)) return [];
	const normalized: CaptureCandidate[] = [];
	const seen = new Set<string>();
	for (const raw of response.updates) {
		const candidate = normalizeCandidate(raw);
		if (!candidate) continue;
		const key = `${candidate.section}:${candidate.markdown}`;
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(candidate);
		if (normalized.length >= 5) break;
	}
	return normalized;
}

async function loadRecentMessages(sessionId: string): Promise<ChatMessage[]> {
	const { data, error } = await supabase
		.from('chat_messages')
		.select('role, content, created_at')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: false })
		.limit(24);

	if (error) throw error;
	return ((data ?? []) as ChatMessage[]).reverse();
}

function buildCapturePrompt(params: {
	projectName: string | null;
	sessionSummary?: string | null;
	messages: ChatMessage[];
}): string {
	return [
		`Project: ${params.projectName ?? 'Unknown project'}`,
		params.sessionSummary ? `Session summary: ${params.sessionSummary}` : null,
		'',
		'Recent chat transcript:',
		...params.messages.map(
			(message) => `${message.role}: ${truncate(message.content.replace(/\s+/g, ' '), 1200)}`
		)
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

async function createProposalRun(params: {
	userId: string;
	sessionId: string;
	projectId: string;
	change: Omit<ProposedChange, 'id'>;
	rationale: string;
}): Promise<string> {
	const runId = randomUUID();
	const now = new Date().toISOString();
	const change: ProposedChange = {
		...params.change,
		id: randomUUID(),
		rationale: params.rationale,
		decision: 'pending'
	};
	const changeSet: ChangeSet = {
		run_id: runId,
		status: 'pending',
		changes: [change],
		created_at: now
	};
	const metrics = {
		tokens: 0,
		cost_usd: 0,
		tool_calls: 0,
		duration_ms: 0
	};
	const result: RunResult = {
		run_id: runId,
		label: 'Update project START HERE',
		status: 'proposal_ready',
		summary: 'Review proposed Start Here updates captured from the completed chat.',
		answer: 'A Start Here document update is staged for review.',
		entities_touched: [],
		proposed_changes: changeSet,
		metrics
	};

	const runRow: AgentRunInsert = {
		id: runId,
		user_id: params.userId,
		trigger: 'chat',
		parent_session_id: params.sessionId,
		depth: 0,
		label: 'Update project START HERE',
		goal: 'Review proposed Start Here updates captured from the completed chat.',
		instructions:
			'This run was created by chat follow-up processing. Review the staged document update before applying it.',
		expected_output: 'A reviewed update to the project Start Here document.',
		context_type: 'project',
		project_id: params.projectId,
		review_required: true,
		status: 'proposal_ready',
		scope_mode: 'read_write',
		allowed_ops: ['onto.document.update'],
		change_set: changeSet as unknown as Json,
		budgets: {} as Json,
		result: result as unknown as Json,
		metrics: metrics as unknown as Json,
		completed_at: now
	};
	const { error } = await supabase.from('agent_runs').insert(runRow);

	if (error) throw error;
	try {
		await syncInboxItemForAgentRun({
			supabase: supabase as any,
			run: runRow as unknown as Record<string, unknown>
		});
	} catch (syncError) {
		console.warn(
			`⚠️ Failed to sync AI Inbox item for Start Here proposal ${runId}:`,
			syncError instanceof Error ? syncError.message : syncError
		);
	}
	return runId;
}

export async function processStartHereCaptureProposals(params: {
	sessionId: string;
	userId: string;
	projectId: string;
	sessionSummary?: string | null;
}): Promise<{ proposed: boolean; runId: string | null; updateCount: number }> {
	try {
		const [{ data: project }, messages] = await Promise.all([
			supabase
				.from('onto_projects')
				.select('id, name, description')
				.eq('id', params.projectId)
				.maybeSingle(),
			loadRecentMessages(params.sessionId)
		]);

		if (!project || messages.length === 0) {
			return { proposed: false, runId: null, updateCount: 0 };
		}

		const llm = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Start Here Capture'
		});
		const capture = await llm.getJSONResponse<CaptureResponse>({
			systemPrompt: START_HERE_CAPTURE_SYSTEM_PROMPT,
			userPrompt: buildCapturePrompt({
				projectName: project.name ?? null,
				sessionSummary: params.sessionSummary,
				messages
			}),
			userId: params.userId,
			profile: 'fast',
			temperature: 0.1,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			}
		});
		const updates = normalizeUpdates(capture);
		if (updates.length === 0) {
			return { proposed: false, runId: null, updateCount: 0 };
		}

		const actorId = await ensureActorId(supabase as any, params.userId);
		const ensured = await ensureProjectStartHereDocument({
			supabase: supabase as any,
			projectId: params.projectId,
			actorId,
			projectName: project.name ?? null,
			projectDescription: project.description ?? null
		});
		if (!ensured.ok) {
			throw new Error(ensured.error);
		}
		if (ensured.skipped) {
			// Project is deleted/archived/cancelled (or gone) — don't seed a
			// Start Here doc just to stage a capture against it.
			return { proposed: false, runId: null, updateCount: 0 };
		}

		const sectionUpdates: StartHereAuthoredSectionUpdate[] = updates.map((update) => ({
			section: update.section,
			markdown: update.markdown
		}));
		const currentContent = ensured.document.content ?? '';
		// Append into authored sections using the full document (managed fences act
		// as section boundaries), then stage only the authored body. Managed regions
		// (status/map) are owned by the snapshot worker — including them in a staged
		// full-content replace would let a concurrent snapshot refresh make the
		// proposal stale before the user commits, and would clobber the freshest
		// managed regions back to stage-time values on commit. The next snapshot
		// re-inserts the managed regions at their canonical positions.
		const mergedContent = appendStartHereAuthoredSectionUpdates(currentContent, sectionUpdates);
		const nextContent = stripStartHereManagedRegions(mergedContent);
		if (stripStartHereManagedRegions(currentContent) === nextContent) {
			return { proposed: false, runId: null, updateCount: 0 };
		}

		const scope: AgentCallScope = {
			mode: 'read_write',
			project_ids: [params.projectId],
			allowed_ops: ['onto.document.update']
		};
		const staged = await stageGatewayWriteOp({
			admin: supabase as any,
			userId: params.userId,
			scope,
			op: 'onto.document.update',
			args: {
				document_id: ensured.document.id,
				content: nextContent,
				update_strategy: 'replace'
			},
			rationale: updates.map((update) => `${update.section}: ${update.rationale}`).join('\n')
		});
		if (!staged.ok) {
			throw new Error(staged.error.message);
		}

		const runId = await createProposalRun({
			userId: params.userId,
			sessionId: params.sessionId,
			projectId: params.projectId,
			change: staged.change,
			rationale: staged.change.rationale
		});

		return { proposed: true, runId, updateCount: updates.length };
	} catch (error) {
		void logWorkerError(error, {
			userId: params.userId,
			tableName: 'chat_sessions',
			recordId: params.sessionId,
			operationType: 'start_here_capture_proposal',
			severity: 'warning',
			metadata: {
				projectId: params.projectId,
				nonFatal: true
			}
		});
		return { proposed: false, runId: null, updateCount: 0 };
	}
}
