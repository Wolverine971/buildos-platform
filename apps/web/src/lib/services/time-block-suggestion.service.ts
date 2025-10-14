// apps/web/src/lib/services/time-block-suggestion.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TimeBlockSuggestion, TimeBlockType } from '@buildos/shared-types';
import { SmartLLMService } from '$lib/services/smart-llm-service';

type TypedSupabaseClient = SupabaseClient<Database>;

const MAX_TASKS_PER_PROMPT = 12;
const MAX_SUGGESTIONS = 3;
const DEFAULT_MODEL_LABEL = 'openrouter:auto';

type TaskRow = Database['public']['Tables']['tasks']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];

interface CandidateTask
	extends Pick<
		TaskRow,
		| 'id'
		| 'title'
		| 'description'
		| 'details'
		| 'priority'
		| 'duration_minutes'
		| 'status'
		| 'start_date'
		| 'project_id'
	> {
	project?: Pick<ProjectRow, 'id' | 'name' | 'status' | 'calendar_color_id'> | null;
}

interface GenerateSuggestionsParams {
	blockType: TimeBlockType;
	projectId?: string | null;
	startTime: Date;
	endTime: Date;
	durationMinutes: number;
	timezone?: string;
}

interface LLMSuggestion {
	task_id?: string | null;
	title: string;
	reason: string;
	project_id?: string | null;
	project_name?: string | null;
	priority?: 'low' | 'medium' | 'high' | 'urgent';
	estimated_minutes?: number | null;
	confidence?: number | null;
}

interface LLMResponse {
	summary?: string | null;
	suggestions?: LLMSuggestion[];
}

export interface TimeBlockSuggestionResult {
	suggestions: TimeBlockSuggestion[];
	summary: string | null;
	model: string | null;
	generatedAt: Date;
}

export class TimeBlockSuggestionService {
	private readonly llmService: SmartLLMService;

	constructor(
		private readonly supabase: TypedSupabaseClient,
		private readonly userId: string
	) {
		this.llmService = new SmartLLMService({ supabase });
	}

	async generateSuggestions(
		params: GenerateSuggestionsParams
	): Promise<TimeBlockSuggestionResult> {
		const tasks = await this.fetchCandidateTasks(params);

		if (tasks.length === 0) {
			return this.buildNoTaskFallback(params);
		}

		try {
			const llmResponse = await this.requestSuggestionsFromLLM(params, tasks);
			const normalized = this.normalizeLLMResponse(llmResponse, tasks);

			if (normalized.suggestions.length > 0 || normalized.summary) {
				return normalized;
			}
		} catch (error) {
			console.error('[TimeBlockSuggestionService] LLM suggestion generation failed:', error);
		}

		return this.buildHeuristicSuggestions(params, tasks);
	}

	private async fetchCandidateTasks(params: GenerateSuggestionsParams): Promise<CandidateTask[]> {
		let query = this.supabase
			.from('tasks')
			.select(
				`
				id,
				title,
				description,
				details,
				priority,
				duration_minutes,
				status,
				start_date,
				project_id,
				project:projects(id, name, status, calendar_color_id)
			`
			)
			.eq('user_id', this.userId)
			.is('deleted_at', null)
			.in('status', ['backlog', 'in_progress', 'blocked'])
			.order('updated_at', { ascending: false })
			.limit(MAX_TASKS_PER_PROMPT);

		if (params.blockType === 'project' && params.projectId) {
			query = query.eq('project_id', params.projectId);
		} else {
			// For build blocks, prioritise active projects but keep flexibility
			query = query.order('priority', { ascending: true });
		}

		const { data, error } = await query;

		if (error) {
			console.error('[TimeBlockSuggestionService] Failed to load candidate tasks:', error);
			return [];
		}

		const tasks = (data ?? []) as CandidateTask[];

		return tasks
			.filter((task) => {
				if (task.project?.status && task.project.status !== 'active') {
					return false;
				}

				if (params.blockType === 'project' && params.projectId) {
					return task.project_id === params.projectId;
				}

				return true;
			})
			.sort((a, b) => this.rankTask(a) - this.rankTask(b))
			.slice(0, MAX_TASKS_PER_PROMPT);
	}

