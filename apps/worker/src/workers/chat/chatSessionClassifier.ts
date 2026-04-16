// apps/worker/src/workers/chat/chatSessionClassifier.ts
// Worker processor for classifying chat sessions and generating titles/topics
// Also handles activity logging and next step generation for project-related sessions

import { supabase } from '../../lib/supabase';
import { logWorkerError } from '../../lib/errorLogger';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	ChatClassificationJobData,
	updateJobStatus,
	validateChatClassificationJobData
} from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';
import { processSessionActivityAndNextSteps } from './chatSessionActivityProcessor';
import { processProfileSignals } from './profileSignalProcessor';
import { processContactSignals } from './contactSignalProcessor';
import {
	emptySessionExtractedEntities,
	sanitizeSessionExtractedEntities,
	type SessionExtractedEntities
} from './libriSessionEntities';
import {
	handoffLibriSessionEntities,
	type LibriEntityHandoffStatus
} from './libriEntityHandoffClient';

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
interface ChatMessage {
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

/**
 * System prompt for chat classification
 */
const CLASSIFICATION_SYSTEM_PROMPT = `You are a chat session analyzer. Your task is to analyze chat conversation history and generate:

1. A concise, descriptive title (max 50 characters) that captures the main topic/purpose of the conversation
2. A list of 3-7 topic keywords that represent the subjects discussed
3. A brief summary (2-3 sentences, max 500 characters) that captures what was discussed and any outcomes
4. Structured Libri entity extraction for high-confidence people, books, YouTube videos, and YouTube channels discussed in the session

Guidelines:
- Title should be human-readable (e.g., "Planning vacation to Japan", "Debugging API issues")
- Topics should be specific keywords, not sentences (e.g., "authentication", "scheduling")
- Summary should help the user quickly recall what this conversation was about
- Include any key decisions made, tasks created, or outcomes achieved
- Focus on the user's actual intent and what was accomplished
- Ignore meta-discussion about the AI or system
- If the conversation is too short or unclear, use "Quick chat" as the title
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
    "extraction_version": "libri_session_synthesis_v1",
    "extracted_at": "ISO-8601 timestamp"
  }
}`;

/**
 * Build the user prompt with conversation history
 */
function getPromptMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(0, 30); // Limit to first 30 messages to avoid token limits
}

