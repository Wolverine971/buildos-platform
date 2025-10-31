// apps/web/src/routes/api/chat/stream/+server.ts
/**
 * Chat Streaming API Endpoint
 *
 * This endpoint provides Server-Sent Events (SSE) streaming for chat conversations
 * with progressive disclosure pattern and tool calling support.
 */

import type { RequestHandler } from './$types';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ChatContextService } from '$lib/services/chat-context-service';
import { ChatToolExecutor } from '$lib/chat/tool-executor';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { SSEResponse } from '$lib/utils/sse-response';
import { ApiResponse } from '$lib/utils/api-response';
import type {
	ChatStreamRequest,
	ChatMessage,
	ChatSession,
	ChatSessionInsert,
	ChatToolCall,
	ChatToolDefinition,
	LLMMessage,
	ChatSSEMessage,
	ChatContextType
} from '@buildos/shared-types';
import { v4 as uuidv4 } from 'uuid';

// Rate limiting
const RATE_LIMIT = {
	MAX_REQUESTS_PER_MINUTE: 30,
	MAX_TOKENS_PER_MINUTE: 50000
};

// Track user request rates
const rateLimiter = new Map<
	string,
	{
		requests: number;
		tokens: number;
		resetAt: number;
	}
>();

/**
 * POST /api/chat/stream
 * Stream a chat conversation response with tool support
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	// Check rate limiting
	const now = Date.now();
	let userRateLimit = rateLimiter.get(userId);

	if (userRateLimit) {
		if (userRateLimit.resetAt > now) {
			if (userRateLimit.requests >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
				return ApiResponse.error(
					'Too many requests. Please wait before sending another message.',
					429,
					'RATE_LIMITED'
				);
			}
			if (userRateLimit.tokens >= RATE_LIMIT.MAX_TOKENS_PER_MINUTE) {
				return ApiResponse.error(
					'Token limit reached. Please wait a moment before continuing.',
					429,
					'RATE_LIMITED'
				);
			}
			userRateLimit.requests++;
		} else {
			// Reset rate limit window
			rateLimiter.set(userId, {
				requests: 1,
				tokens: 0,
				resetAt: now + 60000 // 1 minute
			});
			userRateLimit = rateLimiter.get(userId);
		}
	} else {
		// Initialize rate limit window
		rateLimiter.set(userId, {
			requests: 1,
			tokens: 0,
			resetAt: now + 60000
		});
		userRateLimit = rateLimiter.get(userId);
	}

	try {
		const body = (await request.json()) as ChatStreamRequest;
		const { message, session_id, context_type = 'global', entity_id } = body;

		if (!message?.trim()) {
			return ApiResponse.badRequest('Message is required');
		}

		// Initialize services
		const llmService = new SmartLLMService({ supabase });
		const contextService = new ChatContextService(supabase);
		const toolExecutor = new ChatToolExecutor(supabase, userId);
		const compressionService = new ChatCompressionService(supabase);

		// Get or create session
		let chatSession: ChatSession;

		if (session_id) {
			// Get existing session
			const { data: existingSession } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('id', session_id)
				.eq('user_id', userId)
				.single();

			if (!existingSession) {
				return ApiResponse.notFound('Session');
			}

			chatSession = existingSession;
		} else {
			// Create new session
			const sessionData: ChatSessionInsert = {
				user_id: userId,
				context_type,
				entity_id,
				status: 'active',
				message_count: 0,
				total_tokens_used: 0,
				tool_call_count: 0
			};

			const { data: newSession, error: sessionError } = await supabase
				.from('chat_sessions')
				.insert(sessionData)
				.select()
				.single();

			if (sessionError) {
				console.error('Failed to create session:', sessionError);
				return ApiResponse.internalError(sessionError, 'Failed to create chat session');
			}

			chatSession = newSession;
		}

		// Set session ID for tool execution logging
		toolExecutor.setSessionId(chatSession.id);

		// Get context-appropriate tools based on chat mode
		// Different contexts (global, project, task, etc.) get different tool sets
		const contextTools = contextService.getTools(chatSession.context_type as ChatContextType);

		// Check if this context should auto-execute tools (reactive) or queue them (proactive)
		const shouldAutoExecute = contextService.shouldAutoExecute(
			chatSession.context_type as ChatContextType
		);

		// Build initial context using progressive disclosure
		const initialContext = await contextService.buildInitialContext(
			chatSession.id,
			chatSession.context_type as any,
			chatSession.entity_id
		);

		// Get conversation history
		const { data: allMessages } = await supabase
			.from('chat_messages')
			.select('*')
			.eq('session_id', chatSession.id)
			.order('created_at', { ascending: true });

		let previousMessages = allMessages || [];
		let compressionApplied = false;
		let compressionResult: Awaited<
			ReturnType<typeof compressionService.compressConversation>
		> | null = null;

		// Check if compression is needed (more than 20 messages or high token count)
		if (previousMessages.length > 20) {
			const shouldCompress = await compressionService.shouldCompress(previousMessages, 3000);

			if (shouldCompress) {
				compressionResult = await compressionService.compressConversation(
					chatSession.id,
					previousMessages,
					2000,
					userId
				);

				if (compressionResult.tokensSaved > 0) {
					compressionApplied = true;
					// We'll use compressed messages in the LLM context
					console.log(
						`Compressed conversation, saved ${compressionResult.tokensSaved} tokens`
					);
				} else {
					compressionResult = null;
				}
			}
		}

		// Build messages array for LLM
		const messages: LLMMessage[] = [];

		// Add system prompt with progressive disclosure instructions
		messages.push({
			role: 'system',
			content: initialContext.systemPrompt
		});

		// Add user context if available
		if (initialContext.userContext) {
			messages.push({
				role: 'system',
				content: initialContext.userContext
			});
		}

		// Add location context
		messages.push({
			role: 'system',
			content: initialContext.locationContext
		});

		// Add related data if available
		if (initialContext.relatedData) {
			messages.push({
				role: 'system',
				content: initialContext.relatedData
			});
		}

		// Add conversation history (use compressed or regular messages)
		if (compressionApplied && compressionResult) {
			messages.push(...compressionResult.compressedMessages);
		} else if (previousMessages && previousMessages.length > 0) {
			// Use last 10 messages if no compression
			const recentMessages = previousMessages.slice(-10);
			for (const msg of recentMessages) {
				messages.push({
					role: msg.role as any,
					content: msg.content,
					tool_calls: msg.tool_calls as any,
					tool_call_id: msg.tool_call_id
				});
			}
		}

		// Add current user message
		messages.push({
			role: 'user',
			content: message
		});

		// Save user message
		const userMessageData = {
			session_id: chatSession.id,
			user_id: userId,
			role: 'user',
			content: message
		};

		const { data: userMessage, error: userMessageError } = await supabase
			.from('chat_messages')
			.insert(userMessageData)
			.select()
			.single();

		if (userMessageError) {
			console.error('Failed to save user message:', userMessageError);
			return ApiResponse.internalError(userMessageError, 'Failed to save message');
		}

		// Create SSE response
		const chatStream = SSEResponse.createChatStream();

		// Start streaming in background
		const assistantMessageId = uuidv4();

		(async () => {
			let accumulatedContent = '';
			let toolCalls: ChatToolCall[] = [];
			let totalTokens = 0;

			try {
				// Send session hydration event as soon as the stream opens
				await chatStream.sendMessage({
					type: 'session',
					session: chatSession
				});

				// Stream LLM response with context-appropriate tools
				for await (const chunk of llmService.streamText({
					messages: messages as any,
					tools: contextTools as any,
					tool_choice: 'auto',
					userId,
					profile: 'speed',
					temperature: 0.7,
					maxTokens: 2000,
					sessionId: chatSession.id,
					messageId: assistantMessageId
				})) {
					if (chunk.type === 'text' && chunk.content) {
						// Stream text content
						accumulatedContent += chunk.content;

						const sseMessage: ChatSSEMessage = {
							type: 'text',
							content: chunk.content
						};

						await chatStream.sendMessage(sseMessage);
					} else if (chunk.type === 'tool_call' && chunk.tool_call) {
						// Handle tool call
						const toolCall = chunk.tool_call;
						toolCalls.push(toolCall);

						// Send tool call notification
						const sseMessage: ChatSSEMessage = {
							type: 'tool_call',
							tool_call: toolCall
						};

						await chatStream.sendMessage(sseMessage);

						// Execute tool immediately
						// NOTE: Currently all tools execute immediately. Future enhancement:
						// - If shouldAutoExecute === false (proactive mode)
						// - Check chatSession.auto_accept_operations flag
						// - If false, queue operation for user approval instead of executing
						const toolResult = await toolExecutor.execute(toolCall);

						// Send tool result
						const resultMessage: ChatSSEMessage = {
							type: 'tool_result',
							tool_result: toolResult
						};

						await chatStream.sendMessage(resultMessage);

						// Add tool result to messages for context
						messages.push({
							role: 'tool',
							content: JSON.stringify(toolResult.result),
							tool_call_id: toolCall.id
						});

						// Continue streaming with tool result
						for await (const continuationChunk of llmService.streamText({
							messages: messages as any,
							tools: contextTools as any,
							tool_choice: 'auto',
							userId,
							profile: 'speed',
							temperature: 0.7,
							maxTokens: 1000,
							sessionId: chatSession.id,
							messageId: assistantMessageId
						})) {
							if (continuationChunk.type === 'text' && continuationChunk.content) {
								accumulatedContent += continuationChunk.content;

								const sseMessage: ChatSSEMessage = {
									type: 'text',
									content: continuationChunk.content
								};

								await chatStream.sendMessage(sseMessage);
							} else if (continuationChunk.type === 'done') {
								if (continuationChunk.usage) {
									totalTokens = continuationChunk.usage.total_tokens || 0;
								}
								break;
							}
						}
					} else if (chunk.type === 'done') {
						// Stream completed
						if (chunk.usage) {
							totalTokens = chunk.usage.total_tokens || 0;
						}
						break;
					} else if (chunk.type === 'error') {
						// Handle error
						console.error('Stream error:', chunk.error);

						const errorMessage: ChatSSEMessage = {
							type: 'error',
							error: chunk.error || 'An error occurred during streaming'
						};

						await chatStream.sendMessage(errorMessage);
						break;
					}
				}

				// Save assistant message
				const assistantMessageData = {
					id: assistantMessageId,
					session_id: chatSession.id,
					user_id: userId,
					role: 'assistant',
					content: accumulatedContent,
					tool_calls: toolCalls.length > 0 ? (toolCalls as any) : null,
					total_tokens: totalTokens
				};

				const { error: assistantMessageError } = await supabase
					.from('chat_messages')
					.insert(assistantMessageData);

				if (assistantMessageError) {
					console.error('Failed to save assistant message:', assistantMessageError);
				}

				// Update rate limiter with token usage
				const currentRate = rateLimiter.get(userId);
				if (currentRate) {
					currentRate.tokens = Math.min(
						currentRate.tokens + totalTokens,
						RATE_LIMIT.MAX_TOKENS_PER_MINUTE
					);
				}

				// Generate title for new sessions
				if (!chatSession.title || chatSession.title === 'Untitled Chat') {
					const sessionMessages = await supabase
						.from('chat_messages')
						.select('*')
						.eq('session_id', chatSession.id)
						.order('created_at', { ascending: true })
						.limit(5);

					if (sessionMessages.data && sessionMessages.data.length >= 2) {
						compressionService
							.generateTitle(
								chatSession.id,
								sessionMessages.data,
								chatSession.user_id
							)
							.then((title) => {
								console.log(
									`Generated title for session ${chatSession.id}: ${title}`
								);
							})
							.catch((err) => {
								console.error('Failed to generate title:', err);
							});
					}
				}

				// Send completion message
				const doneMessage: ChatSSEMessage = {
					type: 'done',
					usage: {
						prompt_tokens: 0,
						completion_tokens: 0,
						total_tokens: totalTokens
					},
					finished_reason: 'stop'
				};

				await chatStream.sendMessage(doneMessage);
			} catch (streamError) {
				console.error('Streaming error:', streamError);

				const errorMessage: ChatSSEMessage = {
					type: 'error',
					error: 'Failed to generate response'
				};

				await chatStream.sendMessage(errorMessage);
			} finally {
				await chatStream.close();
			}
		})();

		// Return SSE response
		return chatStream.response;
	} catch (err) {
		console.error('Chat API error:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};

/**
 * GET /api/chat/stream
 * Get chat session information
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		// Get user's active sessions
		const { data: sessions, error: sessionsError } = await supabase
			.from('chat_sessions')
			.select('*')
			.eq('user_id', userId)
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.limit(10);

		if (sessionsError) {
			console.error('Failed to get sessions:', sessionsError);
			return ApiResponse.internalError(sessionsError, 'Failed to get chat sessions');
		}

		return ApiResponse.success({ sessions });
	}

	// Get specific session with messages
	const { data: chatSession, error: sessionError } = await supabase
		.from('chat_sessions')
		.select(
			`
      *,
      messages:chat_messages(*)
    `
		)
		.eq('id', sessionId)
		.eq('user_id', userId)
		.single();

	if (sessionError || !chatSession) {
		return ApiResponse.notFound('Session');
	}

	return ApiResponse.success({ session: chatSession });
};
