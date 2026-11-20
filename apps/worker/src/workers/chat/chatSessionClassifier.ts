// apps/worker/src/workers/chat/chatSessionClassifier.ts
// Worker processor for classifying chat sessions and generating titles/topics.
// For a recent project chat it also refreshes the project's next step and makes sure
// one START HERE snapshot is queued.

import type { Database } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { accessibleSessionProjectId } from '../../lib/projectAccess';
import { logWorkerError } from '../../lib/errorLogger';
import { TransientQueueError } from '../../lib/queueErrors';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { getErrorMessage } from '../../lib/utils/errors';
import {
	ChatClassificationJobData,
	updateJobStatus,
	validateChatClassificationJobData
} from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';
import { processSessionActivityAndNextSteps } from './chatSessionActivityProcessor';
import { queueProjectContextSnapshot } from '../ontology/projectContextSnapshotWorker';
import {
	type SessionExtractedEntities,
	emptySessionExtractedEntities,
	sanitizeSessionExtractedEntities,
	serializeSessionExtractedEntities
} from './libriSessionEntities';
import {
	type LibriEntityHandoffStatus,
	handoffLibriSessionEntities,
	isLibriEntityHandoffConfigured,
	serializeLibriEntityHandoffStatus
} from './libriEntityHandoffClient';

// A title, a few topics, a short summary and any library candidates.
const CLASSIFICATION_MAX_TOKENS = 700;
const CLASSIFICATION_TIMEOUT_MS = 30_000;
/** Newest messages read from the database (any role). */
const MESSAGE_FETCH_LIMIT = 50;
/** Newest user/assistant messages shown to the model, after the chat's opening message. */
const PROMPT_RECENT_MESSAGES = 30;
const PROMPT_MESSAGE_MAX_CHARS = 500;

/**
 * The next step and the START HERE snapshot describe where a project stands now, so
 * they only follow a chat that ended within the last day. The idle sweep also titles
 * chats from weeks ago; an old chat must not rewrite today's project next step.
 */
const PROJECT_FOLLOW_UP_MAX_IDLE_MS = 24 * 60 * 60 * 1000;

const SNAPSHOT_JOB_TYPE = 'build_project_context_snapshot' as const;
/** A snapshot job in one of these states has built, or will build, the project's state. */
const COVERING_SNAPSHOT_STATUSES = ['pending', 'processing', 'retrying', 'completed'] as const;

/**
 * Whether the queue will run this job again if it throws a transient error now. With no
 * known attempt budget this is the last attempt, so the fallback is saved and the
 * session stamped (the behavior before retries existed).
 */
function hasAttemptsRemaining(
	job: Pick<LegacyJob<unknown>, 'attemptsMade' | 'maxAttempts'>
): boolean {
	if (typeof job.maxAttempts !== 'number' || typeof job.attemptsMade !== 'number') return false;
	return job.attemptsMade + 1 < job.maxAttempts;
}

/** Classification and title promotion have different concurrency semantics.
 * Always retain the classification; only promote a title if nobody renamed it
 * since the initial read. Never hold a database lock across the model call.
 */
async function saveClassification(
	sessionId: string,
	userId: string,
	originalTitle: string | null,
	payload: Database['public']['Tables']['chat_sessions']['Update']
) {
	const { error } = await supabase
		.from('chat_sessions')
		.update(payload)
		.eq('id', sessionId)
		.eq('user_id', userId);
	if (error) throw new Error(`Failed to update session classification: ${error.message}`);
	if (!isPlaceholderTitle(originalTitle)) return;
	let promotion = supabase
		.from('chat_sessions')
		.update({ title: payload.auto_title })
		.eq('id', sessionId)
		.eq('user_id', userId);
	promotion =
		originalTitle === null ? promotion.is('title', null) : promotion.eq('title', originalTitle);
	const { error: promotionError } = await promotion;
	if (promotionError)
		throw new Error(`Failed to promote session title: ${promotionError.message}`);
}

/**
 * Response structure from LLM classification
 */
interface ChatClassificationResponse {
	title: string; // Max 50 characters, descriptive title
	topics: string[]; // 3-7 topic keywords
	summary: string; // 2-3 sentences, max 500 characters
	extracted_entities?: unknown;
}

