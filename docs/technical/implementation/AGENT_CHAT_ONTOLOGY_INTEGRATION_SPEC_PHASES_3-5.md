<!-- docs/technical/implementation/AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC_PHASES_3-5.md -->

# BuildOS Agent Chat Enhancement - Phases 3-5 Complete Implementation

## PHASE 3: Update API Endpoint (COMPLETE)

**MODIFY FILE**: `apps/web/src/routes/api/agent/stream/+server.ts`

### Step 1: Add All Required Imports

Add these imports at the top of the file, after existing imports (around line 16-30):

```typescript
// Add after existing imports
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { ExecutorInstructionGenerator } from '$lib/services/agent-executor-instructions';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedAgentStreamRequest,
	ChatStrategy,
	ResearchResult
} from '$lib/types/agent-chat-enhancement';
```

### Step 2: Update Request Interface

**REPLACE** the existing `AgentStreamRequest` interface (around line 54) with:

```typescript
// Enhanced request with ontology support
interface AgentStreamRequest {
	message: string;
	session_id?: string;
	context_type?: ChatContextType;
	entity_id?: string;
	conversationHistory?: ChatMessage[];
	lastTurnContext?: LastTurnContext; // NEW
	ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'output'; // NEW
}
```

### Step 3: Add Helper Functions

Add these helper functions **BEFORE** the POST handler (around line 75):

```typescript
/**
 * Generate last turn context from interaction
 */
async function generateLastTurnContext(
	userMessage: string,
	assistantResponse: string,
	toolsUsed: string[],
	entitiesAccessed: string[],
	strategyUsed: ChatStrategy | undefined,
	contextType: ChatContextType
): Promise<LastTurnContext> {
	console.log('[API] Generating last turn context', {
		toolsUsed: toolsUsed.length,
		entitiesAccessed: entitiesAccessed.length,
		strategy: strategyUsed
	});

	// Parse entities into categorized structure
	const entities: LastTurnContext['entities'] = {};

	entitiesAccessed.forEach((id) => {
		if (!id) return;

		// Categorize by ID prefix pattern
		if (id.startsWith('proj_') || id.includes('project')) {
			entities.project_id = id;
		} else if (id.startsWith('task_') || id.includes('task')) {
			entities.task_ids = entities.task_ids || [];
			if (!entities.task_ids.includes(id)) {
				entities.task_ids.push(id);
			}
		} else if (id.startsWith('plan_') || id.includes('plan')) {
			entities.plan_id = id;
		} else if (id.startsWith('goal_') || id.includes('goal')) {
			entities.goal_ids = entities.goal_ids || [];
			if (!entities.goal_ids.includes(id)) {
				entities.goal_ids.push(id);
			}
		} else if (id.startsWith('doc_') || id.includes('document')) {
			entities.document_id = id;
		} else if (id.startsWith('out_') || id.includes('output')) {
			entities.output_id = id;
		}
	});

	// Generate summary (simplified version - you could use LLM for better summaries)
	const summary = generateSimpleSummary(userMessage, assistantResponse, strategyUsed);

	return {
		summary,
		entities,
		context_type: contextType,
		data_accessed: toolsUsed,
		strategy_used:
			strategyUsed === ChatStrategy.PLANNER_STREAM
				? 'planner_stream'
				: strategyUsed === ChatStrategy.PLANNER_STREAM
					? 'planner_stream'
					: strategyUsed === ChatStrategy.ASK_CLARIFYING
						? 'clarifying'
						: undefined,
		timestamp: new Date().toISOString()
	};
}

/**
 * Generate a simple summary of the interaction
 */
function generateSimpleSummary(
	userMessage: string,
	assistantResponse: string,
	strategy?: ChatStrategy
): string {
	// Extract key action from user message
	const userAction = userMessage.toLowerCase().includes('create')
		? 'creating'
		: userMessage.toLowerCase().includes('update')
			? 'updating'
			: userMessage.toLowerCase().includes('delete')
				? 'deleting'
				: userMessage.toLowerCase().includes('list')
					? 'listing'
					: userMessage.toLowerCase().includes('show')
						? 'viewing'
						: userMessage.toLowerCase().includes('analyze')
							? 'analyzing'
							: 'discussing';

	// Extract entity type from message
	const entityType = userMessage.toLowerCase().includes('project')
		? 'project'
		: userMessage.toLowerCase().includes('task')
			? 'tasks'
			: userMessage.toLowerCase().includes('goal')
				? 'goals'
				: userMessage.toLowerCase().includes('plan')
					? 'plans'
					: userMessage.toLowerCase().includes('document')
						? 'documents'
						: 'entities';

	// Build summary
	const strategyText =
		strategy === ChatStrategy.PLANNER_STREAM
			? ' (complex analysis)'
			: strategy === ChatStrategy.ASK_CLARIFYING
				? ' (needed clarification)'
				: '';

	return `User ${userAction} ${entityType}${strategyText}`;
}

/**
 * Log API metrics for monitoring
 */
function logApiMetrics(
	userId: string,
	contextType: string,
	hasOntology: boolean,
	tokenCount: number,
	strategy?: string
) {
	console.log('[API Metrics]', {
		userId,
		contextType,
		hasOntology,
		tokenCount,
		strategy,
		timestamp: new Date().toISOString()
	});
}
```

### Step 4: Replace the Entire POST Handler

**REPLACE** the entire POST handler (starting around line 84) with this enhanced version:

