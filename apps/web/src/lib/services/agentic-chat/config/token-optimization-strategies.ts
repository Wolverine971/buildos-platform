// apps/web/src/lib/services/agentic-chat/config/token-optimization-strategies.ts
/**
 * Token Optimization Strategies for Agentic Chat
 *
 * Reduces token usage while maintaining context quality
 * Based on January 2025 analysis showing potential 38.5% cost reduction
 */

import type { ChatMessage, ChatContextType } from '@buildos/shared-types';

export interface TokenOptimizationConfig {
	maxTokenBudget: number;
	contextType: ChatContextType;
	hasTools: boolean;
	preserveRecentCount: number;
}

export class TokenOptimizer {
	/**
	 * Get optimal token budget for context
	 */
	static getTokenBudget(contextType: ChatContextType, hasTools: boolean): number {
		// Tool-heavy operations need more context
		if (hasTools) {
			switch (contextType) {
				case 'project_audit':
				case 'project_forecast':
					return 6000; // Complex analysis with tools
				case 'ontology':
				case 'project':
					return 4500; // Moderate complexity with tools
				default:
					return 3500; // Standard tool operations
			}
		}

		// Non-tool operations can be more aggressive with compression
		switch (contextType) {
			case 'project_audit':
			case 'project_forecast':
			case 'project_create':
				return 4000; // Complex reasoning
			case 'calendar':
			case 'brain_dump':
				return 2500; // Simple operations
			default:
				return 3000; // Standard operations
		}
	}

	/**
	 * Intelligent message pruning strategy
	 */
	static pruneMessages(messages: ChatMessage[], config: TokenOptimizationConfig): ChatMessage[] {
		const { maxTokenBudget, contextType, hasTools, preserveRecentCount } = config;

		// Always preserve system messages and recent messages
		const systemMessages = messages.filter((m) => m.role === 'system').slice(-1);
		const recentMessages = messages.slice(-preserveRecentCount);
		const middleMessages = messages.slice(systemMessages.length, -preserveRecentCount);

		// Calculate current token usage
		const currentTokens = this.estimateTokens(messages);

		if (currentTokens <= maxTokenBudget) {
			return messages; // No pruning needed
		}

		// Strategy 1: Remove redundant user confirmations
		let pruned = this.removeRedundantConfirmations(middleMessages);

		// Strategy 2: Summarize tool call sequences
		if (hasTools) {
			pruned = this.summarizeToolCalls(pruned);
		}

		// Strategy 3: Context-aware compression
		pruned = this.applyContextCompression(pruned, contextType);

		// Reassemble messages
		const optimized = [...systemMessages, ...pruned, ...recentMessages];

		// Final check - if still over budget, apply aggressive truncation
		if (this.estimateTokens(optimized) > maxTokenBudget) {
			return this.aggressiveTruncate(optimized, maxTokenBudget);
		}

		return optimized;
	}

