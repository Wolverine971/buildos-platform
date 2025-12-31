// apps/web/src/lib/services/agentic-chat/analysis/project-creation-analyzer.ts
/**
 * Project Creation Analyzer Service
 *
 * Analyzes user messages in the project_create context to determine if there's
 * sufficient information to proceed with project creation, or if clarifying
 * questions should be asked first.
 *
 * Design Philosophy:
 * - Only ask clarifying questions when truly necessary (vague input)
 * - Limit to max 2 rounds of clarification to avoid frustrating back-and-forth
 * - Generate intelligent, conversational questions via LLM
 * - Always proceed after 2 rounds, even with incomplete info (use inference)
 *
 * @module agentic-chat/analysis
 */

/**
 * Interface for LLM service (subset of SmartLLMService)
 */
interface LLMService {
	generateText(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		userId?: string;
		operationType?: string;
		chatSessionId?: string;
		agentSessionId?: string;
		agentPlanId?: string;
		agentExecutionId?: string;
	}): Promise<string>;
}

/**
 * Result of project creation intent analysis
 */
export interface ProjectCreationIntentAnalysis {
	/** Whether there's sufficient information to proceed with project creation */
	hasSufficientContext: boolean;

	/** Confidence level in the assessment (0-1) */
	confidence: number;

	/** What information is present */
	presentInfo: {
		hasProjectType: boolean;
		hasDomain: boolean;
		hasDeliverable: boolean;
		hasGoals: boolean;
		hasTimeline: boolean;
		hasScale: boolean;
	};

	/** What key information is missing */
	missingInfo: string[];

	/** LLM-generated clarifying questions (if context insufficient) */
	clarifyingQuestions?: string[];

	/** Brief reasoning for the assessment */
	reasoning: string;

	/** Inferred project type if detectable (even partial) */
	inferredProjectType?: string;
}

/**
 * Session metadata for tracking clarification rounds
 */
export interface ClarificationRoundMetadata {
	/** Current round number (0 = initial, 1 = first clarification, 2 = max) */
	roundNumber: number;

	/** Accumulated context from all user messages */
	accumulatedContext: string;

	/** Questions asked in previous rounds */
	previousQuestions: string[];

	/** User responses to previous questions */
	previousResponses: string[];
}

/**
 * Service for analyzing project creation intent and generating clarifying questions
 */
export class ProjectCreationAnalyzer {
	// Keywords that strongly indicate project type/domain
	private readonly STRONG_TYPE_INDICATORS = [
		// Software/Tech
		'app',
		'application',
		'software',
		'website',
		'api',
		'platform',
		'mobile',
		'web',
		'saas',
		'tool',
		'automation',
		// Creative/Content
		'book',
		'novel',
		'blog',
		'video',
		'podcast',
		'course',
		'content',
		'writing',
		'music',
		'art',
		'design',
		// Business
		'business',
		'startup',
		'launch',
		'marketing',
		'campaign',
		'product',
		'service',
		'consulting',
		// Research/Academic
		'research',
		'study',
		'thesis',
		'paper',
		'analysis',
		'experiment',
		// Events
		'event',
		'conference',
		'wedding',
		'party',
		'meetup',
		'workshop',
		// Personal
		'fitness',
		'health',
		'travel',
		'move',
		'renovation',
		'learning'
	];

	// Keywords that indicate deliverables/outcomes
	private readonly DELIVERABLE_INDICATORS = [
		'build',
		'create',
		'launch',
		'publish',
		'release',
		'ship',
		'complete',
		'finish',
		'deliver',
		'produce',
		'develop',
		'make',
		'write',
		'design',
		'implement'
	];

	// Keywords that indicate timeline
	private readonly TIMELINE_INDICATORS = [
		'by',
		'before',
		'deadline',
		'due',
		'week',
		'month',
		'quarter',
		'year',
		'asap',
		'urgent',
		'soon',
		'next',
		'end of'
	];

	// Keywords that indicate scale
	private readonly SCALE_INDICATORS = [
		'small',
		'large',
		'big',
		'quick',
		'simple',
		'complex',
		'comprehensive',
		'mvp',
		'prototype',
		'full',
		'complete',
		'mini',
		'major',
		'side'
	];

	constructor(private llmService: LLMService) {}

