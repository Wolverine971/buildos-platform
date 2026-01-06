// apps/worker/src/workers/braindump/braindumpProcessor.ts
// Worker processor for processing braindumps and generating title/topics/summary

import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import {
	BraindumpProcessingJobData,
	updateJobStatus,
	validateBraindumpProcessingJobData
} from '../shared/queueUtils';
import { LegacyJob } from '../shared/jobAdapter';

// Type for braindump record (before types are regenerated from migration)
interface OntoBraindump {
	id: string;
	content: string;
	title: string | null;
	topics: string[] | null;
	summary: string | null;
	status: string;
}

/**
 * Response structure from LLM processing
 */
interface BraindumpProcessingResponse {
	title: string; // Max 100 characters, descriptive title
	topics: string[]; // 3-7 topic keywords
	summary: string; // 2-3 sentence summary
}

const DEFAULT_BRAINDUMP_TITLES = new Set(
	['untitled braindump', 'braindump', 'untitled'].map((title) => title.toLowerCase())
);

const isPlaceholderBraindumpTitle = (title?: string | null) => {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_BRAINDUMP_TITLES.has(normalized);
};

/**
 * System prompt for braindump processing
 */
const PROCESSING_SYSTEM_PROMPT = `You are a thought analyst helping users organize raw braindumps. Your task is to analyze unstructured thoughts and generate:

1. A concise, descriptive title (max 100 characters) that captures the essence
2. A list of 3-7 topic keywords that represent the main themes
3. A brief summary (2-3 sentences) that captures the core ideas

Guidelines:
- The title should be human-readable and capture the main intent or topic
- Topics should be specific keywords, not sentences (e.g., "project planning", "personal goals", "work stress")
- The summary should be a helpful distillation that could remind the user what this braindump was about
- Be supportive and non-judgmental - braindumps are raw thoughts
- If the content is very brief or unclear, generate reasonable defaults
- Focus on extracting value and clarity from the raw thoughts

Respond ONLY with valid JSON in this exact format:
{
  "title": "Your descriptive title here",
  "topics": ["topic1", "topic2", "topic3"],
  "summary": "A 2-3 sentence summary of the key points and themes."
}`;

/**
 * Build the user prompt with braindump content
 */
function buildUserPrompt(content: string): string {
	// Truncate very long braindumps to avoid token limits
	const truncatedContent = content.length > 8000 ? content.slice(0, 8000) + '...' : content;

	return `Analyze this braindump and generate a title, topics, and summary:\n\n${truncatedContent}`;
}

/**
 * Process a braindump processing job
 */
