<!-- apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { goto } from '$app/navigation';
	import {
		CheckCircle,
		Circle,
		Calendar,
		TrendingUp,
		ChevronDown,
		ChevronUp,
		LoaderCircle,
		Clock,
		Repeat
	} from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';

	type CalendarProjectSuggestion =
		Database['public']['Tables']['calendar_project_suggestions']['Row'];

	interface EventPatternsData {
		start_date?: string;
		end_date?: string;
		tags?: string[];
	}

	interface SuggestionTaskView {
		title: string;
		description?: string;
		details?: string;
		status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
		priority?: 'low' | 'medium' | 'high' | 'urgent' | number;
		task_type?: 'one_off' | 'recurring';
		duration_minutes?: number;
		start_date?: string;
		recurrence_pattern?:
			| 'daily'
			| 'weekdays'
			| 'weekly'
			| 'biweekly'
			| 'monthly'
			| 'quarterly'
			| 'yearly';
		recurrence_ends?: string;
		event_id?: string;
		tags?: string[];
	}

	interface Props {
		isOpen: boolean;
		analysisId?: string;
		suggestions?: CalendarProjectSuggestion[];
		autoStart?: boolean;
		onClose?: () => void;
		onStartAnalysis?: (options: {
			daysBack: number;
			daysForward: number;
		}) => Promise<void> | void;
		errorMessage?: string | null;
		embedded?: boolean; // When true, renders without Modal wrapper (for use inside notification modals)
	}

	let {
		isOpen = $bindable(false),
		analysisId,
		suggestions = $bindable([]),
		autoStart = false,
		onClose,
		onStartAnalysis,
		errorMessage = null,
		embedded = false
	}: Props = $props();

	let selectedSuggestions = $state(new Set<string>());
	let processing = $state(false);
	let analyzing = $state(false);
	let expandedSuggestions = $state(new Set<string>());
	let modifiedSuggestions = $state<Map<string, { name?: string; description?: string }>>(
		new Map()
	);
	let analysisTriggered = $state(false); // Track if analysis was already triggered
	let daysForward = $state(60); // Default 2 months (60 days)
	let daysBack = $state(7); // Default 7 days back
	let autoSelectProcessed = $state(false); // Track if auto-selection has been done

	// Task management state
	let tasksExpanded = $state(new Set<string>());
	let enabledTasks = $state<Record<string, boolean>>({});

	function parseSuggestedTasks(value: unknown): SuggestionTaskView[] {
		if (!Array.isArray(value)) return [];

		return value
			.filter(
				(task): task is Record<string, unknown> => typeof task === 'object' && task !== null
			)
			.map((task) => ({
				title:
					typeof task.title === 'string' && task.title.trim().length > 0
						? task.title
						: 'Untitled Task',
				description: typeof task.description === 'string' ? task.description : undefined,
				details: typeof task.details === 'string' ? task.details : undefined,
				status:
					task.status === 'backlog' ||
					task.status === 'in_progress' ||
					task.status === 'done' ||
					task.status === 'blocked'
						? task.status
						: undefined,
				priority:
					task.priority === 'low' ||
					task.priority === 'medium' ||
					task.priority === 'high' ||
					task.priority === 'urgent' ||
					typeof task.priority === 'number'
						? task.priority
						: undefined,
				task_type:
					task.task_type === 'one_off' || task.task_type === 'recurring'
						? task.task_type
						: undefined,
				duration_minutes:
					typeof task.duration_minutes === 'number' ? task.duration_minutes : undefined,
				start_date: typeof task.start_date === 'string' ? task.start_date : undefined,
				recurrence_pattern:
					task.recurrence_pattern === 'daily' ||
					task.recurrence_pattern === 'weekdays' ||
					task.recurrence_pattern === 'weekly' ||
					task.recurrence_pattern === 'biweekly' ||
					task.recurrence_pattern === 'monthly' ||
					task.recurrence_pattern === 'quarterly' ||
					task.recurrence_pattern === 'yearly'
						? task.recurrence_pattern
						: undefined,
				recurrence_ends:
					typeof task.recurrence_ends === 'string' ? task.recurrence_ends : undefined,
				event_id: typeof task.event_id === 'string' ? task.event_id : undefined,
				tags: Array.isArray(task.tags)
					? task.tags.filter((tag): tag is string => typeof tag === 'string')
					: undefined
			}));
	}

	// Start analysis automatically if requested
	$effect(() => {
		if (!browser) return;
		if (isOpen && autoStart && !analysisId && !analyzing && !analysisTriggered) {
			analysisTriggered = true; // Prevent re-triggering
			startAnalysis();
		}
	});

	// Auto-select high confidence suggestions, pre-populate modifications, and auto-expand tasks
	$effect(() => {
		if (suggestions && suggestions.length > 0 && !autoSelectProcessed) {
			const newSelected = new Set<string>();
			const newTasksExpanded = new Set<string>();
			suggestions.forEach((s) => {
				if (s.confidence_score && s.confidence_score >= 0.7) {
					newSelected.add(s.id);
				}
				newTasksExpanded.add(s.id);
				if (!modifiedSuggestions.has(s.id)) {
					modifiedSuggestions.set(s.id, {
						name: s.user_modified_name ?? s.suggested_name ?? undefined,
						description:
							s.user_modified_description ?? s.suggested_description ?? undefined
					});
				}
			});
			selectedSuggestions = newSelected;
			tasksExpanded = newTasksExpanded;
			modifiedSuggestions = new Map(modifiedSuggestions);
			autoSelectProcessed = true;
		}
	});

	// Initialize enabled tasks
	// Note: LLM should only suggest tasks with future dates, so we enable all by default
	// If past tasks are found, they will be visually marked but not auto-disabled
	$effect(() => {
		if (suggestions) {
			const newEnabledTasks: Record<string, boolean> = {};
			suggestions.forEach((suggestion) => {
				const tasks = parseSuggestedTasks(suggestion.suggested_tasks);
				tasks.forEach((_, index) => {
					const taskKey = `${suggestion.id}-${index}`;
					// Enable all tasks by default - LLM should only generate future tasks
					newEnabledTasks[taskKey] = true;
				});
			});
			enabledTasks = newEnabledTasks;
		}
	});

	// Helper functions for task management
	function isTaskInPast(task: SuggestionTaskView): boolean {
		if (!task.start_date) return false;
		const taskDate = new Date(task.start_date);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return taskDate < today;
	}

	function toggleTasksExpanded(suggestionId: string) {
		if (tasksExpanded.has(suggestionId)) {
			tasksExpanded.delete(suggestionId);
		} else {
			tasksExpanded.add(suggestionId);
		}
		tasksExpanded = new Set(tasksExpanded);
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '';
		try {
			return new Date(dateStr).toLocaleDateString();
		} catch {
			return dateStr;
		}
	}

	async function startAnalysis() {
		analyzing = true;
		try {
			if (typeof onStartAnalysis === 'function') {
				await onStartAnalysis({ daysBack, daysForward });
				return;
			}

			const response = await fetch('/api/calendar/analyze', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					daysBack,
					daysForward
				})
			});

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to analyze calendar');
			}

			const data = result.data;

			analysisId = data.analysisId;
			suggestions = data.suggestions || [];

			if (suggestions.length === 0) {
				toastService.info('No project patterns found in your calendar');
			}
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to analyze calendar events'
			);
			handleClose();
		} finally {
			analyzing = false;
		}
	}

	function toggleSuggestion(id: string) {
		if (selectedSuggestions.has(id)) {
			selectedSuggestions.delete(id);
		} else {
			selectedSuggestions.add(id);
		}
		selectedSuggestions = new Set(selectedSuggestions);
	}

	function toggleExpanded(id: string) {
		if (expandedSuggestions.has(id)) {
			expandedSuggestions.delete(id);
		} else {
			expandedSuggestions.add(id);
		}
		expandedSuggestions = new Set(expandedSuggestions);
	}

	async function handleCreateProjects() {
		if (selectedSuggestions.size === 0) return;

		processing = true;
		const selected = suggestions.filter((s) => selectedSuggestions.has(s.id));

		try {
			const suggestionsToProcess = selected.map((s) => {
				const modifications = modifiedSuggestions.get(s.id);

				// Collect task selections for this suggestion
				const taskSelections: Record<string, boolean> = {};
				let selectedTaskCount = 0;

				const tasks = parseSuggestedTasks(s.suggested_tasks);
				tasks.forEach((_, index) => {
					const taskKey = `${s.id}-${index}`;
					const isSelected = enabledTasks[taskKey] ?? true;
					taskSelections[taskKey] = isSelected;

					if (isSelected) {
						selectedTaskCount++;
					}
				});

				return {
					suggestionId: s.id,
					action: 'accept',
					selectedTaskCount,
					modifications: modifications
						? {
								name: modifications.name,
								description: modifications.description,
								includeTasks: true,
								taskSelections
							}
						: {
								includeTasks: true,
								taskSelections
							}
				};
			});

			const response = await fetch('/api/calendar/analyze/suggestions', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					suggestions: suggestionsToProcess
				})
			});

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to create projects');
			}

			const data = result.data;

			const successful = data.results?.filter((r: any) => r.success).length || 0;
			const failed = data.results?.filter((r: any) => !r.success).length || 0;

			// Calculate total tasks that will be created
			const totalSelectedTasks = suggestionsToProcess.reduce(
				(sum, s) => sum + (s.selectedTaskCount || 0),
				0
			);

			if (successful > 0) {
				const projectText = `${successful} project${successful > 1 ? 's' : ''}`;
				const taskText =
					totalSelectedTasks > 0
						? ` with ${totalSelectedTasks} task${totalSelectedTasks > 1 ? 's' : ''}`
						: '';
				toastService.success(`Created ${projectText}${taskText} from your calendar!`);
			}

			if (failed > 0) {
				const failedSuggestions = data.results?.filter((r: any) => !r.success) || [];
				const errorMessages = failedSuggestions.map((r: any) => r.error).filter(Boolean);

				if (errorMessages.length > 0) {
					toastService.error(
						`Failed to create ${failed} project${failed > 1 ? 's' : ''}: ${errorMessages[0]}`
					);
				} else {
					toastService.warning(
						`${failed} project${failed > 1 ? 's' : ''} failed to create`
					);
				}
			}

			handleClose();

			// Navigate to projects page
			await goto('/projects');
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to create projects'
			);
		} finally {
			processing = false;
		}
	}

	function handleClose() {
		isOpen = false;
		onClose?.();
		// Reset state
		selectedSuggestions = new Set();
		modifiedSuggestions = new Map();
		expandedSuggestions = new Set();
		analysisTriggered = false; // Reset flag to allow future analyses
		autoSelectProcessed = false; // Reset auto-select flag
		tasksExpanded = new Set();
		enabledTasks = {};
	}

	function formatConfidence(score: number | null): string {
		if (!score) return '0%';
		return `${Math.round(score * 100)}%`;
	}

	function getConfidenceColorClass(score: number | null): string {
		if (!score) return 'bg-muted text-muted-foreground';
		if (score >= 0.8)
			return 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300';
		if (score >= 0.6)
			return 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300';
		return 'bg-muted text-muted-foreground';
	}