/**
 * Message structure from chat_messages table
 */
export interface ChatMessage {
	id: string;
	role: string;
	content: string;
	created_at: string | null;
}

// Titles we consider placeholders until the classifier generates something more descriptive
const DEFAULT_SESSION_TITLES = new Set(
	[
		'Agent Session',
		'Project Assistant',
		'Task Assistant',
		'Calendar Assistant',
		'General Assistant',
		'New Project Creation',
		'Project Audit',
		'Project Forecast',
		'Task Update',
		'Daily Brief Settings',
		'Chat session', // Sanitized fallback title
		'Untitled Chat'
	].map((title) => title.toLowerCase())
);

const isPlaceholderTitle = (title?: string | null) => {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_SESSION_TITLES.has(normalized);
};

const CLASSIFICATION_INTRO = `You are a chat session analyzer. Your task is to analyze chat conversation history and generate:

1. A concise, descriptive title (max 50 characters) that captures the main topic/purpose of the conversation
2. A list of 3-7 topic keywords that represent the subjects discussed
3. A brief summary (2-3 sentences, max 500 characters) that captures what was discussed and any outcomes`;

const CLASSIFICATION_GUIDELINES = `Guidelines:
- Title should be human-readable (e.g., "Planning vacation to Japan", "Debugging API issues")
- Topics should be specific keywords, not sentences (e.g., "authentication", "scheduling")
- Summary should help the user quickly recall what this conversation was about
- Include any key decisions made, tasks created, or outcomes achieved
- Focus on the user's actual intent and what was accomplished
- Ignore meta-discussion about the AI or system
- If the conversation is too short or unclear, use "Quick chat" as the title
- A long conversation is shown as its opening user message, a note that earlier messages were omitted, then its most recent messages. Use the opening for what the chat set out to do and the recent messages for where it ended up.`;

/** Title, topics and summary only: what every chat needs. */
const CLASSIFICATION_SYSTEM_PROMPT = `${CLASSIFICATION_INTRO}

${CLASSIFICATION_GUIDELINES}

Respond ONLY with valid JSON in this exact format:
{
  "title": "<title, max 50 characters>",
  "topics": ["<keyword>", "<keyword>", "<keyword>"],
  "summary": "<2-3 sentences, max 500 characters>"
}`;

/**
 * The same job plus library (Libri) candidates. Those rules are most of this prompt, so
 * they are sent only when the hand-off that consumes the candidates is configured.
 * `extracted_at` is stamped in code (libriSessionEntities.ts), never asked of the model.
 */
const CLASSIFICATION_WITH_LIBRI_SYSTEM_PROMPT = `${CLASSIFICATION_INTRO}
4. Structured Libri entity extraction for high-confidence people, books, YouTube videos, and YouTube channels discussed in the session

${CLASSIFICATION_GUIDELINES}
- A single clear user message is enough to extract Libri candidates when the entity evidence is explicit and high confidence

Libri extraction rules:
- Include a Libri candidate only when the session explicitly discusses a person, author, thinker, creator, public figure, book title/ISBN, YouTube video, or YouTube channel that is useful for the user's durable library.
- Prefer candidates that were central to the user's request or that the user asked to analyze, add, research, preserve, process, or revisit.
- Use recommended_action "resolve_or_enqueue" only for clear, high-confidence candidates. Use "search_only" for possibly useful but non-enrichment candidates. Use "ignore" for entities that should not be acted on.
- Exclude BuildOS project names, task names, internal documents, teammates, private contacts, private personal facts, vague topics, and incidental examples unless they are clearly public Libri resources.
- Do not invent entities. If evidence is weak, omit the candidate or include it only as an ignored candidate.
- source_message_ids must use the exact message_id values shown in the prompt. source_turn_indices must use the exact turn_index values shown in the prompt.
- evidence_snippets must be short excerpts from the prompt content and must not include entire messages.
- For YouTube URLs, include url and youtube_video_id when available.

Allowed scalar values:
- entity_type must be exactly one of "person", "book", "youtube_video", or "youtube_channel".
- relevance must be exactly one of "primary", "supporting", or "incidental".
- recommended_action must be exactly one of "resolve_or_enqueue", "search_only", or "ignore".

Respond ONLY with valid JSON in this exact format:
{
  "title": "Research Atomic Habits",
  "topics": ["books", "habits", "youtube"],
  "summary": "The user asked to preserve research targets for James Clear, Atomic Habits, and a YouTube video.",
  "extracted_entities": {
    "libri_candidates": [
      {
        "entity_type": "book",
        "display_name": "Atomic Habits",
        "canonical_query": "Atomic Habits James Clear",
        "authors": ["James Clear"],
        "aliases": ["Atomic Habits by James Clear"],
        "confidence": 0.94,
        "relevance": "primary",
        "recommended_action": "resolve_or_enqueue",
        "user_requested_research": false,
        "extraction_reason": "The user explicitly mentioned the book as a research target.",
        "source_message_ids": ["message-id"],
        "source_turn_indices": [0],
        "evidence_snippets": ["Atomic Habits"]
      }
    ],
    "ignored_candidates": [
      {
        "display_name": "Internal project name",
        "reason": "Private BuildOS project names should not be handed to Libri.",
        "evidence_snippets": ["project codename"]
      }
    ],
    "extraction_version": "libri_session_synthesis_v1"
  }
}`;