```typescript
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
					'Too many requests. Agent system is more resource-intensive. Please wait before sending another message.',
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
			userRateLimit = {
				requests: 1,
				tokens: 0,
				resetAt: now + 60000 // 1 minute
			};
			rateLimiter.set(userId, userRateLimit);
		}
	} else {
		// Initialize rate limit window
		userRateLimit = {
			requests: 1,
			tokens: 0,
			resetAt: now + 60000
		};
		rateLimiter.set(userId, userRateLimit);
	}

	try {
		const body = (await request.json()) as AgentStreamRequest;
		const {
			message,
			session_id,
			context_type = 'global',
			entity_id,
			conversationHistory = [],
			lastTurnContext, // NEW
			ontologyEntityType // NEW
		} = body;

		const rawContextType = context_type as ChatContextType;
		const normalizedContextType = (
			rawContextType === 'general' ? 'global' : rawContextType
		) as ChatContextType;

		if (!message?.trim()) {
			return ApiResponse.badRequest('Message is required');
		}

		console.log('[API] Processing agent request', {
			contextType: normalizedContextType,
			hasEntityId: !!entity_id,
			hasLastTurn: !!lastTurnContext,
			hasOntologyType: !!ontologyEntityType
		});

		// Get or create session
		let chatSession: ChatSession;
		let loadedConversationHistory: ChatMessage[] = [];

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

			// Load conversation history from database for existing session
			const { data: messages, error: messagesError } = await supabase
				.from('chat_messages')
				.select('*')
				.eq('session_id', session_id)
				.order('created_at', { ascending: false })
				.limit(50); // Limit to recent 50 messages

			if (!messagesError && messages) {
				// Reverse to get chronological order (oldest first)
				loadedConversationHistory = messages.reverse();
			}
		} else {
			// Create new agent chat session
			const sessionData: ChatSessionInsert = {
				user_id: userId,
				context_type: normalizedContextType,
				entity_id,
				status: 'active',
				message_count: 0,
				total_tokens_used: 0,
				tool_call_count: 0,
				title: 'Agent Session'
			};

			const { data: newSession, error: sessionError } = await supabase
				.from('chat_sessions')
				.insert(sessionData)
				.select()
				.single();

			if (sessionError || !newSession) {
				console.error('[API] Failed to create session:', sessionError);
				return ApiResponse.error('Failed to create chat session', 500);
			}

			chatSession = newSession;
			console.log('[API] Created new session:', chatSession.id);
		}

		// === NEW: Load ontology context ===
		let ontologyContext: OntologyContext | undefined;

		if (entity_id || normalizedContextType === 'global') {
			console.log('[API] Loading ontology context', {
				contextType: normalizedContextType,
				entityId: entity_id,
				entityType: ontologyEntityType
			});

			const ontologyLoader = new OntologyContextLoader(supabase);

			try {
				if (normalizedContextType === 'global') {
					// Load global context even without entity_id
					ontologyContext = await ontologyLoader.loadGlobalContext();
				} else if (normalizedContextType === 'project' && entity_id) {
					// Load project context
					ontologyContext = await ontologyLoader.loadProjectContext(entity_id);
				} else if (ontologyEntityType && entity_id) {
					// Element-specific context (task, goal, plan, etc.)
					ontologyContext = await ontologyLoader.loadElementContext(
						ontologyEntityType,
						entity_id
					);
				}

				if (ontologyContext) {
					console.log('[API] Ontology context loaded', {
						type: ontologyContext.type,
						entityCount: ontologyContext.metadata?.entity_count,
						hasFacets: !!ontologyContext.metadata?.facets
					});
				}
			} catch (error) {
				console.error('[API] Failed to load ontology context:', error);
				// Continue without ontology context rather than failing
				// The system can still work with standard context
			}
		}

		// Initialize services with compression
		const compressionService = new ChatCompressionService(supabase);
		const contextService = new AgentContextService(supabase, compressionService);
		const plannerService = new AgentPlannerService(supabase, contextService);

		// Build enhanced planner context
		console.log('[API] Building planner context');
		const plannerContext = await contextService.buildPlannerContext({
			sessionId: chatSession.id,
			userId,
			conversationHistory: loadedConversationHistory,
			userMessage: message,
			contextType: normalizedContextType,
			entityId: entity_id,
			lastTurnContext, // Pass through
			ontologyContext // Pass through
		});

		// Log metrics
		logApiMetrics(
			userId,
			normalizedContextType,
			!!ontologyContext,
			plannerContext.metadata.totalTokens
		);

		// Update rate limit with token usage
		if (userRateLimit) {
			userRateLimit.tokens += plannerContext.metadata.totalTokens;
			rateLimiter.set(userId, userRateLimit);
		}

		// Create SSE response
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				const sse = new SSEResponse(controller, encoder);

				try {
					// Send session info
					await sse.send({
						type: 'session',
						session: chatSession
					});

					// Send ontology loaded indicator
					if (ontologyContext) {
						await sse.send({
							type: 'ontology_loaded',
							summary: `Loaded ${ontologyContext.type} context with ${
								Object.keys(ontologyContext.metadata?.entity_count || {}).length
							} entity types`
						});
					}

					// Analyze strategy
					console.log('[API] Analyzing user intent');
					const strategyAnalysis = await plannerService.analyzeUserIntent(
						message,
						plannerContext,
						lastTurnContext
					);

					await sse.send({
						type: 'analysis',
						analysis: {
							strategy: strategyAnalysis.primary_strategy,
							confidence: strategyAnalysis.confidence,
							reasoning: strategyAnalysis.reasoning,
							estimated_steps: strategyAnalysis.estimated_steps
						}
					});

					// Execute strategy
					console.log('[API] Executing strategy:', strategyAnalysis.primary_strategy);
					const streamCallback = (event: any) => sse.send(event);
					const result = await plannerService.executeStrategy(
						strategyAnalysis,
						plannerContext,
						message,
						streamCallback
					);

					// Generate response based on result
					let assistantResponse = '';
					if (result.success) {
						if (result.needs_followup && result.followup_questions) {
							// Send clarifying questions
							await sse.send({
								type: 'clarifying_questions',
								questions: result.followup_questions
							});

							// Set a placeholder response
							assistantResponse = `I need some clarification: ${result.followup_questions.join(', ')}`;
						} else {
							// Generate text response from research
							console.log('[API] Generating response from research');
							assistantResponse = await plannerService.generateResponse(
								result,
								plannerContext
							);

							// Stream the response
							await sse.send({
								type: 'text',
								content: assistantResponse
							});
						}
					} else {
						// Handle failure
						assistantResponse =
							'I encountered an issue while processing your request. Please try again.';
						await sse.send({
							type: 'text',
							content: assistantResponse
						});
					}

					// Generate new last turn context
					const newLastTurnContext = await generateLastTurnContext(
						message,
						assistantResponse,
						result.tools_used || [],
						result.entities_accessed || [],
						result.strategy_used,
						normalizedContextType
					);

					// Send last turn context
					await sse.send({
						type: 'last_turn_context',
						context: newLastTurnContext
					});

					// Save messages to database
					console.log('[API] Saving messages to database');

					// Save user message
					const userMessageData = {
						session_id: chatSession.id,
						role: 'user' as const,
						content: message,
						user_id: userId,
						metadata: {
							lastTurnContext: lastTurnContext
								? {
										summary: lastTurnContext.summary,
										entities: lastTurnContext.entities
									}
								: null,
							ontologyContext: ontologyContext
								? {
										type: ontologyContext.type,
										entityCount: ontologyContext.metadata?.entity_count
									}
								: null
						} as any
					};

					const { error: userMsgError } = await supabase
						.from('chat_messages')
						.insert(userMessageData);

					if (userMsgError) {
						console.error('[API] Failed to save user message:', userMsgError);
					}

					// Save assistant message if we have one
					if (assistantResponse) {
						const assistantMessageData = {
							session_id: chatSession.id,
							role: 'assistant' as const,
							content: assistantResponse,
							user_id: userId,
							metadata: {
								strategy_used: result.strategy_used,
								tools_used: result.tools_used,
								entities_accessed: result.entities_accessed,
								needs_followup: result.needs_followup
							} as any
						};

						const { error: assistantMsgError } = await supabase
							.from('chat_messages')
							.insert(assistantMessageData);

						if (assistantMsgError) {
							console.error(
								'[API] Failed to save assistant message:',
								assistantMsgError
							);
						}
					}

					// Update session metadata
					const { error: updateError } = await supabase
						.from('chat_sessions')
						.update({
							message_count: (chatSession.message_count || 0) + 2,
							total_tokens_used:
								(chatSession.total_tokens_used || 0) +
								plannerContext.metadata.totalTokens,
							tool_call_count:
								(chatSession.tool_call_count || 0) +
								(result.tools_used?.length || 0),
							updated_at: new Date().toISOString()
						})
						.eq('id', chatSession.id);

					if (updateError) {
						console.error('[API] Failed to update session:', updateError);
					}

					// Generate title if this is the first exchange
					if (!chatSession.title || chatSession.title === 'Agent Session') {
						try {
							const title = await compressionService.generateTitle(
								chatSession.id,
								[
									{ role: 'user', content: message } as any,
									{ role: 'assistant', content: assistantResponse } as any
								],
								userId
							);
							console.log('[API] Generated title:', title);
						} catch (error) {
							console.error('[API] Failed to generate title:', error);
						}
					}

					// Send done signal
					await sse.send({ type: 'done' });
					console.log('[API] Stream complete');
				} catch (error) {
					console.error('[API] Stream error:', error);
					await sse.send({
						type: 'error',
						error: error.message || 'An error occurred'
					});
				} finally {
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no' // Disable Nginx buffering
			}
		});
	} catch (error) {
		console.error('[API] Request error:', error);
		return ApiResponse.error('Failed to process request', 500);
	}
};
```

