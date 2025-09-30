<!-- apps/web/src/lib/components/project/ProjectHistoryModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Clock,
		AlertCircle,
		ExternalLink,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DiffView from '$lib/components/ui/DiffView.svelte';
	import { type FieldDiff, type DiffLine, createLineDiff } from '$lib/utils/diff';
	import { onMount } from 'svelte';

	export let isOpen = false;
	export let projectId: string;

	const dispatch = createEventDispatcher();

	interface Braindump {
		id: string;
		title: string | null;
		content: string | null;
		created_at: string;
		updated_at: string;
		preview: string | null;
	}

	interface ProjectVersion {
		version_number: number;
		is_first_version: boolean;
		created_at: string;
		created_by: string;
		project_data: any;
		braindump: Braindump | null;
	}

	interface VersionComparison {
		fromVersion: ProjectVersion;
		toVersion: ProjectVersion;
		diffs: FieldDiff[];
		hasChanges: boolean;
	}

	let versions: ProjectVersion[] = [];
	let comparisons: VersionComparison[] = [];
	let currentComparisonIndex = 0;
	let loading = true;
	let error: string | null = null;
	let expandedBraindump = false;

	// Field configuration for display
	const fieldConfig = {
		name: { label: 'Project Name', priority: 1 },
		description: { label: 'Description', priority: 2 },
		context: { label: 'Project Context', priority: 0 }, // Highest priority
		executive_summary: { label: 'Executive Summary', priority: 1 },
		status: { label: 'Status', priority: 2 },
		start_date: { label: 'Start Date', priority: 3 },
		end_date: { label: 'End Date', priority: 3 },
		tags: { label: 'Tags', priority: 3 }
	};

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	$: currentComparison = comparisons[currentComparisonIndex];
	$: currentBraindump = currentComparison?.toVersion?.braindump;

	// Create diff for a specific field
	function createFieldDiff(field: string, oldValue: any, newValue: any): FieldDiff {
		const config = fieldConfig[field] || { label: field, priority: 4 };

		// Handle different field types
		let oldText = '';
		let newText = '';
		let hasChanges = false;

		if (field === 'tags') {
			oldText = Array.isArray(oldValue) ? oldValue.join(', ') : '';
			newText = Array.isArray(newValue) ? newValue.join(', ') : '';
		} else {
			oldText = oldValue ? String(oldValue) : '';
			newText = newValue ? String(newValue) : '';
		}

		hasChanges = oldText !== newText;
		const lineDiff = hasChanges
			? createLineDiff(oldText, newText)
			: { oldLines: [], newLines: [] };

		return {
			field,
			label: config.label,
			oldValue,
			newValue,
			oldLines: lineDiff.oldLines,
			newLines: lineDiff.newLines,
			hasChanges
		};
	}

	// Create comparison between two versions
	function createVersionComparison(
		fromVersion: ProjectVersion,
		toVersion: ProjectVersion
	): VersionComparison {
		const diffs: FieldDiff[] = [];
		let hasChanges = false;

		// Check all fields for changes
		for (const field of Object.keys(fieldConfig)) {
			const oldValue = fromVersion.project_data[field];
			const newValue = toVersion.project_data[field];

			const fieldDiff = createFieldDiff(field, oldValue, newValue);
			if (fieldDiff.hasChanges) {
				diffs.push(fieldDiff);
				hasChanges = true;
			}
		}

		// Sort diffs by priority (context first)
		diffs.sort((a, b) => {
			const aPriority = fieldConfig[a.field]?.priority ?? 4;
			const bPriority = fieldConfig[b.field]?.priority ?? 4;
			return aPriority - bPriority;
		});

		return {
			fromVersion,
			toVersion,
			diffs,
			hasChanges
		};
	}

	// Load project history
	async function loadHistory() {
		loading = true;
		error = null;
		expandedBraindump = false;

		try {
			const response = await fetch(`/api/projects/${projectId}/history`);
			if (!response.ok) {
				throw new Error('Failed to load project history');
			}

			const data = await response.json();
			versions = data.versions || [];

			// Create sequential comparisons
			comparisons = [];
			for (let i = 0; i < versions.length - 1; i++) {
				const comparison = createVersionComparison(versions[i], versions[i + 1]);
				if (comparison.hasChanges) {
					comparisons.push(comparison);
				}
			}

			if (comparisons.length === 0) {
				error = 'No changes found between versions';
			} else {
				// Start at the most recent comparison (latest changes)
				currentComparisonIndex = comparisons.length - 1;
			}
		} catch (err) {
			console.error('Error loading project history:', err);
			error = err instanceof Error ? err.message : 'Failed to load history';
		} finally {
			loading = false;
		}
	}

	// Navigation functions
	function previousComparison() {
		if (currentComparisonIndex > 0) {
			currentComparisonIndex--;
			expandedBraindump = false;
		}
	}

	function nextComparison() {
		if (currentComparisonIndex < comparisons.length - 1) {
			currentComparisonIndex++;
			expandedBraindump = false;
		}
	}

	// Format date
	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		});
	}

	function handleClose() {
		isOpen = false;
		dispatch('close');
	}

	function toggleBraindumpExpansion() {
		expandedBraindump = !expandedBraindump;
	}

	// Load history when modal opens
	$: if (isOpen && projectId) {
		loadHistory();
	}