export function buildClassificationSystemPrompt(options: { includeLibri: boolean }): string {
	return options.includeLibri
		? CLASSIFICATION_WITH_LIBRI_SYSTEM_PROMPT
		: CLASSIFICATION_SYSTEM_PROMPT;
}

/** What the model reads of a chat: how it opened, then its most recent messages. */
export interface ClassificationPromptMessages {
	/** The chat's first user message, when it is older than the recent window. */
	opening: ChatMessage | null;
	/** Whether messages between the opening and the recent window were left out. */
	omittedAfterOpening: boolean;
	recent: ChatMessage[];
	/** Opening (if any) then recent: the order `turn_index` counts in. */
	all: ChatMessage[];
}

/**
 * The most recent messages, so a re-classification sees what changed, plus the first
 * user message, so a long chat keeps how it opened.
 *
 * @param messages the loaded messages, oldest first
 * @param firstUserMessage the session's first user message when `messages` may not reach
 *   back that far; otherwise the first user message in `messages` is used
 */
export function selectClassificationPromptMessages(
	messages: ChatMessage[],
	firstUserMessage: ChatMessage | null = null
): ClassificationPromptMessages {
	const conversation = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
	const recent = conversation.slice(-PROMPT_RECENT_MESSAGES);
	const candidate = firstUserMessage ?? conversation.find((m) => m.role === 'user') ?? null;
	const opening =
		candidate &&
		typeof candidate.content === 'string' &&
		candidate.content.trim().length > 0 &&
		!recent.some((m) => m.id === candidate.id)
			? candidate
			: null;
	const justBeforeRecent = conversation[conversation.length - recent.length - 1];
	return {
		opening,
		omittedAfterOpening: opening !== null && justBeforeRecent?.id !== opening.id,
		recent,
		all: opening ? [opening, ...recent] : recent
	};
}

/**
 * Build the user prompt with conversation history. Message ids and turn indices are
 * shown only for Libri extraction, which cites them.
 */
export function buildClassificationUserPrompt(
	selection: ClassificationPromptMessages,
	options: { includeLibri: boolean }
): string {
	if (selection.all.length === 0) {
		return 'No conversation content available.';
	}

	const render = (m: ChatMessage, index: number) => {
		const role = m.role === 'user' ? 'User' : 'Assistant';
		// Truncate very long messages
		const content =
			m.content.length > PROMPT_MESSAGE_MAX_CHARS
				? m.content.slice(0, PROMPT_MESSAGE_MAX_CHARS) + '...'
				: m.content;
		return options.includeLibri
			? `turn_index=${index}\nmessage_id=${m.id}\nrole=${role}\ncontent: ${content}`
			: `${role}: ${content}`;
	};

	const parts = selection.all.map(render);
	if (selection.opening && selection.omittedAfterOpening) {
		parts.splice(1, 0, '[Earlier messages omitted. The most recent messages follow.]');
	}

	const ask = options.includeLibri
		? 'a title, topics, summary, and Libri entity extraction'
		: 'a title, topics, and summary';
	return `Analyze this conversation and generate ${ask}:\n\n${parts.join('\n\n')}`;
}