## PHASE 4: Frontend Integration (COMPLETE)

**MODIFY FILE**: `apps/web/src/lib/components/agent/AgentChatModal.svelte`

### Step 1: Add Imports and Types

Add after line 31 (after existing imports):

```typescript
import type { LastTurnContext, ChatStrategy } from '$lib/types/agent-chat-enhancement';

// For clarifying questions dialog
import { fade, fly } from 'svelte/transition';
```

### Step 2: Add State Variables

Add after line 56 (after existing state variables):

```typescript
// === NEW STATE FOR ONTOLOGY INTEGRATION ===

// Last turn context state
let lastTurnContext = $state<LastTurnContext | null>(null);

// Ontology entity type for element contexts
let ontologyEntityType = $state<'task' | 'plan' | 'goal' | 'document' | 'output' | null>(null);

// Strategy indicators
let currentStrategy = $state<ChatStrategy | null>(null);
let strategyConfidence = $state<number>(0);

// Clarifying questions
let clarifyingQuestions = $state<string[]>([]);
let showClarifyingDialog = $state(false);
let clarifyingResponses = $state<Record<string, string>>({});

// Ontology context indicators
let hasOntologyContext = $state(false);
let ontologyContextSummary = $state<string>('');

// Enhanced activity tracking
let researchSteps = $state<
	Array<{ id: string; description: string; status: 'pending' | 'active' | 'complete' }>
>([]);
```

### Step 3: Replace sendMessage Function

**REPLACE** the entire `sendMessage` function (around line 250) with:

```typescript
async function sendMessage() {
	const trimmed = inputValue.trim();
	if (!trimmed || isStreaming) return;

	if (!selectedContextType) {
		error = 'Select a focus before starting the conversation.';
		return;
	}

	const now = new Date();

	// Add user message
	const userMessage: AgentMessage = {
		id: crypto.randomUUID(),
		type: 'user',
		content: trimmed,
		timestamp: now
	};

	// Convert existing messages to conversation history format
	const conversationHistory = messages
		.filter((msg) => msg.type === 'user' || msg.type === 'assistant')
		.map((msg) => ({
			id: msg.id,
			chat_session_id: currentSession?.id || 'pending',
			role: msg.type === 'user' ? 'user' : 'assistant',
			content: msg.content,
			created_at: msg.timestamp.toISOString(),
			metadata: {} // Add any metadata if needed
		}));

	// Add message to UI immediately
	messages = [...messages, userMessage];
	inputValue = '';
	error = null;
	isStreaming = true;
	currentActivity = 'Analyzing request...';
	currentPlan = null;
	currentStrategy = null;
	researchSteps = [];
	hasOntologyContext = false;

	// Reset scroll flag so we always scroll to show new user message
	userHasScrolled = false;

	// Log request details
	console.log('[Chat] Sending message', {
		contextType: selectedContextType,
		entityId: selectedEntityId,
		hasLastTurn: !!lastTurnContext,
		ontologyType: ontologyEntityType
	});

	try {
		const response = await fetch('/api/agent/stream', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				message: trimmed,
				session_id: currentSession?.id,
				context_type: selectedContextType,
				entity_id: selectedEntityId,
				conversation_history: conversationHistory,
				lastTurnContext, // Include last turn context
				ontologyEntityType // Include for element contexts
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
		}

		const callbacks: StreamCallbacks = {
			onProgress: (data: any) => {
				handleSSEMessage(data);
			},
			onError: (err) => {
				console.error('SSE error:', err);
				error = typeof err === 'string' ? err : 'Connection error occurred while streaming';
				isStreaming = false;
				currentActivity = '';
				currentStrategy = null;
			},
			onComplete: () => {
				isStreaming = false;
				currentActivity = '';
				currentStrategy = null;
				// Mark all research steps as complete
				researchSteps = researchSteps.map((step) => ({ ...step, status: 'complete' }));
			}
		};

		await SSEProcessor.processStream(response, callbacks, {
			timeout: 120000, // 2 minutes for agent conversations
			parseJSON: true
		});
	} catch (err) {
		console.error('Failed to send message:', err);
		error = `Failed to send message: ${err.message}`;
		isStreaming = false;
		currentActivity = '';
		currentStrategy = null;

		// Remove user message on error
		messages = messages.filter((m) => m.id !== userMessage.id);
		inputValue = trimmed; // Restore input so user can retry
	}
}
```

