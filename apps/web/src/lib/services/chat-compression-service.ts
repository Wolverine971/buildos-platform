// apps/web/src/lib/services/chat-compression-service.ts
/**
 * Chat Compression Service
 *
 * Handles conversation compression to maintain token budgets
 * and auto-generates titles for chat sessions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatSession, ChatCompression, LLMMessage } from '@buildos/shared-types';
import { SmartLLMService } from './smart-llm-service';
import { savePromptForAudit } from '$lib/utils/prompt-audit';

export class ChatCompressionService {
	private llmService: SmartLLMService;

	constructor(private supabase: SupabaseClient) {
		this.llmService = new SmartLLMService({ supabase });
	}

	/**
	 * Generate a title for a chat session based on the first few messages
	 */
	async generateTitle(
		sessionId: string,
		messages: ChatMessage[],
		userId?: string
	): Promise<string> {
		try {
			// Use first 3-5 messages to generate title
			const relevantMessages = messages.slice(0, 5);

			// Create prompt for title generation
			const systemPrompt =
				'You are a helpful assistant that generates concise titles for conversations.';
			const userPrompt = `Based on the following conversation, generate a concise, descriptive title (max 50 characters):

${relevantMessages.map((m) => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')}

Title requirements:
- Maximum 50 characters
- Descriptive and specific
- No quotes or special formatting
- Focus on the main topic or request

Title:`;

			// Save prompt for audit
			await savePromptForAudit({
				systemPrompt,
				userPrompt,
				scenarioType: 'chat-compression-title-generation',
				metadata: {
					sessionId,
					messageCount: relevantMessages.length,
					userId: userId || 'system'
				}
			});

			const titleResponse = await this.llmService.generateText({
				prompt: userPrompt,
				systemPrompt,
				userId: userId || 'system',
				profile: 'speed',
				temperature: 0.3,
				maxTokens: 20,
				operationType: 'chat_title_generation'
			});

			const title = titleResponse.trim().substring(0, 50);

			// Update session with generated title
			const { error } = await this.supabase
				.from('chat_sessions')
				.update({
					title,
					updated_at: new Date().toISOString()
				})
				.eq('id', sessionId);

			if (error) {
				console.error('Failed to update session title:', error);
				return 'Untitled Chat';
			}

			return title;
		} catch (error) {
			console.error('Failed to generate title:', error);
			return 'Untitled Chat';
		}
	}

	/**
	 * Compress a conversation to reduce token usage
	 */
	async compressConversation(
		sessionId: string,
		messages: ChatMessage[],
		targetTokens: number = 2000,
		userId?: string
	): Promise<{
		compressedMessages: LLMMessage[];
		compressionId: string;
		tokensSaved: number;
	}> {
		try {
			// Estimate current token usage (rough: 1 token ≈ 4 chars)
			const currentTokens = messages.reduce(
				(sum, msg) => sum + Math.ceil(msg.content.length / 4),
				0
			);

			// Skip compression if already under target
			if (currentTokens <= targetTokens) {
				return {
					compressedMessages: messages.map((m) => ({
						role: m.role as any,
						content: m.content,
						tool_calls: m.tool_calls as any
					})),
					compressionId: '',
					tokensSaved: 0
				};
			}

			// Identify messages to compress (older messages, excluding recent context)
			const recentCount = 4; // Keep last 4 messages uncompressed
			const toCompress = messages.slice(0, -recentCount);
			const toKeep = messages.slice(-recentCount);

			if (toCompress.length === 0) {
				return {
					compressedMessages: messages.map((m) => ({
						role: m.role as any,
						content: m.content,
						tool_calls: m.tool_calls as any
					})),
					compressionId: '',
					tokensSaved: 0
				};
			}

			// Create compression prompt
			const systemPrompt =
				'You are an expert at compressing conversations while preserving essential information.';
			const userPrompt = `Compress the following conversation into a concise summary that preserves key information, decisions, and context. Target approximately ${Math.floor(targetTokens * 0.3)} tokens.

Conversation to compress:
${toCompress.map((m) => `${m.role}: ${m.content}`).join('\n\n')}

Requirements:
- Preserve all important decisions and outcomes
- Maintain context about what was discussed
- Keep technical details and specifications
- Summarize repetitive or verbose sections
- Use bullet points for clarity

Compressed summary:`;

			// Save prompt for audit
			await savePromptForAudit({
				systemPrompt,
				userPrompt,
				scenarioType: 'chat-compression-conversation',
				metadata: {
					sessionId,
					messagesToCompress: toCompress.length,
					targetTokens,
					currentTokens,
					userId: userId || 'system'
				}
			});

			const compressionResponse = await this.llmService.generateText({
				prompt: userPrompt,
				systemPrompt,
				userId: userId || 'system',
				profile: 'balanced',
				temperature: 0.2,
				maxTokens: Math.floor(targetTokens * 0.4),
				operationType: 'chat_conversation_compression'
			});

			const compressedSummary = compressionResponse;

			// Save compression record
			const { data: compression, error: compressionError } = await this.supabase
				.from('chat_compressions')
				.insert({
					session_id: sessionId,
					original_messages: toCompress,
					compressed_summary: compressedSummary,
					compression_ratio: toCompress.length / 1,
					tokens_before: currentTokens,
					tokens_after:
						Math.ceil(compressedSummary.length / 4) +
						toKeep.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)
				})
				.select()
				.single();

			if (compressionError) {
				console.error('Failed to save compression:', compressionError);
				throw compressionError;
			}

			// Create compressed message list
			const compressedMessages: LLMMessage[] = [
				{
					role: 'system',
					content: `Previous conversation summary:\n${compressedSummary}`
				},
				...toKeep.map((m) => ({
					role: m.role as any,
					content: m.content,
					tool_calls: m.tool_calls as any
				}))
			];

			const newTokens = compressedMessages.reduce(
				(sum, msg) => sum + Math.ceil(msg.content.length / 4),
				0
			);

			return {
				compressedMessages,
				compressionId: compression.id,
				tokensSaved: currentTokens - newTokens
			};
		} catch (error) {
			console.error('Failed to compress conversation:', error);
			// Return original messages on error
			return {
				compressedMessages: messages.map((m) => ({
					role: m.role as any,
					content: m.content,
					tool_calls: m.tool_calls as any
				})),
				compressionId: '',
				tokensSaved: 0
			};
		}
	}

	/**
	 * Determine if compression is needed based on token count
	 */
	async shouldCompress(messages: ChatMessage[], maxTokens: number = 4000): Promise<boolean> {
		const estimatedTokens = messages.reduce(
			(sum, msg) => sum + Math.ceil(msg.content.length / 4),
			0
		);

		return estimatedTokens > maxTokens;
	}

	/**
	 * Get compression history for a session
	 */
	async getCompressionHistory(sessionId: string): Promise<ChatCompression[]> {
		const { data, error } = await this.supabase
			.from('chat_compressions')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Failed to get compression history:', error);
			return [];
		}

		return data || [];
	}

	/**
	 * Smart compression that preserves tool calls and important context
	 */
	async smartCompress(
		sessionId: string,
		messages: ChatMessage[],
		contextType: string,
		userId?: string
	): Promise<{
		compressedMessages: LLMMessage[];
		metadata: {
			originalCount: number;
			compressedCount: number;
			compressionRatio: number;
			preservedToolCalls: number;
			estimatedTokens: number;
		};
	}> {
		// Separate tool calls and regular messages
		const toolMessages = messages.filter((m) => m.tool_calls || m.tool_call_id);
		const regularMessages = messages.filter((m) => !m.tool_calls && !m.tool_call_id);

		// Always preserve tool interactions
		const preservedTools = toolMessages.map((m) => ({
			role: m.role as any,
			content: m.content,
			tool_calls: m.tool_calls as any,
			tool_call_id: m.tool_call_id
		}));

		// Compress regular messages if needed
		let compressedRegular: LLMMessage[] = [];

		if (regularMessages.length > 10) {
			// Group messages by topic/time proximity
			const groups = this.groupMessagesByContext(regularMessages);

			for (const group of groups) {
				if (group.length > 3) {
					// Compress this group
					const summary = await this.compressMessageGroup(group, contextType, userId);
					compressedRegular.push({
						role: 'system',
						content: `[Compressed ${group.length} messages]: ${summary}`
					});
				} else {
					// Keep as-is
					compressedRegular.push(
						...group.map((m) => ({
							role: m.role as any,
							content: m.content
						}))
					);
				}
			}
		} else {
			compressedRegular = regularMessages.map((m) => ({
				role: m.role as any,
				content: m.content
			}));
		}

		// Merge preserved tools and compressed regular messages
		const finalMessages = this.mergeMessagesChronologically(
			preservedTools,
			compressedRegular,
			messages
		);

		// Calculate metrics
		const estimatedTokens = finalMessages.reduce(
			(sum, msg) => sum + Math.ceil(msg.content.length / 4),
			0
		);

		return {
			compressedMessages: finalMessages,
			metadata: {
				originalCount: messages.length,
				compressedCount: finalMessages.length,
				compressionRatio: messages.length / finalMessages.length,
				preservedToolCalls: toolMessages.length,
				estimatedTokens
			}
		};
	}

	/**
	 * Group messages by contextual similarity
	 */
	private groupMessagesByContext(messages: ChatMessage[]): ChatMessage[][] {
		const groups: ChatMessage[][] = [];
		let currentGroup: ChatMessage[] = [];
		let lastTimestamp = 0;

		for (const message of messages) {
			const timestamp = new Date(message.created_at || 0).getTime();
			const timeDiff = timestamp - lastTimestamp;

			// Start new group if time gap > 5 minutes
			if (timeDiff > 300000 && currentGroup.length > 0) {
				groups.push(currentGroup);
				currentGroup = [message];
			} else {
				currentGroup.push(message);
			}

			lastTimestamp = timestamp;
		}

		if (currentGroup.length > 0) {
			groups.push(currentGroup);
		}

		return groups;
	}

	/**
	 * Compress a group of related messages
	 */
	private async compressMessageGroup(
		messages: ChatMessage[],
		contextType: string,
		userId?: string
	): Promise<string> {
		const content = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

		const systemPrompt = 'Create concise summaries that preserve essential information.';
		const userPrompt = `Summarize this conversation segment concisely, preserving key points and decisions:
Context: ${contextType}
Messages: ${content}

Summary (max 100 words):`;

		// Save prompt for audit
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: 'chat-compression-segment',
			metadata: {
				contextType,
				messageCount: messages.length,
				userId: userId || 'system'
			}
		});

		try {
			const response = await this.llmService.generateText({
				prompt: userPrompt,
				systemPrompt,
				userId: userId || 'system',
				profile: 'speed',
				temperature: 0.2,
				maxTokens: 150,
				operationType: 'chat_segment_summary'
			});

			return response.trim();
		} catch {
			// Fallback to simple truncation
			return messages[0]?.content?.substring(0, 200) + '...' || 'Summary unavailable';
		}
	}

	/**
	 * Merge messages maintaining chronological order
	 */
	private mergeMessagesChronologically(
		toolMessages: LLMMessage[],
		regularMessages: LLMMessage[],
		originalMessages: ChatMessage[]
	): LLMMessage[] {
		// For now, return a simple concatenation
		// In production, this would maintain proper chronological ordering
		return [...regularMessages, ...toolMessages];
	}
}
