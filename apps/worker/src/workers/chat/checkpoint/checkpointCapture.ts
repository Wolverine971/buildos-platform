// apps/worker/src/workers/chat/checkpoint/checkpointCapture.ts
//
// Chat checkpoint capture (tasker/95). Runs after chat turns, never inside one:
// a scheduler sweep enqueues it once a session crosses a size or turn
// threshold or goes idle, and closing a chat runs it too. Each run reads only
// the messages after the session's watermark, so each message is captured once.
//
// Two outputs per checkpoint:
// - Thinking log: the user's own words, near-verbatim, dated, newest first.
//   It applies automatically because it is the user's own content.
// - START HERE: the model rewrites the doc's real sections. Code applies the
//   additions and the Current state snapshot now; removed or reworded lines
//   wait in one reviewable proposal per project. Managed fences, unique
//   headings, valid links and code-owned decision dates are enforced here.
import {
	START_HERE_AUTHORED_SECTION_NAMES,
	START_HERE_SECTION_MAX_CHARS,
	type StartHereSectionBody,
	applyStartHereSectionBodies,
	checkStartHereCaptureInvariants,
	joinStartHereSectionBlocks,
	planStartHereCheckpointRewrites,
	readStartHereDocumentSections,
	splitStartHereSectionBlocks,
	stripStartHereManagedRegions,
	stripStartHereScaffolding
} from '@buildos/shared-agent-ops/ontology/start-here';
import { resolveEntityReferences } from '@buildos/shared-agent-ops/utils/entity-reference-parser';
import {
	type PromptEntity,
	type PromptMessage,
	type PromptSection,
	START_HERE_SYNTHESIS_SYSTEM_PROMPT,
	THINKING_LOG_SYSTEM_PROMPT,
	applySectionEdit,
	buildStartHereSynthesisPrompt,
	buildThinkingLogPrompt,
	normalizeSynthesisReply,
	normalizeThinkingLogReply
} from './capturePrompts';
import {
	buildThinkingLogDocument,
	buildThinkingLogEntry,
	faithfulPassage,
	prependThinkingLogEntry
} from '@buildos/shared-agent-ops/ontology/thinking-log';

export type CheckpointTrigger = 'threshold' | 'idle' | 'close' | 'backfill' | 'manual';

export type CheckpointSession = {
	id: string;
	userId: string;
	projectId: string | null;
	title: string | null;
};

export type CheckpointDocument = { id: string; content: string; updatedAt: string | null };

export type CheckpointProject = {
	name: string | null;
	createdAt: string | null;
	timezone: string;
	startHere: CheckpointDocument;
	thinkingLog: CheckpointDocument | null;
	entities: PromptEntity[];
};

export type PendingStartHereReview = {
	/** Unreviewed START HERE proposals for the project; all are replaced by a new one. */
	runIds: string[];
	/** The newest proposal's content when it still applies to the current doc. */
	effectiveContent: string | null;
};

export type CheckpointRecord = {
	sessionId: string;
	userId: string;
	projectId: string | null;
	trigger: CheckpointTrigger;
	status: 'noop' | 'captured' | 'failed';
	throughMessageId: string;
	throughMessageAt: string;
	userMessageCount: number;
	thinkingLog: { documentId: string; entry: string; passageCount: number } | null;
	startHere: {
		documentId: string;
		beforeContent: string;
		afterUpdatedAt: string | null;
		appliedSections: string[];
	} | null;
	review: { runId: string; sections: string[] } | null;
	skipped: Array<{ heading: string; reason: string }>;
	invariantViolations: string[];
	droppedLinks: number;
	error: string | null;
};