	private rankTask(task: CandidateTask): number {
		const priorityRank: Record<string, number> = {
			urgent: 0,
			high: 1,
			medium: 2,
			low: 3
		};

		const statusRank: Record<string, number> = {
			in_progress: 0,
			backlog: 1,
			blocked: 2,
			done: 3
		};

		const priorityKey = (task.priority ?? 'medium').toLowerCase();
		const statusKey = (task.status ?? 'backlog').toLowerCase();

		const priorityValue = priorityRank[priorityKey] ?? 4;
		const statusValue = statusRank[statusKey] ?? 4;
		const durationPenalty = task.duration_minutes && task.duration_minutes > 240 ? 1 : 0;

		return priorityValue * 10 + statusValue + durationPenalty;
	}

	private async requestSuggestionsFromLLM(
		params: GenerateSuggestionsParams,
		tasks: CandidateTask[]
	): Promise<LLMResponse> {
		const systemPrompt = this.buildSystemPrompt(params.blockType);
		const userPrompt = this.buildUserPrompt(params, tasks);

		return await this.llmService.getJSONResponse<LLMResponse>({
			systemPrompt,
			userPrompt,
			userId: this.userId,
			profile: 'balanced',
			temperature: 0.2,
			validation: {
				retryOnParseError: true,
				validateSchema: false,
				maxRetries: 2
			},
			operationType: 'time_play_suggestions',
			projectId: params.projectId ?? undefined
		});
	}

	private buildSystemPrompt(blockType: TimeBlockType): string {
		return [
			'You are an executive productivity assistant for the BuildOS Time Play feature.',
			'Generate concise, practical focus suggestions for an upcoming time block.',
			'Always return valid JSON with this shape:',
			'{',
			'  "summary": string,',
			'  "suggestions": [',
			'    {',
			'      "task_id": string | null,',
			'      "title": string,',
			'      "reason": string,',
			'      "project_id": string | null,',
			'      "project_name": string | null,',
			'      "priority": "low" | "medium" | "high" | "urgent" | null,',
			'      "estimated_minutes": number | null,',
			'      "confidence": number | null',
			'    }',
			'  ]',
			'}',
			'',
			`The block type is "${blockType}". For project blocks, focus on the provided project. For build blocks, recommend high-impact work across projects.`,
			'Keep suggestions actionable and limit to three. Use the provided tasks; do not invent new work.'
		].join('\n');
	}

	private buildUserPrompt(params: GenerateSuggestionsParams, tasks: CandidateTask[]): string {
		const taskLines = tasks
			.map((task, index) => {
				const summary = this.truncate(
					task.details || task.description || 'No additional details provided.',
					240
				);
				const payload = {
					index: index + 1,
					id: task.id,
					title: task.title,
					project_id: task.project_id,
					project_name: task.project?.name ?? null,
					priority: task.priority,
					status: task.status,
					duration_minutes: task.duration_minutes,
					start_date: task.start_date,
					summary
				};
				return JSON.stringify(payload);
			})
			.join('\n');

		return [
			'Generate focus suggestions for the following time block:',
			`Block type: ${params.blockType}`,
			params.projectId ? `Project ID: ${params.projectId}` : 'Project ID: null',
			`Starts at: ${params.startTime.toISOString()}`,
			`Ends at: ${params.endTime.toISOString()}`,
			`Duration: ${params.durationMinutes} minutes`,
			params.timezone ? `Timezone: ${params.timezone}` : 'Timezone: not provided',
			'',
			'Candidate tasks (JSON per line):',
			taskLines,
			'',
			'Instructions:',
			'- Recommend at most three suggestions.',
			'- Reference task IDs when possible.',
			'- Provide a brief reason (max 160 characters).',
			'- Estimated minutes should not exceed the block duration.',
			'- Confidence should be between 0 and 1 when included.'
		].join('\n');
	}