function truncateForFallback(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildFallbackClassification(messages: ChatMessage[]): ChatClassificationResponse {
	const userMessages = messages
		.filter((message) => message.role === 'user')
		.map((message) => message.content)
		.filter((content) => typeof content === 'string' && content.trim().length > 0)
		.map((content) => content.trim());

	const firstUserMessage = userMessages[0] ?? '';
	const title =
		truncateForFallback(firstUserMessage, 50) ||
		(userMessages.length > 0 ? 'Conversation recap' : 'Quick chat');
	const summary =
		userMessages.length > 0
			? `Conversation about: ${truncateForFallback(userMessages.slice(0, 2).join(' '), 220)}`
			: 'A brief conversation captured for reference.';

	return {
		title,
		topics: ['general'],
		summary,
		extracted_entities: emptySessionExtractedEntities()
	};
}

function hasMeaningfulUserMessage(messages: ChatMessage[]): boolean {
	return messages.some(
		(message) =>
			message.role === 'user' &&
			typeof message.content === 'string' &&
			message.content.trim().length > 0
	);
}

/**
 * Process a chat classification job
 */
export async function processChatClassificationJob(job: LegacyJob<ChatClassificationJobData>) {
	console.log(
		`🏷️  Processing chat classification job ${job.id} for session ${job.data.sessionId}`
	);

	try {
		// Validate job data
		const validatedData = validateChatClassificationJobData(job.data);

		await updateJobStatus(
			job.id,
			'processing',
			'chat_classification',
			undefined,
			job.processingToken
		);

		// Fetch the chat session to verify it exists and get current state
		const { data: session, error: sessionError } = await supabase
			.from('chat_sessions')
			.select(
				'id, title, auto_title, chat_topics, summary, extracted_entities, message_count, status, context_type, entity_id, last_message_at, last_classified_at'
			)
			.eq('id', validatedData.sessionId)
			.eq('user_id', validatedData.userId)
			.maybeSingle();

		if (sessionError) {
			throw new Error(`Failed to load chat session: ${sessionError.message}`);
		}

		if (!session) {
			console.log(`⏭️  Session ${validatedData.sessionId} no longer exists, skipping`);
			await updateJobStatus(
				job.id,
				'completed',
				'chat_classification',
				undefined,
				job.processingToken
			);
			return { success: true, skipped: true, reason: 'session_not_found' };
		}

		// Fetch the MOST RECENT 50 messages (capped for token usage), oldest first.
		// Reading the oldest 50 instead would stamp message #50 as the latest, so a
		// longer session would never look changed and never be re-classified.
		const { data: recentMessages, error: messagesError } = await supabase
			.from('chat_messages')
			.select('id, role, content, created_at')
			.eq('session_id', validatedData.sessionId)
			.order('created_at', { ascending: false })
			.limit(MESSAGE_FETCH_LIMIT);

		if (messagesError) {
			throw new Error(`Failed to fetch messages: ${messagesError.message}`);
		}
		const messages = recentMessages ? [...recentMessages].reverse() : recentMessages;

		const originalTitle = session.title;
		const hasClassification =
			!!session.auto_title &&
			!!session.chat_topics &&
			session.chat_topics.length > 0 &&
			!!session.summary;
		const hasEntityExtraction = !!session.extracted_entities;
		const latestMessageAtIso =
			messages?.length && messages[messages.length - 1]?.created_at
				? messages[messages.length - 1].created_at
				: (session.last_message_at ?? null);
		const lastMessageAt = latestMessageAtIso ? new Date(latestMessageAtIso) : null;
		const lastClassifiedAt = session.last_classified_at
			? new Date(session.last_classified_at)
			: null;
		const hasNewMessages =
			lastClassifiedAt && lastMessageAt
				? lastMessageAt > lastClassifiedAt
				: !lastClassifiedAt || !lastMessageAt;

		// Skip if already classified and no new messages since last classification
		if (hasClassification && hasEntityExtraction && !hasNewMessages) {
			if (!session.last_classified_at) {
				const classificationTimestamp = latestMessageAtIso ?? new Date().toISOString();
				const { error: stampError } = await supabase
					.from('chat_sessions')
					.update({ last_classified_at: classificationTimestamp })
					.eq('id', validatedData.sessionId);

				if (stampError) {
					console.warn(
						`⚠️ Failed to backfill last_classified_at for session ${validatedData.sessionId}:`,
						stampError.message
					);
				}
			}

			console.log(
				`⏭️  Session ${validatedData.sessionId} already classified (no new messages), skipping`
			);
			await updateJobStatus(
				job.id,
				'completed',
				'chat_classification',
				undefined,
				job.processingToken
			);
			return { success: true, skipped: true, reason: 'already_classified' };
		}

		const typedMessages = (messages ?? []) as ChatMessage[];

		// If there is no meaningful user content, use default classification.
		// A single explicit user message still goes through the model.
		if (!messages || messages.length === 0 || !hasMeaningfulUserMessage(typedMessages)) {
			console.log(
				`⚠️  Session ${validatedData.sessionId} has no meaningful user messages (${messages?.length || 0})`
			);

			const fallbackClassification = buildFallbackClassification(typedMessages);
			const title = sanitizeTitle(fallbackClassification.title);
			const topics = sanitizeTopics(fallbackClassification.topics);
			const summary = sanitizeSummary(fallbackClassification.summary);
			const extractedEntities = sanitizeSessionExtractedEntities(
				fallbackClassification.extracted_entities
			);

			// Update with default values
			const classificationTimestamp = latestMessageAtIso ?? new Date().toISOString();
			const updatePayload: Database['public']['Tables']['chat_sessions']['Update'] = {
				auto_title: title,
				chat_topics: topics,
				summary,
				extracted_entities: serializeSessionExtractedEntities(extractedEntities),
				last_classified_at: classificationTimestamp,
				updated_at: new Date().toISOString()
			};

			await saveClassification(
				validatedData.sessionId,
				validatedData.userId,
				originalTitle,
				updatePayload
			);

			await updateJobStatus(
				job.id,
				'completed',
				'chat_classification',
				undefined,
				job.processingToken
			);
			return {
				success: true,
				title,
				topics,
				summary,
				extractedEntities,
				messageCount: messages?.length || 0,
				reason: 'no_meaningful_user_messages'
			};
		}

		// Library candidates are extracted only when the hand-off that consumes them is
		// configured. Otherwise the model is asked for title, topics and summary alone.
		const libriConfigured = isLibriEntityHandoffConfigured();

		// A full fetch window may not reach back to how the chat opened.
		const firstUserMessage =
			typedMessages.length >= MESSAGE_FETCH_LIMIT
				? await loadFirstUserMessage(validatedData.sessionId)
				: null;
		const promptSelection = selectClassificationPromptMessages(typedMessages, firstUserMessage);

		// Initialize LLM service
		const llmService = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Chat Classifier'
		});

		// Build prompt with conversation
		const userPrompt = buildClassificationUserPrompt(promptSelection, {
			includeLibri: libriConfigured
		});

		// Call LLM for classification
		console.log(`🤖 Calling LLM to classify session ${validatedData.sessionId}...`);
		let usedFallbackClassification = false;
		let classification: ChatClassificationResponse;
		try {
			classification = await llmService.getJSONResponse<ChatClassificationResponse>({
				systemPrompt: buildClassificationSystemPrompt({ includeLibri: libriConfigured }),
				userPrompt,
				userId: validatedData.userId,
				profile: 'fast', // Use fast profile since this is a simple classification
				operationType: 'chat_session_classification',
				temperature: 0.3,
				// Labelling and extraction: hidden reasoning was ~1,100 of every ~1,250
				// output tokens and most of the job's 19-56 s (same fix as checkpointLlm.ts).
				reasoning: { enabled: false },
				maxTokens: CLASSIFICATION_MAX_TOKENS,
				timeoutMs: CLASSIFICATION_TIMEOUT_MS,
				validation: {
					retryOnParseError: true,
					maxRetries: 2,
					// The title, topics and summary come first in the reply. If a long
					// library-candidate list hits the output cap, keep them.
					allowTruncatedJsonRecovery: true
				}
			});
		} catch (llmError) {
			const llmMessage = getErrorMessage(llmError, 'LLM classification failed');
			// The queue retries with backoff while attempts remain. Only the last attempt
			// falls back to the first user message and stamps the session: a model
			// failure is then not kept as the final title, and the idle sweep cannot
			// queue the session again forever.
			if (hasAttemptsRemaining(job)) {
				throw new TransientQueueError(
					'chat_classification_model_failed',
					`Chat classification model call failed: ${llmMessage}`
				);
			}
			usedFallbackClassification = true;
			console.warn(
				`⚠️  LLM classification failed for session ${validatedData.sessionId} on the last attempt, using fallback:`,
				llmMessage
			);
			classification = buildFallbackClassification(
				promptSelection.opening
					? [promptSelection.opening, ...typedMessages]
					: typedMessages
			);
		}

		// Validate and sanitize the response
		const title = sanitizeTitle(classification.title);
		const topics = sanitizeTopics(classification.topics);
		const summary = sanitizeSummary(classification.summary);
		// Candidates the model was not asked for are never stored; the empty block keeps
		// the stored shape valid (the session reads as "extraction done").
		const promptMessages = promptSelection.all;
		const extractedEntities = libriConfigured
			? sanitizeSessionExtractedEntities(classification.extracted_entities, {
					knownMessageIds: new Set(promptMessages.map((message) => message.id)),
					maxTurnIndex: Math.max(0, promptMessages.length - 1)
				})
			: emptySessionExtractedEntities();

		console.log(
			`✅ Classification result${usedFallbackClassification ? ' (fallback)' : ''} for session ${validatedData.sessionId}: title ${title.length} chars, ${topics.length} topics, summary ${summary.length} chars, ${extractedEntities.libri_candidates.length} Libri candidates`
		);

		// Update the chat session with classification results
		const classificationTimestamp = latestMessageAtIso ?? new Date().toISOString();
		const updatePayload: Database['public']['Tables']['chat_sessions']['Update'] = {
			// Preserve any user-provided title; only set the auto title
			auto_title: title,
			chat_topics: topics,
			summary: summary,
			extracted_entities: serializeSessionExtractedEntities(extractedEntities),
			last_classified_at: classificationTimestamp,
			updated_at: new Date().toISOString()
		};

		await saveClassification(
			validatedData.sessionId,
			validatedData.userId,
			originalTitle,
			updatePayload
		);

		// The scope on the session row is user-written. Follow-ups run with the service role, so
		// they only use a project the session's owner can reach.
		const sessionProjectId = await accessibleSessionProjectId(
			supabase,
			validatedData.userId,
			session
		);

		const libriHandoffStatus = libriConfigured
			? await processLibriEntityHandoff({
					sessionId: validatedData.sessionId,
					userId: validatedData.userId,
					contextType: session.context_type,
					projectId: sessionProjectId,
					extractedEntities,
					jobId: job.id
				})
			: null;

		// Project follow-ups run after classification is saved. Checkpoint capture
		// (thinking log, START HERE) is not queued here: the every-minute checkpoint
		// sweep already captures every project chat once it is idle or long enough,
		// under the same CHAT_CHECKPOINT_CAPTURE_ENABLED switch.
		let nextStepResult = {
			nextStepUpdated: false,
			projectId: null as string | null
		};
		const projectFollowUpsDue =
			!lastMessageAt || Date.now() - lastMessageAt.getTime() <= PROJECT_FOLLOW_UP_MAX_IDLE_MS;
		try {
			if (projectFollowUpsDue) {
				nextStepResult = await processSessionActivityAndNextSteps(
					validatedData.sessionId,
					validatedData.userId
				);
			} else if (sessionProjectId) {
				console.log(
					`⏭️  Session ${validatedData.sessionId} ended over a day ago: titled only, project follow-ups skipped`
				);
			}
			if (nextStepResult.nextStepUpdated) {
				console.log(`📊 Next step updated for project ${nextStepResult.projectId}`);
			}
		} catch (activityError) {
			// Don't fail the classification job if the next step fails
			console.error(`⚠️ Next step processing failed (non-fatal):`, activityError);
			void logWorkerError(activityError, {
				userId: validatedData.userId,
				tableName: 'chat_sessions',
				recordId: validatedData.sessionId,
				operationType: 'chat_activity_processing',
				severity: 'warning',
				metadata: {
					jobId: job.id,
					nonFatal: true
				}
			});
		}

		// Refresh the Start Here document's managed status/map regions after a project
		// chat: one forced snapshot per chat close, whoever saw the close first.
		let projectSnapshot: ProjectSnapshotOutcome = 'not_due';
		if (sessionProjectId && projectFollowUpsDue) {
			projectSnapshot = await ensureProjectSnapshotAfterChat({
				projectId: sessionProjectId,
				userId: validatedData.userId,
				sessionId: validatedData.sessionId,
				lastMessageAtIso: latestMessageAtIso
			});
		}

		await updateJobStatus(
			job.id,
			'completed',
			'chat_classification',
			undefined,
			job.processingToken
		);

		return {
			success: true,
			sessionId: validatedData.sessionId,
			title,
			topics,
			summary,
			extractedEntities,
			libriHandoff: libriHandoffStatus,
			messageCount: messages.length,
			usedFallbackClassification,
			nextStepUpdated: nextStepResult.nextStepUpdated,
			projectId: nextStepResult.projectId ?? sessionProjectId,
			projectSnapshot
		};
	} catch (error) {
		const errorMessage = getErrorMessage(error, 'Chat classification failed');
		// A model failure with attempts left: the queue retries it, so it is not an error yet.
		const willRetry = error instanceof TransientQueueError && hasAttemptsRemaining(job);
		console.error(`❌ Chat classification job ${job.id} failed:`, errorMessage);
		await logWorkerError(error, {
			userId: job.data.userId,
			tableName: 'chat_sessions',
			recordId: job.data.sessionId,
			operationType: 'chat_classification',
			severity: willRetry ? 'warning' : 'error',
			metadata: {
				jobId: job.id,
				willRetry
			}
		});
		await updateJobStatus(
			job.id,
			'failed',
			'chat_classification',
			errorMessage,
			job.processingToken
		);
		throw error;
	}
}

