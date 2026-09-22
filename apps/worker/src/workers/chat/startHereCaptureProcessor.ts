// apps/worker/src/workers/chat/startHereCaptureProcessor.ts
//
// Session-end START HERE capture. After a project chat, a fast model reads the
// document's CURRENT authored sections plus the transcript and returns the
// complete new body of each section the chat changed. Code then reconciles
// (never-wipe, date stamps, bullet dedupe, length caps) and stages one
// reviewable replace. The old contract appended snippets without showing the
// model the doc, so every session re-derived the same facts in new words
// (tasker/93).
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
	START_HERE_AUTHORED_SECTION_NAMES,
	START_HERE_SECTION_MAX_CHARS,
	type StartHereAuthoredSectionName,
	readStartHereAuthoredSections,
	reconcileStartHereAuthoredSections,
	stripStartHereAuthoredSections,
	stripStartHereManagedRegions,
	stripStartHereScaffolding
} from '@buildos/shared-agent-ops/ontology/start-here';
import { resolveUserCivilTimezone } from '@buildos/shared-agent-ops/dates/civil-date';
import { stageGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { syncInboxItemForAgentRun } from '@buildos/shared-agent-ops';

type CaptureCandidate = {
	section: StartHereAuthoredSectionName;
	markdown: string;
	rationale: string;
};

type CaptureResponse = {
	sections?: unknown;
	outside_note?: unknown;
};

type ChatMessage = {
	role: string;
	content: string;
	created_at: string | null;
};

type AgentRunInsert = Database['public']['Tables']['agent_runs']['Insert'];

type PendingProposalRow = {
	id: string;
	created_at: string | null;
	change_set: Json | null;
};

export const START_HERE_CAPTURE_RUN_LABEL = 'Update project START HERE';
const OUTSIDE_TEXT_PROMPT_MAX_CHARS = 1500;

const START_HERE_CAPTURE_SYSTEM_PROMPT = `You maintain the authored sections of a BuildOS START HERE document: the page a future agent or collaborator reads first to understand a project.

You get the document's current sections and a finished chat. Return a section only when the chat changes what it should say. A returned section REPLACES the whole section, so its markdown must be the complete new body: the current text merged with what the chat established. Never return only the new part.

Sections:
- What this is: one paragraph on what the project is and what "done" looks like. If the chat changed the direction, rewrite the paragraph; the newest direction wins.
- Non-goals: one bullet per thing the project deliberately is not doing, with a short reason.
- Current state: a short snapshot of right now: what just happened, what is in progress, what is blocked. Replace it; never stack older states.
- Decisions: one bullet per decision, "- **Decision** - rationale. _(date)_". Keep existing decisions. A restated decision stays one bullet. A reversed decision is rewritten or struck through (~~old~~), never added twice.
- Vocabulary and mental model: one bullet per term, "- **Term** - meaning". One definition per term.
- Open questions: remove questions the chat answered; add questions it opened.

Rules:
- Record only what the chat or the current sections state explicitly. Be conservative. Skip ordinary task chatter, private reasoning, and tool output.
- Keep still-true content and the user's own wording. Do not drop anything that is still true.
- Dates: stamp decisions made in this chat with Today's date from the input. Keep existing dates as written. Never guess a date.
- Do not return sections marked editable="false".
- Text outside the sections is read-only. If it contradicts what the chat established, say so in one sentence in "outside_note"; otherwise omit it.
- Return {"sections": []} when nothing durable changed.

Return JSON only:
{
  "sections": [
    {
      "section": "Decisions",
      "markdown": "<complete new section body, no heading>",
      "rationale": "<what changed and why>"
    }
  ],
  "outside_note": "<optional one sentence>"
}`;

function truncate(value: string, maxChars: number): string {
	const trimmed = value.trim();
	return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function isAllowedSection(value: unknown): value is StartHereAuthoredSectionName {
	return (
		typeof value === 'string' &&
		(START_HERE_AUTHORED_SECTION_NAMES as readonly string[]).includes(value)
	);
}

/** YYYY-MM-DD for an instant in the user's timezone. */
function civilDate(instant: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(instant);
}

function civilDateOf(value: string | null | undefined, timezone: string): string | null {
	if (!value) return null;
	const instant = new Date(value);
	return Number.isFinite(instant.getTime()) ? civilDate(instant, timezone) : null;
}

function normalizeCandidates(response: CaptureResponse): CaptureCandidate[] {
	// Only the full-section contract is accepted. A reply in the retired
	// `updates` snippet shape would wipe sections if treated as full bodies.
	if (!Array.isArray(response.sections)) return [];
	const candidates: CaptureCandidate[] = [];
	for (const raw of response.sections) {
		const record = asRecord(raw);
		if (!record || !isAllowedSection(record.section)) continue;
		if (typeof record.markdown !== 'string' || !record.markdown.trim()) continue;
		candidates.push({
			section: record.section,
			markdown: record.markdown,
			rationale:
				typeof record.rationale === 'string' && record.rationale.trim()
					? truncate(record.rationale, 300)
					: 'Durable project orientation captured from chat.'
		});
	}
	return candidates;
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

async function loadPendingProposals(params: {
	userId: string;
	projectId: string;
}): Promise<PendingProposalRow[]> {
	const { data, error } = await supabase
		.from('agent_runs')
		.select('id, created_at, change_set')
		.eq('user_id', params.userId)
		.eq('project_id', params.projectId)
		.eq('label', START_HERE_CAPTURE_RUN_LABEL)
		.eq('status', 'proposal_ready')
		.order('created_at', { ascending: false })
		.limit(10);
	if (error) throw error;
	return (data ?? []) as PendingProposalRow[];
}

/**
 * The authored body an unreviewed proposal would produce, when it still applies
 * cleanly to the current document. The new capture builds on it, so replacing
 * the older proposal loses nothing it captured.
 */
function pendingProposalBody(
	run: PendingProposalRow,
	documentId: string,
	currentAuthored: string
): string | null {
	const changeSet = asRecord(run.change_set);
	if (!changeSet || changeSet.status !== 'pending' || !Array.isArray(changeSet.changes)) {
		return null;
	}
	const change = asRecord(changeSet.changes[0]);
	const before = asRecord(change?.before);
	const after = asRecord(change?.after);
	if (!change || !before || !after || change.op !== 'onto.document.update') return null;
	if (change.entity_id !== documentId && after.document_id !== documentId) return null;
	if (typeof before.content !== 'string' || typeof after.content !== 'string') return null;
	// Staged against an older body: the commit drift guard would reject it.
	if (stripStartHereManagedRegions(before.content) !== currentAuthored) return null;
	return stripStartHereManagedRegions(after.content);
}

function buildCapturePrompt(params: {
	projectName: string | null;
	sessionSummary?: string | null;
	today: string;
	projectCreated: string | null;
	sections: Partial<Record<StartHereAuthoredSectionName, string>>;
	lockedSections: Set<StartHereAuthoredSectionName>;
	outsideText: string;
	messages: ChatMessage[];
	timezone: string;
}): string {
	const sectionBlocks = START_HERE_AUTHORED_SECTION_NAMES.map((section) => {
		const body = params.sections[section]?.trim() || '(empty)';
		if (params.lockedSections.has(section)) {
			return `<section name="${section}" editable="false">\n${truncate(body, 600)}\n</section>`;
		}
		return `<section name="${section}">\n${body}\n</section>`;
	});

	return [
		`Project: ${params.projectName ?? 'Unknown project'}`,
		`Today's date: ${params.today}`,
		params.projectCreated ? `Project created: ${params.projectCreated}` : null,
		params.sessionSummary ? `Session summary: ${params.sessionSummary}` : null,
		'',
		'Current START HERE sections:',
		...sectionBlocks,
		params.outsideText
			? `\nText outside the sections (read-only):\n<outside>\n${truncate(params.outsideText, OUTSIDE_TEXT_PROMPT_MAX_CHARS)}\n</outside>`
			: null,
		'',
		'Chat transcript, oldest first:',
		...params.messages.map((message) => {
			const day = civilDateOf(message.created_at, params.timezone);
			return `${day ? `[${day}] ` : ''}${message.role}: ${truncate(message.content.replace(/\s+/g, ' '), 1200)}`;
		})
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
		label: START_HERE_CAPTURE_RUN_LABEL,
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
		label: START_HERE_CAPTURE_RUN_LABEL,
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
			supabase,
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

/**
 * Retire older unreviewed proposals once a newer one exists: one pending START
 * HERE proposal per project. Conditional on proposal_ready, so a proposal the
 * user is committing right now is left alone. The `superseded:` error prefix
 * maps the inbox item to expired, not blocked.
 */
async function supersedePendingProposals(params: {
	userId: string;
	runIds: string[];
	supersededBy: string;
}): Promise<number> {
	let superseded = 0;
	for (const runId of params.runIds) {
		const { data, error } = await supabase
			.from('agent_runs')
			.update({
				status: 'cancelled',
				error: `superseded: replaced by newer Start Here proposal ${params.supersededBy}`,
				completed_at: new Date().toISOString()
			})
			.eq('id', runId)
			.eq('user_id', params.userId)
			.eq('status', 'proposal_ready')
			.select('*')
			.maybeSingle();
		if (error) {
			console.warn(
				`⚠️ Failed to supersede Start Here proposal ${runId}:`,
				error.message ?? error
			);
			continue;
		}
		if (!data) continue;
		superseded += 1;
		try {
			await syncInboxItemForAgentRun({
				supabase,
				run: data as unknown as Record<string, unknown>
			});
		} catch (syncError) {
			console.warn(
				`⚠️ Failed to sync AI Inbox item for superseded Start Here proposal ${runId}:`,
				syncError instanceof Error ? syncError.message : syncError
			);
		}
	}
	return superseded;
}

export async function processStartHereCaptureProposals(params: {
	sessionId: string;
	userId: string;
	projectId: string;
	sessionSummary?: string | null;
	now?: Date;
}): Promise<{
	proposed: boolean;
	runId: string | null;
	updateCount: number;
	supersededCount?: number;
}> {
	const none = { proposed: false, runId: null, updateCount: 0 };
	try {
		const [{ data: project }, messages, userTimezone] = await Promise.all([
			supabase
				.from('onto_projects')
				.select('id, name, description, created_at')
				.eq('id', params.projectId)
				.maybeSingle(),
			loadRecentMessages(params.sessionId),
			resolveUserCivilTimezone(supabase, params.userId)
		]);

		if (!project || messages.length === 0) return none;

		// The model must see the document it is editing, so ensure it first.
		const actorId = await ensureActorId(supabase, params.userId);
		const ensured = await ensureProjectStartHereDocument({
			supabase,
			projectId: params.projectId,
			actorId,
			projectName: project.name ?? null,
			projectDescription: project.description ?? null
		});
		if (!ensured.ok) {
			throw new Error(ensured.error);
		}
		if (ensured.skipped) {
			// Project is deleted/archived/cancelled (or gone) — don't stage a
			// capture against it.
			return none;
		}

		const documentId = ensured.document.id;
		// Stage only the authored body. Managed regions (status/map) are owned by
		// the snapshot worker; including them in a full-content replace would let a
		// concurrent refresh make the proposal stale and would clobber the freshest
		// managed regions on commit. The commit path re-inserts current managed
		// regions (preserveCurrentStartHereManagedRegions).
		const currentAuthored = stripStartHereManagedRegions(ensured.document.content ?? '');
		const pending = await loadPendingProposals({
			userId: params.userId,
			projectId: params.projectId
		});
		const baseProposal = pending
			.map((run) => ({ run, body: pendingProposalBody(run, documentId, currentAuthored) }))
			.find((candidate) => candidate.body !== null);
		const workingBody = baseProposal?.body ?? currentAuthored;

		const timezone = userTimezone ?? 'UTC';
		const today = civilDate(params.now ?? new Date(), timezone);
		const projectCreated = civilDateOf(project.created_at, timezone);
		const sections = readStartHereAuthoredSections(workingBody);
		const promptSections: Partial<Record<StartHereAuthoredSectionName, string>> = {};
		const lockedSections = new Set<StartHereAuthoredSectionName>();
		for (const section of START_HERE_AUTHORED_SECTION_NAMES) {
			const body = stripStartHereScaffolding(sections[section] ?? '');
			promptSections[section] = body;
			// Too long to show in full: the model could only rewrite a truncated
			// copy, so the section is read-only for this capture.
			if (body.length > START_HERE_SECTION_MAX_CHARS[section]) lockedSections.add(section);
		}
		const outsideText = stripStartHereScaffolding(
			stripStartHereAuthoredSections(workingBody).replace(/^#\s+.*$/m, '')
		).replace(/\n{3,}/g, '\n\n');

		const llm = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Start Here Capture'
		});
		const capture = await llm.getJSONResponse<CaptureResponse>({
			systemPrompt: START_HERE_CAPTURE_SYSTEM_PROMPT,
			userPrompt: buildCapturePrompt({
				projectName: project.name ?? null,
				sessionSummary: params.sessionSummary,
				today,
				projectCreated,
				sections: promptSections,
				lockedSections,
				outsideText,
				messages,
				timezone
			}),
			userId: params.userId,
			profile: 'fast',
			temperature: 0.1,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			}
		});
		const candidates = normalizeCandidates(capture ?? {});
		if (candidates.length === 0) return none;

		const reconciled = reconcileStartHereAuthoredSections({
			currentBody: workingBody,
			rewrites: candidates,
			lockedSections,
			dates: {
				today,
				earliest: projectCreated,
				allowed: messages
					.map((message) => civilDateOf(message.created_at, timezone))
					.filter((day): day is string => Boolean(day))
			}
		});
		const nextContent = stripStartHereManagedRegions(reconciled.body);
		if (
			reconciled.applied.length === 0 ||
			nextContent === workingBody ||
			nextContent === currentAuthored
		) {
			return none;
		}

		const rationaleBySection = new Map(
			candidates.map((candidate) => [candidate.section, candidate.rationale])
		);
		const outsideNote =
			typeof capture?.outside_note === 'string' && capture.outside_note.trim()
				? truncate(capture.outside_note, 300)
				: null;
		const rationale = [
			...reconciled.applied.map(
				(update) => `${update.section}: ${rationaleBySection.get(update.section) ?? ''}`
			),
			baseProposal
				? 'Includes the earlier unreviewed Start Here proposal, which this one replaces.'
				: null,
			outsideNote ? `Outside the Start Here sections: ${outsideNote}` : null
		]
			.filter((line): line is string => Boolean(line))
			.join('\n');

		const scope: AgentCallScope = {
			mode: 'read_write',
			project_ids: [params.projectId],
			allowed_ops: ['onto.document.update']
		};
		const staged = await stageGatewayWriteOp({
			admin: supabase,
			userId: params.userId,
			scope,
			op: 'onto.document.update',
			args: {
				document_id: documentId,
				content: nextContent,
				update_strategy: 'replace'
			},
			rationale
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
		const supersededCount = await supersedePendingProposals({
			userId: params.userId,
			runIds: pending.map((run) => run.id),
			supersededBy: runId
		});

		return {
			proposed: true,
			runId,
			updateCount: reconciled.applied.length,
			supersededCount
		};
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
		return none;
	}
}