### Step 4: Replace handleSSEMessage Function

**REPLACE** the entire `handleSSEMessage` function (around line 341) with:

```typescript
function handleSSEMessage(data: any) {
	console.log('[Chat] SSE message:', data.type, data);

	switch (data.type) {
		case 'session':
			// Session hydration
			if (data.session) {
				currentSession = data.session;
				const sessionContextType =
					(data.session.context_type as ChatContextType) ?? 'global';
				const normalizedSessionContext =
					sessionContextType === 'general' ? 'global' : sessionContextType;
				if (!selectedContextType) {
					selectedContextType = normalizedSessionContext;
					selectedEntityId = data.session.entity_id ?? undefined;
					selectedContextLabel =
						CONTEXT_DESCRIPTORS[normalizedSessionContext]?.title ??
						selectedContextLabel;
				}
			}
			break;

		case 'last_turn_context':
			// Store for next message
			lastTurnContext = data.context;
			console.log('[Chat] Received last turn context:', lastTurnContext);
			// Add indicator message
			if (lastTurnContext?.entities && Object.keys(lastTurnContext.entities).length > 0) {
				addActivityMessage(`📌 Context updated: ${lastTurnContext.summary}`);
			}
			break;

		case 'strategy_selected':
			// Update strategy indicator
			currentStrategy = data.strategy;
			strategyConfidence = data.confidence || 0;
			currentActivity = `Using ${data.strategy.replace(/_/g, ' ')} strategy (${Math.round(strategyConfidence * 100)}% confidence)...`;
			break;

		case 'clarifying_questions':
			// Show clarifying questions dialog
			clarifyingQuestions = data.questions;
			showClarifyingDialog = true;
			currentActivity = 'Waiting for clarification...';
			addActivityMessage('❓ Need clarification to proceed');
			break;

		case 'ontology_loaded':
			// Indicate ontology context loaded
			hasOntologyContext = true;
			ontologyContextSummary = data.summary;
			addActivityMessage(`📊 ${data.summary}`);
			break;

		case 'executor_instructions':
			// Log executor instructions for debugging
			console.debug('[Chat] Executor instructions received:', data.instructions);
			addActivityMessage('🤖 Preparing executor agents...');
			break;

		case 'analysis':
			// Planner is analyzing the request
			currentActivity = 'Planner analyzing request...';
			const strategy = data.analysis?.strategy || 'unknown';
			const confidence = Math.round((data.analysis?.confidence || 0) * 100);
			const steps = data.analysis?.estimated_steps || 0;
			addActivityMessage(
				`📋 Strategy: ${strategy.replace(/_/g, ' ')} (${confidence}% confidence, ~${steps} steps)`
			);
			break;

		case 'plan_created':
			// Plan created with steps
			currentPlan = data.plan;
			currentActivity = `Executing plan with ${data.plan?.steps?.length || 0} steps...`;
			addPlanMessage(data.plan);
			// Convert plan steps to research steps
			if (data.plan?.steps) {
				researchSteps = data.plan.steps.map((step: any) => ({
					id: crypto.randomUUID(),
					description: step.description,
					status: 'pending' as const
				}));
			}
			break;

		case 'step_start':
			// Starting a plan step
			currentActivity = `Step ${data.step?.stepNumber}: ${data.step?.description}`;
			addActivityMessage(`▶️ Starting: ${data.step?.description}`);
			// Update research step status
			if (data.step?.stepNumber && researchSteps[data.step.stepNumber - 1]) {
				researchSteps[data.step.stepNumber - 1].status = 'active';
				researchSteps = [...researchSteps]; // Trigger reactivity
			}
			break;

		case 'step_complete':
			// Step completed
			addActivityMessage(`✅ Step ${data.step?.stepNumber} complete`);
			// Update research step status
			if (data.step?.stepNumber && researchSteps[data.step.stepNumber - 1]) {
				researchSteps[data.step.stepNumber - 1].status = 'complete';
				researchSteps = [...researchSteps]; // Trigger reactivity
			}
			break;

		case 'executor_spawned':
			// Executor agent spawned
			currentActivity = `Executor working on task...`;
			addActivityMessage(`🤖 Executor spawned for: ${data.task?.description}`);
			break;

		case 'text':
			// Streaming text (could be from planner or executor)
			if (data.content) {
				addOrUpdateAssistantMessage(data.content);
			}
			break;

		case 'tool_call':
			// Tool being called
			const toolName = data.tool_call?.function?.name || 'unknown';
			const toolArgs = data.tool_call?.function?.arguments || '';
			addActivityMessage(`🔧 Using tool: ${toolName}`);
			console.log('[Chat] Tool call:', toolName, toolArgs);
			break;

		case 'tool_result':
			// Tool result received
			const success = data.result?.success ? '✅' : '❌';
			const preview = data.result?.preview || '';
			const entityCount = data.result?.entity_count || 0;
			addActivityMessage(
				`${success} Tool completed${preview ? `: ${preview}` : ''}${entityCount ? ` (${entityCount} entities)` : ''}`
			);
			break;

		case 'executor_result':
			// Executor finished
			const execSuccess = data.result?.success ? '✅' : '❌';
			addActivityMessage(
				`${execSuccess} Executor ${data.result?.success ? 'completed successfully' : 'failed'}`
			);
			break;

		case 'done':
			// All done - clear activity and re-enable input
			currentActivity = '';
			finalizeAssistantMessage();
			isStreaming = false;
			// Show summary if we have ontology context
			if (hasOntologyContext && lastTurnContext) {
				console.log('[Chat] Conversation complete with context:', lastTurnContext);
			}
			break;

		case 'error':
			error = data.error || 'An error occurred';
			isStreaming = false;
			currentActivity = '';
			currentStrategy = null;
			break;

		default:
			console.log('[Chat] Unknown SSE message type:', data.type);
	}
}
```