async function loadFirstUserMessage(sessionId: string): Promise<ChatMessage | null> {
	const { data, error } = await supabase
		.from('chat_messages')
		.select('id, role, content, created_at')
		.eq('session_id', sessionId)
		.eq('role', 'user')
		.order('created_at', { ascending: true })
		.limit(1);
	if (error) {
		// The recent messages still give a title; only the opening is missing.
		console.warn(
			`⚠️ Could not load the first user message of session ${sessionId}:`,
			error.message
		);
		return null;
	}
	return ((data ?? [])[0] as ChatMessage | undefined) ?? null;
}

type ProjectSnapshotOutcome = 'not_due' | 'queued' | 'already_queued' | 'failed';

function isForcedSnapshotJob(metadata: unknown): boolean {
	return (
		typeof metadata === 'object' &&
		metadata !== null &&
		!Array.isArray(metadata) &&
		(metadata as Record<string, unknown>).force === true
	);
}

/**
 * Queue the project's START HERE snapshot for this chat unless one is already covered.
 *
 * The web close route queues a forced snapshot when the browser closes a chat, and this
 * job used to queue a second one for the same close. A chat classified by the idle sweep
 * has no browser close, so it gets its snapshot here. A forced snapshot job queued for
 * the project since the chat's last message (waiting, running or done) already reflects
 * everything the chat saved, whoever queued it. The revision key matches the close
 * route's, so the two also coalesce in the queue while either is still in flight.
 */
