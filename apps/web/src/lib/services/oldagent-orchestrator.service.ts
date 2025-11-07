// apps/web/src/lib/services/oldagent-orchestrator.service.ts
/**
 * AgentOrchestrator - Main orchestrator for the conversational project agent
 * Handles conversation flow, dimension detection, and operation generation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AgentSSEMessage,
	AgentMetadata,
	AgentSessionPhase,
	ProjectDraft,
	ChatOperation,
	AgentChatType,
	Database,
	SystemPromptMetadata
} from '@buildos/shared-types';
import {
	DIMENSION_QUESTIONS,
	DEFAULT_AGENT_CONFIG,
	AGENT_LLM_PROFILES
} from '@buildos/shared-types';
import type {
	ParsedOperation,
	TableName,
	OperationType,
	PreparatoryAnalysisResult
} from '$lib/types/brain-dump';

import { BrainDumpProcessor } from '$lib/utils/braindump-processor';
import { OperationsExecutor } from '$lib/utils/operations/operations-executor';
import { ChatContextService } from '$lib/services/chat-context-service';
import { DraftService } from '$lib/services/draft.service';
import { SmartLLMService } from './smart-llm-service';
import { PromptTemplateService } from './promptTemplate.service';

// Helper to generate IDs
const generateId = () => crypto.randomUUID();

export class AgentOrchestrator {
	private supabase: SupabaseClient<Database>;
	private llmService: SmartLLMService;
	private contextService: ChatContextService;
	private operationsExecutor: OperationsExecutor;
	private brainDumpProcessor: BrainDumpProcessor;
	private draftService: DraftService;
	private promptTemplateService: PromptTemplateService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.llmService = new SmartLLMService({ supabase });
		this.contextService = new ChatContextService(supabase);
		this.operationsExecutor = new OperationsExecutor(supabase);
		this.brainDumpProcessor = new BrainDumpProcessor(supabase);
		this.draftService = new DraftService(supabase);
		this.promptTemplateService = new PromptTemplateService(supabase);
	}

	/**
	 * Main entry point - processes a message and yields SSE events
	 */
	async *processMessage(
		sessionId: string,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		const session = await this.loadSession(sessionId);
		const autoAccept = session.auto_accept_operations ?? false; // Default to false per requirements

		// Use context_type as primary routing mechanism (maps to system prompts)
		const chatType = (session.context_type || session.chat_type) as AgentChatType;

		switch (chatType) {
			case 'project_create':
				yield* this.handleProjectCreate(session, userMessage, userId, autoAccept);
				break;
			case 'project':
				yield* this.handleProjectUpdate(session, userMessage, userId, autoAccept);
				break;
			case 'project_audit':
				yield* this.handleProjectAudit(session, userMessage, userId);
				break;
			case 'project_forecast':
				yield* this.handleProjectForecast(session, userMessage, userId);
				break;
			case 'task_update':
				yield* this.handleTaskUpdate(session, userMessage, userId, autoAccept);
				break;
			case 'daily_brief_update':
				yield* this.handleDailyBriefUpdate(session, userMessage, userId);
				break;
			case 'general':
			default:
				yield* this.handleGeneral(session, userMessage, userId);
		}
	}

	/**
	 * Handle project creation mode
	 */
	private async *handleProjectCreate(
		session: any,
		userMessage: string,
		userId: string,
		autoAccept: boolean
	): AsyncGenerator<AgentSSEMessage> {
		// Get or create draft (one per session)
		let draft = await this.draftService.getOrCreateDraft(session.id, userId);

		const metadata = (session.agent_metadata as AgentMetadata) || {};
		const phase = metadata?.session_phase || 'gathering_info';

		if (phase === 'gathering_info') {
			// Fetch user info for metadata
			const userInfo = await this.getUserInfo(userId);

			// Build metadata for system prompt
			const promptMetadata: SystemPromptMetadata = {
				userName: userInfo.userName,
				dimensionsCovered: draft.dimensions_covered || []
			};

			// Stream acknowledgment using streamText for real-time response
			const stream = this.llmService.streamText({
				messages: [
					{
						role: 'system',
						content: this.contextService.getSystemPrompt(
							'project_create',
							promptMetadata
						)
					},
					{ role: 'user', content: userMessage }
				],
				userId,
				profile: 'speed', // Fast conversational responses
				temperature: 0.8, // Warmer for conversation
				maxTokens: 500
			});

			// Stream the acknowledgment
			for await (const chunk of stream) {
				if (chunk.type === 'text') {
					yield { type: 'text', content: chunk.content };
				}
			}

			// Run dimension detection using existing preparatory analysis
			const dimensions = await this.detectRelevantDimensions(userMessage, draft);

			// Update metadata
			await this.updateSessionMetadata(session.id, {
				...metadata,
				dimensions_detected: dimensions,
				session_phase: 'clarifying',
				draft_project_id: draft.id
			});

			yield {
				type: 'phase_update',
				phase: 'clarifying',
				message: 'I have a few questions to help shape this project...'
			};

			// Ask first question
			const question = this.getNextPrioritizedQuestion(dimensions, draft);
			if (question) {
				yield { type: 'text', content: question };
			}
		} else if (phase === 'clarifying') {
			// Process the user's answer
			const dimension = await this.identifyAnsweredDimension(
				userMessage,
				metadata.dimensions_detected || [],
				draft
			);

			if (dimension) {
				// Extract content for this dimension
				const content = await this.extractDimensionContent(userMessage, dimension);

				// Update draft
				await this.draftService.updateDimension(draft.id, dimension, content);
				await this.draftService.incrementQuestionCount(draft.id);

				yield {
					type: 'dimension_update',
					dimension,
					content
				};
			}

			// Check if we've asked enough questions
			const questionCount = (metadata.questions_asked || 0) + 1;
			const isComplex = this.isComplexProject(draft);
			const maxQuestions = isComplex
				? DEFAULT_AGENT_CONFIG.max_questions_complex
				: DEFAULT_AGENT_CONFIG.max_questions_simple;

			if (questionCount >= maxQuestions || (await this.hasMinimalViability(draft))) {
				yield {
					type: 'text',
					content:
						'I think we have enough to get started! Ready to create your project, or would you like to answer a few more questions?'
				};

				await this.updateSessionMetadata(session.id, {
					...metadata,
					session_phase: 'finalizing',
					questions_asked: questionCount
				});

				yield {
					type: 'phase_update',
					phase: 'finalizing'
				};
			} else {
				// Ask next question
				const nextQuestion = this.getNextPrioritizedQuestion(
					metadata.dimensions_detected || [],
					draft
				);

				if (nextQuestion) {
					await this.updateSessionMetadata(session.id, {
						...metadata,
						questions_asked: questionCount
					});
					yield { type: 'text', content: nextQuestion };
				} else {
					// No more questions to ask
					yield {
						type: 'text',
						content: "I think we're ready! Should I create your project now?"
					};
					await this.updateSessionMetadata(session.id, {
						...metadata,
						session_phase: 'finalizing'
					});
				}
			}
		} else if (phase === 'finalizing') {
			// Check if user confirms creation
			if (this.isUserConfirmation(userMessage)) {
				// Prepare draft for finalization
				await this.draftService.prepareDraftForFinalization(draft.id);

				// Generate operations
				const operations = await this.generateProjectOperations(draft);

				if (autoAccept) {
					// Execute immediately
					yield {
						type: 'text',
						content: 'Creating your project now...'
					};

					const result = await this.operationsExecutor.executeOperations({
						operations,
						userId,
						brainDumpId: session.id // Use session as reference
					});

					// Stream execution results
					for (const op of result.successful) {
						yield {
							type: 'operation',
							operation: this.convertToOperation(op, session.id)
						};
					}

					// Handle failures
					if (result.failed.length > 0) {
						yield {
							type: 'phase_update',
							phase: 'partial_failure',
							message: `${result.successful.length} operations succeeded, ${result.failed.length} failed`
						};

						await this.updateSessionMetadata(session.id, {
							...metadata,
							partial_failure: true,
							failed_operations: result.failed.map((op) => op.id)
						});
					} else {
						// Complete success
						await this.draftService.finalizeDraft(draft.id, userId);
						await this.updateSessionMetadata(session.id, {
							...metadata,
							session_phase: 'completed',
							operations_executed: result.successful.length
						});

						yield {
							type: 'phase_update',
							phase: 'completed'
						};

						yield {
							type: 'text',
							content: '✨ Your project has been created successfully!'
						};
					}
				} else {
					// Queue operations for approval
					const queuedOps = await this.queueOperations(operations, session.id, userId);

					yield {
						type: 'queue_update',
						operations: queuedOps
					};

					yield {
						type: 'text',
						content:
							"I've prepared the project creation steps above. Please review and approve them when you're ready."
					};

					await this.updateSessionMetadata(session.id, {
						...metadata,
						operations_queued: queuedOps.length
					});
				}
			} else {
				// User wants to modify something
				yield {
					type: 'text',
					content: 'No problem! What would you like to adjust or add?'
				};

				// Go back to clarifying phase
				await this.updateSessionMetadata(session.id, {
					...metadata,
					session_phase: 'clarifying'
				});
			}
		}
	}

	/**
	 * Handle project update mode
	 */
	private async *handleProjectUpdate(
		session: any,
		userMessage: string,
		userId: string,
		autoAccept: boolean
	): AsyncGenerator<AgentSSEMessage> {
		const projectId = session.entity_id;
		if (!projectId) {
			yield {
				type: 'error',
				error: 'No project specified for update'
			};
			return;
		}

		// Load project context (abbreviated for token savings)
		const context = await this.contextService.loadLocationContext(
			'project',
			projectId,
			true, // abbreviated
			userId
		);

		// Build metadata for system prompt
		const promptMetadata: SystemPromptMetadata = {
			projectId,
			projectName: context.metadata?.projectName
		};

		// Use LLM to analyze what needs updating
		const systemPrompt = this.contextService.getSystemPrompt('project', promptMetadata);

		// Analyze what the user wants to update
		const updateAnalysis = await this.analyzeUpdateRequest(userMessage, context, systemPrompt);

		// Generate operations for the updates
		const operations = await this.generateUpdateOperations(updateAnalysis, projectId, userId);

		// Show preview
		yield {
			type: 'text',
			content: this.formatUpdatePreview(operations)
		};

		if (autoAccept) {
			// Execute immediately
			for (const op of operations) {
				const result = await this.executeOperation(op, userId, session.id);
				yield {
					type: 'operation',
					operation: result
				};
			}
			yield {
				type: 'text',
				content: "Updates completed! Anything else you'd like to change?"
			};
		} else {
			// Queue for approval
			const queuedOps = await this.queueOperations(operations, session.id, userId);
			yield {
				type: 'queue_update',
				operations: queuedOps
			};
			yield {
				type: 'text',
				content: 'Review the updates above and approve when ready.'
			};
		}
	}

	/**
	 * Handle project audit mode (read-only)
	 */
	private async *handleProjectAudit(
		session: any,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		const projectId = session.entity_id;
		if (!projectId) {
			yield {
				type: 'error',
				error: 'No project specified for audit'
			};
			return;
		}

		yield {
			type: 'text',
			content: 'Analyzing your project across all dimensions...'
		};

		// Load full project context for analysis
		const context = await this.contextService.loadLocationContext(
			'project',
			projectId,
			false, // full context needed
			userId
		);

		// Build metadata for system prompt (default audit harshness: 7/10)
		const promptMetadata: SystemPromptMetadata = {
			projectId,
			projectName: context.metadata?.projectName,
			auditHarshness: 7
		};

		// Get system prompt for audit
		const systemPrompt = this.contextService.getSystemPrompt('project_audit', promptMetadata);

		// Run audit analysis
		const auditResults = await this.runProjectAudit(context, userMessage, systemPrompt);

		// Stream findings
		for (const finding of auditResults.findings) {
			yield {
				type: 'text',
				content: this.formatAuditFinding(finding)
			};
		}

		// Provide recommendations
		yield {
			type: 'text',
			content: this.formatAuditRecommendations(auditResults.recommendations)
		};

		yield {
			type: 'text',
			content: 'Would you like me to help implement any of these suggestions?'
		};
	}

	/**
	 * Handle project forecast mode (read-only)
	 */
	private async *handleProjectForecast(
		session: any,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		const projectId = session.entity_id;
		if (!projectId) {
			yield {
				type: 'error',
				error: 'No project specified for forecast'
			};
			return;
		}

		// Load project context
		const context = await this.contextService.loadLocationContext(
			'project',
			projectId,
			false, // full context
			userId
		);

		// Build metadata for system prompt
		const promptMetadata: SystemPromptMetadata = {
			projectId,
			projectName: context.metadata?.projectName
		};

		// Get system prompt for forecast
		const systemPrompt = this.contextService.getSystemPrompt(
			'project_forecast',
			promptMetadata
		);

		// Generate forecast
		const forecast = await this.generateForecast(context, userMessage, systemPrompt);

		// Stream scenarios
		for (const scenario of forecast.scenarios) {
			yield {
				type: 'text',
				content: this.formatScenario(scenario)
			};
		}

		yield {
			type: 'text',
			content: this.formatForecastInsights(forecast.insights)
		};
	}

	/**
	 * Handle task update mode
	 */
	private async *handleTaskUpdate(
		session: any,
		userMessage: string,
		userId: string,
		autoAccept: boolean
	): AsyncGenerator<AgentSSEMessage> {
		const taskId = session.entity_id;
		if (!taskId) {
			yield {
				type: 'error',
				error: 'No task specified for update'
			};
			return;
		}

		// Load task context
		const context = await this.contextService.loadLocationContext('task', taskId, true, userId);

		// Build metadata for system prompt
		const promptMetadata: SystemPromptMetadata = {
			taskTitle: context.metadata?.taskTitle
		};

		// Use task_update system prompt
		const stream = this.llmService.streamText({
			messages: [
				{
					role: 'system',
					content: this.contextService.getSystemPrompt('task_update', promptMetadata)
				},
				{
					role: 'system',
					content: `Current task: ${JSON.stringify(context, null, 2)}`
				},
				{ role: 'user', content: userMessage }
			],
			userId,
			profile: 'speed',
			temperature: 0.3,
			maxTokens: 300
		});

		for await (const chunk of stream) {
			if (chunk.type === 'text') {
				yield { type: 'text', content: chunk.content };
			}
		}

		// TODO: Generate and execute/queue task update operations
		yield {
			type: 'text',
			content: '(Task update operations will be implemented in future iteration)'
		};
	}

	/**
	 * Handle daily brief update mode
	 */
	private async *handleDailyBriefUpdate(
		session: any,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		// Fetch user info for metadata
		const userInfo = await this.getUserInfo(userId);

		// Build metadata for system prompt
		const promptMetadata: SystemPromptMetadata = {
			userName: userInfo.userName
		};

		// Use daily_brief_update system prompt
		const stream = this.llmService.streamText({
			messages: [
				{
					role: 'system',
					content: this.contextService.getSystemPrompt(
						'daily_brief_update',
						promptMetadata
					)
				},
				{ role: 'user', content: userMessage }
			],
			userId,
			profile: 'speed',
			temperature: 0.5,
			maxTokens: 400
		});

		for await (const chunk of stream) {
			if (chunk.type === 'text') {
				yield { type: 'text', content: chunk.content };
			}
		}

		// TODO: Generate and execute/queue daily brief update operations
		yield {
			type: 'text',
			content: '(Daily brief update operations will be implemented in future iteration)'
		};
	}

	/**
	 * Handle general conversation
	 */
	private async *handleGeneral(
		session: any,
		userMessage: string,
		userId: string
	): AsyncGenerator<AgentSSEMessage> {
		// Fetch user info for metadata
		const userInfo = await this.getUserInfo(userId);

		// Build metadata for system prompt
		const promptMetadata: SystemPromptMetadata = {
			userName: userInfo.userName
		};

		// Use general system prompt
		const stream = this.llmService.streamText({
			messages: [
				{
					role: 'system',
					content: this.contextService.getSystemPrompt('general', promptMetadata)
				},
				{ role: 'user', content: userMessage }
			],
			userId,
			profile: 'speed',
			temperature: 0.7,
			maxTokens: 300
		});

		for await (const chunk of stream) {
			if (chunk.type === 'text') {
				yield { type: 'text', content: chunk.content };
			}
		}
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Fetch user information for metadata
	 */
	private async getUserInfo(userId: string): Promise<{ userName?: string }> {
		const { data } = await this.supabase.from('users').select('name').eq('id', userId).single();

		return { userName: data?.name || undefined };
	}

	/**
	 * Detect relevant dimensions using preparatory analysis
	 */
	private async detectRelevantDimensions(
		brainDump: string,
		draft: ProjectDraft
	): Promise<string[]> {
		// Note: runPreparatoryAnalysis is a private method on BrainDumpProcessor
		// For now, we'll use a simple heuristic approach instead
		// TODO: Expose a public method or refactor to make this accessible

		// Simple heuristic: detect dimensions based on keywords
		const lowerBrainDump = brainDump.toLowerCase();
		const touchedDimensions: string[] = [];

		// Map keywords to dimensions
		const dimensionKeywords = {
			core_integrity_ideals: ['goal', 'purpose', 'vision', 'mission', 'objective', 'aim'],
			core_people_bonds: [
				'team',
				'people',
				'relationship',
				'collaborate',
				'partner',
				'stakeholder'
			],
			core_goals_momentum: ['progress', 'milestone', 'deadline', 'timeline', 'complete'],
			core_reality_understanding: [
				'challenge',
				'problem',
				'issue',
				'constraint',
				'limitation'
			],
			core_trust_safeguards: ['risk', 'security', 'safety', 'protect', 'verify'],
			core_opportunity_freedom: ['opportunity', 'explore', 'experiment', 'innovate'],
			core_power_resources: ['resource', 'budget', 'cost', 'investment', 'tool'],
			core_meaning_identity: ['why', 'value', 'principle', 'belief', 'culture'],
			core_harmony_integration: ['balance', 'integrate', 'align', 'coordinate']
		};

		// Detect dimensions based on keywords
		for (const [dimension, keywords] of Object.entries(dimensionKeywords)) {
			if (keywords.some((keyword) => lowerBrainDump.includes(keyword))) {
				touchedDimensions.push(dimension);
			}
		}

		// Always include critical dimensions for new projects
		const coreDimensions = ['core_integrity_ideals', 'core_reality_understanding'];

		return [...new Set([...coreDimensions, ...touchedDimensions])];
	}

	/**
	 * Get the next prioritized question to ask
	 */
	private getNextPrioritizedQuestion(dimensions: string[], draft: ProjectDraft): string | null {
		const covered = draft.dimensions_covered || [];

		// Priority order for dimensions
		const priorityOrder = [
			'core_integrity_ideals',
			'core_reality_understanding',
			'core_goals_momentum',
			'core_people_bonds',
			'core_trust_safeguards',
			'core_power_resources',
			'core_opportunity_freedom',
			'core_meaning_identity',
			'core_harmony_integration'
		];

		for (const dimension of priorityOrder) {
			if (dimensions.includes(dimension) && !covered.includes(dimension)) {
				const questions = DIMENSION_QUESTIONS[dimension];
				if (questions && questions.length > 0) {
					// Pick a random question from the options
					const question = questions[Math.floor(Math.random() * questions.length)];
					return question;
				}
			}
		}

		return null;
	}

	/**
	 * Check if project is complex
	 */
	private isComplexProject(draft: ProjectDraft): boolean {
		const dimensionCount = draft.dimensions_covered?.length || 0;
		const hasMultipleTasks = (draft.draft_tasks?.length || 0) > 5;
		const hasLongTimeline =
			draft.start_date &&
			draft.end_date &&
			new Date(draft.end_date).getTime() - new Date(draft.start_date).getTime() >
				90 * 24 * 60 * 60 * 1000;

		return dimensionCount > 5 || hasMultipleTasks || hasLongTimeline;
	}

	/**
	 * Check if draft has minimal viability
	 */
	private async hasMinimalViability(draft: ProjectDraft): Promise<boolean> {
		return await this.draftService.isDraftReadyToFinalize(draft.id);
	}

	/**
	 * Check if user message is a confirmation
	 */
	private isUserConfirmation(message: string): boolean {
		const confirmationPhrases = [
			'yes',
			'yeah',
			'yep',
			'sure',
			'ok',
			'okay',
			'create',
			'do it',
			'go ahead',
			"let's do it",
			'sounds good',
			'perfect',
			'great'
		];
		const normalized = message.toLowerCase().trim();
		return confirmationPhrases.some((phrase) => normalized.includes(phrase));
	}

	/**
	 * Identify which dimension the user's answer relates to
	 */
	private async identifyAnsweredDimension(
		answer: string,
		detectedDimensions: string[],
		draft: ProjectDraft
	): Promise<string | null> {
		// Simple heuristic: assume they're answering the most recent uncovered dimension
		const covered = draft.dimensions_covered || [];
		for (const dimension of detectedDimensions) {
			if (!covered.includes(dimension)) {
				return dimension;
			}
		}
		return null;
	}

	/**
	 * Extract content for a specific dimension from user's answer
	 */
	private async extractDimensionContent(answer: string, dimension: string): Promise<string> {
		// For now, just return the answer as-is
		// Could enhance with LLM to structure the content
		return answer;
	}

	/**
	 * Generate operations for creating a project from draft
	 */
	private async generateProjectOperations(draft: ProjectDraft): Promise<ParsedOperation[]> {
		const operations: ParsedOperation[] = [];

		// Create project operation
		operations.push({
			id: generateId(),
			table: 'projects' as TableName,
			operation: 'create' as OperationType,
			data: {
				name: draft.name || 'Untitled Project',
				slug: draft.slug || this.draftService.generateSlug(draft.name || 'untitled'),
				description: draft.description,
				context: draft.context,
				executive_summary: draft.executive_summary,
				core_integrity_ideals: draft.core_integrity_ideals,
				core_people_bonds: draft.core_people_bonds,
				core_goals_momentum: draft.core_goals_momentum,
				core_meaning_identity: draft.core_meaning_identity,
				core_reality_understanding: draft.core_reality_understanding,
				core_trust_safeguards: draft.core_trust_safeguards,
				core_opportunity_freedom: draft.core_opportunity_freedom,
				core_power_resources: draft.core_power_resources,
				core_harmony_integration: draft.core_harmony_integration,
				tags: draft.tags || [],
				status: 'active',
				start_date: draft.start_date,
				end_date: draft.end_date
			},
			ref: 'new-project-1',
			enabled: true
		});

		// Create tasks from draft tasks
		if (draft.draft_tasks?.length) {
			for (const draftTask of draft.draft_tasks) {
				operations.push({
					id: generateId(),
					table: 'tasks' as TableName,
					operation: 'create' as OperationType,
					data: {
						project_ref: 'new-project-1', // Reference will be resolved by executor
						title: draftTask.title,
						description: draftTask.description,
						priority: draftTask.priority || 'medium',
						status: draftTask.status || 'backlog',
						start_date: draftTask.start_date,
						duration_minutes: draftTask.duration_minutes
					},
					enabled: true
				});
			}
		}

		return operations;
	}

	/**
	 * Convert ParsedOperation to ChatOperation
	 */
	private convertToOperation(op: ParsedOperation, sessionId: string): ChatOperation {
		return {
			...op,
			chat_session_id: sessionId,
			user_id: '', // Will be filled by executor
			status: 'completed',
			created_at: new Date().toISOString()
		};
	}

	/**
	 * Queue operations for approval
	 */
	private async queueOperations(
		operations: ParsedOperation[],
		sessionId: string,
		userId: string
	): Promise<ChatOperation[]> {
		const queuedOps: ChatOperation[] = [];

		for (let i = 0; i < operations.length; i++) {
			const { data: op } = await this.supabase
				.from('chat_operations')
				.insert({
					chat_session_id: sessionId,
					user_id: userId,
					table_name: operations[i].table,
					operation_type: operations[i].operation,
					data: operations[i].data,
					ref: operations[i].ref,
					status: 'queued',
					enabled: operations[i].enabled,
					reasoning: operations[i].reasoning,
					sequence_number: i
				})
				.select()
				.single();

			if (op) {
				queuedOps.push(op as unknown as ChatOperation);
			}
		}

		return queuedOps;
	}

	/**
	 * Execute a single operation
	 */
	private async executeOperation(
		operation: ParsedOperation,
		userId: string,
		sessionId: string
	): Promise<ChatOperation> {
		// This would integrate with OperationsExecutor
		const result = await this.operationsExecutor.executeOperations({
			operations: [operation],
			userId,
			brainDumpId: sessionId
		});

		if (result.successful.length > 0) {
			return this.convertToOperation(result.successful[0], sessionId);
		} else if (result.failed.length > 0) {
			return {
				...this.convertToOperation(result.failed[0], sessionId),
				status: 'failed',
				error: result.failed[0].error
			};
		}

		throw new Error('Operation execution failed');
	}

	/**
	 * Load session from database
	 */
	private async loadSession(sessionId: string): Promise<any> {
		const { data } = await this.supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', sessionId)
			.single();

		return data;
	}

	/**
	 * Update session metadata
	 */
	private async updateSessionMetadata(sessionId: string, metadata: AgentMetadata): Promise<void> {
		await this.supabase
			.from('chat_sessions')
			.update({
				agent_metadata: metadata
			})
			.eq('id', sessionId);
	}

	/**
	 * Analyze update request (placeholder for LLM analysis)
	 */
	private async analyzeUpdateRequest(
		message: string,
		context: any,
		systemPrompt: string
	): Promise<any> {
		// This would use LLM with systemPrompt to analyze what needs updating
		return {
			updates: [],
			reasoning: 'Analysis of update request'
		};
	}

	/**
	 * Generate update operations (placeholder)
	 */
	private async generateUpdateOperations(
		analysis: any,
		projectId: string,
		userId: string
	): Promise<ParsedOperation[]> {
		// This would generate appropriate operations based on analysis
		return [];
	}

	/**
	 * Format update preview
	 */
	private formatUpdatePreview(operations: ParsedOperation[]): string {
		const lines = ["I'm going to make the following updates:\n"];
		for (const op of operations) {
			lines.push(`• ${op.operation} ${op.table}: ${op.reasoning || 'Update'}`);
		}
		return lines.join('\n');
	}

	/**
	 * Run project audit (placeholder)
	 */
	private async runProjectAudit(
		context: any,
		message: string,
		systemPrompt: string
	): Promise<any> {
		// This would use LLM with systemPrompt to audit the project
		return {
			findings: [],
			recommendations: []
		};
	}

	/**
	 * Format audit finding
	 */
	private formatAuditFinding(finding: any): string {
		return `**Finding**: ${finding.description}\n**Impact**: ${finding.impact}`;
	}

	/**
	 * Format audit recommendations
	 */
	private formatAuditRecommendations(recommendations: any[]): string {
		const lines = ['**Recommendations**:\n'];
		for (const rec of recommendations) {
			lines.push(`• ${rec.description}`);
		}
		return lines.join('\n');
	}

	/**
	 * Generate forecast (placeholder)
	 */
	private async generateForecast(
		context: any,
		message: string,
		systemPrompt: string
	): Promise<any> {
		// This would use LLM with systemPrompt to generate forecast scenarios
		return {
			scenarios: [],
			insights: []
		};
	}

	/**
	 * Format scenario
	 */
	private formatScenario(scenario: any): string {
		return `**${scenario.name}** (${scenario.likelihood}% chance):\n${scenario.description}`;
	}

	/**
	 * Format forecast insights
	 */
	private formatForecastInsights(insights: any[]): string {
		const lines = ['**Key Insights**:\n'];
		for (const insight of insights) {
			lines.push(`• ${insight}`);
		}
		return lines.join('\n');
	}
}
