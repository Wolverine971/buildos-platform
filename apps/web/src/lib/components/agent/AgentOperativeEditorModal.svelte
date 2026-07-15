<!-- apps/web/src/lib/components/agent/AgentOperativeEditorModal.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { AgentOperativeRow } from '$lib/stores/agentOperativesStore';
	import {
		Bot,
		CalendarClock,
		ChevronDown,
		Eye,
		FolderKanban,
		Globe,
		LoaderCircle,
		PencilLine,
		Save,
		ShieldCheck,
		SlidersHorizontal
	} from '$lib/icons/lucide';

	type ContextType = 'global' | 'project';
	type ScopeMode = 'read_only' | 'read_write';
	type ScheduleFrequency = 'daily' | 'weekly';

	interface ProjectOption {
		id: string;
		name: string;
	}

	let {
		isOpen,
		operative = null,
		onClose,
		onSaved
	}: {
		isOpen: boolean;
		operative?: AgentOperativeRow | null;
		onClose: () => void;
		onSaved?: (operative: AgentOperativeRow) => void;
	} = $props();

	const propsId = $props.id();
	const formId = `agent-operative-editor-${propsId}`;
	const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	const dayOptions = [
		{ value: 0, label: 'Sun' },
		{ value: 1, label: 'Mon' },
		{ value: 2, label: 'Tue' },
		{ value: 3, label: 'Wed' },
		{ value: 4, label: 'Thu' },
		{ value: 5, label: 'Fri' },
		{ value: 6, label: 'Sat' }
	];

	let label = $state('');
	let goal = $state('');
	let instructions = $state('');
	let expectedOutput = $state('');
	let contextType = $state<ContextType>('global');
	let projectId = $state('');
	let scopeMode = $state<ScopeMode>('read_only');
	let review = $state(false);
	let scheduleEnabled = $state(false);
	let scheduleFrequency = $state<ScheduleFrequency>('daily');
	let scheduleTime = $state('09:00');
	let scheduleDay = $state(1);
	let scheduleTimezone = $state('UTC');
	let showAdvanced = $state(false);
	let submitting = $state(false);
	let formError = $state<string | null>(null);
	let projects = $state<ProjectOption[]>([]);
	let projectsLoaded = $state(false);
	let projectsLoading = $state(false);
	let projectsError = $state<string | null>(null);
	let wasOpen = false;

	let trimmedGoal = $derived(goal.trim());
	let canSubmit = $derived(
		Boolean(trimmedGoal) &&
			(contextType !== 'project' || Boolean(projectId)) &&
			(!scheduleEnabled || Boolean(scheduleTime.trim())) &&
			!submitting &&
			(contextType !== 'project' || !projectsLoading)
	);
	let title = $derived(operative ? 'Edit automation' : 'New automation');
	let accessSummary = $derived(
		scopeMode === 'read_only'
			? 'Review only'
			: review
				? 'Can make changes · approval required'
				: 'Can make changes automatically'
	);
	let optionalDetailCount = $derived(
		Number(Boolean(instructions.trim())) + Number(Boolean(expectedOutput.trim()))
	);
	let advancedSummary = $derived(
		[
			accessSummary,
			scheduleEnabled ? `Timezone: ${scheduleTimezone || 'UTC'}` : null,
			optionalDetailCount
				? `${optionalDetailCount} custom ${optionalDetailCount === 1 ? 'detail' : 'details'}`
				: null
		]
			.filter(Boolean)
			.join(' · ')
	);

	$effect(() => {
		if (isOpen && !wasOpen) {
			resetForm(operative);
		}
		wasOpen = isOpen;
	});

	$effect(() => {
		if (!isOpen || contextType !== 'project' || projectsLoaded || projectsLoading) return;
		void loadProjects();
	});

	function resetForm(row: AgentOperativeRow | null) {
		label = row?.label ?? '';
		goal = row?.goal ?? '';
		instructions = row?.instructions ?? '';
		expectedOutput = row?.expected_output ?? '';
		contextType = row?.context_type === 'project' ? 'project' : 'global';
		projectId = row?.project_id ?? '';
		scopeMode = row?.scope_mode === 'read_write' ? 'read_write' : 'read_only';
		review = row?.scope_mode === 'read_write' ? (row.review_required ?? false) : false;
		scheduleEnabled = row?.schedule_enabled ?? false;
		scheduleFrequency = row?.schedule_frequency === 'weekly' ? 'weekly' : 'daily';
		scheduleTime = (row?.schedule_time_of_day ?? '09:00:00').slice(0, 5);
		scheduleDay = row?.schedule_day_of_week ?? 1;
		scheduleTimezone = row?.schedule_timezone ?? localTimezone;
		showAdvanced = Boolean(
			row &&
				(row.scope_mode === 'read_write' ||
					row.review_required ||
					row.instructions ||
					row.expected_output ||
					(scheduleEnabled && scheduleTimezone !== localTimezone))
		);
		submitting = false;
		formError = null;
	}

	function segmentClass(active: boolean): string {
		return [
			'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
			active
				? 'bg-card text-foreground shadow-ink'
				: 'text-muted-foreground hover:bg-background hover:text-foreground'
		].join(' ');
	}

	function inputClass(): string {
		return 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-ink placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';
	}

	function setContextType(next: ContextType) {
		contextType = next;
		formError = null;
		if (next === 'global') {
			projectId = '';
			return;
		}
		void loadProjects();
	}

	function setScopeMode(next: ScopeMode) {
		scopeMode = next;
		formError = null;
		if (next === 'read_only') review = false;
	}

	async function loadProjects() {
		if (projectsLoading || projectsLoaded) return;
		projectsLoading = true;
		projectsError = null;
		try {
			const response = await fetch(
				'/api/projects?mode=context-selection&status=active,planning&limit=100&include_counts=false',
				{ headers: { accept: 'application/json' } }
			);
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				projectsError = body?.message || body?.error || 'Could not load projects';
				return;
			}
			const rows = Array.isArray(body?.data?.projects) ? body.data.projects : [];
			projects = rows
				.filter((project: ProjectOption) => project?.id && project?.name)
				.map((project: ProjectOption) => ({ id: project.id, name: project.name }));
			projectsLoaded = true;
		} catch (error) {
			console.warn('[AgentOperativeEditorModal] Failed to load projects', error);
			projectsError = 'Could not load projects';
		} finally {
			projectsLoading = false;
		}
	}

	function handleClose() {
		if (submitting) return;
		onClose();
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;

		submitting = true;
		formError = null;

		const payload = {
			label: label.trim() || undefined,
			goal: trimmedGoal,
			instructions: instructions.trim() || undefined,
			expected_output: expectedOutput.trim() || undefined,
			context_type: contextType,
			project_id: contextType === 'project' ? projectId : undefined,
			scope_mode: scopeMode,
			review: scopeMode === 'read_write' ? review : false,
			schedule: {
				enabled: scheduleEnabled,
				frequency: scheduleFrequency,
				time_of_day: `${scheduleTime}:00`,
				day_of_week: scheduleFrequency === 'weekly' ? scheduleDay : null,
				timezone: scheduleTimezone.trim() || 'UTC'
			}
		};

		const endpoint = operative
			? `/api/agent-operatives/${operative.id}`
			: '/api/agent-operatives';
		const method = operative ? 'PATCH' : 'POST';

		try {
			const response = await fetch(endpoint, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				const message = body?.message || body?.error || 'Could not save this automation';
				formError = message;
				toastService.error(message);
				return;
			}

			const saved = body?.data?.operative as AgentOperativeRow | undefined;
			if (saved) onSaved?.(saved);
			toastService.success(operative ? 'Automation updated' : 'Automation saved');
			onClose();
		} catch (error) {
			console.warn('[AgentOperativeEditorModal] Failed to save operative', error);
			formError = 'Could not save this automation';
			toastService.error('Could not save this automation');
		} finally {
			submitting = false;
		}
	}
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	{title}
	size="lg"
	closeOnBackdrop={!submitting}
	closeOnEscape={!submitting}