	/**
	 * Analyze user message to determine if there's sufficient context for project creation
	 */
	async analyzeIntent(
		message: string,
		userId: string,
		clarificationMetadata?: ClarificationRoundMetadata,
		chatSessionId?: string
	): Promise<ProjectCreationIntentAnalysis> {
		const roundNumber = clarificationMetadata?.roundNumber ?? 0;
		const accumulatedContext = clarificationMetadata?.accumulatedContext
			? `${clarificationMetadata.accumulatedContext}\n\nUser's latest response: ${message}`
			: message;

		console.log('[ProjectCreationAnalyzer] Analyzing intent', {
			messageLength: message.length,
			roundNumber,
			hasAccumulatedContext: !!clarificationMetadata?.accumulatedContext
		});

		// Quick heuristic check first
		const quickAnalysis = this.quickHeuristicAnalysis(accumulatedContext);

		// If round 2 or quick analysis says sufficient, proceed
		if (roundNumber >= 2) {
			console.log(
				'[ProjectCreationAnalyzer] Max rounds reached, proceeding with available info'
			);
			return {
				hasSufficientContext: true,
				confidence: 0.7,
				presentInfo: quickAnalysis.presentInfo,
				missingInfo: [],
				reasoning:
					'Max clarification rounds reached. Proceeding with available information and inference.',
				inferredProjectType: quickAnalysis.inferredType
			};
		}

		// If heuristics say we have enough, trust it
		if (quickAnalysis.hasSufficientContext && quickAnalysis.confidence >= 0.8) {
			console.log('[ProjectCreationAnalyzer] Quick analysis: sufficient context detected');
			return {
				hasSufficientContext: true,
				confidence: quickAnalysis.confidence,
				presentInfo: quickAnalysis.presentInfo,
				missingInfo: [],
				reasoning: quickAnalysis.reasoning,
				inferredProjectType: quickAnalysis.inferredType
			};
		}

		// Use LLM for deeper analysis and question generation
		try {
			const llmAnalysis = await this.performLLMAnalysis(
				accumulatedContext,
				quickAnalysis,
				userId,
				clarificationMetadata
			);
			return llmAnalysis;
		} catch (error) {
			console.error(
				'[ProjectCreationAnalyzer] LLM analysis failed, using heuristics:',
				error
			);
			// Fallback: if heuristics found some indicators, proceed; otherwise ask generic question
			if (quickAnalysis.confidence >= 0.5) {
				return {
					hasSufficientContext: true,
					confidence: quickAnalysis.confidence,
					presentInfo: quickAnalysis.presentInfo,
					missingInfo: quickAnalysis.missingInfo,
					reasoning: 'LLM analysis unavailable, proceeding with heuristic assessment.',
					inferredProjectType: quickAnalysis.inferredType
				};
			}

			return {
				hasSufficientContext: false,
				confidence: 0.3,
				presentInfo: quickAnalysis.presentInfo,
				missingInfo: ['project type', 'main goal'],
				clarifyingQuestions: [
					'What kind of project would you like to create? For example, is this a software app, a writing project, a business initiative, or something else?'
				],
				reasoning: 'Unable to determine project type from the provided information.'
			};
		}
	}

	/**
	 * Quick heuristic analysis without LLM call
	 */
	private quickHeuristicAnalysis(message: string): {
		hasSufficientContext: boolean;
		confidence: number;
		presentInfo: ProjectCreationIntentAnalysis['presentInfo'];
		missingInfo: string[];
		reasoning: string;
		inferredType?: string;
	} {
		const lowerMessage = message.toLowerCase();
		const words = lowerMessage.split(/\s+/);

		// Check for type indicators
		const foundTypeIndicators = this.STRONG_TYPE_INDICATORS.filter(
			(indicator) =>
				lowerMessage.includes(indicator) ||
				words.some((word) => word === indicator || word.startsWith(indicator))
		);
		const hasProjectType = foundTypeIndicators.length > 0;

		// Check for deliverable indicators
		const foundDeliverableIndicators = this.DELIVERABLE_INDICATORS.filter((indicator) =>
			lowerMessage.includes(indicator)
		);
		const hasDeliverable = foundDeliverableIndicators.length > 0;

		// Check for timeline indicators
		const hasTimeline = this.TIMELINE_INDICATORS.some((indicator) =>
			lowerMessage.includes(indicator)
		);

		// Check for scale indicators
		const hasScale = this.SCALE_INDICATORS.some((indicator) =>
			lowerMessage.includes(indicator)
		);

		// Check for goals (phrases like "want to", "need to", "goal is", etc.)
		const hasGoals =
			/want to|need to|goal is|aim to|trying to|planning to|hoping to|objective|purpose/i.test(
				message
			);

		// Domain is often implied by type, but check for explicit domain keywords
		const hasDomain = hasProjectType; // Simplified: if we have type, we likely have domain

		const presentInfo = {
			hasProjectType,
			hasDomain,
			hasDeliverable,
			hasGoals,
			hasTimeline,
			hasScale
		};

		// Calculate sufficiency
		const criticalPresent = hasProjectType || (hasDeliverable && hasGoals);
		const infoScore =
			(hasProjectType ? 3 : 0) +
			(hasDeliverable ? 2 : 0) +
			(hasGoals ? 2 : 0) +
			(hasTimeline ? 1 : 0) +
			(hasScale ? 1 : 0);

		// Confidence calculation
		let confidence = Math.min(infoScore / 7, 1);
		if (message.length > 100) confidence = Math.min(confidence + 0.1, 1);
		if (message.length < 20 && !hasProjectType) confidence = Math.max(confidence - 0.2, 0);

		// Determine missing info
		const missingInfo: string[] = [];
		if (!hasProjectType) missingInfo.push('project type');
		if (!hasDeliverable && !hasGoals) missingInfo.push('main goal or deliverable');

		// Infer project type if possible
		let inferredType: string | undefined;
		if (foundTypeIndicators.length > 0) {
			inferredType = foundTypeIndicators[0];
		}

		const hasSufficientContext = criticalPresent && confidence >= 0.6;
		const reasoning = hasSufficientContext
			? `Detected project type indicators: ${foundTypeIndicators.join(', ') || 'inferred from context'}`
			: `Missing key information: ${missingInfo.join(', ')}`;

		return {
			hasSufficientContext,
			confidence,
			presentInfo,
			missingInfo,
			reasoning,
			inferredType
		};
	}

