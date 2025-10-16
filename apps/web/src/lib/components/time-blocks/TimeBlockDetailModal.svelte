<!-- apps/web/src/lib/components/time-blocks/TimeBlockDetailModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { TimeBlockWithProject, TimeBlockSuggestion } from '@buildos/shared-types';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';

	let {
		block,
		isRegenerating = false,
		onClose,
		onDelete,
		onRegenerate
	}: {
		block: TimeBlockWithProject;
		isRegenerating?: boolean;
		onClose: () => void;
		onDelete: () => void;
		onRegenerate: () => void;
	} = $props();

	// Format date and time
	const startDate = $derived(new Date(block.start_time));
	const endDate = $derived(new Date(block.end_time));

	const dayOfWeek = $derived(startDate.toLocaleDateString('en-US', { weekday: 'long' }));

	const monthDay = $derived(
		startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
	);

	const startTime = $derived(
		startDate.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		})
	);

	const endTime = $derived(
		endDate.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		})
	);

	const timeRange = $derived(`${startTime} – ${endTime}`);

	const blockTitle = $derived(
		block.block_type === 'project' ? (block.project?.name ?? 'Project Block') : 'Build Block'
	);

	const blockColor = $derived(resolveBlockAccentColor(block));

	function getSuggestions(): TimeBlockSuggestion[] {
		return Array.isArray(block.ai_suggestions) ? block.ai_suggestions : [];
	}

	function suggestionMeta(suggestion: TimeBlockSuggestion): string | null {
		const parts: string[] = [];

		if (block.block_type === 'build' && suggestion.project_name) {
			parts.push(suggestion.project_name);
		}

		if (suggestion.estimated_minutes) {
			parts.push(`${suggestion.estimated_minutes} min`);
		}

		if (suggestion.priority) {
			parts.push(suggestion.priority.toUpperCase());
		}

		return parts.length > 0 ? parts.join(' · ') : null;
	}

	function handleDelete() {
		if (confirm('Delete this time block? This will also remove it from your calendar.')) {
			onDelete();
		}
	}
</script>

