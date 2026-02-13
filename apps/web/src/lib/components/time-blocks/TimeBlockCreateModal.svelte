<!-- apps/web/src/lib/components/time-blocks/TimeBlockCreateModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import type { FormConfig } from '$lib/types/form';

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
		// Format as local datetime string for datetime-local input
		// datetime-local expects YYYY-MM-DDTHH:mm format in local time
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
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

	// Form config for time fields only (project selector is in the before-form slot)
	const formConfig: FormConfig = {
		startTime: {
			type: 'datetime-local',
			label: 'Start time',
			required: true
		},
		endTime: {
			type: 'datetime-local',
			label: 'End time',
			required: true
		}
	};

	let initialData = $derived({
		startTime: startValue,
		endTime: endValue
	});

	async function handleSubmit(data: Record<string, any>) {
		const start = parseInput(data.startTime);
		const end = parseInput(data.endTime);

		if (!start || !end) {
			throw new Error('Please provide valid start and end times');
		}

		if (end <= start) {
			throw new Error('End time must be after start time');
		}

		if (blockType === 'project' && !selectedProjectId) {
			throw new Error('Please select a project');
		}

		// Update state from form data
		startValue = data.startTime;
		endValue = data.endTime;

		dispatch('create', {
			blockType,
			projectId: blockType === 'project' ? selectedProjectId : null,
			startTime: start,
			endTime: end
		});
	}
</script>

<FormModal
	isOpen={true}
	title="Create Focus Block"
	submitText="Create block"
	loadingText="Creating…"
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	onClose={() => dispatch('close')}
	size="lg"
	customClasses="z-[100]"
>
	<!-- Block type selector and project selector before form fields -->
	{#snippet beforeForm()}
		<div class="px-6 pt-6 pb-0 space-y-5">
			<fieldset class="space-y-3">
				<legend class="text-sm font-semibold text-foreground"
					>Block type</legend
				>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<button
						type="button"
						class={`rounded-xl border px-4 py-4 text-left text-sm font-medium transition-all touch-manipulation ${
							blockType === 'project'
								? 'border-blue-600 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-ink ring-2 ring-blue-200 dark:border-blue-400 dark:from-blue-900/20 dark:to-indigo-900/20 dark:text-blue-100 dark:ring-blue-800'
								: 'border-border bg-card text-foreground hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 dark:text-muted-foreground dark:hover:border-blue-400 dark:hover:bg-blue-900/10 dark:hover:text-blue-200'
						}`}
						aria-pressed={blockType === 'project'}
						onclick={() => (blockType = 'project')}
						disabled={projects.length === 0}
					>
						<span class="block font-semibold text-base mb-1">Project focus</span>
						<span class="block text-xs text-muted-foreground">
							Attach to a project for tailored suggestions.
						</span>
					</button>
					<button
						type="button"
						class={`rounded-xl border px-4 py-4 text-left text-sm font-medium transition-all touch-manipulation ${
							blockType === 'build'
								? 'border-indigo-600 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 shadow-ink ring-2 ring-indigo-200 dark:border-indigo-400 dark:from-indigo-900/20 dark:to-purple-900/20 dark:text-indigo-100 dark:ring-indigo-800'
								: 'border-border bg-card text-foreground hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:text-muted-foreground dark:hover:border-indigo-400 dark:hover:bg-indigo-900/10 dark:hover:text-indigo-200'
						}`}
						aria-pressed={blockType === 'build'}
						onclick={() => (blockType = 'build')}
					>
						<span class="block font-semibold text-base mb-1">Build block</span>
						<span class="block text-xs text-muted-foreground">
							Protect flexible time across all projects.
						</span>
					</button>
				</div>
				<p class="text-xs text-muted-foreground leading-relaxed">
					Project blocks pull high-impact tasks from the selected project. Build blocks
					stay flexible and surface suggestions across your workspace.
				</p>
			</fieldset>

			{#if blockType === 'project'}
				<!-- Project selector with card-style matching FormModal pattern -->
				<div
					class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 border-blue-200 rounded-xl border p-5 shadow-ink"
				>
					<div class="flex items-center gap-2 mb-3">
						<svg
							class="w-4 h-4 text-muted-foreground"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
							/>
						</svg>
						<label
							for="project-select"
							class="text-sm font-semibold text-foreground uppercase tracking-wider"
						>
							Project
							<span class="text-red-500 ml-0.5">*</span>
						</label>
					</div>
					<p class="text-xs text-muted-foreground mb-3">
						Select the project this focus block is for
					</p>
					<select
						id="project-select"
						class="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-foreground"
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
					class="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 px-4 py-3.5 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-gradient-to-br dark:from-indigo-900/20 dark:to-purple-900/20 dark:text-indigo-100"
				>
					<div class="flex items-start gap-2">
						<svg
							class="w-5 h-5 flex-shrink-0 mt-0.5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>
							This block will stay project-agnostic. We'll recommend the most
							meaningful work across your active projects.
						</span>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}
</FormModal>

<style lang="postcss">
	:global(.modal-content) {
		z-index: 100;
	}
</style>