	/**
	 * Perform LLM-based analysis for deeper understanding and question generation
	 */
	private async performLLMAnalysis(
		accumulatedContext: string,
		quickAnalysis: ReturnType<typeof this.quickHeuristicAnalysis>,
		userId: string,
		clarificationMetadata?: ClarificationRoundMetadata
	): Promise<ProjectCreationIntentAnalysis> {
		const previousQuestionsContext = clarificationMetadata?.previousQuestions?.length
			? `\nPrevious questions asked: ${clarificationMetadata.previousQuestions.join('; ')}`
			: '';

		const systemPrompt = `You are a project creation assistant analyzing user intent. Your job is to determine if there's enough information to create a meaningful project, and if not, generate 1-2 focused clarifying questions.

CRITICAL RULES:
1. Be LENIENT - if you can reasonably infer the project type, that's sufficient
2. Only ask questions about CRITICAL missing info (project type, main deliverable)
3. Generate at most 2 questions, preferably just 1
4. Questions should be conversational and friendly, not interrogative
5. If user mentions ANY specific domain (app, book, website, business, etc.), that's sufficient context
6. Avoid asking about nice-to-have details like timeline, team size, budget - those can be inferred

When generating questions:
- Make them open-ended but focused
- Avoid yes/no questions
- Don't repeat questions that were already asked${previousQuestionsContext}

Return JSON only (no markdown):
{
  "hasSufficientContext": boolean,
  "confidence": 0.0-1.0,
  "missingInfo": ["what's missing"],
  "clarifyingQuestions": ["question1", "question2"] or null if sufficient,
  "reasoning": "brief explanation",
  "inferredProjectType": "type if detectable" or null
}`;

		const prompt = `Analyze this project creation request:

"${accumulatedContext}"

Heuristic pre-analysis found:
- Project type indicators: ${quickAnalysis.presentInfo.hasProjectType ? 'Yes' : 'No'}
- Goals mentioned: ${quickAnalysis.presentInfo.hasGoals ? 'Yes' : 'No'}
- Deliverables mentioned: ${quickAnalysis.presentInfo.hasDeliverable ? 'Yes' : 'No'}
- Current confidence: ${quickAnalysis.confidence.toFixed(2)}

Is there enough context to create a meaningful project? If not, what 1-2 questions would help most?`;

		const response = await this.llmService.generateText({
			systemPrompt,
			prompt,
			temperature: 0.3,
			maxTokens: 400,
			userId,
			operationType: 'project_creation_analysis',
			chatSessionId
		});

		try {
			// Parse JSON response
			let jsonString = response.trim();
			if (jsonString.startsWith('```json')) {
				jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
			} else if (jsonString.startsWith('```')) {
				jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
			}

			const parsed = JSON.parse(jsonString);

			return {
				hasSufficientContext: parsed.hasSufficientContext ?? false,
				confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
				presentInfo: quickAnalysis.presentInfo,
				missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
				clarifyingQuestions: parsed.hasSufficientContext
					? undefined
					: Array.isArray(parsed.clarifyingQuestions)
						? parsed.clarifyingQuestions.slice(0, 2)
						: undefined,
				reasoning: parsed.reasoning ?? 'Analysis complete',
				inferredProjectType: parsed.inferredProjectType ?? quickAnalysis.inferredType
			};
		} catch (error) {
			console.error('[ProjectCreationAnalyzer] Failed to parse LLM response:', error);
			throw error;
		}
	}

	/**
	 * Create initial clarification metadata for a new session
	 */
	createInitialMetadata(): ClarificationRoundMetadata {
		return {
			roundNumber: 0,
			accumulatedContext: '',
			previousQuestions: [],
			previousResponses: []
		};
	}

	/**
	 * Update metadata after a clarification round
	 */
	updateMetadataAfterRound(
		current: ClarificationRoundMetadata,
		userResponse: string,
		questionsAsked: string[]
	): ClarificationRoundMetadata {
		return {
			roundNumber: current.roundNumber + 1,
			accumulatedContext: current.accumulatedContext
				? `${current.accumulatedContext}\n\n${userResponse}`
				: userResponse,
			previousQuestions: [...current.previousQuestions, ...questionsAsked],
			previousResponses: [...current.previousResponses, userResponse]
		};
	}
}