<Modal title="" isOpen={true} {onClose} size="lg">
	<div class="space-y-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
		<!-- Header Section with Color Accent -->
		<div class="flex items-start gap-5">
			<!-- Vibrant accent bar with glow -->
			<div class="relative flex-shrink-0">
				<div
					class="absolute inset-0 rounded-full opacity-40 blur-xl"
					style="background: {blockColor};"
				></div>
				<div
					class="relative h-20 w-1.5 rounded-full shadow-lg"
					style="background: {blockColor};"
				></div>
			</div>

			<div class="flex-1 space-y-3">
				<h2
					class="text-2xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-white"
				>
					{blockTitle}
				</h2>
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-white/10"
					>
						{block.block_type === 'project' ? 'Project Focus' : 'Build Block'}
					</span>
					{#if block.block_type === 'build'}
						<span
							class="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500/10 to-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-purple-700 shadow-sm ring-1 ring-purple-500/20 dark:from-purple-500/20 dark:to-indigo-500/20 dark:text-purple-300 dark:ring-purple-400/30"
						>
							Flexible Time
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Date and Time Card with Glassmorphic Effect -->
		<div
			class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50/90 to-slate-100/60 p-6 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-xl transition-all hover:shadow-md dark:from-slate-800/60 dark:to-slate-900/40 dark:ring-white/10 dark:hover:ring-white/20"
		>
			<!-- Subtle gradient overlay -->
			<div
				class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100 dark:from-blue-400/10 dark:to-purple-400/10"
			></div>

			<div class="relative flex items-start gap-5">
				<!-- Icon with gradient background -->
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 shadow-inner ring-1 ring-blue-500/20 dark:from-blue-400/20 dark:to-indigo-400/20 dark:ring-blue-400/30"
				>
					<svg
						class="h-6 w-6 text-blue-600 dark:text-blue-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
				</div>

				<div class="flex-1 space-y-3">
					<div
						class="text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
					>
						{dayOfWeek}, {monthDay}
					</div>
					<div class="flex items-baseline gap-2.5 text-[15px]">
						<span class="font-semibold text-slate-900 dark:text-slate-100">
							{timeRange}
						</span>
						<span class="text-slate-400 dark:text-slate-500">•</span>
						<span class="font-medium text-slate-600 dark:text-slate-300">
							{block.duration_minutes} minutes
						</span>
					</div>
					<div
						class="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"
					>
						{block.timezone ?? 'Local timezone'}
					</div>
				</div>
			</div>

			{#if block.calendar_event_link}
				<div class="relative mt-5 pt-5">
					<div
						class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700"
					></div>
					<a
						href={block.calendar_event_link}
						target="_blank"
						rel="noreferrer"
						class="group/link inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-blue-500/30 transition-all hover:from-blue-500/20 hover:to-indigo-500/20 hover:shadow-md hover:ring-blue-500/40 dark:from-blue-400/15 dark:to-indigo-400/15 dark:text-blue-300 dark:ring-blue-400/40 dark:hover:from-blue-400/25 dark:hover:to-indigo-400/25 dark:hover:ring-blue-400/50"
					>
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
							<path
								d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"
							/>
						</svg>
						<span>Open in Google Calendar</span>
						<svg
							class="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2.5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
						</svg>
					</a>
				</div>
			{/if}
		</div>

		<!-- AI Suggestions Section -->
		{#if getSuggestions().length > 0}
			<div class="space-y-4">
				<div class="flex items-center justify-between px-1">
					<h3
						class="text-base font-semibold tracking-tight text-slate-900 dark:text-white"
					>
						<span class="mr-2">💡</span>Focus Suggestions
					</h3>
					{#if block.suggestions_generated_at}
						<span
							class="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"
						>
							Updated {new Date(block.suggestions_generated_at).toLocaleString(
								'en-US',
								{
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: '2-digit'
								}
							)}
						</span>
					{/if}
				</div>

				<div class="space-y-3">
					{#each getSuggestions() as suggestion, index}
						<div
							class="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white/80 to-slate-50/60 p-5 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-sm transition-all hover:shadow-md hover:ring-slate-300/80 dark:from-slate-800/60 dark:to-slate-900/40 dark:ring-white/10 dark:hover:ring-white/20"
						>
							<!-- Subtle hover gradient -->
							<div
								class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/0 to-purple-500/0 opacity-0 transition-opacity group-hover:from-blue-500/5 group-hover:to-purple-500/5 group-hover:opacity-100 dark:group-hover:from-blue-400/10 dark:group-hover:to-purple-400/10"
							></div>

							<div class="relative flex items-start gap-4">
								<!-- Number badge with gradient -->
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-lg ring-2 ring-blue-500/20 dark:from-blue-400 dark:to-indigo-500 dark:ring-blue-400/30"
								>
									{index + 1}
								</div>

								<div class="flex-1 space-y-2.5">
									<div class="flex flex-wrap items-center gap-2.5">
										<h4
											class="text-[15px] font-semibold leading-snug text-slate-900 dark:text-white"
										>
											{suggestion.title}
										</h4>
										{#if suggestionMeta(suggestion)}
											<span
												class="inline-flex items-center rounded-full bg-slate-100/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-white/10"
											>
												{suggestionMeta(suggestion)}
											</span>
										{/if}
									</div>
									<p
										class="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300"
									>
										{suggestion.reason}
									</p>
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Regenerate Button -->
				<button
					type="button"
					class="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-blue-500/30 transition-all hover:from-blue-500/20 hover:to-indigo-500/20 hover:shadow-md hover:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:from-blue-400/15 dark:to-indigo-400/15 dark:text-blue-300 dark:ring-blue-400/40 dark:hover:from-blue-400/25 dark:hover:to-indigo-400/25 dark:hover:ring-blue-400/50"
					onclick={onRegenerate}
					disabled={isRegenerating}
				>
					{#if isRegenerating}
						<span
							class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent dark:border-blue-400"
						></span>
						<span>Refreshing suggestions…</span>
					{:else}
						<svg
							class="h-4 w-4 transition-transform group-hover:rotate-180"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						<span>Regenerate Suggestions</span>
					{/if}
				</button>
			</div>
		{:else}
			<!-- Empty State -->
			<div
				class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50/90 to-slate-100/60 p-10 text-center shadow-sm ring-1 ring-slate-200/60 backdrop-blur-xl dark:from-slate-800/60 dark:to-slate-900/40 dark:ring-white/10"
			>
				<div
					class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 dark:from-blue-400/10 dark:to-purple-400/10"
				></div>
				<div class="relative space-y-5">
					<div
						class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/80 shadow-inner ring-1 ring-slate-300/50 dark:from-slate-800/80 dark:to-slate-900/60 dark:ring-white/10"
					>
						<svg
							class="h-8 w-8 text-slate-400 dark:text-slate-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
							/>
						</svg>
					</div>
					<div class="space-y-2">
						<p class="text-sm font-semibold text-slate-900 dark:text-white">
							No AI suggestions yet
						</p>
						<p class="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
							Generate smart recommendations to maximize your focus during this block
						</p>
					</div>
					<button
						type="button"
						class="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-blue-500/50 transition-all hover:scale-[1.02] hover:shadow-xl hover:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:from-blue-500 dark:to-indigo-600 dark:ring-blue-400/50"
						onclick={onRegenerate}
						disabled={isRegenerating}
					>
						{#if isRegenerating}
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							<span>Generating…</span>
						{:else}
							<svg
								class="h-4 w-4 transition-transform group-hover:rotate-180"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							<span>Generate Suggestions</span>
						{/if}
					</button>
				</div>
			</div>
		{/if}

		<!-- Summary Card (if exists) -->
		{#if block.suggestions_summary}
			<div
				class="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/60 p-5 shadow-sm ring-1 ring-blue-200/60 backdrop-blur-sm dark:from-blue-950/40 dark:to-indigo-950/30 dark:ring-blue-400/20"
			>
				<div
					class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-400/10 via-transparent to-indigo-400/10"
				></div>
				<p class="relative text-sm leading-relaxed text-slate-700 dark:text-slate-200">
					{block.suggestions_summary}
				</p>
			</div>
		{/if}
	</div>

	<!-- Action Buttons in Footer -->
	<div
		class="flex flex-col sm:flex-row gap-3 sm:justify-between px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		<button
			type="button"
			class="order-2 sm:order-1 w-full sm:w-auto group inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-rose-500/10 to-red-500/10 px-5 py-3 sm:py-2.5 text-sm font-semibold text-rose-700 shadow-sm ring-1 ring-rose-500/30 transition-all hover:from-rose-500/20 hover:to-red-500/20 hover:shadow-md hover:ring-rose-500/40 dark:from-rose-400/15 dark:to-red-400/15 dark:text-rose-300 dark:ring-rose-400/40 dark:hover:from-rose-400/25 dark:hover:to-red-400/25 dark:hover:ring-rose-400/50 touch-manipulation"
			onclick={handleDelete}
		>
			<svg
				class="h-4 w-4 transition-transform group-hover:scale-110"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
				/>
			</svg>
			<span>Delete Block</span>
		</button>
		<button
			type="button"
			class="order-1 sm:order-2 w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-100 px-6 py-3 sm:py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200/80 transition-all hover:bg-slate-200 hover:shadow-md dark:bg-slate-800/80 dark:text-white dark:ring-white/10 dark:hover:bg-slate-700/80 dark:hover:ring-white/20 touch-manipulation"
			onclick={onClose}
		>
			Close
		</button>
	</div>
</Modal>