export async function processBraindumpProcessingJob(job: LegacyJob<BraindumpProcessingJobData>) {
	console.log(`🧠 Processing braindump job ${job.id} for braindump ${job.data.braindumpId}`);

	try {
		// Validate job data
		const validatedData = validateBraindumpProcessingJobData(job.data);

		await updateJobStatus(job.id, 'processing', 'process_onto_braindump');

		// Fetch the braindump to verify it exists and get content
		// Note: Using type assertion until types are regenerated from migration
		const { data: braindump, error: braindumpError } = (await (supabase as any)
			.from('onto_braindumps')
			.select('id, content, title, topics, summary, status')
			.eq('id', validatedData.braindumpId)
			.eq('user_id', validatedData.userId)
			.single()) as { data: OntoBraindump | null; error: any };

		if (braindumpError || !braindump) {
			throw new Error(
				`Braindump not found: ${braindumpError?.message || 'Braindump does not exist'}`
			);
		}

		const hasPlaceholderTitle = isPlaceholderBraindumpTitle(braindump.title);

		// Skip if already processed (has non-placeholder title, topics, and summary)
		if (
			braindump.title &&
			!hasPlaceholderTitle &&
			(braindump.topics?.length ?? 0) > 0 &&
			braindump.summary
		) {
			console.log(`⏭️  Braindump ${validatedData.braindumpId} already processed, skipping`);
			await updateJobStatus(job.id, 'completed', 'process_onto_braindump');
			return { success: true, skipped: true, reason: 'already_processed' };
		}

		// Mark as processing in the braindump table
		await (supabase as any)
			.from('onto_braindumps')
			.update({ status: 'processing' })
			.eq('id', validatedData.braindumpId);

		// Check if content is too short for meaningful processing
		if (!braindump.content || braindump.content.trim().length < 10) {
			console.log(
				`⚠️  Braindump ${validatedData.braindumpId} has insufficient content (${braindump.content?.length || 0} chars)`
			);

			// Update with default values
			const { error: updateError } = await (supabase as any)
				.from('onto_braindumps')
				.update({
					title: 'Quick thought',
					topics: ['general'],
					summary: 'A brief note captured for later.',
					status: 'processed',
					processed_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', validatedData.braindumpId);

			if (updateError) {
				throw new Error(`Failed to update braindump: ${updateError.message}`);
			}

			await updateJobStatus(job.id, 'completed', 'process_onto_braindump');
			return {
				success: true,
				title: 'Quick thought',
				topics: ['general'],
				summary: 'A brief note captured for later.',
				reason: 'insufficient_content'
			};
		}

		// Initialize LLM service
		const llmService = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Braindump Processor'
		});

		// Build prompt with content
		const userPrompt = buildUserPrompt(braindump.content);

		// Call LLM for processing
		console.log(`🤖 Calling LLM to process braindump ${validatedData.braindumpId}...`);
		const result = await llmService.getJSONResponse<BraindumpProcessingResponse>({
			systemPrompt: PROCESSING_SYSTEM_PROMPT,
			userPrompt,
			userId: validatedData.userId,
			profile: 'fast', // Use fast profile since this is a simple processing task
			temperature: 0.3,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		// Validate and sanitize the response
		const title = sanitizeTitle(result.title);
		const topics = sanitizeTopics(result.topics);
		const summary = sanitizeSummary(result.summary);

		console.log(`✅ Processing result: "${title}" with topics: [${topics.join(', ')}]`);

		// Update the braindump with processing results
		const { error: updateError } = await (supabase as any)
			.from('onto_braindumps')
			.update({
				title,
				topics,
				summary,
				status: 'processed',
				processed_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', validatedData.braindumpId);

		if (updateError) {
			throw new Error(
				`Failed to update braindump with processing results: ${updateError.message}`
			);
		}

		await updateJobStatus(job.id, 'completed', 'process_onto_braindump');

		return {
			success: true,
			braindumpId: validatedData.braindumpId,
			title,
			topics,
			summary,
			contentLength: braindump.content.length
		};
	} catch (error: any) {
		console.error(`❌ Braindump processing job ${job.id} failed:`, error.message);

		// Mark braindump as failed
		try {
			await (supabase as any)
				.from('onto_braindumps')
				.update({
					status: 'failed',
					error_message: error.message,
					updated_at: new Date().toISOString()
				})
				.eq('id', job.data.braindumpId);
		} catch (updateErr) {
			console.error('Failed to update braindump status to failed:', updateErr);
		}

		await updateJobStatus(job.id, 'failed', 'process_onto_braindump', error.message);
		throw error;
	}
}

/**
 * Sanitize and validate the title
 */
function sanitizeTitle(title: string): string {
	if (!title || typeof title !== 'string') {
		return 'Braindump';
	}

	// Trim and limit to 100 characters
	let sanitized = title.trim();
	if (sanitized.length > 100) {
		sanitized = sanitized.slice(0, 97) + '...';
	}

	return sanitized || 'Braindump';
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
 * Sanitize and validate summary
 */
function sanitizeSummary(summary: string): string {
	if (!summary || typeof summary !== 'string') {
		return 'A collection of thoughts captured for later reference.';
	}

	// Trim and limit to 500 characters
	let sanitized = summary.trim();
	if (sanitized.length > 500) {
		sanitized = sanitized.slice(0, 497) + '...';
	}

	return sanitized || 'A collection of thoughts captured for later reference.';
}
