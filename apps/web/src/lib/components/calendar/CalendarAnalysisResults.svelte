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
		AlertTriangle,
		Calendar,
		Users,
		TrendingUp,
		Edit2,
		ChevronDown,
		ChevronUp,
		LoaderCircle,
		Clock,
		Edit3,
		Repeat
	} from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';
	import CalendarTaskEditModal from './CalendarTaskEditModal.svelte';
	import type { SuggestedTask } from '$lib/utils/calendar-task-field-config';

	type CalendarProjectSuggestion =
		Database['public']['Tables']['calendar_project_suggestions']['Row'];

	interface EventPatternsData {
		executive_summary?: string;
		start_date?: string;
		end_date?: string;
		tags?: string[];
		slug?: string;
		recurring?: boolean;
		common_attendees?: string[];
		add_to_existing?: boolean;
		existing_project_id?: string;
		deduplication_reasoning?: string;
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
	let editingSuggestion = $state<string | null>(null);
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
	let editingTaskKey = $state<string | null>(null);
	let editingTaskData = $state<SuggestedTask | null>(null);
	let isTaskEditModalOpen = $state(false);

	// Start analysis automatically if requested
	$effect(() => {
		if (!browser) return;
		if (isOpen && autoStart && !analysisId && !analyzing && !analysisTriggered) {
			analysisTriggered = true; // Prevent re-triggering
			startAnalysis();
		}
	});

	// Auto-select high confidence suggestions (only once when suggestions are loaded)
	$effect(() => {
		if (suggestions && suggestions.length > 0 && !autoSelectProcessed) {
			const newSelected = new Set<string>();
			suggestions.forEach((s) => {
				if (s.confidence_score && s.confidence_score >= 0.7) {
					newSelected.add(s.id);
				}
			});
			selectedSuggestions = newSelected;
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
				const tasks = suggestion.suggested_tasks;
				if (tasks && Array.isArray(tasks)) {
					tasks.forEach((task, index) => {
						const taskKey = `${suggestion.id}-${index}`;
						// Enable all tasks by default - LLM should only generate future tasks
						newEnabledTasks[taskKey] = true;
					});
				}
			});
			enabledTasks = newEnabledTasks;
		}
	});

	// Helper functions for task management
	function isTaskInPast(task: any): boolean {
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

	function startEditingTask(suggestionId: string, taskIndex: number) {
		const suggestion = suggestions.find((s) => s.id === suggestionId);
		const task = suggestion?.suggested_tasks?.[taskIndex];

		if (task) {
			editingTaskKey = `${suggestionId}-${taskIndex}`;
			editingTaskData = { ...task } as SuggestedTask;
			isTaskEditModalOpen = true;
		}
	}

	function handleTaskSave(updatedTask: SuggestedTask) {
		if (!editingTaskKey) return;

		const [suggestionId, indexStr] = editingTaskKey.split('-');
		const taskIndex = parseInt(indexStr, 10);

		const suggestion = suggestions.find((s) => s.id === suggestionId);
		if (suggestion && suggestion.suggested_tasks && Array.isArray(suggestion.suggested_tasks)) {
			suggestion.suggested_tasks[taskIndex] = updatedTask;
			suggestions = [...suggestions]; // Trigger reactivity
			toastService.success('Task updated successfully');
		}

		isTaskEditModalOpen = false;
		editingTaskKey = null;
		editingTaskData = null;
	}

	function handleTaskEditClose() {
		isTaskEditModalOpen = false;
		editingTaskKey = null;
		editingTaskData = null;
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

	function startEditingSuggestion(id: string) {
		editingSuggestion = id;
		const suggestion = suggestions.find((s) => s.id === id);
		if (suggestion) {
			// Always set/update the modifications when starting to edit
			const currentMods = modifiedSuggestions.get(id);
			modifiedSuggestions.set(id, {
				name:
					currentMods?.name || suggestion.user_modified_name || suggestion.suggested_name,
				description:
					currentMods?.description ||
					suggestion.user_modified_description ||
					suggestion.suggested_description
			});
			modifiedSuggestions = new Map(modifiedSuggestions); // Trigger reactivity
		}
	}

	function saveEditingSuggestion() {
		editingSuggestion = null;
	}

	function cancelEditingSuggestion(id: string) {
		modifiedSuggestions.delete(id);
		editingSuggestion = null;
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

				if (s.suggested_tasks && Array.isArray(s.suggested_tasks)) {
					s.suggested_tasks.forEach((_, index) => {
						const taskKey = `${s.id}-${index}`;
						const isSelected = enabledTasks[taskKey] ?? true;
						taskSelections[taskKey] = isSelected;

						if (isSelected) {
							selectedTaskCount++;
						}
					});
				}

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
		editingSuggestion = null;
		modifiedSuggestions = new Map();
		expandedSuggestions = new Set();
		analysisTriggered = false; // Reset flag to allow future analyses
		autoSelectProcessed = false; // Reset auto-select flag
		// Reset task state
		tasksExpanded = new Set();
		enabledTasks = {};
		editingTaskKey = null;
		editingTaskData = null;
		isTaskEditModalOpen = false;
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
		class="space-y-6 px-4 sm:px-6 py-3 sm:py-4 {embedded
			? ''
			: 'border-b border-border bg-muted/50 flex-shrink-0'}"
	>
		{#if errorMessage}
			<div
				class="rounded border border-red-300 bg-red-50/80 p-4 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-200"
			>
				{errorMessage}
			</div>
		{/if}
		{#if !analyzing && !analysisId && suggestions.length === 0 && !autoStart}
			<!-- Date Range Selection (only show if not autoStart) -->
			<div class="bg-accent/10 rounded p-6 border border-accent/20 shadow-ink mx-1">
				<h3 class="text-lg font-semibold text-foreground mb-4">Select Analysis Period</h3>
				<p class="text-sm text-muted-foreground mb-6">
					Choose how far back and forward to analyze your calendar
				</p>

				<div class="grid grid-cols-2 gap-6">
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
							class="w-full rounded border border-border px-4 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 transition-all duration-200"
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
							class="w-full rounded border border-border px-4 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 transition-all duration-200"
						>
							<option value={30}>1 month</option>
							<option value={60}>2 months (default)</option>
							<option value={90}>3 months</option>
							<option value={180}>6 months</option>
							<option value={365}>1 year</option>
						</select>
					</div>
				</div>

				<div class="mt-6 flex justify-center">
					<Button
						variant="primary"
						onclick={() => {
							analysisTriggered = true;
							startAnalysis();
						}}
						class="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
					>
						Start Analysis
					</Button>
				</div>
			</div>
		{:else if analyzing}
			<!-- Loading State -->
			<div class="flex flex-col items-center justify-center py-16">
				<!-- Loader Container with Gradient Background -->
				<div class="relative mb-6">
					<div
						class="absolute inset-0 bg-gradient-to-br from-blue-400 to-purple-600 dark:from-blue-500 dark:to-purple-500 rounded-full blur-xl opacity-20 animate-pulse"
					></div>
					<div
						class="relative bg-accent/10 p-5 rounded-full border border-accent/20 shadow-ink-strong"
					>
						<LoaderCircle
							class="w-12 h-12 text-purple-600 dark:text-purple-400 animate-spin"
						/>
					</div>
				</div>

				<!-- Loading Text -->
				<h3 class="text-xl font-semibold text-foreground mb-3">Analyzing Your Calendar</h3>
				<p class="text-base text-muted-foreground text-center max-w-md leading-relaxed">
					Looking for project patterns in your meetings and events. This typically takes
					10-30 seconds...
				</p>

				<!-- Progress Indicator -->
				<div class="mt-6 flex items-center gap-2">
					<div
						class="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-pulse"
					></div>
					<div
						class="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-pulse"
						style="animation-delay: 0.2s"
					></div>
					<div
						class="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-pulse"
						style="animation-delay: 0.4s"
					></div>
				</div>
			</div>
		{:else if suggestions.length > 0}
			<!-- Summary -->
			<div
				class="clarity-zone bg-accent/10 rounded p-6 border border-accent/20 shadow-ink mx-1"
			>
				<div class="flex items-center justify-between">
					<div>
						<h3 class="text-lg font-semibold text-foreground">
							Found {suggestions.length} potential project{suggestions.length !== 1
								? 's'
								: ''}
						</h3>
						<p class="text-sm text-muted-foreground mt-2">
							Review and select the projects you'd like to create
						</p>
					</div>
					<div class="bg-card p-3 rounded shadow-ink">
						<Calendar class="w-8 h-8 text-purple-600 dark:text-purple-400" />
					</div>
				</div>
			</div>

			<!-- Suggestions List -->
			<div class="space-y-4 max-h-[500px] overflow-y-auto pr-2 -mx-2 px-2">
				{#each suggestions as suggestion}
					{@const isSelected = selectedSuggestions.has(suggestion.id)}
					{@const isExpanded = expandedSuggestions.has(suggestion.id)}
					{@const isEditing = editingSuggestion === suggestion.id}
					{@const confidence = suggestion.confidence_score || 0}
					{@const modifications = modifiedSuggestions.get(suggestion.id)}
					{@const tasks = suggestion.suggested_tasks}
					{@const patterns = suggestion.event_patterns as EventPatternsData | null}

					<div
						class="border-2 rounded p-6 transition-all duration-300 hover:shadow-ink {isSelected
							? 'border-purple-500 dark:border-purple-400 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20'
							: 'clarity-zone border-border'}"
					>
						<div class="flex items-start gap-4">
							<!-- Selection Indicator -->
							<button
								onclick={() => toggleSuggestion(suggestion.id)}
								class="mt-1 flex-shrink-0 transition-transform duration-200 hover:scale-110"
								disabled={processing}
							>
								{#if isSelected}
									<CheckCircle
										class="w-6 h-6 text-purple-600 dark:text-purple-400"
									/>
								{:else}
									<Circle
										class="w-6 h-6 text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground"
									/>
								{/if}
							</button>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2">
									<div class="flex-1">
										{#if isEditing && modifications}
											<input
												type="text"
												bind:value={modifications.name}
												placeholder={suggestion.suggested_name}
												class="w-full rounded border border-border px-4 py-2.5 mb-3 text-base text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 transition-all duration-200"
											/>
											<textarea
												bind:value={modifications.description}
												placeholder={suggestion.suggested_description}
												class="w-full rounded border border-border px-4 py-2.5 text-sm text-muted-foreground bg-card focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 transition-all duration-200"
												rows="2"
											></textarea>
										{:else}
											<h4 class="text-lg font-semibold text-foreground">
												{modifications?.name || suggestion.suggested_name}
											</h4>
											<p
												class="text-sm text-muted-foreground mt-2 leading-relaxed"
											>
												{modifications?.description ||
													suggestion.suggested_description}
											</p>

											<!-- Deduplication Notice -->
											{#if patterns?.add_to_existing && patterns?.existing_project_id}
												<div
													class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800/50"
												>
													<p
														class="text-sm text-blue-700 dark:text-blue-300 font-medium"
													>
														💡 Matches existing project
													</p>
													<p
														class="text-xs text-blue-600 dark:text-blue-400 mt-1"
													>
														{patterns.deduplication_reasoning ||
															'Tasks will be added to your existing project instead of creating a duplicate.'}
													</p>
												</div>
											{/if}
										{/if}
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
									class="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground"
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

									{#if patterns && patterns?.recurring}
										<span class="flex items-center gap-1.5">
											<TrendingUp class="w-4 h-4" />
											Recurring
										</span>
									{/if}

									{#if patterns && patterns?.common_attendees?.length}
										<span class="flex items-center gap-1.5">
											<Users class="w-4 h-4" />
											{patterns.common_attendees.length} people
										</span>
									{/if}
								</div>

								<!-- Expandable Tasks Section -->
								{#if tasks && Array.isArray(tasks) && tasks.length > 0}
									{@const tasksAreExpanded = tasksExpanded.has(suggestion.id)}
									<button
										class="flex items-center gap-2 mt-4 text-sm text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 transition-all duration-200"
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
											class="mt-4 space-y-2 pl-6 border-l-2 border-purple-200 dark:border-purple-800"
										>
											{#each tasks as task, index}
												{@const taskKey = `${suggestion.id}-${index}`}
												{@const isPastTask = isTaskInPast(task)}
												{@const isTaskEnabled =
													enabledTasks[taskKey] ?? true}

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
															class="mt-1 w-4 h-4 text-purple-600 border-border rounded focus:ring-purple-500"
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
																		<h5
																			class="font-medium text-foreground text-sm"
																		>
																			{task.title}
																		</h5>
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
																				class="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full"
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

																<!-- Edit Button -->
																<Button
																	size="sm"
																	variant="ghost"
																	icon={Edit3}
																	onclick={() =>
																		startEditingTask(
																			suggestion.id,
																			index
																		)}
																	disabled={processing}
																	class="ml-2 !p-1.5 flex-shrink-0"
																	title="Edit task"
																/>
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
										class="flex items-center gap-2 mt-4 text-sm text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 transition-all duration-200"
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
											class="clarity-zone mt-4 p-4 border-l-2 border-purple-200 dark:border-purple-800/50"
										>
											<p
												class="text-sm text-muted-foreground leading-relaxed"
											>
												{suggestion.ai_reasoning}
											</p>

											{#if patterns && patterns?.executive_summary}
												<div
													class="mt-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded"
												>
													<p
														class="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1"
													>
														Executive Summary:
													</p>
													<p
														class="text-sm text-purple-600 dark:text-purple-400"
													>
														{patterns.executive_summary}
													</p>
												</div>
											{/if}

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
													<span
														class="text-xs text-muted-foreground"
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
													<span
														class="text-xs text-muted-foreground"
														>Project tags:
													</span>
													{#each patterns.tags as tag}
														<span
															class="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-700 text-blue-700 dark:text-blue-300 rounded-full"
														>
															{tag}
														</span>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								{/if}

								<!-- Actions -->
								<div
									class="flex items-center gap-3 mt-4 pt-4 border-t border-border"
								>
									{#if isEditing}
										<Button
											size="sm"
											variant="primary"
											onclick={saveEditingSuggestion}
											class="px-4 py-2"
										>
											Save
										</Button>
										<Button
											size="sm"
											variant="secondary"
											onclick={() => cancelEditingSuggestion(suggestion.id)}
											class="px-4 py-2"
										>
											Cancel
										</Button>
									{:else}
										<button
											class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 rounded transition-all duration-200"
											onclick={() => startEditingSuggestion(suggestion.id)}
											disabled={processing}
										>
											<Edit2 class="w-4 h-4" />
											Edit
										</button>
										<button
											class="px-3 py-1.5 text-sm text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 rounded transition-all duration-200"
											onclick={() => toggleSuggestion(suggestion.id)}
											disabled={processing}
										>
											{isSelected ? 'Deselect' : 'Select'}
										</button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- No suggestions -->
			<div class="text-center py-12">
				<div
					class="bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/30 dark:to-slate-800/30 p-4 rounded-full inline-block mb-4"
				>
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
		class="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 {embedded
			? ''
			: 'border-t border-border bg-muted/50'}"
	>
		{#if !analyzing}
			<div class="text-sm text-muted-foreground font-medium">
				{#if suggestions.length > 0}
					<span class="text-purple-600 dark:text-purple-400"
						>{selectedSuggestions.size}</span
					>
					of {suggestions.length} selected
				{/if}
			</div>

			<div class="flex items-center gap-3">
				<Button
					variant="secondary"
					onclick={handleClose}
					disabled={processing}
					class="px-6 py-2.5"
				>
					{suggestions.length > 0 ? 'Cancel' : 'Close'}
				</Button>
				{#if suggestions.length > 0}
					<Button
						variant="primary"
						onclick={handleCreateProjects}
						disabled={selectedSuggestions.size === 0 || processing}
						loading={processing}
						class="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0"
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

<!-- Task Edit Modal -->
{#if isTaskEditModalOpen && editingTaskData}
	<CalendarTaskEditModal
		isOpen={isTaskEditModalOpen}
		task={editingTaskData}
		onSave={handleTaskSave}
		onClose={handleTaskEditClose}
	/>
{/if}