</script>

<Modal {isOpen} size="xl" onClose={handleClose} title="Project History">
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 flex flex-col h-full max-h-[75vh]">
		<div class="flex-1 overflow-hidden">
			{#if loading}
				<div class="flex items-center justify-center h-full">
					<div class="text-center">
						<div
							class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"
						></div>
						<p class="text-gray-600 dark:text-gray-400">Loading project history...</p>
					</div>
				</div>
			{:else if error}
				<div class="flex items-center justify-center h-full">
					<div class="text-center max-w-md">
						<AlertCircle class="w-12 h-12 text-rose-500 mx-auto mb-4" />
						<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							{error === 'No changes found between versions'
								? 'No Changes Found'
								: 'Error Loading History'}
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							{error === 'No changes found between versions'
								? "This project hasn't been modified since it was created."
								: error}
						</p>
					</div>
				</div>
			{:else if comparisons.length === 0}
				<div class="flex items-center justify-center h-full">
					<div class="text-center max-w-md">
						<Clock class="w-12 h-12 text-gray-400 mx-auto mb-4" />
						<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							No History Available
						</h3>
						<p class="text-gray-600 dark:text-gray-400">
							This project doesn't have any recorded changes yet.
						</p>
					</div>
				</div>
			{:else}
				<!-- Navigation Header -->
				<div
					class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
				>
					<!-- Mobile: Stack everything vertically, Desktop: Two rows -->
					<div class="space-y-3">
						<!-- Main version info and navigation -->
						<div
							class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
						>
							<div class="text-center sm:text-left">
								<div class="text-sm font-medium text-gray-900 dark:text-white">
									Version {currentComparison.fromVersion.version_number} → Version
									{currentComparison.toVersion.version_number}
								</div>
								<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
									{comparisons.length} total comparison{comparisons.length !== 1
										? 's'
										: ''}
								</div>
							</div>

							<!-- Navigation Controls -->
							<div class="flex items-center justify-center sm:justify-end space-x-3">
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{currentComparisonIndex + 1} of {comparisons.length}
								</span>
								<div class="flex items-center space-x-1">
									<Button
										onclick={previousComparison}
										disabled={currentComparisonIndex === 0}
										variant="outline"
										size="md"
										class="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center"
										aria-label="Previous comparison"
									>
										<ChevronLeft class="w-4 h-4" />
									</Button>
									<Button
										onclick={nextComparison}
										disabled={currentComparisonIndex === comparisons.length - 1}
										variant="outline"
										size="md"
										class="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center"
										aria-label="Next comparison"
									>
										<ChevronRight class="w-4 h-4" />
									</Button>
								</div>
							</div>
						</div>

						<!-- Date info - simplified for mobile -->
						<div
							class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-xs text-gray-500 dark:text-gray-400"
						>
							<div class="flex items-center space-x-1">
								<Clock class="w-3 h-3" />
								<span>{formatDate(currentComparison.fromVersion.created_at)}</span>
							</div>
							<div class="hidden sm:block text-gray-300 dark:text-gray-600">→</div>
							<div class="flex items-center space-x-1">
								<Clock class="w-3 h-3" />
								<span>{formatDate(currentComparison.toVersion.created_at)}</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Content Layout -->
				<div class="flex-1 overflow-auto">
					<div class="flex flex-col lg:flex-row h-full">
						<!-- Diff Content - Takes up 2/3 on desktop -->
						<div
							class="flex-1 lg:w-2/3 p-4 lg:border-r border-gray-200 dark:border-gray-700"
						>
							<DiffView
								diffs={currentComparison.diffs}
								fromVersionLabel="Version {currentComparison.fromVersion
									.version_number}"
								toVersionLabel="Version {currentComparison.toVersion
									.version_number}"
								showFieldPriority={true}
							/>
						</div>

						<!-- Braindump Section - Takes up 1/3 on desktop -->
						<div
							class="w-full lg:w-1/3 p-4 bg-gray-50 dark:bg-gray-900/50 border-t lg:border-t-0 border-gray-200 dark:border-gray-700"
						>
							<div class="sticky top-0">
								<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
									Related Braindump
								</h3>

								{#if currentBraindump}
									<div
										class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
									>
										<!-- Braindump Header -->
										<div
											class="p-4 border-b border-gray-200 dark:border-gray-700"
										>
											<h4
												class="font-medium text-gray-900 dark:text-white mb-2"
											>
												{currentBraindump.title || 'Untitled Braindump'}
											</h4>
											<div
												class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
											>
												<div class="flex items-center space-x-1">
													<Clock class="w-3 h-3" />
													<span
														>{formatDate(
															currentBraindump.updated_at
														)}</span
													>
												</div>
												<a
													href="/history?braindump={currentBraindump.id}"
													target="_blank"
													rel="noopener noreferrer"
													class="flex items-center space-x-1 text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
												>
													<span>View</span>
													<ExternalLink class="w-3 h-3" />
												</a>
											</div>
										</div>

										<!-- Braindump Content -->
										<div class="p-4">
											{#if currentBraindump.preview}
												<div
													class="text-sm text-gray-700 dark:text-gray-300"
												>
													{#if expandedBraindump}
														<p class="whitespace-pre-wrap">
															{currentBraindump.content || ''}
														</p>
														<Button
															onclick={toggleBraindumpExpansion}
															variant="ghost"
															size="sm"
															class="mt-2 text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-xs min-h-[44px]"
														>
															<ChevronUp class="w-3 h-3 mr-1" />
															Show less
														</Button>
													{:else}
														<p>{currentBraindump.preview}</p>
														{#if currentBraindump.content && currentBraindump.content.length > 100}
															<Button
																onclick={toggleBraindumpExpansion}
																variant="ghost"
																size="sm"
																class="mt-2 text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-xs min-h-[44px]"
															>
																<ChevronDown class="w-3 h-3 mr-1" />
																Read more
															</Button>
														{/if}
													{/if}
												</div>
											{:else}
												<p
													class="text-sm text-gray-500 dark:text-gray-400 italic"
												>
													No content preview available.
												</p>
											{/if}
										</div>
									</div>
								{:else}
									<div class="text-center py-8">
										<p class="text-gray-500 dark:text-gray-400 text-sm">
											No braindump found for this version.
										</p>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</Modal>