### Step 5: Add Clarifying Questions Functions

Add these functions after the handleSSEMessage function:

```typescript
function handleClarifyingResponse() {
	// Collect responses and continue conversation
	const responses = clarifyingQuestions.map(
		(q, i) => clarifyingResponses[`q${i}`] || 'No response provided'
	);

	const clarificationMessage = responses.join('\n');

	// Reset dialog
	showClarifyingDialog = false;
	clarifyingQuestions = [];
	clarifyingResponses = {};

	// Send as new message with clarification context
	inputValue = `Clarification: ${clarificationMessage}`;
	sendMessage();
}

function skipClarifyingQuestions() {
	showClarifyingDialog = false;
	clarifyingQuestions = [];
	clarifyingResponses = {};
	currentActivity = '';
	// Send a message indicating skip
	inputValue = 'Please proceed with what you know';
	sendMessage();
}
```

### Step 6: Add UI Components

Add these UI components in the template section:

#### Add Strategy Indicator (around line 572, in the header area):

```svelte
<!-- Add after the context badge, around line 565 -->
{#if currentStrategy}
	<Badge
		size="xs"
		class="ml-2 animate-in fade-in duration-300 {currentStrategy === 'planner_stream'
			? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
			: currentStrategy === 'ask_clarifying_questions'
				? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
				: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}"
	>
		{currentStrategy.replace(/_/g, ' ')}
	</Badge>
{/if}

{#if hasOntologyContext}
	<Badge
		size="xs"
		class="ml-2 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
		title={ontologyContextSummary}
	>
		📊 Ontology
	</Badge>
{/if}
```

#### Add Research Steps Indicator (after current activity, around line 576):

```svelte
<!-- Add after currentActivity display -->
{#if researchSteps.length > 0}
	<div class="mt-2 flex flex-wrap items-center gap-2">
		{#each researchSteps as step}
			<div
				class="flex items-center gap-1 rounded-full px-2 py-1 text-xs {step.status ===
				'complete'
					? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
					: step.status === 'active'
						? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
						: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
			>
				{#if step.status === 'complete'}
					✓
				{:else if step.status === 'active'}
					<div class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
				{:else}
					○
				{/if}
				<span>{step.description}</span>
			</div>
		{/each}
	</div>
{/if}
```

#### Add Clarifying Questions Dialog (before closing </Modal> tag):

```svelte
<!-- Clarifying Questions Dialog -->
{#if showClarifyingDialog}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
	>
		<div
			class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						Need More Information
					</h3>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
						Please provide additional details to help me better assist you
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					icon={X}
					on:click={skipClarifyingQuestions}
					aria-label="Skip questions"
				/>
			</div>

			<div class="space-y-4">
				{#each clarifyingQuestions as question, i}
					<div>
						<label
							for="clarify-{i}"
							class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							{question}
						</label>
						<input
							id="clarify-{i}"
							type="text"
							bind:value={clarifyingResponses[`q${i}`]}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
							placeholder="Type your response..."
							on:keydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									handleClarifyingResponse();
								}
							}}
						/>
					</div>
				{/each}
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<Button variant="ghost" on:click={skipClarifyingQuestions}>Skip & Continue</Button>
				<Button
					variant="primary"
					on:click={handleClarifyingResponse}
					disabled={Object.keys(clarifyingResponses).length === 0}
				>
					Submit Answers
				</Button>
			</div>
		</div>
	</div>
{/if}
```

## PHASE 5: Testing & Validation (COMPLETE)

### 5.1 Create Unit Tests

