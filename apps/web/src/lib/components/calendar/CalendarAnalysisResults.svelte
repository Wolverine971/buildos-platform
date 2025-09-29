<script lang="ts">
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
		Loader2
	} from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';

	type CalendarProjectSuggestion =
		Database['public']['Tables']['calendar_project_suggestions']['Row'];

	interface Props {
		isOpen: boolean;
		analysisId?: string;
		suggestions?: CalendarProjectSuggestion[];
		autoStart?: boolean;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		analysisId,
		suggestions = $bindable([]),
		autoStart = false,
		onClose
	}: Props = $props();

	let selectedSuggestions = $state(new Set<string>());
	let editingSuggestion = $state<string | null>(null);
	let processing = $state(false);
	let analyzing = $state(false);
	let expandedSuggestions = $state(new Set<string>());
	let modifiedSuggestions = $state<Map<string, { name?: string; description?: string }>>(
		new Map()
	);

	// Start analysis automatically if requested
	$effect(() => {
		if (isOpen && autoStart && !analysisId && !analyzing) {
			startAnalysis();
		}
	});

	// Auto-select high confidence suggestions
	$effect(() => {
		if (suggestions && suggestions.length > 0) {
			suggestions.forEach((s) => {
				if (s.confidence_score && s.confidence_score >= 0.7) {
					selectedSuggestions.add(s.id);
				}
			});
			// Force reactivity
			selectedSuggestions = new Set(selectedSuggestions);
		}
	});

	async function startAnalysis() {
		analyzing = true;
		try {
			const response = await fetch('/api/calendar/analyze', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					daysBack: 30,
					daysForward: 60
				})
			});

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || 'Failed to analyze calendar');
			}

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
		if (suggestion && !modifiedSuggestions.has(id)) {
			modifiedSuggestions.set(id, {
				name: suggestion.user_modified_name || suggestion.suggested_name,
				description:
					suggestion.user_modified_description || suggestion.suggested_description
			});
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
				return {
					suggestionId: s.id,
					action: 'accept',
					modifications: modifications
						? {
								name: modifications.name,
								description: modifications.description,
								includeTasks: true
							}
						: { includeTasks: true }
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

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || 'Failed to create projects');
			}

			const successful = data.results?.filter((r: any) => r.success).length || 0;
			const failed = data.results?.filter((r: any) => !r.success).length || 0;

			if (successful > 0) {
				toastService.success(
					`Created ${successful} project${successful > 1 ? 's' : ''} from your calendar!`
				);
			}

			if (failed > 0) {
				toastService.warning(`${failed} project${failed > 1 ? 's' : ''} failed to create`);
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
	}

	function formatConfidence(score: number | null): string {
		if (!score) return '0%';
		return `${Math.round(score * 100)}%`;
	}

	function getConfidenceColorClass(score: number | null): string {
		if (!score) return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
		if (score >= 0.8)
			return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
		if (score >= 0.6)
			return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
		return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
	}
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	title="Calendar Analysis Results"
	size="xl"
	showCloseButton={!analyzing && !processing}
	closeOnBackdrop={false}
	closeOnEscape={false}