async function ensureProjectSnapshotAfterChat(params: {
	projectId: string;
	userId: string;
	sessionId: string;
	lastMessageAtIso: string | null;
}): Promise<ProjectSnapshotOutcome> {
	try {
		if (params.lastMessageAtIso) {
			const { data: jobs, error } = await supabase
				.from('queue_jobs')
				.select('metadata')
				.eq('job_type', SNAPSHOT_JOB_TYPE)
				.like('dedup_key', `project-context-snapshot-${params.projectId}%`)
				.in('status', [...COVERING_SNAPSHOT_STATUSES])
				.gte('created_at', params.lastMessageAtIso)
				.order('created_at', { ascending: false })
				.limit(10);
			if (error) {
				// Unknown is treated as "not queued": a second snapshot is cheaper than none.
				console.warn(
					`⚠️ Could not check for a queued project snapshot (${params.projectId}):`,
					error.message
				);
			} else if ((jobs ?? []).some((queued) => isForcedSnapshotJob(queued.metadata))) {
				return 'already_queued';
			}
		}
		const snapshotQueue = await queueProjectContextSnapshot({
			projectId: params.projectId,
			userId: params.userId,
			reason: 'chat_session_end',
			force: true,
			revisionKey: `close-${params.sessionId}-${params.lastMessageAtIso ?? 'unknown'}`
		});
		if (!snapshotQueue.queued) {
			console.warn(
				`⚠️ Project context snapshot enqueue skipped (non-fatal): ${snapshotQueue.reason}`
			);
			return 'failed';
		}
		return 'queued';
	} catch (snapshotError) {
		console.warn(`⚠️ Project context snapshot enqueue failed (non-fatal):`, snapshotError);
		return 'failed';
	}
}