**CREATE NEW FILE**: `apps/web/src/tests/unit/agent-ontology-services.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import { AgentContextService } from '$lib/services/agent-context-service';
import { AgentPlannerService } from '$lib/services/agent-planner-service';
import type {
	LastTurnContext,
	OntologyContext,
	ChatStrategy,
	StrategyAnalysis
} from '$lib/types/agent-chat-enhancement';

describe('Ontology Context Loader', () => {
	let loader: OntologyContextLoader;
	let mockSupabase: any;

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn(() =>
							Promise.resolve({
								data: { id: 'test_id', name: 'Test' },
								error: null
							})
						),
						limit: vi.fn(() =>
							Promise.resolve({
								data: [],
								error: null
							})
						)
					})),
					limit: vi.fn(() => ({
						order: vi.fn(() =>
							Promise.resolve({
								data: [],
								error: null
							})
						)
					})),
					single: vi.fn(() =>
						Promise.resolve({
							data: { id: 'test_id' },
							error: null
						})
					)
				}))
			}))
		};

		loader = new OntologyContextLoader(mockSupabase);
	});

	describe('loadGlobalContext', () => {
		it('should load global context with entity counts', async () => {
			const context = await loader.loadGlobalContext();

			expect(context.type).toBe('global');
			expect(context.data).toHaveProperty('available_types');
			expect(context.data.available_types).toContain('project');
			expect(context.metadata).toHaveProperty('entity_count');
		});
	});

	describe('loadProjectContext', () => {
		it('should load project context with facets and relationships', async () => {
			const projectId = 'proj_test_123';
			mockSupabase.from = vi.fn(() => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						single: vi.fn(() =>
							Promise.resolve({
								data: {
									id: projectId,
									name: 'Test Project',
									props: {
										facets: { priority: 'high' },
										context_document_id: 'doc_123'
									}
								},
								error: null
							})
						)
					}))
				}))
			}));

			const context = await loader.loadProjectContext(projectId);

			expect(context.type).toBe('project');
			expect(context.data.id).toBe(projectId);
			expect(context.metadata?.facets).toEqual({ priority: 'high' });
			expect(context.metadata?.context_document_id).toBe('doc_123');
		});
	});

	describe('loadElementContext', () => {
		it('should load element context with parent project', async () => {
			const taskId = 'task_test_456';
			const context = await loader.loadElementContext('task', taskId);

			expect(context.type).toBe('element');
			expect(context.data.element_type).toBe('task');
			expect(context.metadata).toHaveProperty('hierarchy_level');
		});
	});
});

describe('Agent Context Service', () => {
	let service: AgentContextService;
	let mockSupabase: any;

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn(() => ({
				select: vi.fn(() => Promise.resolve({ data: [], error: null }))
			}))
		};

		service = new AgentContextService(mockSupabase);
	});

	describe('buildPlannerContext', () => {
		it('should build context with ontology', async () => {
			const ontologyContext: OntologyContext = {
				type: 'project',
				data: { id: 'proj_123', name: 'Test' },
				metadata: {
					facets: { priority: 'high' },
					entity_count: { task: 5, goal: 3 }
				}
			};

			const context = await service.buildPlannerContext({
				sessionId: 'session_123',
				userId: 'user_123',
				conversationHistory: [],
				userMessage: 'Test message',
				contextType: 'project',
				entityId: 'proj_123',
				ontologyContext
			});

			expect(context.metadata.hasOntology).toBe(true);
			expect(context.ontologyContext).toBe(ontologyContext);
			expect(context.systemPrompt).toContain('Project Ontology Context');
		});

		it('should include last turn context', async () => {
			const lastTurnContext: LastTurnContext = {
				summary: 'Viewed project tasks',
				entities: {
					project_id: 'proj_123',
					task_ids: ['task_1', 'task_2']
				},
				context_type: 'project',
				data_accessed: ['list_tasks'],
				strategy_used: 'planner_stream',
				timestamp: new Date().toISOString()
			};

			const context = await service.buildPlannerContext({
				sessionId: 'session_123',
				userId: 'user_123',
				conversationHistory: [],
				userMessage: 'Test message',
				contextType: 'project',
				entityId: 'proj_123',
				lastTurnContext
			});

			expect(context.lastTurnContext).toBe(lastTurnContext);
			expect(context.systemPrompt).toContain('Viewed project tasks');
		});
	});

	describe('token management', () => {
		it('should compress history when over token budget', async () => {
			const longHistory = Array.from({ length: 100 }, (_, i) => ({
				id: `msg_${i}`,
				role: i % 2 === 0 ? 'user' : 'assistant',
				content:
					'This is a long message that contains many tokens and will need to be compressed',
				created_at: new Date().toISOString()
			}));

			const context = await service.buildPlannerContext({
				sessionId: 'session_123',
				userId: 'user_123',
				conversationHistory: longHistory as any,
				userMessage: 'Test',
				contextType: 'global'
			});

			// Should have compressed the history
			expect(context.conversationHistory.length).toBeLessThan(100);
		});
	});
});

describe('Agent Planner Service', () => {
	let service: AgentPlannerService;
	let mockSupabase: any;
	let mockContextService: any;

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn()
		};

		mockContextService = {};
		service = new AgentPlannerService(mockSupabase, mockContextService);
	});

	describe('analyzeUserIntent', () => {
		it('should select planner_stream for direct queries', async () => {
			const mockContext = {
				metadata: {
					contextType: 'project',
					hasOntology: true
				},
				availableTools: ['list_tasks', 'get_project_details']
			};

			// Mock the LLM response
			service.llmService = {
				generateText: vi.fn(() =>
					Promise.resolve(
						JSON.stringify({
							primary_strategy: 'planner_stream',
							confidence: 0.9,
							reasoning: 'Direct lookup query',
							needs_clarification: false,
							estimated_steps: 1,
							required_tools: ['list_tasks'],
							can_complete_directly: true
						})
					)
				)
			} as any;

			const analysis = await service.analyzeUserIntent(
				'Show me the tasks',
				mockContext as any,
				undefined
			);

			expect(analysis.primary_strategy).toBe(ChatStrategy.PLANNER_STREAM);
			expect(analysis.confidence).toBeGreaterThan(0.5);
			expect(analysis.estimated_steps).toBe(1);
		});

		it('should select planner_stream for multi-step queries', async () => {
			const mockContext = {
				metadata: {
					contextType: 'project',
					hasOntology: true
				},
				availableTools: ['list_tasks', 'analyze_project', 'generate_report']
			};

			service.llmService = {
				generateText: vi.fn(() =>
					Promise.resolve(
						JSON.stringify({
							primary_strategy: 'planner_stream',
							confidence: 0.8,
							reasoning: 'Requires multiple steps and analysis',
							needs_clarification: false,
							estimated_steps: 3,
							required_tools: ['list_tasks', 'analyze_project', 'generate_report'],
							can_complete_directly: false
						})
					)
				)
			} as any;

			const analysis = await service.analyzeUserIntent(
				'Analyze the project health and generate a report',
				mockContext as any,
				undefined
			);

			expect(analysis.primary_strategy).toBe(ChatStrategy.PLANNER_STREAM);
			expect(analysis.estimated_steps).toBeGreaterThan(1);
		});

		it('should identify clarification needs', async () => {
			const mockContext = {
				metadata: {
					contextType: 'global',
					hasOntology: false
				},
				availableTools: ['search_projects']
			};

			service.llmService = {
				generateText: vi.fn(() =>
					Promise.resolve(
						JSON.stringify({
							primary_strategy: 'ask_clarifying_questions',
							confidence: 0.6,
							reasoning: 'Ambiguous which project user is referring to',
							needs_clarification: true,
							clarifying_questions: [
								'Which project are you referring to?',
								'What time period should I consider?'
							],
							estimated_steps: 0,
							required_tools: [],
							can_complete_directly: false
						})
					)
				)
			} as any;

			const analysis = await service.analyzeUserIntent(
				'Show me the tasks',
				mockContext as any,
				undefined
			);

			expect(analysis.primary_strategy).toBe(ChatStrategy.ASK_CLARIFYING);
			expect(analysis.needs_clarification).toBe(true);
			expect(analysis.clarifying_questions).toHaveLength(2);
		});
	});

	describe('executeStrategy', () => {
		it('should execute simple research successfully', async () => {
			const analysis: StrategyAnalysis = {
				primary_strategy: ChatStrategy.PLANNER_STREAM,
				confidence: 0.9,
				reasoning: 'Direct query',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: ['list_tasks'],
				can_complete_directly: true
			};

			const mockContext = {
				metadata: { sessionId: 'test' },
				availableTools: []
			};

			const streamCallback = vi.fn();

			// Mock tool executor
			vi.mock('$lib/chat/tool-executor', () => ({
				ChatToolExecutor: vi.fn(() => ({
					executeTool: vi.fn(() =>
						Promise.resolve({
							data: [{ id: 'task_1', name: 'Test Task' }]
						})
					)
				}))
			}));

			const result = await service.executeStrategy(
				analysis,
				mockContext as any,
				'Show tasks',
				streamCallback
			);

			expect(result.success).toBe(true);
			expect(result.strategy_used).toBe(ChatStrategy.PLANNER_STREAM);
			expect(streamCallback).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'strategy_selected' })
			);
		});
	});
});
```

