<!-- apps/web/src/lib/components/admin/ActivityTimelineChart.svelte -->
<script lang="ts">
	import { FileText, FolderOpen, CheckSquare, StickyNote, Brain, Calendar } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { onMount } from 'svelte';

	interface Activity {
		entity_type: string;
		action: string;
		object_name?: string;
		created_at: string;
		project_name?: string;
		details?: string;
	}

	// Using $props() for Svelte 5 runes mode
	let { activities = [] }: { activities?: Activity[] } = $props();

	// Reactive state using $state() - required in runes mode for reactivity
	let timeZone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	// Sort activities by date (most recent first) - Using $derived for reactivity
	// IMPORTANT: Create a copy with [...activities] before sorting to avoid mutating the prop
	let sortedActivities = $derived(
		[...activities]
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
			.slice(0, 20) // Show last 20 activities
	);

	function getActivityIcon(type: string, action: string) {
		switch (type) {
			case 'brief':
				return FileText;
			case 'project':
				return FolderOpen;
			case 'task':
				return CheckSquare;
			case 'note':
			case 'document':
				return StickyNote;
			case 'brain_dump':
				return Brain;
			case 'calendar':
				return Calendar;
			default:
				return FileText;
		}
	}

	function getActivityColor(type: string, action: string) {
		switch (type) {
			case 'brief':
				return 'text-accent bg-accent/10';
			case 'project':
				return 'text-purple-600 dark:text-purple-400 bg-purple-500/10';
			case 'task':
				if (action === 'completed' || action === 'done') {
					return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
				}
				return 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
			case 'note':
			case 'document':
				return 'text-teal-600 dark:text-teal-400 bg-teal-500/10';
			case 'brain_dump':
				return 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10';
			case 'calendar':
				return 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10';
			default:
				return 'text-muted-foreground bg-muted';
		}
	}

	function formatActivityText(activity: Activity) {
		const entityLabel = activity.entity_type.replace(/_/g, ' ');
		const actionLabel = activity.action.replace(/_/g, ' ');
		const object = activity.object_name || 'item';
		return `${entityLabel} ${actionLabel} "${object}"`;
	}

	function formatRelativeTime(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();

		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffMinutes < 60) {
			return `${diffMinutes}m ago`;
		} else if (diffHours < 24) {
			return `${diffHours}h ago`;
		} else if (diffDays < 7) {
			return `${diffDays}d ago`;
		} else {
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
		}
	}

	// Group activities by day for better visualization - Using $derived for memoization
	let groupedActivities = $derived(
		sortedActivities.reduce(
			(groups, activity) => {
				const date = new Date(activity.created_at).toDateString();
				if (!groups[date]) {
					groups[date] = [];
				}
				groups[date].push(activity);
				return groups;
			},
			{} as Record<string, any[]>
		)
	);
</script>

{#if sortedActivities?.length}
	<Card variant="elevated">
		<CardBody padding="md" class="w-full">
			<!-- Activity Type Legend -->
			<div class="flex flex-wrap gap-2 mb-3">
				<div class="flex items-center text-xs">
					<div class="w-2.5 h-2.5 bg-accent rounded mr-1"></div>
					<span class="text-muted-foreground">Briefs</span>
				</div>
				<div class="flex items-center text-xs">
					<div class="w-2.5 h-2.5 bg-purple-500 rounded mr-1"></div>
					<span class="text-muted-foreground">Projects</span>
				</div>
				<div class="flex items-center text-xs">
					<div class="w-2.5 h-2.5 bg-amber-500 rounded mr-1"></div>
					<span class="text-muted-foreground">Tasks</span>
				</div>
				<div class="flex items-center text-xs">
					<div class="w-2.5 h-2.5 bg-teal-500 rounded mr-1"></div>
					<span class="text-muted-foreground">Notes</span>
				</div>
				<div class="flex items-center text-xs">
					<div class="w-2.5 h-2.5 bg-indigo-500 rounded mr-1"></div>
					<span class="text-muted-foreground">Brain Dumps</span>
				</div>
			</div>

			<!-- Timeline -->
			<div class="relative">
				<!-- Vertical line -->
				<div
					class="absolute left-5 top-0 bottom-0 w-0.5 bg-border"
				></div>

				<div class="space-y-4">
					{#each Object.entries(groupedActivities) as [date, dayActivities]}
						<!-- Date header -->
						<div class="relative">
							<div
								class="absolute left-3 w-4 h-4 bg-card border-2 border-border rounded-full"
							></div>
							<div class="ml-10">
								<h4 class="text-sm font-medium text-foreground mb-2">
									{new Date(date).toLocaleDateString('en-US', {
										weekday: 'long',
										month: 'short',
										day: 'numeric',
										timeZone
									})}
								</h4>

								<!-- Activities for this day -->
								<div class="space-y-1.5">
									{#each dayActivities as activity}
										{@const Activity_type = getActivityIcon(
											activity.entity_type,
											activity.action
										)}

										<div
											class="flex items-start gap-2 px-2 py-1.5 bg-muted/50 rounded-md border border-border/50"
										>
											<div
												class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center {getActivityColor(
													activity.entity_type,
													activity.action
												)}"
											>
												<Activity_type class="w-3.5 h-3.5" />
											</div>

											<div class="flex-1 min-w-0">
												<p class="text-sm text-foreground">
													{formatActivityText(activity)}
												</p>
												{#if activity.project_name}
													<p
														class="text-xs text-muted-foreground"
													>
														in project: {activity.project_name}
													</p>
												{/if}
												{#if activity.details}
													<p
														class="text-xs text-muted-foreground truncate"
													>
														{activity.details}
													</p>
												{/if}
											</div>

											<div class="flex-shrink-0 text-xs text-muted-foreground">
												{formatRelativeTime(activity.created_at)}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Activity Summary -->
			<div class="mt-4 p-3 bg-muted/50 border border-border rounded-lg">
				<h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
					Activity Summary
				</h4>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
					{#each Object.entries(sortedActivities.reduce((counts, activity) => {
							const type = activity.entity_type.split('_')[0];
							counts[type] = (counts[type] || 0) + 1;
							return counts;
						}, {})) as [type, count]}
						<div class="text-center">
							<div class="text-base font-bold text-foreground">
								{count}
							</div>
							<div class="text-[0.65rem] uppercase tracking-wide text-muted-foreground capitalize">
								{type}s
							</div>
						</div>
					{/each}
				</div>
			</div>
		</CardBody>
	</Card>
{:else}
	<Card variant="default">
		<CardBody
			padding="md"
			class="flex flex-col items-center justify-center h-48 text-muted-foreground"
		>
			<svg class="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
				></path>
			</svg>
			<p class="text-sm font-medium text-foreground">No Activity Data</p>
			<p class="text-xs text-center">No recent activity found for this user</p>
		</CardBody>
	</Card>
{/if}
