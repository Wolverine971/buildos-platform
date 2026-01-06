// apps/worker/src/workers/chat/chatSessionClassifier.ts
// Worker processor for classifying chat sessions and generating titles/topics
// Also handles activity logging and next step generation for project-related sessions

import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	ChatClassificationJobData,
	updateJobStatus,
	validateChatClassificationJobData
} from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';
import { processSessionActivityAndNextSteps } from './chatSessionActivityProcessor';

/**
 * Response structure from LLM classification
 */
interface ChatClassificationResponse {
	title: string; // Max 50 characters, descriptive title
	topics: string[]; // 3-7 topic keywords
	summary: string; // 2-3 sentences, max 500 characters
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

Guidelines:
- Title should be human-readable (e.g., "Planning vacation to Japan", "Debugging API issues")
- Topics should be specific keywords, not sentences (e.g., "authentication", "scheduling")
- Summary should help the user quickly recall what this conversation was about
- Include any key decisions made, tasks created, or outcomes achieved
- Focus on the user's actual intent and what was accomplished
- Ignore meta-discussion about the AI or system
- If the conversation is too short or unclear, use "Quick chat" as the title

Respond ONLY with valid JSON in this exact format:
{
  "title": "Your descriptive title here",
  "topics": ["topic1", "topic2", "topic3"],
  "summary": "A 2-3 sentence summary of what was discussed and any outcomes."
}`;

/**
 * Build the user prompt with conversation history
 */
function buildUserPrompt(messages: ChatMessage[]): string {
	// Filter to relevant messages (user and assistant only)
	const relevantMessages = messages
		.filter((m) => m.role === 'user' || m.role === 'assistant')
		.slice(0, 30); // Limit to first 30 messages to avoid token limits

	if (relevantMessages.length === 0) {
		return 'No conversation content available.';
	}

	const conversationText = relevantMessages
		.map((m) => {
			const role = m.role === 'user' ? 'User' : 'Assistant';
			// Truncate very long messages
			const content = m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content;
			return `${role}: ${content}`;
		})
		.join('\n\n');

	return `Analyze this conversation and generate a title and topics:\n\n${conversationText}`;
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
			.select('id, title, auto_title, chat_topics, summary, message_count, status')
			.eq('id', validatedData.sessionId)
			.eq('user_id', validatedData.userId)
			.single();

		if (sessionError || !session) {
			throw new Error(
				`Chat session not found: ${sessionError?.message || 'Session does not exist'}`
			);
		}

		const hasPlaceholderTitle = isPlaceholderTitle(session.title);

		// Skip if already classified (has auto_title, topics, and summary)
		if (
			session.auto_title &&
			session.chat_topics &&
			session.chat_topics.length > 0 &&
			session.summary &&
			!hasPlaceholderTitle
		) {
			console.log(`⏭️  Session ${validatedData.sessionId} already classified, skipping`);
			await updateJobStatus(job.id, 'completed', 'chat_classification');
			return { success: true, skipped: true, reason: 'already_classified' };
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

		// If no messages or too few, use default classification
		if (!messages || messages.length < 2) {
			console.log(
				`⚠️  Session ${validatedData.sessionId} has insufficient messages (${messages?.length || 0})`
			);

			const defaultSummary = 'A brief conversation captured for reference.';

			// Update with default values
			const updatePayload: Record<string, any> = {
				auto_title: 'Quick chat',
				chat_topics: ['general'],
				summary: defaultSummary,
				updated_at: new Date().toISOString()
			};

			// Promote the auto title if the existing title is just a placeholder
			if (hasPlaceholderTitle) {
				updatePayload.title = 'Quick chat';
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
				title: 'Quick chat',
				topics: ['general'],
				summary: defaultSummary,
				messageCount: messages?.length || 0,
				reason: 'insufficient_messages'
			};
		}

		// Initialize LLM service
		const llmService = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Chat Classifier'
		});

		// Build prompt with conversation
		const userPrompt = buildUserPrompt(messages as ChatMessage[]);

		// Call LLM for classification
		console.log(`🤖 Calling LLM to classify session ${validatedData.sessionId}...`);
		const classification = await llmService.getJSONResponse<ChatClassificationResponse>({
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

		// Validate and sanitize the response
		const title = sanitizeTitle(classification.title);
		const topics = sanitizeTopics(classification.topics);
		const summary = sanitizeSummary(classification.summary);

		console.log(`✅ Classification result: "${title}" with topics: [${topics.join(', ')}]`);
		console.log(`📝 Summary: ${summary.slice(0, 100)}${summary.length > 100 ? '...' : ''}`);

		// Update the chat session with classification results
		const updatePayload: Record<string, any> = {
			// Preserve any user-provided title; only set the auto title
			auto_title: title,
			chat_topics: topics,
			summary: summary,
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
		}

		await updateJobStatus(job.id, 'completed', 'chat_classification');

		return {
			success: true,
			sessionId: validatedData.sessionId,
			title,
			topics,
			summary,
			messageCount: messages.length,
			activityLogsCreated: activityResult.activityLogsCreated,
			nextStepUpdated: activityResult.nextStepUpdated,
			projectId: activityResult.projectId
		};
	} catch (error: any) {
		console.error(`❌ Chat classification job ${job.id} failed:`, error.message);
		await updateJobStatus(job.id, 'failed', 'chat_classification', error.message);
		throw error;
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