>
	<div class="space-y-6">
		{#if analyzing}
			<!-- Loading State -->
			<div class="flex flex-col items-center justify-center py-12">
				<Loader2 class="w-12 h-12 text-purple-500 animate-spin mb-4" />
				<h3 class="text-lg font-medium text-gray-900 mb-2">Analyzing Your Calendar</h3>
				<p class="text-sm text-gray-600 text-center max-w-sm">
					Looking for project patterns in your meetings and events. This typically takes
					10-30 seconds...
				</p>
			</div>
		{:else if suggestions.length > 0}
			<!-- Summary -->
			<div
				class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-100"
			>
				<div class="flex items-center justify-between">
					<div>
						<h3 class="font-medium text-gray-900">
							Found {suggestions.length} potential project{suggestions.length !== 1
								? 's'
								: ''}
						</h3>
						<p class="text-sm text-gray-600 mt-1">
							Review and select the projects you'd like to create
						</p>
					</div>
					<Calendar class="w-8 h-8 text-purple-500" />
				</div>
			</div>

			<!-- Suggestions List -->
			<div class="space-y-4 max-h-[400px] overflow-y-auto">
				{#each suggestions as suggestion}
					{@const isSelected = selectedSuggestions.has(suggestion.id)}
					{@const isExpanded = expandedSuggestions.has(suggestion.id)}
					{@const isEditing = editingSuggestion === suggestion.id}
					{@const confidence = suggestion.confidence_score || 0}
					{@const modifications = modifiedSuggestions.get(suggestion.id)}

					<div
						class="border rounded-lg p-4 transition-all"
						class:border-purple-500={isSelected}
						class:bg-purple-50={isSelected}
						class:border-gray-200={!isSelected}
					>
						<div class="flex items-start gap-4">
							<!-- Selection Indicator -->
							<button
								on:click={() => toggleSuggestion(suggestion.id)}
								class="mt-1 flex-shrink-0"
								disabled={processing}
							>
								{#if isSelected}
									<CheckCircle class="w-5 h-5 text-purple-600" />
								{:else}
									<Circle class="w-5 h-5 text-gray-400" />
								{/if}
							</button>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2">
									<div class="flex-1">
										{#if isEditing}
											<input
												type="text"
												bind:value={modifications.name}
												placeholder={suggestion.suggested_name}
												class="w-full border rounded px-2 py-1 mb-2 text-gray-900"
											/>
											<textarea
												bind:value={modifications.description}
												placeholder={suggestion.suggested_description}
												class="w-full border rounded px-2 py-1 text-sm text-gray-600"
												rows="2"
											/>
										{:else}
											<h4 class="font-medium text-gray-900">
												{modifications?.name || suggestion.suggested_name}
											</h4>
											<p class="text-sm text-gray-600 mt-1">
												{modifications?.description ||
													suggestion.suggested_description}
											</p>
										{/if}
									</div>

									<!-- Confidence Badge -->
									<span
										class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md {getConfidenceColorClass(
											confidence
										)}"
									>
										{formatConfidence(confidence)} confidence
									</span>
								</div>

								<!-- Metadata -->
								<div class="flex items-center gap-4 mt-3 text-sm text-gray-500">
									<span class="flex items-center gap-1">
										<Calendar class="w-4 h-4" />
										{suggestion.event_count ||
											suggestion.calendar_event_ids?.length ||
											0} events
									</span>

									{#if suggestion.event_patterns?.recurring}
										<span class="flex items-center gap-1">
											<TrendingUp class="w-4 h-4" />
											Recurring
										</span>
									{/if}

									{#if suggestion.event_patterns?.common_attendees?.length}
										<span class="flex items-center gap-1">
											<Users class="w-4 h-4" />
											{suggestion.event_patterns.common_attendees.length} people
										</span>
									{/if}
								</div>

								<!-- AI Reasoning (expandable) -->
								{#if suggestion.ai_reasoning}
									<button
										class="flex items-center gap-1 mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
										on:click={() => toggleExpanded(suggestion.id)}
									>
										<span>Why this was suggested</span>
										{#if isExpanded}
											<ChevronUp class="w-4 h-4" />
										{:else}
											<ChevronDown class="w-4 h-4" />
										{/if}
									</button>

									{#if isExpanded}
										<p
											class="text-sm text-gray-600 mt-2 pl-4 border-l-2 border-gray-200"
										>
											{suggestion.ai_reasoning}
										</p>
										{#if suggestion.detected_keywords?.length}
											<div class="mt-2 pl-4">
												<span class="text-xs text-gray-500"
													>Keywords detected:
												</span>
												<span class="text-xs text-gray-600">
													{suggestion.detected_keywords.join(', ')}
												</span>
											</div>
										{/if}
									{/if}
								{/if}

								<!-- Actions -->
								<div class="flex items-center gap-2 mt-3">
									{#if isEditing}
										<Button
											size="sm"
											variant="primary"
											on:click={saveEditingSuggestion}
										>
											Save
										</Button>
										<Button
											size="sm"
											variant="secondary"
											on:click={() => cancelEditingSuggestion(suggestion.id)}
										>
											Cancel
										</Button>
									{:else}
										<button
											class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
											on:click={() => startEditingSuggestion(suggestion.id)}
											disabled={processing}
										>
											<Edit2 class="w-4 h-4" />
											Edit
										</button>
										<button
											class="text-sm text-gray-500 hover:text-gray-700 transition-colors"
											on:click={() => toggleSuggestion(suggestion.id)}
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
			<div class="text-center py-8">
				<Calendar class="w-12 h-12 text-gray-400 mx-auto mb-3" />
				<p class="text-gray-600">No project patterns found in your calendar</p>
				<p class="text-sm text-gray-500 mt-1">
					This might be because your events are mostly one-off meetings or personal
					appointments
				</p>
			</div>
		{/if}
	</div>

	<div slot="footer" class="flex items-center justify-between">
		{#if !analyzing}
			<div class="text-sm text-gray-600">
				{#if suggestions.length > 0}
					{selectedSuggestions.size} of {suggestions.length} selected
				{/if}
			</div>

			<div class="flex items-center gap-3">
				<Button variant="secondary" on:click={handleClose} disabled={processing}>
					{suggestions.length > 0 ? 'Cancel' : 'Close'}
				</Button>
				{#if suggestions.length > 0}
					<Button
						variant="primary"
						on:click={handleCreateProjects}
						disabled={selectedSuggestions.size === 0 || processing}
						loading={processing}
					>
						Create {selectedSuggestions.size} Project{selectedSuggestions.size !== 1
							? 's'
							: ''}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</Modal>