	private normalizeLLMResponse(
		response: LLMResponse | null | undefined,
		tasks: CandidateTask[]
	): TimeBlockSuggestionResult {
		const now = new Date();

		if (!response) {
			return {
				suggestions: [],
				summary: null,
				model: DEFAULT_MODEL_LABEL,
				generatedAt: now
			};
		}

		const taskMap = new Map(tasks.map((task) => [task.id, task]));

		const sanitizedSuggestions = (response.suggestions ?? [])
			.map<TimeBlockSuggestion>((suggestion) => {
				const relatedTask = (suggestion.task_id && taskMap.get(suggestion.task_id)) || null;

				const title = this.truncate(
					suggestion.title || relatedTask?.title || 'Focus on meaningful work',
					80
				);
				const reason = this.truncate(
					suggestion.reason || 'This matters for moving your work forward.',
					200
				);

				const estimatedMinutes =
					typeof suggestion.estimated_minutes === 'number' &&
					suggestion.estimated_minutes > 0
						? Math.round(suggestion.estimated_minutes)
						: (relatedTask?.duration_minutes ?? null);

				return {
					title,
					reason,
					task_id: suggestion.task_id ?? relatedTask?.id ?? null,
					project_id: suggestion.project_id ?? relatedTask?.project_id ?? null,
					project_name:
						suggestion.project_name ??
						relatedTask?.project?.name ??
						(relatedTask?.project_id ? 'Project Work' : null),
					priority:
						(suggestion.priority as TimeBlockSuggestion['priority']) ??
						(relatedTask?.priority as unknown as TimeBlockSuggestion['priority']) ??
						undefined,
					estimated_minutes: estimatedMinutes,
					confidence:
						typeof suggestion.confidence === 'number'
							? Math.min(Math.max(suggestion.confidence, 0), 1)
							: null
				};
			})
			.filter((suggestion) => suggestion.title && suggestion.reason)
			.slice(0, MAX_SUGGESTIONS);

		return {
			suggestions: sanitizedSuggestions,
			summary: response.summary ? this.truncate(response.summary, 280) : null,
			model: DEFAULT_MODEL_LABEL,
			generatedAt: now
		};
	}

	private buildHeuristicSuggestions(
		params: GenerateSuggestionsParams,
		tasks: CandidateTask[]
	): TimeBlockSuggestionResult {
		const now = new Date();
		const topTasks = tasks.slice(0, MAX_SUGGESTIONS);

		const suggestions: TimeBlockSuggestion[] = topTasks.map((task) => ({
			title: this.truncate(task.title, 80),
			reason: this.truncate(
				task.status === 'in_progress'
					? 'Continue momentum on this in-progress work.'
					: 'High-priority task pulled from your backlog.',
				200
			),
			task_id: task.id,
			project_id: task.project_id,
			project_name: task.project?.name ?? null,
			priority: (task.priority as unknown as TimeBlockSuggestion['priority']) ?? undefined,
			estimated_minutes:
				task.duration_minutes && task.duration_minutes > 0
					? Math.min(task.duration_minutes, params.durationMinutes)
					: null,
			confidence: null
		}));

		return {
			suggestions,
			summary:
				params.blockType === 'project'
					? 'Focus on the highest-impact work for this project.'
					: 'Use this protected time to tackle the most important tasks across projects.',
			model: 'heuristic',
			generatedAt: now
		};
	}

	private buildNoTaskFallback(params: GenerateSuggestionsParams): TimeBlockSuggestionResult {
		const now = new Date();

		return {
			suggestions: [],
			summary:
				params.blockType === 'project'
					? 'There are no active tasks for this project right now. Consider reviewing backlog or planning next steps.'
					: 'No active tasks available. Use this block for strategic planning, reviews, or proactive outreach.',
			model: 'no-data',
			generatedAt: now
		};
	}

	private truncate(value: string, maxLength: number): string {
		if (!value) return value;
		return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
	}
}