async function processLibriEntityHandoff(params: {
	sessionId: string;
	userId: string;
	contextType: string | null;
	projectId: string | null;
	extractedEntities: SessionExtractedEntities;
	jobId: string;
}): Promise<LibriEntityHandoffStatus | null> {
	try {
		const status = await handoffLibriSessionEntities({
			sessionId: params.sessionId,
			contextType: params.contextType,
			projectId: params.projectId,
			extractedEntities: params.extractedEntities
		});

		if (!status) return null;

		const { error } = await supabase.rpc('merge_chat_session_agent_metadata', {
			p_session_id: params.sessionId,
			p_patch: {
				libri_handoff: serializeLibriEntityHandoffStatus(status)
			}
		});

		if (error) {
			console.warn(
				`⚠️ Failed to store Libri handoff status for session ${params.sessionId}:`,
				error.message
			);
			void logWorkerError(error, {
				userId: params.userId,
				tableName: 'chat_sessions',
				recordId: params.sessionId,
				operationType: 'chat_libri_handoff_status',
				severity: 'warning',
				metadata: {
					jobId: params.jobId,
					nonFatal: true
				}
			});
			return status;
		}

		console.log(
			`📚 Libri handoff ${status.status} for session ${params.sessionId} (${status.results.length} entities)`
		);
		return status;
	} catch (error) {
		console.warn(`⚠️ Libri entity handoff failed (non-fatal):`, error);
		void logWorkerError(error, {
			userId: params.userId,
			tableName: 'chat_sessions',
			recordId: params.sessionId,
			operationType: 'chat_libri_handoff',
			severity: 'warning',
			metadata: {
				jobId: params.jobId,
				nonFatal: true
			}
		});
		return null;
	}
}