</script>

{#snippet resultsContent()}
	<div
		class="space-y-3 px-3 sm:px-4 py-2 sm:py-3 {embedded
			? ''
			: 'border-b border-border bg-muted/50 flex-shrink-0'}"
	>
		{#if errorMessage}
			<div
				class="rounded-lg border border-border p-3 text-sm text-red-700 dark:text-red-300 tx tx-static tx-weak shadow-ink"
			>
				{errorMessage}
			</div>
		{/if}
		{#if !analyzing && !analysisId && suggestions.length === 0 && !autoStart}
			<!-- Date Range Selection (only show if not autoStart) -->
			<div
				class="bg-card rounded-lg p-3 border border-border shadow-ink tx tx-grid tx-weak wt-paper sp-block"
			>
				<h3 class="text-sm font-semibold text-foreground mb-2">Select Analysis Period</h3>
				<p class="text-sm text-muted-foreground mb-2">
					Choose how far back and forward to analyze your calendar
				</p>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label
							for="daysBack"
							class="block text-sm font-medium text-foreground mb-2"
						>
							Look back
						</label>
						<select
							id="daysBack"
							bind:value={daysBack}
							class="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-background shadow-ink-inner focus:outline-none focus:border-accent focus:ring-1 focus:ring-ring transition-colors"
						>
							<option value={30}>1 month</option>
							<option value={60}>2 months</option>
							<option value={90}>3 months</option>
						</select>
					</div>

					<div>
						<label
							for="daysForward"
							class="block text-sm font-medium text-foreground mb-2"
						>
							Look forward
						</label>
						<select
							id="daysForward"
							bind:value={daysForward}
							class="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-background shadow-ink-inner focus:outline-none focus:border-accent focus:ring-1 focus:ring-ring transition-colors"
						>
							<option value={30}>1 month</option>
							<option value={60}>2 months (default)</option>
							<option value={90}>3 months</option>
							<option value={180}>6 months</option>
							<option value={365}>1 year</option>
						</select>
					</div>
				</div>

				<div class="mt-3 flex justify-center">
					<Button
						variant="primary"
						onclick={() => {
							analysisTriggered = true;
							startAnalysis();
						}}
						class="px-4 py-2"
					>
						Start Analysis
					</Button>
				</div>
			</div>
		{:else if analyzing}
			<!-- Loading State -->
			<div class="flex flex-col items-center justify-center py-8">
				<!-- Loader Container with Gradient Background -->
				<div class="mb-3">
					<div class="hidden"></div>
					<div class="bg-accent/10 p-4 rounded-full border border-accent/20 shadow-ink">
						<LoaderCircle class="w-8 h-8 text-accent animate-spin" />
					</div>
				</div>

				<!-- Loading Text -->
				<h3 class="text-sm font-semibold text-foreground mb-2">Analyzing Your Calendar</h3>
				<p class="text-sm text-muted-foreground text-center">
					Looking for project patterns in your meetings and events. This typically takes
					10-30 seconds...
				</p>

				<!-- Progress Indicator -->
				<div class="mt-3 flex items-center gap-2">
					<div class="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
					<div
						class="w-2 h-2 bg-accent rounded-full animate-pulse"
						style="animation-delay: 0.2s"
					></div>
					<div
						class="w-2 h-2 bg-accent rounded-full animate-pulse"
						style="animation-delay: 0.4s"
					></div>
				</div>
			</div>
		{:else if suggestions.length > 0}
			<!-- Summary -->
			<div
				class="bg-card rounded-lg p-3 border border-border shadow-ink tx tx-frame tx-weak wt-card"
			>
				<div class="flex items-center justify-between">
					<div>
						<h3 class="text-sm font-semibold text-foreground">
							Found {suggestions.length} potential project{suggestions.length !== 1
								? 's'
								: ''}
						</h3>
						<p class="text-sm text-muted-foreground mt-1">
							Review and select the projects you'd like to create
						</p>
					</div>
					<div class="bg-card p-3 rounded shadow-ink">
						<Calendar class="w-8 h-8 text-accent" />
					</div>
				</div>
			</div>

			<!-- Suggestions List -->
			<div class="space-y-2 max-h-[500px] overflow-y-auto pr-2 -mx-2 px-2">
				{#each suggestions as suggestion}
					{@const isSelected = selectedSuggestions.has(suggestion.id)}
					{@const isExpanded = expandedSuggestions.has(suggestion.id)}
					{@const confidence = suggestion.confidence_score || 0}
					{@const modifications = modifiedSuggestions.get(suggestion.id)}
					{@const tasks = parseSuggestedTasks(suggestion.suggested_tasks)}
					{@const patterns = suggestion.event_patterns as EventPatternsData | null}

					<div
						class="border rounded-lg p-3 transition-colors shadow-ink tx tx-bloom tx-weak wt-paper sp-block {isSelected
							? 'border-accent bg-accent/5'
							: 'border-border'}"
					>
						<div class="flex items-start gap-3">
							<!-- Selection Indicator -->
							<button
								onclick={() => toggleSuggestion(suggestion.id)}
								class="mt-1 flex-shrink-0 transition-transform duration-200 hover:scale-110"
								disabled={processing}
							>
								{#if isSelected}
									<CheckCircle class="w-5 h-5 text-accent" />
								{:else}
									<Circle class="w-5 h-5 text-muted-foreground" />
								{/if}
							</button>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2">
									<div class="flex-1">
										<input
											type="text"
											value={modifications?.name ??
												suggestion.suggested_name ??
												''}
											oninput={(e) => {
												const mods =
													modifiedSuggestions.get(suggestion.id) ?? {};
												mods.name = e.currentTarget.value;
												modifiedSuggestions.set(suggestion.id, mods);
												modifiedSuggestions = new Map(modifiedSuggestions);
											}}
											class="w-full text-sm font-semibold text-foreground bg-transparent border-0 border-b border-transparent hover:border-border focus:border-accent outline-none p-0 pb-0.5 transition-colors"
											placeholder="Project name"
											disabled={processing}
										/>
										<input
											type="text"
											value={modifications?.description ??
												suggestion.suggested_description ??
												''}
											oninput={(e) => {
												const mods =
													modifiedSuggestions.get(suggestion.id) ?? {};
												mods.description = e.currentTarget.value;
												modifiedSuggestions.set(suggestion.id, mods);
												modifiedSuggestions = new Map(modifiedSuggestions);
											}}
											class="w-full text-sm text-muted-foreground bg-transparent border-0 border-b border-transparent hover:border-border focus:border-accent outline-none p-0 pb-0.5 mt-1 transition-colors"
											placeholder="Project description"
											disabled={processing}
										/>
									</div>

									<!-- Confidence Badge -->
									<span
										class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full shadow-ink border border-border {getConfidenceColorClass(
											confidence
										)}"
									>
										{formatConfidence(confidence)} confidence
									</span>
								</div>

								<!-- Metadata -->
								<div
									class="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground"
								>
									<span class="flex items-center gap-1.5">
										<Calendar class="w-4 h-4" />
										{suggestion.event_count ||
											suggestion.calendar_event_ids?.length ||
											0} events
									</span>

									{#if tasks && Array.isArray(tasks) && tasks.length > 0}
										<span class="flex items-center gap-1.5">
											<TrendingUp class="w-4 h-4" />
											{tasks.length} suggested task{tasks.length !== 1
												? 's'
												: ''}
										</span>
									{/if}
								</div>

								<!-- Expandable Tasks Section -->
								{#if tasks && Array.isArray(tasks) && tasks.length > 0}
									{@const tasksAreExpanded = tasksExpanded.has(suggestion.id)}
									<button
										class="flex items-center gap-2 mt-4 text-sm text-muted-foreground hover:text-accent transition-all duration-200"
										onclick={() => toggleTasksExpanded(suggestion.id)}
									>
										<span
											>View {tasks.length} suggested task{tasks.length !== 1
												? 's'
												: ''}</span
										>
										{#if tasksAreExpanded}
											<ChevronUp
												class="w-4 h-4 transition-transform duration-200"
											/>
										{:else}
											<ChevronDown
												class="w-4 h-4 transition-transform duration-200"
											/>
										{/if}
									</button>

									{#if tasksAreExpanded}
										<div
											class="mt-3 space-y-1.5 pl-4 border-l-2 border-accent/20"
										>
											{#each tasks as task, index}
												{@const taskKey = `${suggestion.id}-${index}`}
												{@const isPastTask = isTaskInPast(task)}

												<div
													class="p-3 rounded transition-all duration-200 {isPastTask
														? 'bg-amber-50 dark:bg-amber-900/20'
														: 'bg-muted/50'}"
												>
													<!-- Task Header -->
													<div class="flex items-start gap-3">
														<input
															type="checkbox"
															bind:checked={enabledTasks[taskKey]}
															disabled={processing}
															class="mt-1 w-4 h-4 text-accent border-border rounded focus:ring-ring"
														/>
														<div class="flex-1 min-w-0">
															<!-- Enhanced Task Display - All Fields -->
															<div
																class="flex items-start justify-between"
															>
																<div class="flex-1 min-w-0">
																	<!-- Title + Status + Past Task Badge -->
																	<div
																		class="flex items-center gap-2 mb-2"
																	>
																		<input
																			type="text"
																			value={task.title}
																			oninput={(e) => {
																				const arr =
																					suggestion.suggested_tasks;
																				if (
																					Array.isArray(
																						arr
																					) &&
																					arr[index]
																				) {
																					(
																						arr[
																							index
																						] as Record<
																							string,
																							unknown
																						>
																					).title =
																						e.currentTarget.value;
																				}
																			}}
																			class="font-medium text-foreground text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-accent outline-none p-0 pb-0.5 flex-1 min-w-0 transition-colors"
																			placeholder="Task name"
																			disabled={processing}
																		/>
																		{#if task.status}
																			<span
																				class="px-2 py-0.5 text-xs rounded-full font-medium
																				{task.status === 'done'
																					? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
																					: task.status ===
																						  'in_progress'
																						? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
																						: task.status ===
																							  'blocked'
																							? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
																							: 'bg-muted text-foreground/30 dark:text-muted-foreground'}"
																			>
																				{task.status.replace(
																					'_',
																					' '
																				)}
																			</span>
																		{/if}
																		{#if isPastTask}
																			<span
																				class="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full"
																			>
																				Past Event
																			</span>
																		{/if}
																	</div>

																	<!-- Description -->
																	{#if task.description}
																		<p
																			class="text-sm text-muted-foreground mb-2"
																		>
																			{task.description}
																		</p>
																	{/if}

																	<!-- Details (if present) -->
																	{#if task.details}
																		<div
																			class="text-xs text-muted-foreground mb-2 p-2 bg-card rounded border border-border"
																		>
																			<strong
																				class="text-foreground"
																				>Details:</strong
																			>
																			<p
																				class="mt-1 whitespace-pre-wrap"
																			>
																				{task.details}
																			</p>
																		</div>
																	{/if}

																	<!-- Metadata Grid -->
																	<div
																		class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
																	>
																		<!-- Priority -->
																		{#if task.priority}
																			<span
																				class="inline-flex px-2 py-0.5 rounded-full font-medium
																				{task.priority === 'high'
																					? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
																					: task.priority ===
																						  'medium'
																						? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
																						: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}"
																			>
																				{task.priority} priority
																			</span>
																		{/if}

																		<!-- Task Type -->
																		{#if task.task_type}
																			<span
																				class="flex items-center gap-1"
																			>
																				{#if task.task_type === 'recurring'}
																					<Repeat
																						class="w-3 h-3"
																					/>
																					Recurring
																				{:else}
																					<Calendar
																						class="w-3 h-3"
																					/>
																					One-time
																				{/if}
																			</span>
																		{/if}

																		<!-- Start Date -->
																		{#if task.start_date}
																			<span
																				class="flex items-center gap-1"
																			>
																				<Calendar
																					class="w-3 h-3"
																				/>
																				{formatDate(
																					task.start_date
																				)}
																			</span>
																		{/if}

																		<!-- Duration -->
																		{#if task.duration_minutes}
																			<span
																				class="flex items-center gap-1"
																			>
																				<Clock
																					class="w-3 h-3"
																				/>
																				{task.duration_minutes}min
																			</span>
																		{/if}

																		<!-- Recurrence Pattern (if recurring) -->
																		{#if task.task_type === 'recurring' && task.recurrence_pattern}
																			<span
																				class="flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded-full"
																			>
																				<Repeat
																					class="w-3 h-3"
																				/>
																				{task.recurrence_pattern.replace(
																					'_',
																					' '
																				)}
																				{#if task.recurrence_ends}
																					until {new Date(
																						task.recurrence_ends
																					).toLocaleDateString()}
																				{/if}
																			</span>
																		{/if}
																	</div>

																	<!-- Tags (if present) -->
																	{#if task.tags && task.tags.length > 0}
																		<div
																			class="flex flex-wrap gap-1.5 mt-2"
																		>
																			{#each task.tags as tag}
																				<span
																					class="inline-flex px-2 py-0.5 text-xs font-medium bg-muted text-foreground rounded-full"
																				>
																					{tag}
																				</span>
																			{/each}
																		</div>
																	{/if}

																	<!-- Linked Event (if present) -->
																	{#if task.event_id}
																		<div
																			class="text-xs text-muted-foreground mt-2 flex items-center gap-1"
																		>
																			<Calendar
																				class="w-3 h-3"
																			/>
																			Linked to calendar event
																		</div>
																	{/if}
																</div>
															</div>
														</div>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								{/if}

								<!-- AI Reasoning (expandable) -->
								{#if suggestion.ai_reasoning}
									<button
										class="flex items-center gap-2 mt-4 text-sm text-muted-foreground hover:text-accent transition-all duration-200"
										onclick={() => toggleExpanded(suggestion.id)}
									>
										<span>Why this was suggested</span>
										{#if isExpanded}
											<ChevronUp
												class="w-4 h-4 transition-transform duration-200"
											/>
										{:else}
											<ChevronDown
												class="w-4 h-4 transition-transform duration-200"
											/>
										{/if}
									</button>

									{#if isExpanded}
										<div
											class="clarity-zone mt-4 p-4 border-l-2 border-accent/20"
										>
											<p
												class="text-sm text-muted-foreground leading-relaxed"
											>
												{suggestion.ai_reasoning}
											</p>

											{#if patterns && (patterns?.start_date || patterns?.end_date)}
												<div
													class="mt-3 flex items-center gap-4 text-sm text-muted-foreground"
												>
													{#if patterns?.start_date}
														<span
															>Start: {new Date(
																patterns.start_date
															).toLocaleDateString()}</span
														>
													{/if}
													{#if patterns?.end_date}
														<span
															>End: {new Date(
																patterns.end_date
															).toLocaleDateString()}</span
														>
													{/if}
												</div>
											{/if}

											{#if suggestion.detected_keywords?.length}
												<div class="mt-3 flex flex-wrap gap-2">
													<span class="text-xs text-muted-foreground"
														>Keywords detected:
													</span>
													{#each suggestion.detected_keywords as keyword}
														<span
															class="inline-flex px-2 py-1 text-xs font-medium bg-muted text-foreground rounded-full"
														>
															{keyword}
														</span>
													{/each}
												</div>
											{/if}

											{#if patterns && patterns?.tags?.length}
												<div class="mt-3 flex flex-wrap gap-2">
													<span class="text-xs text-muted-foreground"
														>Project tags:
													</span>
													{#each patterns.tags as tag}
														<span
															class="inline-flex px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-full"
														>
															{tag}
														</span>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- No suggestions -->
			<div class="text-center py-8">
				<div class="bg-muted p-3 rounded-full inline-block mb-3">
					<Calendar class="w-12 h-12 text-muted-foreground" />
				</div>
				<p class="text-lg font-medium text-foreground">
					No project patterns found in your calendar
				</p>
				<p class="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
					This might be because your events are mostly one-off meetings or personal
					appointments
				</p>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet resultsFooter()}
	<div
		class="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 {embedded
			? ''
			: 'border-t border-border bg-muted/50'}"
	>
		{#if !analyzing}
			<div class="text-sm text-muted-foreground font-medium">
				{#if suggestions.length > 0}
					<span class="text-accent">{selectedSuggestions.size}</span>
					of {suggestions.length} selected
				{/if}
			</div>

			<div class="flex items-center gap-3">
				<Button
					variant="secondary"
					onclick={handleClose}
					disabled={processing}
					class="px-4 py-2"
				>
					{suggestions.length > 0 ? 'Cancel' : 'Close'}
				</Button>
				{#if suggestions.length > 0}
					<Button
						variant="primary"
						onclick={handleCreateProjects}
						disabled={selectedSuggestions.size === 0 || processing}
						loading={processing}
						class="px-4 py-2"
					>
						Create {selectedSuggestions.size} Project{selectedSuggestions.size !== 1
							? 's'
							: ''}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<!-- Render with or without Modal wrapper depending on embedded mode -->
{#if embedded}
	<!-- Embedded mode: render content directly without Modal wrapper -->
	{@render resultsContent()}
	{@render resultsFooter()}
{:else}
	<!-- Standalone mode: wrap in Modal -->
	<Modal
		{isOpen}
		onClose={handleClose}
		title="Calendar Analysis Results"
		size="xl"
		showCloseButton={!analyzing && !processing}
		closeOnBackdrop={true}
		closeOnEscape={true}
	>
		{@render resultsContent()}
		{#snippet footer()}
			<div>
				{@render resultsFooter()}
			</div>
		{/snippet}
	</Modal>
{/if}