	/**
	 * Remove redundant confirmations like "ok", "got it", etc.
	 */
	private static removeRedundantConfirmations(messages: ChatMessage[]): ChatMessage[] {
		const redundantPatterns = /^(ok|okay|got it|understood|yes|sure|thanks|thank you)\.?$/i;

		return messages.filter((msg) => {
			// Keep if it's not a simple confirmation
			if (msg.role === 'user' && redundantPatterns.test(msg.content.trim())) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Summarize sequences of tool calls
	 */
	private static summarizeToolCalls(messages: ChatMessage[]): ChatMessage[] {
		const summarized: ChatMessage[] = [];
		let toolSequence: ChatMessage[] = [];

		for (const msg of messages) {
			if (msg.tool_calls || msg.tool_call_id) {
				toolSequence.push(msg);
			} else {
				// End of tool sequence
				if (toolSequence.length > 3 && toolSequence[0]) {
					// Summarize long tool sequences
					summarized.push({
						...toolSequence[0],
						content: `[Compressed ${toolSequence.length} tool operations: ${this.getToolSummary(
							toolSequence
						)}]`
					});
				} else {
					// Keep short sequences as-is
					summarized.push(...toolSequence);
				}
				toolSequence = [];
				summarized.push(msg);
			}
		}

		// Handle remaining tool sequence
		if (toolSequence.length > 0) {
			summarized.push(...toolSequence);
		}

		return summarized;
	}

	/**
	 * Apply context-specific compression
	 */
	private static applyContextCompression(
		messages: ChatMessage[],
		contextType: ChatContextType
	): ChatMessage[] {
		switch (contextType) {
			case 'calendar':
				// Aggressive compression for simple contexts
				return this.compressSimpleContext(messages);

			case 'project_audit':
			case 'project_forecast':
				// Preserve detail for complex analysis
				return this.compressComplexContext(messages);

			default:
				// Moderate compression
				return this.compressModerateContext(messages);
		}
	}

	/**
	 * Compress simple context aggressively
	 */
	private static compressSimpleContext(messages: ChatMessage[]): ChatMessage[] {
		// Keep only key decision points
		return messages.filter((msg, idx) => {
			// Keep first and last
			if (idx === 0 || idx === messages.length - 1) return true;

			// Keep messages with important keywords
			const important = /create|update|delete|schedule|complete|assign|priority/i;
			return important.test(msg.content);
		});
	}

	/**
	 * Compress complex context carefully
	 */
	private static compressComplexContext(messages: ChatMessage[]): ChatMessage[] {
		// Group by topic and keep key points
		const compressed: ChatMessage[] = [];
		let currentTopic: ChatMessage[] = [];

		for (const msg of messages) {
			// Detect topic changes
			if (this.isTopicChange(msg, currentTopic)) {
				if (currentTopic.length > 2 && currentTopic[0]) {
					// Summarize previous topic
					compressed.push({
						...currentTopic[0],
						content: this.summarizeTopic(currentTopic)
					});
				} else {
					compressed.push(...currentTopic);
				}
				currentTopic = [msg];
			} else {
				currentTopic.push(msg);
			}
		}

		// Handle remaining topic
		if (currentTopic.length > 0) {
			compressed.push(...currentTopic);
		}

		return compressed;
	}

	/**
	 * Moderate compression strategy
	 */
	private static compressModerateContext(messages: ChatMessage[]): ChatMessage[] {
		// Keep every 2nd message from middle section
		return messages.filter((_, idx) => {
			const position = idx / messages.length;
			// Keep all messages from first 20% and last 30%
			if (position < 0.2 || position > 0.7) return true;
			// Keep every other message in middle
			return idx % 2 === 0;
		});
	}

	/**
	 * Aggressive truncation as last resort
	 */
	private static aggressiveTruncate(
		messages: ChatMessage[],
		maxTokenBudget: number
	): ChatMessage[] {
		const result: ChatMessage[] = [];
		let currentTokens = 0;

		// Add from end (most recent first)
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (!msg) continue;
			const msgTokens = this.estimateTokens([msg]);
			if (currentTokens + msgTokens <= maxTokenBudget) {
				result.unshift(msg);
				currentTokens += msgTokens;
			} else {
				// Add truncation notice
				const firstMsg = messages[0];
				if (firstMsg) {
					result.unshift({
						...firstMsg,
						role: 'system',
						content: `[Earlier context truncated to fit token budget]`
					});
				}
				break;
			}
		}

		return result;
	}

	/**
	 * Estimate tokens (rough: 1 token ≈ 4 chars)
	 */
	private static estimateTokens(messages: ChatMessage[]): number {
		return messages.reduce((sum, msg) => {
			const contentTokens = Math.ceil(msg.content.length / 4);
			const toolTokens = msg.tool_calls ? 50 : 0; // Rough estimate for tool calls
			return sum + contentTokens + toolTokens;
		}, 0);
	}

	/**
	 * Detect topic changes in conversation
	 */
	private static isTopicChange(current: ChatMessage, topic: ChatMessage[]): boolean {
		if (topic.length === 0) return false;

		// Simple heuristic: check for question words or new entities
		const topicKeywords = /what|how|why|when|create|update|analyze|review/i;
		return topicKeywords.test(current.content);
	}

	/**
	 * Summarize a topic group
	 */
	private static summarizeTopic(messages: ChatMessage[]): string {
		const key = messages
			.filter((m) => m.role === 'assistant')
			.map((m) => m.content.substring(0, 100))
			.join(' ');

		return `[Topic summary: ${messages.length} messages about ${key.substring(0, 150)}...]`;
	}

	/**
	 * Get summary of tool operations
	 */
	private static getToolSummary(toolMessages: ChatMessage[]): string {
		const toolNames = toolMessages
			.map((m) => {
				const toolCalls = m.tool_calls;
				if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
				const firstCall = toolCalls[0] as { function?: { name?: string } } | undefined;
				return firstCall?.function?.name;
			})
			.filter(Boolean)
			.join(', ');

		return toolNames || 'multiple operations';
	}
}