function buildUserPrompt(messages: ChatMessage[]): string {
	const relevantMessages = getPromptMessages(messages);

	if (relevantMessages.length === 0) {
		return 'No conversation content available.';
	}

	const conversationText = relevantMessages
		.map((m, index) => {
			const role = m.role === 'user' ? 'User' : 'Assistant';
			// Truncate very long messages
			const content = m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content;
			return `turn_index=${index}\nmessage_id=${m.id}\nrole=${role}\ncontent: ${content}`;
		})
		.join('\n\n');

	return `Analyze this conversation and generate a title, topics, summary, and Libri entity extraction:\n\n${conversationText}`;
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

		await updateJobStatus(job.id, 'processing', 'chat_classification');

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
			await updateJobStatus(job.id, 'completed', 'chat_classification');
			return { success: true, skipped: true, reason: 'session_not_found' };
		}

		// Fetch chat messages for this session
		const { data: messages, error: messagesError } = await supabase
			.from('chat_messages')
			.select('id, role, content, created_at')
			.eq('session_id', validatedData.sessionId)
			.order('created_at', { ascending: true })
			.limit(50); // Limit messages to avoid excessive token usage

		if (messagesError) {
			throw new Error(`Failed to fetch messages: ${messagesError.message}`);
		}

		const hasPlaceholderTitle = isPlaceholderTitle(session.title);
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
			await updateJobStatus(job.id, 'completed', 'chat_classification');
			return { success: true, skipped: true, reason: 'already_classified' };
		}

		const typedMessages = (messages ?? []) as ChatMessage[];

		// If there is no meaningful user content, use default classification.
		// A single explicit user message still goes through synthesis so Libri entities can be extracted.
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
			const updatePayload: Record<string, any> = {
				auto_title: title,
				chat_topics: topics,
				summary,
				extracted_entities: extractedEntities,
				last_classified_at: classificationTimestamp,
				updated_at: new Date().toISOString()
			};

			// Promote the auto title if the existing title is just a placeholder
			if (hasPlaceholderTitle) {
				updatePayload.title = title;
			}

			const { error: updateError } = await supabase
				.from('chat_sessions')
				.update(updatePayload)
				.eq('id', validatedData.sessionId);

			if (updateError) {
				throw new Error(`Failed to update session: ${updateError.message}`);
			}

			await updateJobStatus(job.id, 'completed', 'chat_classification');
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

		// Initialize LLM service
		const llmService = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Chat Classifier'
		});

		// Build prompt with conversation
		const userPrompt = buildUserPrompt(typedMessages);

		// Call LLM for classification
		console.log(`🤖 Calling LLM to classify session ${validatedData.sessionId}...`);
		let usedFallbackClassification = false;
		let classification: ChatClassificationResponse;
		try {
			classification = await llmService.getJSONResponse<ChatClassificationResponse>({
				systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
				userPrompt,
				userId: validatedData.userId,
				profile: 'fast', // Use fast profile since this is a simple classification
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					maxRetries: 2
				}
			});
		} catch (llmError: any) {
			usedFallbackClassification = true;
			console.warn(
				`⚠️  LLM classification failed for session ${validatedData.sessionId}, using fallback:`,
				llmError?.message ?? llmError
			);
			classification = buildFallbackClassification(typedMessages);
		}

		// Validate and sanitize the response
		const title = sanitizeTitle(classification.title);
		const topics = sanitizeTopics(classification.topics);
		const summary = sanitizeSummary(classification.summary);
		const promptMessages = getPromptMessages(typedMessages);
		const extractedEntities = sanitizeSessionExtractedEntities(
			classification.extracted_entities,
			{
				knownMessageIds: new Set(promptMessages.map((message) => message.id)),
				maxTurnIndex: Math.max(0, promptMessages.length - 1)
			}
		);

		console.log(
			`✅ Classification result${usedFallbackClassification ? ' (fallback)' : ''}: "${title}" with topics: [${topics.join(', ')}]`
		);
		console.log(`📝 Summary: ${summary.slice(0, 100)}${summary.length > 100 ? '...' : ''}`);
		console.log(`📚 Libri candidates: ${extractedEntities.libri_candidates.length} extracted`);

		// Update the chat session with classification results
		const classificationTimestamp = latestMessageAtIso ?? new Date().toISOString();
		const updatePayload: Record<string, any> = {
			// Preserve any user-provided title; only set the auto title
			auto_title: title,
			chat_topics: topics,
			summary: summary,
			extracted_entities: extractedEntities,
			last_classified_at: classificationTimestamp,
			updated_at: new Date().toISOString()
		};

		// If the stored title is just a placeholder, promote the classified title
		if (hasPlaceholderTitle) {
			updatePayload.title = title;
		}

		const { error: updateError } = await supabase
			.from('chat_sessions')
			.update(updatePayload)
			.eq('id', validatedData.sessionId);

		if (updateError) {
			throw new Error(`Failed to update session with classification: ${updateError.message}`);
		}

		const libriHandoffStatus = await processLibriEntityHandoff({
			sessionId: validatedData.sessionId,
			userId: validatedData.userId,
			contextType: session.context_type,
			projectId: session.context_type === 'project' ? session.entity_id : null,
			extractedEntities,
			jobId: job.id
		});

		// Process activity logging and next steps for project-related sessions
		// This runs after classification to ensure we have the title/topics context
		let activityResult = {
			activityLogsCreated: 0,
			nextStepUpdated: false,
			projectId: null as string | null
		};
		try {
			activityResult = await processSessionActivityAndNextSteps(
				validatedData.sessionId,
				validatedData.userId
			);
			if (activityResult.activityLogsCreated > 0 || activityResult.nextStepUpdated) {
				console.log(
					`📊 Activity processing: ${activityResult.activityLogsCreated} logs, next step ${activityResult.nextStepUpdated ? 'updated' : 'unchanged'}`
				);
			}
		} catch (activityError) {
			// Don't fail the classification job if activity processing fails
			console.error(`⚠️ Activity processing failed (non-fatal):`, activityError);
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

		let profileSignalResult: Awaited<ReturnType<typeof processProfileSignals>> = {
			skipped: true,
			reason: 'not_attempted',
			extractedCount: 0,
			insertedCount: 0,
			mergedCount: 0,
			needsReviewCount: 0
		};
		try {
			profileSignalResult = await processProfileSignals({
				sessionId: validatedData.sessionId,
				userId: validatedData.userId,
				messages: typedMessages,
				classification: {
					title,
					topics,
					summary
				}
			});
			if (!profileSignalResult.skipped) {
				console.log(
					`🧬 Profile signals: extracted=${profileSignalResult.extractedCount}, inserted=${profileSignalResult.insertedCount}, merged=${profileSignalResult.mergedCount}, needsReview=${profileSignalResult.needsReviewCount}`
				);
			}
		} catch (profileError) {
			console.error(`⚠️ Profile signal extraction failed (non-fatal):`, profileError);
			void logWorkerError(profileError, {
				userId: validatedData.userId,
				tableName: 'chat_sessions',
				recordId: validatedData.sessionId,
				operationType: 'chat_profile_signal_processing',
				severity: 'warning',
				metadata: {
					jobId: job.id,
					nonFatal: true
				}
			});
		}

		let contactSignalResult: Awaited<ReturnType<typeof processContactSignals>> = {
			skipped: true,
			reason: 'not_attempted',
			extractedCount: 0,
			insertedCount: 0,
			appliedCount: 0,
			createdCount: 0,
			needsConfirmationCount: 0,
			mergeCandidateCount: 0
		};
		try {
			contactSignalResult = await processContactSignals({
				sessionId: validatedData.sessionId,
				userId: validatedData.userId,
				messages: typedMessages,
				classification: {
					title,
					topics,
					summary
				}
			});
			if (!contactSignalResult.skipped) {
				console.log(
					`👥 Contact signals: extracted=${contactSignalResult.extractedCount}, inserted=${contactSignalResult.insertedCount}, applied=${contactSignalResult.appliedCount}, created=${contactSignalResult.createdCount}, needsConfirmation=${contactSignalResult.needsConfirmationCount}, mergeCandidates=${contactSignalResult.mergeCandidateCount}`
				);
			}
		} catch (contactError) {
			console.error(`⚠️ Contact signal extraction failed (non-fatal):`, contactError);
			void logWorkerError(contactError, {
				userId: validatedData.userId,
				tableName: 'chat_sessions',
				recordId: validatedData.sessionId,
				operationType: 'chat_contact_signal_processing',
				severity: 'warning',
				metadata: {
					jobId: job.id,
					nonFatal: true
				}
			});
		}

		await updateJobStatus(job.id, 'completed', 'chat_classification');

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
			activityLogsCreated: activityResult.activityLogsCreated,
			nextStepUpdated: activityResult.nextStepUpdated,
			projectId: activityResult.projectId,
			profileSignals: profileSignalResult,
			contactSignals: contactSignalResult
		};
	} catch (error: any) {
		console.error(`❌ Chat classification job ${job.id} failed:`, error.message);
		await logWorkerError(error, {
			userId: job.data.userId,
			tableName: 'chat_sessions',
			recordId: job.data.sessionId,
			operationType: 'chat_classification',
			severity: 'error',
			metadata: {
				jobId: job.id
			}
		});
		await updateJobStatus(job.id, 'failed', 'chat_classification', error.message);
		throw error;
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

		const { error } = await (supabase as any).rpc('merge_chat_session_agent_metadata', {
			p_session_id: params.sessionId,
			p_patch: {
				libri_handoff: status
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