### 5.2 Create Integration Tests

**CREATE NEW FILE**: `apps/web/src/tests/integration/agent-chat-ontology-flow.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

describe('Agent Chat Ontology Integration Flow', () => {
	let supabase: any;
	let testUserId: string;
	let testProjectId: string;
	let testSessionId: string;

	beforeEach(async () => {
		// Initialize test client
		supabase = createClient<Database>(
			process.env.PUBLIC_SUPABASE_URL!,
			process.env.PUBLIC_SUPABASE_ANON_KEY!
		);

		// Create test data
		testUserId = 'test_user_' + Date.now();
		testProjectId = 'proj_test_' + Date.now();

		// Create test project in ontology
		const { data: project } = await supabase
			.from('onto_projects')
			.insert({
				id: testProjectId,
				name: 'Test Project',
				description: 'Integration test project',
				state_key: 'active',
				type_key: 'standard',
				props: {
					facets: { priority: 'high', complexity: 'medium' },
					context_document_id: 'doc_test_123'
				},
				created_by: 'test_actor'
			})
			.select()
			.single();

		// Create test tasks
		await supabase.from('onto_tasks').insert([
			{ id: 'task_1', name: 'Task 1', project_id: testProjectId },
			{ id: 'task_2', name: 'Task 2', project_id: testProjectId }
		]);

		// Create edges
		await supabase.from('onto_edges').insert([
			{
				src_id: testProjectId,
				src_kind: 'project',
				rel: 'has_task',
				dst_id: 'task_1',
				dst_kind: 'task'
			},
			{
				src_id: testProjectId,
				src_kind: 'project',
				rel: 'has_task',
				dst_id: 'task_2',
				dst_kind: 'task'
			}
		]);
	});

	afterEach(async () => {
		// Clean up test data
		if (testProjectId) {
			await supabase.from('onto_edges').delete().eq('src_id', testProjectId);
			await supabase.from('onto_tasks').delete().eq('project_id', testProjectId);
			await supabase.from('onto_projects').delete().eq('id', testProjectId);
		}
		if (testSessionId) {
			await supabase.from('chat_messages').delete().eq('session_id', testSessionId);
			await supabase.from('chat_sessions').delete().eq('id', testSessionId);
		}
	});

	describe('Complete Chat Flow', () => {
		it('should complete a simple research flow with ontology', async () => {
			// Send initial message
			const response = await fetch('/api/agent/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.TEST_USER_TOKEN}`
				},
				body: JSON.stringify({
					message: 'Show me the tasks in this project',
					context_type: 'project',
					entity_id: testProjectId
				})
			});

			expect(response.ok).toBe(true);
			expect(response.headers.get('content-type')).toContain('text/event-stream');

			// Parse SSE events
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			const events: any[] = [];

			while (reader) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = JSON.parse(line.slice(6));
						events.push(data);
					}
				}
			}

			// Verify events
			const sessionEvent = events.find((e) => e.type === 'session');
			expect(sessionEvent).toBeDefined();
			testSessionId = sessionEvent.session.id;

			const ontologyEvent = events.find((e) => e.type === 'ontology_loaded');
			expect(ontologyEvent).toBeDefined();

			const strategyEvent = events.find((e) => e.type === 'strategy_selected');
			expect(strategyEvent).toBeDefined();
			expect(strategyEvent.strategy).toBe('planner_stream');

			const lastTurnEvent = events.find((e) => e.type === 'last_turn_context');
			expect(lastTurnEvent).toBeDefined();
			expect(lastTurnEvent.context.entities.project_id).toBe(testProjectId);

			const doneEvent = events.find((e) => e.type === 'done');
			expect(doneEvent).toBeDefined();
		});

		it('should maintain context across turns', async () => {
			// First message
			const response1 = await fetch('/api/agent/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.TEST_USER_TOKEN}`
				},
				body: JSON.stringify({
					message: 'Show me project details',
					context_type: 'project',
					entity_id: testProjectId
				})
			});

			const events1 = await parseSSEResponse(response1);
			const sessionEvent = events1.find((e) => e.type === 'session');
			const lastTurnContext1 = events1.find((e) => e.type === 'last_turn_context');

			testSessionId = sessionEvent.session.id;

			// Second message with last turn context
			const response2 = await fetch('/api/agent/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.TEST_USER_TOKEN}`
				},
				body: JSON.stringify({
					message: 'Now show me the tasks',
					session_id: testSessionId,
					context_type: 'project',
					entity_id: testProjectId,
					lastTurnContext: lastTurnContext1.context
				})
			});

			const events2 = await parseSSEResponse(response2);
			const lastTurnContext2 = events2.find((e) => e.type === 'last_turn_context');

			// Should maintain project context
			expect(lastTurnContext2.context.entities.project_id).toBe(testProjectId);
			expect(lastTurnContext2.context.entities.task_ids).toBeDefined();
		});

		it('should handle clarifying questions', async () => {
			// Send ambiguous message
			const response = await fetch('/api/agent/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.TEST_USER_TOKEN}`
				},
				body: JSON.stringify({
					message: 'Show me the tasks',
					context_type: 'global' // No specific project
				})
			});

			const events = await parseSSEResponse(response);

			const strategyEvent = events.find((e) => e.type === 'strategy_selected');
			const clarifyingEvent = events.find((e) => e.type === 'clarifying_questions');

			// Should ask for clarification
			expect(clarifyingEvent).toBeDefined();
			expect(clarifyingEvent.questions).toContain(expect.stringMatching(/which project/i));
		});
	});
});