/**
 * Sanitize and validate the title
 */
function sanitizeTitle(title: string): string {
	if (!title || typeof title !== 'string') {
		return 'Chat session';
	}

	// Trim and limit to 50 characters
	let sanitized = title.trim();
	if (sanitized.length > 50) {
		sanitized = sanitized.slice(0, 47) + '...';
	}

	return sanitized || 'Chat session';
}

/**
 * Sanitize and validate topics array
 */
function sanitizeTopics(topics: string[]): string[] {
	if (!Array.isArray(topics) || topics.length === 0) {
		return ['general'];
	}

	// Filter, trim, and limit topics
	const sanitized = topics
		.filter((t) => typeof t === 'string' && t.trim().length > 0)
		.map((t) => t.trim().toLowerCase().slice(0, 30)) // Max 30 chars per topic
		.slice(0, 7); // Max 7 topics

	// Ensure at least one topic
	return sanitized.length > 0 ? sanitized : ['general'];
}

/**
 * Sanitize and validate the summary
 */
function sanitizeSummary(summary: string | undefined | null): string {
	if (!summary || typeof summary !== 'string') {
		return 'A conversation captured for reference.';
	}

	let sanitized = summary.trim();
	if (sanitized.length > 500) {
		sanitized = sanitized.slice(0, 497) + '...';
	}

	return sanitized || 'A conversation captured for reference.';
}
