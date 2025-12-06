<!-- apps/web/src/lib/components/agent/DraftsList.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import {
		FileText,
		Clock,
		CheckCircle,
		Edit,
		Trash2,
		RefreshCw,
		FolderOpen,
		Sparkles,
		ListTodo
	} from 'lucide-svelte';
	import type { ProjectDraft } from '@buildos/shared-types';
	import { formatRelativeTime } from '$lib/utils/date-utils';

	// Props using Svelte 5 syntax
	interface Props {
		drafts: ProjectDraft[];
		onSelect?: (draft: ProjectDraft) => void;
		onRefresh?: () => void;
	}

	let { drafts = [], onSelect = () => {}, onRefresh = () => {} }: Props = $props();

	// State
	let expandedDraft = $state<string | null>(null);
	let isRefreshing = $state(false);

	// Derived state
	let sortedDrafts = $derived(
		[...drafts].sort(
			(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
		)
	);

	let stats = $derived({
		total: drafts.length,
		recent: drafts.filter((d) => {
			const hoursSinceUpdate =
				(Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60);
			return hoursSinceUpdate < 24;
		}).length,
		ready: drafts.filter((d) => (d.dimensions_covered?.length || 0) >= 3).length
	});

	// Functions
	function toggleExpanded(draftId: string) {
		expandedDraft = expandedDraft === draftId ? null : draftId;
	}

	async function handleRefresh() {
		isRefreshing = true;
		await onRefresh();
		setTimeout(() => {
			isRefreshing = false;
		}, 500);
	}

	function getDraftCompleteness(draft: ProjectDraft): number {
		const dimensions = draft.dimensions_covered?.length || 0;
		const hasName = draft.name ? 1 : 0;
		const hasDescription = draft.description ? 1 : 0;
		const hasTasks = (draft.draft_tasks?.length || 0) > 0 ? 1 : 0;

		// Max score is 12 (9 dimensions + 3 fields)
		const score = dimensions + hasName + hasDescription + hasTasks;
		return Math.round((score / 12) * 100);
	}

	function getDimensionIcon(dimension: string): string {
		const icons: Record<string, string> = {
			core_integrity_ideals: '🎯',
			core_people_bonds: '👥',
			core_goals_momentum: '🚀',
			core_meaning_identity: '💡',
			core_reality_understanding: '🔍',
			core_trust_safeguards: '🛡️',
			core_opportunity_freedom: '🌟',
			core_power_resources: '💪',
			core_harmony_integration: '⚖️'
		};
		return icons[dimension] || '📊';
	}

	function formatDimension(dimension: string): string {
		return dimension
			.replace('core_', '')
			.replace(/_/g, ' ')
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	// Auto-expand the most recent draft on mount
	onMount(() => {
		if (sortedDrafts.length > 0 && !expandedDraft) {
			expandedDraft = sortedDrafts[0].id;
		}
	});
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div
		class="flex items-center justify-between border-b border-slate-200/60 bg-gradient-to-r from-purple-50/50 to-pink-50/50 px-4 backdrop-blur-sm dark:border-slate-700/60 dark:from-purple-950/30 dark:to-pink-950/30"
	>
		<div class="flex items-center gap-2">
			<h3
				class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
			>
				<FileText class="h-4 w-4" />
				<span>Draft Projects</span>
			</h3>
			{#if stats.total > 0}
				<Badge variant="info" size="sm">
					{stats.total}
				</Badge>
			{/if}
		</div>
		<Button
			onclick={handleRefresh}
			variant="ghost"
			size="sm"
			disabled={isRefreshing}
			title="Refresh drafts"
			class=""
		>
			<RefreshCw class="h-4 w-4 {isRefreshing ? 'animate-spin' : ''}" />
		</Button>
	</div>

	<!-- Stats Bar -->
	{#if stats.total > 0}
		<div
			class="flex gap-3 border-b border-slate-200/60 bg-slate-50/80 px-4 py-2 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/50"
		>
			<div class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
				<Clock class="h-3 w-3 text-blue-500 dark:text-blue-400" />
				<span>{stats.recent} recent</span>
			</div>
			<div class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
				<Sparkles class="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
				<span>{stats.ready} ready</span>
			</div>
		</div>
	{/if}

	<!-- Drafts List -->
	<div class="flex-1 space-y-2 overflow-y-auto p-3">
		{#if sortedDrafts.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
				<FolderOpen class="h-12 w-12 text-slate-300 dark:text-slate-600" />
				<p class="text-sm text-slate-500 dark:text-slate-400">No draft projects yet</p>
				<p class="text-xs text-slate-400 dark:text-slate-500">
					Start a conversation to create one
				</p>
			</div>
		{:else}
			{#each sortedDrafts as draft (draft.id)}
				{@const completeness = getDraftCompleteness(draft)}
				{@const isExpanded = expandedDraft === draft.id}

				<div
					class="rounded-lg border border-slate-200/60 bg-white/85 backdrop-blur-sm transition-all hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/70 {isExpanded
						? 'shadow-md'
						: 'shadow-sm'}"
				>
					<button
						class="flex w-full items-start justify-between gap-3 p-3 text-left transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
						onclick={() => toggleExpanded(draft.id)}
					>
						<div class="flex min-w-0 flex-1 items-start gap-2">
							<div class="flex-shrink-0 pt-0.5">
								{#if completeness >= 75}
									<CheckCircle
										class="h-5 w-5 text-emerald-500 dark:text-emerald-400"
									/>
								{:else if completeness >= 50}
									<Sparkles class="h-5 w-5 text-blue-500 dark:text-blue-400" />
								{:else}
									<FileText class="h-5 w-5 text-slate-400 dark:text-slate-500" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div
									class="truncate text-sm font-semibold text-slate-900 dark:text-white"
								>
									{draft.name || 'Untitled Project'}
								</div>
								<div
									class="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-slate-600 dark:text-slate-400"
								>
									<span>
										Updated {formatRelativeTime(draft.updated_at)}
									</span>
									{#if draft.dimensions_covered && draft.dimensions_covered.length > 0}
										<span class="opacity-50">•</span>
										<span>
											{draft.dimensions_covered.length}/9 dimensions
										</span>
									{/if}
									{#if draft.draft_tasks && draft.draft_tasks.length > 0}
										<span class="opacity-50">•</span>
										<span>
											{draft.draft_tasks.length} task{draft.draft_tasks
												.length === 1
												? ''
												: 's'}
										</span>
									{/if}
								</div>
							</div>
						</div>
						<div class="flex-shrink-0">
							<div class="completeness-indicator">
								<svg class="progress-ring" width="32" height="32">
									<circle
										cx="16"
										cy="16"
										r="14"
										stroke="currentColor"
										stroke-width="2"
										fill="none"
										opacity="0.2"
									/>
									<circle
										cx="16"
										cy="16"
										r="14"
										stroke="currentColor"
										stroke-width="2"
										fill="none"
										stroke-dasharray={`${(completeness / 100) * 88} 88`}
										stroke-dashoffset="22"
										transform="rotate(-90 16 16)"
										class={completeness >= 75
											? 'text-green-500'
											: completeness >= 50
												? 'text-blue-500'
												: 'text-gray-400'}
									/>
								</svg>
								<span class="completeness-text">{completeness}%</span>
							</div>
						</div>
					</button>

					{#if isExpanded}
						<div
							class="border-t border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-700/60 dark:bg-slate-800/30"
						>
							{#if draft.description}
								<div class="mb-3">
									<h4
										class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
									>
										Description
									</h4>
									<p
										class="text-sm leading-relaxed text-slate-700 dark:text-slate-300"
									>
										{draft.description}
									</p>
								</div>
							{/if}

							{#if draft.dimensions_covered && draft.dimensions_covered.length > 0}
								<div class="mb-3">
									<h4
										class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
									>
										Dimensions Covered
									</h4>
									<div class="flex flex-wrap gap-2">
										{#each draft.dimensions_covered as dimension}
											<span
												class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
											>
												<span class="text-sm"
													>{getDimensionIcon(dimension)}</span
												>
												<span class="text-slate-700 dark:text-slate-300">
													{formatDimension(dimension)}
												</span>
											</span>
										{/each}
									</div>
								</div>
							{/if}

							{#if draft.draft_tasks && draft.draft_tasks.length > 0}
								<div class="mb-3">
									<h4
										class="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
									>
										<ListTodo class="inline h-3.5 w-3.5" />
										<span>Draft Tasks ({draft.draft_tasks.length})</span>
									</h4>
									<div class="space-y-2">
										{#each draft.draft_tasks.slice(0, 3) as task}
											<div class="flex items-center gap-2 text-sm">
												<span class="flex-shrink-0 text-slate-400">•</span>
												<span
													class="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300"
												>
													{task.title}
												</span>
												{#if task.priority}
													<Badge
														variant={task.priority === 'high'
															? 'error'
															: task.priority === 'medium'
																? 'warning'
																: 'info'}
														size="sm"
													>
														{task.priority}
													</Badge>
												{/if}
											</div>
										{/each}
										{#if draft.draft_tasks.length > 3}
											<div
												class="text-sm italic text-slate-500 dark:text-slate-400"
											>
												+{draft.draft_tasks.length - 3} more task{draft
													.draft_tasks.length -
													3 ===
												1
													? ''
													: 's'}
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<div
								class="flex gap-2 border-t border-slate-200/60 pt-3 dark:border-slate-700/60"
							>
								<Button onclick={() => onSelect(draft)} variant="primary" size="sm">
									Resume Session
								</Button>
								{#if completeness >= 25}
									<Button
										onclick={() => onSelect(draft)}
										variant="secondary"
										size="sm"
									>
										<CheckCircle class="w-4 h-4 mr-1" />
										Finalize
									</Button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