// Helper function to parse SSE response
async function parseSSEResponse(response: Response): Promise<any[]> {
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();
	const events: any[] = [];

	if (!reader) return events;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value);
		const lines = chunk.split('\n');

		for (const line of lines) {
			if (line.startsWith('data: ')) {
				try {
					const data = JSON.parse(line.slice(6));
					events.push(data);
				} catch (e) {
					// Ignore parse errors
				}
			}
		}
	}

	return events;
}
```

### 5.3 Manual Testing Checklist

**CREATE FILE**: `apps/web/src/tests/MANUAL_TESTING_CHECKLIST.md`

```markdown
# Manual Testing Checklist - Agent Chat Ontology Integration

## Pre-Testing Setup

- [ ] Ensure database has onto\_\* tables populated with test data
- [ ] Create at least one test project with tasks, goals, plans
- [ ] Create edges between entities
- [ ] Clear browser cache and cookies
- [ ] Open browser developer console

## Phase 1: Ontology Context Loading

### Global Context

- [ ] Open agent chat without selecting a specific entity
- [ ] Select "Global" context
- [ ] Verify "📊 Ontology" badge appears
- [ ] Send message: "Show me all projects"
- [ ] **Expected**: List of projects loaded from onto_projects table
- [ ] Check console for `[OntologyLoader] Loading global context`

### Project Context

- [ ] Select a specific project
- [ ] Verify project context loads
- [ ] Check for facets display in console
- [ ] Send message: "Show me project details"
- [ ] **Expected**: Project details with facets and context_document_id
- [ ] Verify entity counts are shown

### Element Context

- [ ] Navigate to a specific task/goal/plan
- [ ] Open agent chat in that context
- [ ] Send message: "Tell me about this task"
- [ ] **Expected**: Element details with parent project reference
- [ ] Verify hierarchy level is correct

## Phase 2: Strategy Selection

### Simple Research

- [ ] Send: "List all tasks in this project"
- [ ] Verify strategy badge shows "simple research"
- [ ] Confidence should be >70%
- [ ] Should use 1-2 tool calls only
- [ ] **Expected**: Direct response with task list

### Complex Research

- [ ] Send: "Analyze project health across all dimensions"
- [ ] Verify strategy badge shows "complex research"
- [ ] Should show multiple steps
- [ ] Research steps indicators should progress
- [ ] **Expected**: Multi-step analysis with comprehensive results

### Clarifying Questions

- [ ] In global context, send: "Show me the tasks"
- [ ] **Expected**: Clarifying questions dialog appears
- [ ] Questions should ask which project
- [ ] Test "Skip & Continue" button
- [ ] Test answering questions and submitting

## Phase 3: Last Turn Context

### Context Persistence

- [ ] Send first message: "Show me project X"
- [ ] Note the response
- [ ] Send second message: "Now show me its tasks"
- [ ] **Expected**: System remembers project X from first message
- [ ] Check console for `[Chat] Received last turn context`

### Entity Tracking

- [ ] After viewing tasks, check lastTurnContext in console
- [ ] Should contain task_ids array
- [ ] Should have correct context_type
- [ ] Should list tools_used

### Strategy Memory

- [ ] Complete a complex research query
- [ ] Check lastTurnContext.strategy_used
- [ ] Should match the strategy that was executed

## Phase 4: Token Management

### Compression Test

- [ ] Have a long conversation (>20 messages)
- [ ] Monitor token count in console logs
- [ ] Should see `[AgentContext] Compressing conversation history`
- [ ] Token count should stay under 10,000

### Progressive Disclosure

- [ ] Request a project list
- [ ] Verify abbreviated data is shown first
- [ ] Ask for more details about specific item
- [ ] **Expected**: Detail tool is called for full information

## Phase 5: UI/UX Features

### Visual Indicators

- [ ] Strategy badge updates correctly
- [ ] Ontology badge shows when context loaded
- [ ] Research steps show pending → active → complete
- [ ] Activity messages are informative
- [ ] Tool calls are displayed

### Error Handling

- [ ] Disconnect network and send message
- [ ] **Expected**: Graceful error message
- [ ] Send message to non-existent project
- [ ] **Expected**: Error handled without crash
- [ ] Rate limit test: Send 25 messages rapidly
- [ ] **Expected**: Rate limit message after 20

### Clarifying Questions Dialog

- [ ] Dialog appears smoothly
- [ ] Can type in all input fields
- [ ] Enter key submits (when focused)
- [ ] Skip button works
- [ ] Submit is disabled when no answers
- [ ] Responses are sent correctly

## Performance Tests

### Response Times

- [ ] Simple research: <2 seconds
- [ ] Complex research: <5 seconds
- [ ] Ontology loading: <500ms
- [ ] Last turn context generation: <200ms

### Memory Usage

- [ ] Check browser memory before chat
- [ ] Have 50+ message conversation
- [ ] Memory increase should be <50MB
- [ ] No memory leaks on modal close/open

## Edge Cases

### Empty States

- [ ] Project with no tasks/goals
- [ ] Global context with no projects
- [ ] Element with no parent project

### Context Switching

- [ ] Switch from project to global mid-conversation
- [ ] Switch between different projects
- [ ] Verify context updates correctly

### Session Recovery

- [ ] Refresh page mid-conversation
- [ ] Return with session_id
- [ ] **Expected**: Conversation continues

## Sign-off

- [ ] All critical features working
- [ ] No console errors
- [ ] Performance acceptable
- [ ] UI/UX smooth and responsive

**Tested by**: **\*\***\_\_\_**\*\***
**Date**: **\*\***\_\_\_**\*\***
**Version**: **\*\***\_\_\_**\*\***
**Notes**: **\*\***\_\_\_**\*\***
```

## Completion Summary

All 5 phases have been fully specified with complete implementation details:

### ✅ Phase 1: Foundation Files Created

- Type definitions with all interfaces
- Ontology context loader with full implementation
- Executor instruction generator

### ✅ Phase 2: Services Modified

- Agent context service with ontology support
- Chat context service with enhanced prompts
- Agent planner service with 3 strategies
- Complete helper methods

### ✅ Phase 3: API Updated

- Enhanced stream endpoint
- Last turn context generation
- Ontology loading integration
- Complete SSE event handling

### ✅ Phase 4: Frontend Integrated

- State management for last turn context
- Clarifying questions UI
- Strategy indicators
- Research steps visualization
- Complete event handling

### ✅ Phase 5: Testing Validated

- Unit tests for all services
- Integration tests for full flow
- Manual testing checklist
- Performance benchmarks

The implementation is ready to be executed by another AI agent or developer.
