<!-- apps/web/src/lib/components/time-play/TimeBlockCreateModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';

	let {
		projects = [],
		initialStart,
		initialEnd,
		isCreating = false
	}: {
		projects?: Array<{ id: string; name: string; calendar_color_id?: string | null }>;
		initialStart?: Date;
		initialEnd?: Date;
		isCreating?: boolean;
	} = $props();

	const dispatch = createEventDispatcher<{
		create: {
			blockType: 'project' | 'build';
			projectId: string | null;
			startTime: Date;
			endTime: Date;
		};
		close: void;
	}>();

	function defaultStart() {
		const start = new Date();
		start.setMinutes(0, 0, 0);
		start.setHours(start.getHours() + 1);
		return start;
	}

	function defaultEnd() {
		const end = new Date(defaultStart());
		end.setHours(end.getHours() + 2);
		return end;
	}

	function formatForInput(date: Date): string {
		const pad = (value: number) => value.toString().padStart(2, '0');
		const year = date.getFullYear();
		const month = pad(date.getMonth() + 1);
		const day = pad(date.getDate());
		const hours = pad(date.getHours());
		const minutes = pad(date.getMinutes());
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	function parseInput(value: string): Date | null {
		if (!value) return null;
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	let blockType = $state<'project' | 'build'>(projects.length > 0 ? 'project' : 'build');
	let selectedProjectId = $state(projects[0]?.id ?? '');
	let startValue = $state(formatForInput(initialStart ?? defaultStart()));
	let endValue = $state(formatForInput(initialEnd ?? defaultEnd()));

	// Flag to prevent auto-adjustment during initialization
	let isInitialized = $state(false);

	$effect(() => {
		if (blockType === 'project') {
			if (!projects.find((project) => project.id === selectedProjectId)) {
				selectedProjectId = projects[0]?.id ?? '';
			}
		} else {
			selectedProjectId = '';
		}
	});

	$effect(() => {
		if (projects.length === 0 && blockType === 'project') {
			blockType = 'build';
		}
	});

	$effect(() => {
		if (initialStart) {
			startValue = formatForInput(initialStart);
		}
		if (initialEnd) {
			endValue = formatForInput(initialEnd);
		}
		// Mark as initialized after processing initial values
		isInitialized = true;
	});

	// Auto-adjust end time to be 15 minutes after start time when end becomes invalid
	$effect(() => {
		// Only auto-adjust after initialization and when start value changes
		if (isInitialized && startValue && endValue) {
			const start = parseInput(startValue);
			const end = parseInput(endValue);

			// Only adjust if end is before or equal to start (invalid state)
			if (start && end && end <= start) {
				const newEnd = new Date(start.getTime() + 15 * 60 * 1000); // Add 15 minutes
				endValue = formatForInput(newEnd);
			}
		}
	});

	function handleSubmit() {
		const start = parseInput(startValue);
		const end = parseInput(endValue);

		if (!start || !end) {
			alert('Please provide valid start and end times');
			return;
		}

		if (end <= start) {
			alert('End time must be after start time');
			return;
		}

		if (blockType === 'project' && !selectedProjectId) {
			alert('Please select a project');
			return;
		}

		dispatch('create', {
			blockType,
			projectId: blockType === 'project' ? selectedProjectId : null,
			startTime: start,
			endTime: end
		});
	}
</script>

<Modal title="Create Focus Block" isOpen={true} onClose={() => dispatch('close')} size="md">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-6">
			<div class="space-y-3">
				<fieldset class="space-y-3">
					<legend class="text-sm font-semibold text-slate-700 dark:text-slate-200">
						Block type
					</legend>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
						<button
							type="button"
							class={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition touch-manipulation ${
								blockType === 'project'
									? 'border-blue-500 bg-blue-500/10 text-blue-600 shadow-inner shadow-blue-200/50 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100'
									: 'border-slate-200 bg-white/80 text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:text-blue-200'
							}`}
							aria-pressed={blockType === 'project'}
							onclick={() => (blockType = 'project')}
							disabled={projects.length === 0}
						>
							<span class="block font-semibold">Project focus</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								Attach to a project for tailored suggestions.
							</span>
						</button>
						<button
							type="button"
							class={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition touch-manipulation ${
								blockType === 'build'
									? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 shadow-inner shadow-indigo-200/50 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-100'
									: 'border-slate-200 bg-white/80 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-200'
							}`}
							aria-pressed={blockType === 'build'}
							onclick={() => (blockType = 'build')}
						>
							<span class="block font-semibold">Build block</span>
							<span class="block text-xs text-slate-500 dark:text-slate-400">
								Protect flexible time across all projects.
							</span>
						</button>
					</div>
					<p class="text-xs text-slate-500 dark:text-slate-400">
						Project blocks pull high-impact tasks from the selected project. Build
						blocks stay flexible and surface suggestions across your workspace.
					</p>
				</fieldset>
			</div>

			{#if blockType === 'project'}
				<div class="space-y-3">
					<label
						class="text-sm font-semibold text-slate-700 dark:text-slate-200"
						for="project"
					>
						Project
					</label>
					<select
						id="project"
						class="w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner shadow-slate-200/70 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none touch-manipulation"
						bind:value={selectedProjectId}
						required={blockType === 'project'}
					>
						<option value="" disabled>Select a project…</option>
						{#each projects as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</div>
			{:else}
				<div
					class="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-inner shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300"
				>
					This block will stay project-agnostic. We'll recommend the most meaningful work
					across your active projects.
				</div>
			{/if}

			<div class="grid gap-5 sm:grid-cols-2">
				<div class="space-y-3">
					<label
						class="text-sm font-semibold text-slate-700 dark:text-slate-200"
						for="start"
					>
						Start time
					</label>
					<input
						id="start"
						type="datetime-local"
						class="w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner shadow-slate-200/70 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none touch-manipulation"
						bind:value={startValue}
						required
					/>
				</div>
				<div class="space-y-3">
					<label
						class="text-sm font-semibold text-slate-700 dark:text-slate-200"
						for="end"
					>
						End time
					</label>
					<input
						id="end"
						type="datetime-local"
						class="w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner shadow-slate-200/70 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none touch-manipulation"
						bind:value={endValue}
						required
					/>
				</div>
			</div>
		</div>
	</form>

	<!-- Footer with Actions - Outside form but still inside Modal -->
	<div
		class="flex flex-col sm:flex-row gap-3 sm:justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		<button
			type="button"
			class="order-2 sm:order-1 w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-slate-300/80 px-4 py-3 sm:py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-500 touch-manipulation"
			onclick={() => dispatch('close')}
		>
			Cancel
		</button>
		<button
			type="button"
			class="order-1 sm:order-2 w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 px-5 py-3 sm:py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:scale-[1.01] hover:shadow-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
			disabled={isCreating}
			onclick={handleSubmit}
		>
			{isCreating ? 'Creating…' : 'Create block'}
		</button>
	</div>
</Modal>