export type CheckpointCapturePorts = {
	loadSession(params: { sessionId: string; userId: string }): Promise<CheckpointSession | null>;
	/** Messages after the session's watermark, and a few before it for context, oldest first. */
	loadMessages(session: CheckpointSession): Promise<{
		newMessages: PromptMessage[];
		priorMessages: PromptMessage[];
	}>;
	loadProject(
		session: CheckpointSession & { projectId: string }
	): Promise<CheckpointProject | null>;
	loadPendingReview(
		session: CheckpointSession & { projectId: string },
		startHere: CheckpointDocument
	): Promise<PendingStartHereReview>;
	completeJson(params: {
		systemPrompt: string;
		userPrompt: string;
		userId: string;
		operation: 'thinking_log' | 'start_here_synthesis';
	}): Promise<unknown>;
	saveThinkingLog(params: {
		session: CheckpointSession & { projectId: string };
		document: CheckpointDocument | null;
		content: string;
	}): Promise<CheckpointDocument>;
	saveStartHere(params: {
		session: CheckpointSession & { projectId: string };
		document: CheckpointDocument;
		content: string;
	}): Promise<CheckpointDocument>;
	stageStartHereReview(params: {
		session: CheckpointSession & { projectId: string };
		document: CheckpointDocument;
		content: string;
		rationale: string;
		supersedeRunIds: string[];
	}): Promise<string>;
	supersedeStartHereReviews(params: {
		session: CheckpointSession & { projectId: string };
		runIds: string[];
	}): Promise<void>;
	/** Persist the checkpoint and advance the session watermark to its last message. */
	finishCheckpoint(record: CheckpointRecord): Promise<void>;
};

export type CheckpointOutcome =
	| { status: 'skipped'; reason: 'session_not_found' | 'nothing_new' }
	| { status: 'noop' | 'captured'; record: CheckpointRecord };

const CUSTOM_SECTION_PROMPT_MAX_CHARS = 4000;
const RECENT_LOG_ENTRY_HEADINGS = 5;

function civilParts(instant: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(instant);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	return {
		date: `${get('year')}-${get('month')}-${get('day')}`,
		time: `${get('hour')}:${get('minute')}`
	};
}

function validInstant(value: string | null | undefined): Date | null {
	if (!value) return null;
	const instant = new Date(value);
	return Number.isFinite(instant.getTime()) ? instant : null;
}

/** "3:51 PM" in the user's timezone. */
function civilClock(instant: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit'
	}).format(instant);
}

function headingKey(heading: string): string {
	return heading.replace(/\s+/g, ' ').trim().toLowerCase();
}

