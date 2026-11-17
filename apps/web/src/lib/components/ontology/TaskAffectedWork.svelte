<!-- Task dependencies are loaded only when someone opens this section. -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { TaskAffectedWorkPayload } from '@buildos/shared-types';
	import { ChevronDown, GitBranch, RefreshCw } from '$lib/icons/lucide';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';

	let { taskId }: { taskId: string } = $props();
	const panelId = $props.id();
	let expanded = $state(false);
	let maxDepth = $state(3);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let result = $state.raw<TaskAffectedWorkPayload | null>(null);
	let controller: AbortController | null = null;
	let requestNumber = 0;
	const visibleResult = $derived(result?.source_task.id === taskId ? result : null);

	// The remote request belongs to the displayed task. Cancel it and reset its
	// controls when the reader navigates, including when it returns to an old task.
	$effect(() => {
		void taskId;
		untrack(() => {
			requestNumber += 1;
			controller?.abort();
			expanded = false;
			maxDepth = 3;
			loading = false;
			error = null;
			result = null;
		});
		return () => {
			requestNumber += 1;
			controller?.abort();
		};
	});

	async function load() {
		controller?.abort();
		const requestController = new AbortController();
		controller = requestController;
		const currentRequest = ++requestNumber;
		const requestedTaskId = taskId;
		loading = true;
		error = null;
		result = null;

		try {
			const response = await fetch(
				`/api/onto/tasks/${encodeURIComponent(requestedTaskId)}/affected-work?max_depth=${maxDepth}&max_tasks=50`,
				{ signal: requestController.signal }
			);
			const body = await response.json();
			if (!response.ok || !body.success || !body.data) {
				throw new Error('Affected work could not be loaded. Please try again.');
			}
			if (
				requestController.signal.aborted ||
				currentRequest !== requestNumber ||
				requestedTaskId !== taskId
			)
				return;
			result = body.data as TaskAffectedWorkPayload;
		} catch {
			if (
				!requestController.signal.aborted &&
				currentRequest === requestNumber &&
				requestedTaskId === taskId
			)
				error = 'Affected work could not be loaded. Please try again.';
		} finally {
			if (currentRequest === requestNumber && requestedTaskId === taskId) loading = false;
		}
	}

	function toggle() {
		expanded = !expanded;
		if (expanded && !visibleResult) void load();
		if (!expanded && loading) {
			requestNumber += 1;
			controller?.abort();
			loading = false;
		}
	}

	function changeDepth(event: Event) {
		maxDepth = Number((event.currentTarget as HTMLSelectElement).value);
		void load();
	}
</script>

<section class="min-w-0" aria-label="Affected work">
	<button
		type="button"
		class="flex min-h-10 w-full items-center justify-between gap-2 rounded-md py-2 text-left text-sm font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-expanded={expanded}
		aria-controls={panelId}
		onclick={toggle}
	>
		<span class="flex items-center gap-2">
			<GitBranch class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
			Affected work
		</span>
		<ChevronDown
			class={`h-4 w-4 text-muted-foreground ${expanded ? 'rotate-180' : ''}`}
			aria-hidden="true"
		/>
	</button>
	<div id={panelId} hidden={!expanded}>
		{#if expanded}
			<div class="space-y-3 pb-3">
				<p class="text-xs leading-relaxed text-muted-foreground">
					Open tasks that may be affected if this task changes, based on recorded
					dependencies. Completed or cancelled tasks stop the chain. Dates stay unchanged.
				</p>
				<div class="flex flex-wrap items-end gap-2">
					<label class="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
						Follow dependencies
						<select
							class="min-h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							value={maxDepth}
							onchange={changeDepth}
						>
							<option value={1}>1 step · direct only</option>
							<option value={2}>Up to 2 steps</option>
							<option value={3}>Up to 3 steps</option>
							<option value={4}>Up to 4 steps</option>
							<option value={5}>Up to 5 steps</option>
							<option value={6}>Up to 6 steps</option>
						</select>
					</label>
					<button
						type="button"
						class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						disabled={loading}
						onclick={() => void load()}
					>
						<RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
						{error ? 'Try again' : 'Recheck'}
					</button>
				</div>
				<div aria-live="polite" aria-busy={loading}>
					{#if loading}
						<p class="text-sm text-muted-foreground">Following task dependencies…</p>
					{:else if error}
						<p class="text-sm text-destructive" role="alert">{error}</p>
					{:else if visibleResult}
						<ErrorBoundary
							area="task-affected-work"
							resetKey={taskId}
							context={{ taskId }}
						>
							{#if visibleResult.truncated}
								<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
									Showing a partial view.
									{#if visibleResult.truncation_reasons.includes('tasks')}
										The {visibleResult.limits.max_tasks}-task limit was reached.
									{/if}
									{#if visibleResult.truncation_reasons.includes('depth')}
										More tasks may be connected beyond {visibleResult.limits
											.max_depth} steps.
									{/if}
								</p>
							{/if}
							{#if visibleResult.tasks.length === 0}
								<p class="text-sm text-muted-foreground">
									No open downstream tasks found in the recorded dependencies.
									Unlinked work may still be affected.
								</p>
							{:else}
								<p class="mb-2 text-xs text-muted-foreground">
									{visibleResult.tasks.length} potentially affected {visibleResult
										.tasks.length === 1
										? 'task'
										: 'tasks'}
								</p>
								<ul class="divide-y divide-border">
									{#each visibleResult.tasks as task (task.id)}
										<li class="min-w-0 space-y-1 py-2.5">
											<div
												class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"
											>
												<a
													href={resolve(
														'/projects/[id]/tasks/[task_id]',
														{
															id: visibleResult.source_task
																.project_id,
															task_id: task.id
														}
													)}
													class="min-w-0 break-words text-sm font-medium text-foreground underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>{task.title}</a
												>
												<span
													class="shrink-0 text-xs text-muted-foreground"
												>
													{task.distance === 1
														? 'Direct'
														: `Indirect · ${task.distance} steps`}
												</span>
											</div>
											<p
												class="break-words text-xs leading-relaxed text-muted-foreground"
											>
												<span class="sr-only">Dependency path: </span>
												{task.path.map((entry) => entry.title).join(' → ')}
											</p>
										</li>
									{/each}
								</ul>
							{/if}
						</ErrorBoundary>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>
