<!-- apps/web/src/lib/components/project/TaskBraindumpSection.svelte -->
<script lang="ts">
	import {
		Brain,
		ChevronDown,
		ChevronRight,
		CheckCircle2,
		Clock,
		AlertTriangle,
		ExternalLink,
		LoaderCircle
	} from 'lucide-svelte';
	import { formatDistanceToNow, format, differenceInHours } from 'date-fns';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { requireApiData } from '$lib/utils/api-client-helpers';

	// Types
	interface Braindump {
		id: string;
		title: string | null;
		content: string | null;
		ai_summary: string | null;
		status: string;
		created_at: string;
		updated_at: string;
		linked_at: string;
	}

	interface Props {
		taskId: string;
	}

	// Props (Svelte 5 runes syntax)
	let { taskId }: Props = $props();

	// State
	let braindumps = $state<Braindump[]>([]);
	let loading = $state(false);
	let loaded = $state(false);
	let loadError = $state<string | null>(null);
	let expandedCards = $state<Set<string>>(new Set());

	// Fetch braindumps from API
	async function loadBraindumps() {
		if (loaded || loading || !taskId) return;

		loading = true;
		loadError = null;

		try {
			const response = await fetch(`/api/tasks/${taskId}/braindumps`);
			const data = await requireApiData<{ braindumps?: Braindump[] }>(
				response,
				'Failed to load braindumps'
			);
			braindumps = data.braindumps || [];
			loaded = true;
		} catch (err: any) {
			console.error('Error loading braindumps:', err);
			loadError = err.message || 'Failed to load associated braindumps';
		} finally {
			loading = false;
		}
	}

	// Auto-load braindumps when component mounts (Svelte 5 effect)
	$effect(() => {
		if (taskId && !loaded && !loading) {
			loadBraindumps();
		}
	});

	// Toggle individual card expanded state
	function toggleCard(braindumpId: string, event: MouseEvent) {
		// Prevent section toggle when clicking card
		event.stopPropagation();

		if (expandedCards.has(braindumpId)) {
			expandedCards.delete(braindumpId);
		} else {
			expandedCards.add(braindumpId);
		}
		expandedCards = new Set(expandedCards); // Trigger reactivity
	}

	// Helper: Get time display (relative if < 24h, else formatted date)
	function getTimeDisplay(dateStr: string): string {
		const date = new Date(dateStr);
		const hoursAgo = differenceInHours(new Date(), date);

		if (hoursAgo < 24) {
			return formatDistanceToNow(date, { addSuffix: true });
		}

		return format(date, 'MMM d, yyyy');
	}

	// Helper: Truncate content for preview
	function truncateContent(content: string | null, maxLength: number = 80): string {
		if (!content) return '';
		const stripped = content.replace(/[#*_`]/g, '').trim();
		return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
	}

	// Helper: Get status display info
	function getStatusInfo(status: string): { color: string; icon: any; label: string } {
		switch (status) {
			case 'processed':
				return {
					color: 'text-green-600 dark:text-green-400',
					icon: CheckCircle2,
					label: 'Processed'
				};
			case 'processing':
				return {
					color: 'text-yellow-600 dark:text-yellow-400',
					icon: Clock,
					label: 'Processing'
				};
			case 'pending':
				return {
					color: 'text-blue-600 dark:text-blue-400',
					icon: Clock,
					label: 'Pending'
				};
			default:
				return {
					color: 'text-gray-600 dark:text-gray-400',
					icon: Brain,
					label: status || 'Draft'
				};
		}
	}

	// Derived values (Svelte 5 runes syntax)
	let hasBraindumps = $derived(braindumps.length > 0);
	let displayCount = $derived(braindumps.length);
	let canExpand = $derived(!loading || hasBraindumps);
</script>

<div class="border-t border-gray-200/50 dark:border-gray-700/50 pt-3">
	<!-- Section Header (non-clickable label) -->
	<div class="flex items-center justify-between p-3">
		<div class="flex items-center space-x-2">
			<span class="w-2 h-2 bg-indigo-500 rounded-full"></span>
			<span
				class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
			>
				Braindumps
			</span>

			{#if loading && !loaded}
				<span class="text-xs text-gray-500 flex items-center">
					<LoaderCircle class="w-3 h-3 mr-1 animate-spin" />
					Loading...
				</span>
			{:else if loadError}
				<span class="text-xs text-red-600 dark:text-red-400 flex items-center">
					<AlertTriangle class="w-3 h-3 mr-1" />
					Error
				</span>
			{:else if loaded}
				<span class="text-xs text-gray-500">
					{displayCount}
					{displayCount === 1 ? 'braindump' : 'braindumps'}
				</span>
			{/if}
		</div>
	</div>

	<!-- Content (always visible) -->
	<div>
		<!-- Loading State -->
		{#if loading && !loaded}
			<div class="mt-2 px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
				<LoaderCircle class="w-5 h-5 mx-auto mb-2 animate-spin" />
				Loading braindumps...
			</div>
		{/if}

		<!-- Error State -->
		{#if loadError}
			<div
				class="mt-2 mx-2 p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800"
			>
				<AlertTriangle class="w-4 h-4 inline mr-1" />
				{loadError}
				<button
					type="button"
					onclick={loadBraindumps}
					class="ml-2 underline hover:no-underline"
				>
					Retry
				</button>
			</div>
		{/if}

		<!-- Empty State -->
		{#if loaded && !hasBraindumps && !loadError}
			<div class="mt-2 px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
				<Brain class="w-5 h-5 mx-auto mb-2 opacity-50" />
				No braindumps associated with this task
			</div>
		{/if}

		<!-- Braindump Cards -->
		{#if loaded && hasBraindumps}
			<div class="mt-2 space-y-2 px-2">
				{#each braindumps as braindump (braindump.id)}
					{@const statusInfo = getStatusInfo(braindump.status)}
					{@const timeDisplay = getTimeDisplay(braindump.updated_at)}
					{@const contentPreview = truncateContent(braindump.content)}
					{@const fullContent = braindump.content || 'No content'}
					{@const isExpanded = expandedCards.has(braindump.id)}
					{@const IsExpandedChevronDownChevronRight = isExpanded
						? ChevronDown
						: ChevronRight}
					{@const Icon = statusInfo.icon}

					<div
						class="rounded-lg border border-gray-200 dark:border-gray-700
								bg-gradient-to-br from-white to-gray-50/30 dark:from-gray-800 dark:to-gray-900/30
								hover:shadow-sm transition-all duration-200"
					>
						<!-- Card Header (clickable to expand) -->
						<button
							type="button"
							onclick={(e) => toggleCard(braindump.id, e)}
							class="w-full text-left p-3 flex items-start justify-between group"
						>
							<div class="flex-1 min-w-0 space-y-2">
								<!-- Title Row -->
								<div class="flex items-center space-x-2">
									<Brain
										class="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0"
									/>
									<span
										class="text-sm font-medium text-gray-900 dark:text-white truncate flex-1"
									>
										{braindump.title || 'Untitled braindump'}
									</span>

									<IsExpandedChevronDownChevronRight
										class="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0"
									/>
								</div>

								<!-- Content Preview (when collapsed) -->
								{#if !isExpanded && contentPreview}
									<p
										class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2"
									>
										{contentPreview}
									</p>
								{/if}

								<!-- Metadata Footer -->
								<div class="flex items-center justify-between text-xs">
									<span
										class="text-gray-500 dark:text-gray-400 flex items-center"
									>
										<Clock class="w-3 h-3 mr-1" />
										{timeDisplay}
									</span>

									<span class="flex items-center {statusInfo.color}">
										<Icon class="w-3 h-3 mr-1" />
										{statusInfo.label}
									</span>
								</div>
							</div>
						</button>

						<!-- Expanded Content -->
						{#if isExpanded}
							<div
								transition:slide={{ duration: 200, easing: quintOut }}
								class="px-3 pb-3 space-y-3 border-t border-gray-200/50 dark:border-gray-700/50 pt-3"
							>
								<!-- Full Content -->
								<div
									class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto"
								>
									{fullContent}
								</div>

								<!-- History Link -->
								<a
									href="/history?braindump={braindump.id}"
									class="inline-flex items-center space-x-1 text-xs font-medium
											text-indigo-600 dark:text-indigo-400
											hover:text-indigo-700 dark:hover:text-indigo-300
											hover:underline transition-colors"
									onclick={(e) => e.stopPropagation()}
								>
									<ExternalLink class="w-3 h-3" />
									<span>View in History</span>
								</a>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