function comparable(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/** Preamble and title text outside the authored sections, shown read-only. */
function outsideSectionsText(content: string): string {
	const authored = stripStartHereManagedRegions(content);
	const firstSection = /^##[ \t]+/m.exec(authored);
	const preamble = firstSection ? authored.slice(0, firstSection.index) : authored;
	return stripStartHereScaffolding(preamble.replace(/^#\s+.*$/m, '')).trim();
}

function recentLogHeadings(content: string | null | undefined): string[] {
	if (!content) return [];
	return [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)]
		.slice(0, RECENT_LOG_ENTRY_HEADINGS)
		.map((match) => match[1] ?? '');
}

export async function runChatCheckpointCapture(
	ports: CheckpointCapturePorts,
	input: { sessionId: string; userId: string; trigger: CheckpointTrigger; now?: Date }
): Promise<CheckpointOutcome> {
	const session = await ports.loadSession({ sessionId: input.sessionId, userId: input.userId });
	if (!session) return { status: 'skipped', reason: 'session_not_found' };
	const { newMessages, priorMessages } = await ports.loadMessages(session);
	const last = newMessages[newMessages.length - 1];
	if (!last) return { status: 'skipped', reason: 'nothing_new' };
	// A backfill replays an older chat: its log entry and decisions are dated to
	// when the user said it, and today's Current state snapshot is left alone
	// (an old chat cannot know the current state).
	const backfill = input.trigger === 'backfill';
	const now = (backfill ? validInstant(last.created_at) : null) ?? input.now ?? new Date();

	const userMessages = newMessages.filter(
		(message) => message.role === 'user' && message.content.trim().length > 0
	);
	const record: CheckpointRecord = {
		sessionId: session.id,
		userId: session.userId,
		projectId: session.projectId,
		trigger: input.trigger,
		status: 'noop',
		throughMessageId: last.id,
		throughMessageAt: last.created_at,
		userMessageCount: userMessages.length,
		thinkingLog: null,
		startHere: null,
		review: null,
		skipped: [],
		invariantViolations: [],
		droppedLinks: 0,
		error: null
	};
	const projectId = session.projectId;
	if (userMessages.length === 0 || !projectId) {
		await ports.finishCheckpoint(record);
		return { status: 'noop', record };
	}
	const projectSession = { ...session, projectId };
	const project = await ports.loadProject(projectSession);
	if (!project) {
		await ports.finishCheckpoint(record);
		return { status: 'noop', record };
	}

	const timezone = project.timezone;
	const today = civilParts(now, timezone).date;
	const createdAt = validInstant(project.createdAt);
	const stamp = (message: PromptMessage) => {
		const instant = validInstant(message.created_at);
		if (!instant) return null;
		const parts = civilParts(instant, timezone);
		return `${parts.date} ${parts.time}`;
	};

	const pending = await ports.loadPendingReview(projectSession, project.startHere);
	const current = project.startHere.content;
	const effective = pending.effectiveContent ?? current;
	const effectiveSections = readStartHereDocumentSections(effective);
	const lockedHeadings: string[] = [];
	let nextBlockId = 1;
	const promptSections: PromptSection[] = effectiveSections.map((section) => {
		const body = stripStartHereScaffolding(section.body);
		const maxChars = section.standard
			? START_HERE_SECTION_MAX_CHARS[section.standard]
			: CUSTOM_SECTION_PROMPT_MAX_CHARS;
		const editable =
			body.length <= maxChars && !(backfill && section.standard === 'Current state');
		if (!editable) lockedHeadings.push(section.heading);
		return {
			heading: section.heading,
			editable,
			blocks: splitStartHereSectionBlocks(body).map((markdown) => ({
				id: `b${nextBlockId++}`,
				markdown
			}))
		};
	});
	if (backfill) lockedHeadings.push('Current state');
	const missingStandardSections = START_HERE_AUTHORED_SECTION_NAMES.filter(
		(name) =>
			!(backfill && name === 'Current state') &&
			!effectiveSections.some((section) => section.standard === name)
	);

	const [logReply, synthesisReply] = await Promise.all([
		ports.completeJson({
			systemPrompt: THINKING_LOG_SYSTEM_PROMPT,
			userPrompt: buildThinkingLogPrompt({
				projectName: project.name,
				recentEntryHeadings: recentLogHeadings(project.thinkingLog?.content),
				newMessages,
				stamp
			}),
			userId: session.userId,
			operation: 'thinking_log'
		}),
		ports.completeJson({
			systemPrompt: START_HERE_SYNTHESIS_SYSTEM_PROMPT,
			userPrompt: buildStartHereSynthesisPrompt({
				projectName: project.name,
				today,
				projectCreated: createdAt ? civilParts(createdAt, timezone).date : null,
				sections: promptSections,
				missingStandardSections,
				outsideText: outsideSectionsText(effective),
				entities: project.entities,
				priorMessages,
				newMessages,
				stamp
			}),
			userId: session.userId,
			operation: 'start_here_synthesis'
		})
	]);

	// --- Thinking log -------------------------------------------------------
	const log = normalizeThinkingLogReply(logReply);
	const userById = new Map(userMessages.map((message) => [message.id, message]));
	const passages = log.passages
		.map((passage) => ({ message: userById.get(passage.messageId), text: passage.text }))
		.filter(
			(passage): passage is { message: PromptMessage; text: string } =>
				passage.message !== undefined
		)
		.sort((left, right) => left.message.created_at.localeCompare(right.message.created_at))
		.map((passage) => ({
			message: passage.message,
			text: faithfulPassage(passage.text, passage.message.content)
		}));
	if (passages.length > 0) {
		const lastPassage = validInstant(passages[passages.length - 1]!.message.created_at) ?? now;
		const entry = buildThinkingLogEntry({
			date: civilParts(lastPassage, timezone).date,
			time: civilClock(lastPassage, timezone),
			topic: log.topic,
			chatTitle: session.title,
			passages: passages.map((passage) => passage.text)
		});
		const content = project.thinkingLog
			? prependThinkingLogEntry(project.thinkingLog.content, entry)
			: buildThinkingLogDocument(project.name, entry);
		const saved = await ports.saveThinkingLog({
			session: projectSession,
			document: project.thinkingLog,
			content
		});
		record.thinkingLog = { documentId: saved.id, entry, passageCount: passages.length };
	}

	// --- START HERE -----------------------------------------------------------
	const synthesis = normalizeSynthesisReply(synthesisReply);
	const knownEntities = new Set(project.entities.map((entity) => `${entity.type}:${entity.id}`));
	knownEntities.add(`project:${projectId}`);
	const isKnown = (type: string, id: string) => knownEntities.has(`${type}:${id}`);
	const sectionsByKey = new Map(
		promptSections.map((section) => [headingKey(section.heading), section])
	);
	const rewrites: StartHereSectionBody[] = synthesis.edits.map((edit) => {
		const blocks = applySectionEdit(
			sectionsByKey.get(headingKey(edit.heading))?.blocks ?? [],
			edit
		).map((markdown) => {
			const resolved = resolveEntityReferences(markdown, isKnown);
			record.droppedLinks += resolved.dropped.length;
			return resolved.markdown;
		});
		return { heading: edit.heading, markdown: joinStartHereSectionBlocks(blocks) };
	});
	// The model edited the doc as it would read with any pending proposal
	// approved. Plan that desired doc against the REAL doc: every addition lands
	// now (including a pending proposal's), and only removed or reworded lines
	// wait for review.
	const desired = applyStartHereSectionBodies(effective, rewrites);
	const currentBodies = new Map(
		readStartHereDocumentSections(current).map((section) => [
			headingKey(section.heading),
			section.body
		])
	);
	const plan = planStartHereCheckpointRewrites({
		content: current,
		rewrites: readStartHereDocumentSections(desired)
			.filter(
				(section) =>
					comparable(
						stripStartHereScaffolding(
							currentBodies.get(headingKey(section.heading)) ?? ''
						)
					) !== comparable(stripStartHereScaffolding(section.body))
			)
			.map((section) => ({ heading: section.heading, markdown: section.body })),
		today,
		lockedHeadings
	});
	record.skipped = plan.skipped;

	const autoBodies: StartHereSectionBody[] = plan.plans.flatMap((section) =>
		section.autoMarkdown === null
			? []
			: [{ heading: section.heading, markdown: section.autoMarkdown }]
	);
	let startHereDoc = project.startHere;
	let afterAuto = current;
	if (autoBodies.length > 0) {
		const next = applyStartHereSectionBodies(current, autoBodies);
		const violations = checkStartHereCaptureInvariants(current, next);
		record.invariantViolations.push(...violations);
		if (violations.length === 0 && next !== current) {
			startHereDoc = await ports.saveStartHere({
				session: projectSession,
				document: project.startHere,
				content: next
			});
			afterAuto = next;
			record.startHere = {
				documentId: project.startHere.id,
				beforeContent: current,
				afterUpdatedAt: startHereDoc.updatedAt,
				appliedSections: autoBodies.map((body) => body.heading)
			};
		}
	}

	// Reviewed part: one proposal per project, written onto the real doc so the
	// managed fences keep their current bytes. It replaces any older proposal,
	// whose remaining changes it carries.
	const reviewSections = plan.plans.filter((section) => section.reviewMarkdown !== null);
	const reviewContent = applyStartHereSectionBodies(
		afterAuto,
		reviewSections.map((section) => ({
			heading: section.heading,
			markdown: section.reviewMarkdown!
		}))
	);
	const reviewViolations = checkStartHereCaptureInvariants(afterAuto, reviewContent);
	record.invariantViolations.push(...reviewViolations);
	if (reviewViolations.length === 0 && comparable(reviewContent) !== comparable(afterAuto)) {
		const rationaleByHeading = new Map(
			synthesis.edits.map((edit) => [headingKey(edit.heading), edit.rationale])
		);
		const rationale = [
			...reviewSections.map(
				(section) =>
					`${section.heading}: ${rationaleByHeading.get(headingKey(section.heading)) ?? 'Carried from the earlier unreviewed proposal.'}`
			),
			pending.effectiveContent !== null
				? 'Includes the earlier unreviewed START HERE proposal, which this one replaces.'
				: null,
			synthesis.outsideNote ? `Outside the sections: ${synthesis.outsideNote}` : null
		]
			.filter((line): line is string => Boolean(line))
			.join('\n');
		const runId = await ports.stageStartHereReview({
			session: projectSession,
			document: { ...startHereDoc, content: afterAuto },
			content: reviewContent,
			rationale,
			supersedeRunIds: pending.runIds
		});
		record.review = { runId, sections: reviewSections.map((section) => section.heading) };
	} else if (afterAuto !== current && pending.runIds.length > 0) {
		// The doc changed under the older proposal and nothing is left to review.
		await ports.supersedeStartHereReviews({ session: projectSession, runIds: pending.runIds });
	}

	record.status = record.thinkingLog || record.startHere || record.review ? 'captured' : 'noop';
	await ports.finishCheckpoint(record);
	return { status: record.status === 'captured' ? 'captured' : 'noop', record };
}