>
	{#snippet children()}
		<form id={formId} onsubmit={handleSubmit} class="space-y-4 px-3 py-3 sm:px-4 sm:py-4">
			<div class="flex items-start gap-3 rounded-lg border border-border bg-muted/35 p-3">
				<Bot class="mt-0.5 h-5 w-5 flex-shrink-0 text-foreground" />
				<div class="min-w-0 flex-1">
					<label for={`${formId}-goal`} class="text-sm font-semibold text-foreground">
						What should this automation do?
					</label>
					<textarea
						id={`${formId}-goal`}
						bind:value={goal}
						rows="3"
						disabled={submitting}
						required
						placeholder="Review this project every week and flag anything blocked…"
						class="{inputClass()} mt-2 resize-y"
					></textarea>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-2">
					<label for={`${formId}-label`} class="text-sm font-medium text-foreground">
						Name
					</label>
					<input
						id={`${formId}-label`}
						bind:value={label}
						disabled={submitting}
						placeholder="Optional"
						class={inputClass()}
					/>
				</div>

				<div class="space-y-2">
					<div class="text-sm font-medium text-foreground">Work in</div>
					<div
						class="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1"
					>
						<button
							type="button"
							class={segmentClass(contextType === 'global')}
							aria-pressed={contextType === 'global'}
							disabled={submitting}
							onclick={() => setContextType('global')}
						>
							<Globe class="h-4 w-4" />
							<span>Workspace</span>
						</button>
						<button
							type="button"
							class={segmentClass(contextType === 'project')}
							aria-pressed={contextType === 'project'}
							disabled={submitting}
							onclick={() => setContextType('project')}
						>
							<FolderKanban class="h-4 w-4" />
							<span>Project</span>
						</button>
					</div>
				</div>
			</div>

			{#if contextType === 'project'}
				<div class="space-y-2">
					<label for={`${formId}-project`} class="text-sm font-medium text-foreground">
						Project
					</label>
					{#if projectsLoading}
						<div
							class="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
						>
							<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
							<span>Loading projects...</span>
						</div>
					{:else if projectsError}
						<div
							class="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
						>
							{projectsError}
						</div>
					{:else}
						<select
							id={`${formId}-project`}
							bind:value={projectId}
							disabled={submitting || projects.length === 0}
							required={contextType === 'project'}
							class={inputClass()}
						>
							<option value="" disabled>
								{projects.length ? 'Choose a project' : 'No projects available'}
							</option>
							{#each projects as project (project.id)}
								<option value={project.id}>{project.name}</option>
							{/each}
						</select>
					{/if}
				</div>
			{/if}

			<button
				type="button"
				class="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-ink transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				aria-expanded={showAdvanced}
				aria-controls={`${formId}-advanced-access ${formId}-advanced-timezone ${formId}-advanced-details`}
				disabled={submitting}
				onclick={() => (showAdvanced = !showAdvanced)}
			>
				<SlidersHorizontal
					class="h-4 w-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<span class="min-w-0 flex-1">
					<span class="block text-sm font-medium text-foreground">Automation options</span
					>
					<span class="block truncate text-xs text-muted-foreground"
						>{advancedSummary}</span
					>
				</span>
				<ChevronDown
					class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {showAdvanced
						? 'rotate-180'
						: ''}"
					aria-hidden="true"
				/>
			</button>

			{#if showAdvanced}
				<div
					id={`${formId}-advanced-access`}
					class="space-y-3 rounded-lg border border-border bg-muted/20 p-3"
				>
					<p class="micro-label font-semibold text-muted-foreground">Access policy</p>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-2">
							<div class="text-sm font-medium text-foreground">Access</div>
							<div
								class="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1"
							>
								<button
									type="button"
									class={segmentClass(scopeMode === 'read_only')}
									aria-pressed={scopeMode === 'read_only'}
									disabled={submitting}
									onclick={() => setScopeMode('read_only')}
								>
									<Eye class="h-4 w-4" />
									<span>Review only</span>
								</button>
								<button
									type="button"
									class={segmentClass(scopeMode === 'read_write')}
									aria-pressed={scopeMode === 'read_write'}
									disabled={submitting}
									onclick={() => setScopeMode('read_write')}
								>
									<PencilLine class="h-4 w-4" />
									<span>Can make changes</span>
								</button>
							</div>
						</div>

						<label
							class="flex min-h-[78px] items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-ink {scopeMode ===
							'read_write'
								? ''
								: 'opacity-60'}"
						>
							<span class="flex min-w-0 items-center gap-2">
								<ShieldCheck class="h-4 w-4 flex-shrink-0 text-muted-foreground" />
								<span class="min-w-0">
									<span class="block text-sm font-medium text-foreground"
										>Ask before applying</span
									>
									<span class="block text-xs text-muted-foreground"
										>You approve any changes first</span
									>
								</span>
							</span>
							<span class="relative inline-flex flex-shrink-0 items-center">
								<input
									type="checkbox"
									bind:checked={review}
									disabled={scopeMode !== 'read_write' || submitting}
									class="peer sr-only"
								/>
								<span
									aria-hidden="true"
									class="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-accent peer-disabled:cursor-not-allowed after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-card after:shadow-ink after:transition-transform peer-checked:after:translate-x-5 motion-reduce:transition-none motion-reduce:after:transition-none"
								></span>
							</span>
						</label>
					</div>
				</div>
			{/if}

			<div class="space-y-3 rounded-lg border border-border bg-muted/35 p-3">
				<label class="flex items-center justify-between gap-3">
					<span class="flex min-w-0 items-center gap-2">
						<CalendarClock class="h-4 w-4 flex-shrink-0 text-muted-foreground" />
						<span class="text-sm font-medium text-foreground">Schedule</span>
					</span>
					<span class="relative inline-flex flex-shrink-0 items-center">
						<input
							type="checkbox"
							bind:checked={scheduleEnabled}
							disabled={submitting}
							class="peer sr-only"
						/>
						<span
							aria-hidden="true"
							class="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-accent peer-disabled:cursor-not-allowed after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-card after:shadow-ink after:transition-transform peer-checked:after:translate-x-5 motion-reduce:transition-none motion-reduce:after:transition-none"
						></span>
					</span>
				</label>

				{#if scheduleEnabled}
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-2">
							<label
								for={`${formId}-frequency`}
								class="text-sm font-medium text-foreground"
							>
								Frequency
							</label>
							<select
								id={`${formId}-frequency`}
								bind:value={scheduleFrequency}
								disabled={submitting}
								class={inputClass()}
							>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
							</select>
						</div>
						<div class="space-y-2">
							<label
								for={`${formId}-time`}
								class="text-sm font-medium text-foreground"
							>
								Time
							</label>
							<input
								id={`${formId}-time`}
								type="time"
								bind:value={scheduleTime}
								disabled={submitting}
								required={scheduleEnabled}
								class={inputClass()}
							/>
						</div>
					</div>

					{#if scheduleFrequency === 'weekly'}
						<div class="grid grid-cols-7 gap-1">
							{#each dayOptions as day (day.value)}
								<button
									type="button"
									class={segmentClass(scheduleDay === day.value)}
									aria-pressed={scheduleDay === day.value}
									disabled={submitting}
									onclick={() => (scheduleDay = day.value)}
								>
									<span>{day.label}</span>
								</button>
							{/each}
						</div>
					{/if}

					{#if showAdvanced}
						<div id={`${formId}-advanced-timezone`} class="space-y-2">
							<label
								for={`${formId}-timezone`}
								class="text-sm font-medium text-foreground"
							>
								Timezone
							</label>
							<input
								id={`${formId}-timezone`}
								bind:value={scheduleTimezone}
								disabled={submitting}
								class={inputClass()}
							/>
						</div>
					{:else}
						<p class="text-xs text-muted-foreground">
							Times use <span class="font-medium text-foreground"
								>{scheduleTimezone}</span
							>.
						</p>
					{/if}
				{/if}
			</div>

			{#if showAdvanced}
				<div id={`${formId}-advanced-details`} class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<label
							for={`${formId}-instructions`}
							class="text-sm font-medium text-foreground"
						>
							Instructions
						</label>
						<textarea
							id={`${formId}-instructions`}
							bind:value={instructions}
							rows="3"
							disabled={submitting}
							placeholder="Optional"
							class="{inputClass()} resize-y"
						></textarea>
					</div>
					<div class="space-y-2">
						<label
							for={`${formId}-expected-output`}
							class="text-sm font-medium text-foreground"
						>
							Expected output
						</label>
						<textarea
							id={`${formId}-expected-output`}
							bind:value={expectedOutput}
							rows="3"
							disabled={submitting}
							placeholder="Optional"
							class="{inputClass()} resize-y"
						></textarea>
					</div>
				</div>
			{/if}

			{#if formError}
				<div
					class="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
				>
					{formError}
				</div>
			{/if}
		</form>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex items-center justify-end gap-2 border-t border-border bg-muted/50 px-3 py-3 sm:px-4"
		>
			<Button onclick={handleClose} variant="outline" size="md" disabled={submitting}>
				Cancel
			</Button>
			<Button
				type="submit"
				form={formId}
				variant="primary"
				size="md"
				icon={Save}
				loading={submitting}
				disabled={!canSubmit}
			>
				{submitting ? 'Saving…' : 'Save automation'}
			</Button>
		</div>
	{/snippet}
</Modal>
