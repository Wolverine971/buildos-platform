<!-- apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte -->
<!--
	Milestone Creation Modal Component

	Creates milestones within the BuildOS ontology system.
	Type is auto-classified after creation.

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/milestones/create/+server.ts
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
	- Risk Creation: /apps/web/src/lib/components/ontology/RiskCreateModal.svelte
-->
<script lang="ts">
	import {
		ChevronRight,
		Loader,
		Flag,
		Save,
		Package,
		CheckCircle2,
		Milestone as MilestoneIcon,
		Calendar,
		Rocket,
		Clock
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { MILESTONE_STATES } from '$lib/types/onto';
	import { parseDateFromInput } from '$lib/utils/date-utils';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (milestoneId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	// Milestone type definitions (built-in, not fetched from templates)
	const MILESTONE_TYPES = [
		{
			type_key: 'milestone.delivery',
			name: 'Delivery',
			description: 'A key deliverable or artifact completion',
			icon: Package,
			category: 'Project'
		},
		{
			type_key: 'milestone.phase_complete',
			name: 'Phase Complete',
			description: 'Marks the end of a project phase',
			icon: CheckCircle2,
			category: 'Project'
		},
		{
			type_key: 'milestone.review',
			name: 'Review Point',
			description: 'Scheduled review or checkpoint',
			icon: MilestoneIcon,
			category: 'Project'
		},
		{
			type_key: 'milestone.deadline',
			name: 'Deadline',
			description: 'Hard deadline that must be met',
			icon: Clock,
			category: 'Timeline'
		},
		{
			type_key: 'milestone.release',
			name: 'Release',
			description: 'Software or product release',
			icon: Rocket,
			category: 'Timeline'
		},
		{
			type_key: 'milestone.launch',
			name: 'Launch',
			description: 'Go-live or public launch date',
			icon: Flag,
			category: 'Timeline'
		}
	];

	const STATE_OPTIONS = MILESTONE_STATES.map((state) => ({
		value: state,
		label:
			state === 'pending'
				? 'Pending'
				: state === 'in_progress'
					? 'In Progress'
					: state === 'completed'
						? 'Completed'
						: state === 'missed'
							? 'Missed'
							: state,
		description:
			state === 'pending'
				? 'Not yet started'
				: state === 'in_progress'
					? 'Work is underway'
					: state === 'completed'
						? 'Successfully completed'
						: 'Deadline was not met'
	}));

	let selectedType = $state<(typeof MILESTONE_TYPES)[0] | null>(null);
	let showTypeSelection = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1);

	// Form fields
	let title = $state('');
	let description = $state('');
	let milestoneDetails = $state('');
	let dueAt = $state('');
	let stateKey = $state('pending');

	// Group milestone types by category
	const typesByCategory = $derived(
		MILESTONE_TYPES.reduce((acc: Record<string, typeof MILESTONE_TYPES>, type) => {
			const category = type.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(type);
			return acc;
		}, {})
	);

	// Format date for the input (local date)
	function getDefaultDate(): string {
		const date = new Date();
		date.setDate(date.getDate() + 7); // Default to 1 week from now
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Initialize date
	$effect(() => {
		if (!dueAt) {
			dueAt = getDefaultDate();
		}
	});

	function selectType(type: (typeof MILESTONE_TYPES)[0]) {
		selectedType = type;
		slideDirection = 1;
		showTypeSelection = false;
	}

	function skipTypeSelection() {
		selectedType = {
			type_key: 'milestone.general',
			name: 'General Milestone',
			description: 'A general project milestone',
			icon: Flag,
			category: 'General'
		};
		slideDirection = 1;
		showTypeSelection = false;
	}

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();

		if (!title.trim()) {
			error = 'Milestone title is required';
			return;
		}

		if (!dueAt) {
			error = 'Due date is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const dueDateIso = parseDateFromInput(dueAt);
			if (!dueDateIso) {
				error = 'Due date must be a valid date';
				isSaving = false;
				return;
			}

			const requestBody = {
				project_id: projectId,
				title: title.trim(),
				milestone: milestoneDetails.trim() || null,
				due_at: dueDateIso,
				state_key: stateKey || 'pending',
				description: description.trim() || null,
				classification_source: 'create_modal'
			};

			const response = await fetch('/api/onto/milestones/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create milestone');
			}

			// Success! Call the callback
			if (onCreated) {
				onCreated(result.data.milestone.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating milestone:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/milestones/create',
				method: 'POST',
				projectId,
				entityType: 'milestone',
				operation: 'milestone_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create milestone';
			isSaving = false;
		}
	}

	function handleBack() {
		slideDirection = -1;
		showTypeSelection = true;
		selectedType = null;
		// Reset form
		title = '';
		description = '';
		milestoneDetails = '';
		dueAt = getDefaultDate();
		stateKey = 'pending';
		error = '';
	}

	function handleClose() {
		onClose();
	}
</script>

<Modal
	isOpen={true}
	onClose={handleClose}
	size="xl"
	closeOnEscape={!isSaving}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0"
				>
					<Flag class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || 'New Milestone'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						Type will be auto-classified
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				disabled={isSaving}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400 tx tx-grain tx-weak"
				aria-label="Close modal"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-2 py-2 sm:px-6 sm:py-4">
			<!-- Horizontal Slide Animation Between Views -->
			<div class="relative overflow-hidden" style="min-height: 380px;">
				{#key showTypeSelection}
					<div
						in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
						out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
						class="absolute inset-0 overflow-y-auto"
					>
						{#if showTypeSelection}
							<!-- MILESTONE TYPE SELECTION VIEW -->
							<div class="space-y-3 sm:space-y-4">
								<!-- Header -->
								<div class="flex items-center gap-3 pb-4 border-b border-border">
									<div class="p-2 rounded bg-muted tx tx-bloom tx-weak">
										<Flag class="w-5 h-5 text-amber-500" />
									</div>
									<div>
										<h3 class="text-lg font-semibold text-foreground">
											What Type of Milestone?
										</h3>
										<p class="text-sm text-muted-foreground">
											Select a category to help organize and track this
											milestone
										</p>
									</div>
								</div>

								<div class="space-y-4 sm:space-y-6">
									{#each Object.entries(typesByCategory) as [category, types]}
										<div>
											<h3
												class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"
											>
												<span class="w-1.5 h-1.5 bg-amber-500 rounded-full"
												></span>
												{category}
											</h3>
											<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
												{#each types as type}
													{@const TypeIcon = type.icon}
													<button
														type="button"
														onclick={() => selectType(type)}
														class="bg-card border border-border p-2.5 sm:p-4 rounded-lg text-left group hover:border-amber-500 shadow-ink transition-all duration-200"
													>
														<div
															class="flex items-start justify-between mb-2"
														>
															<div class="flex items-center gap-2">
																<TypeIcon
																	class="w-4 h-4 text-amber-500"
																/>
																<h4
																	class="font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors"
																>
																	{type.name}
																</h4>
															</div>
															<ChevronRight
																class="w-5 h-5 text-muted-foreground group-hover:text-amber-500 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
															/>
														</div>
														<p
															class="text-sm text-muted-foreground line-clamp-2"
														>
															{type.description}
														</p>
													</button>
												{/each}
											</div>
										</div>
									{/each}

									<!-- Quick Add Option -->
									<div class="pt-4 border-t border-border">
										<button
											type="button"
											onclick={skipTypeSelection}
											class="w-full bg-muted/50 border border-dashed border-border p-2.5 sm:p-4 rounded-lg text-left hover:bg-muted hover:border-amber-500/50 transition-all duration-200"
										>
											<div class="flex items-center justify-between">
												<div class="flex items-center gap-3">
													<Flag class="w-5 h-5 text-muted-foreground" />
													<div>
														<h4 class="font-medium text-foreground">
															General Milestone
														</h4>
														<p class="text-sm text-muted-foreground">
															Skip categorization and create a general
															milestone
														</p>
													</div>
												</div>
												<ChevronRight
													class="w-5 h-5 text-muted-foreground"
												/>
											</div>
										</button>
									</div>
								</div>
							</div>
						{:else}
							<!-- MILESTONE DETAILS FORM -->
							<form class="space-y-3 sm:space-y-4" onsubmit={handleSubmit}>
								<!-- Selected Type Badge -->
								{#if selectedType}
									{@const SelectedTypeIcon = selectedType.icon}
									<div
										class="rounded-lg border border-border bg-muted/30 p-2.5 sm:p-4 tx tx-grain tx-weak"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="flex items-center gap-3 flex-1 min-w-0">
												<div class="p-2 rounded bg-card shadow-ink">
													<SelectedTypeIcon
														class="w-4 h-4 text-amber-500"
													/>
												</div>
												<div class="flex-1 min-w-0">
													<h4
														class="text-sm font-semibold text-foreground"
													>
														{selectedType.name}
													</h4>
													<p
														class="text-xs text-muted-foreground truncate"
													>
														{selectedType.description}
													</p>
												</div>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onclick={handleBack}
												class="shrink-0"
											>
												Change
											</Button>
										</div>
									</div>
								{/if}

								<!-- Milestone Title -->
								<FormField
									label="Milestone Title"
									labelFor="title"
									required={true}
									error={!title.trim() && error
										? 'Milestone title is required'
										: ''}
								>
									<TextInput
										id="title"
										bind:value={title}
										placeholder="What needs to be achieved?"
										inputmode="text"
										enterkeyhint="next"
										required={true}
										disabled={isSaving}
										error={!title.trim() && error ? true : false}
										size="md"
									/>
								</FormField>

								<!-- Due Date -->
								<FormField
									label="Due Date"
									labelFor="due_at"
									required={true}
									error={!dueAt && error ? 'Due date is required' : ''}
								>
									<div class="relative">
										<Calendar
											class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
										/>
										<input
											type="date"
											id="due_at"
											bind:value={dueAt}
											class="w-full pl-10 pr-3 py-2.5 rounded-lg border bg-background text-foreground
												{!dueAt && error ? 'border-destructive' : 'border-border'}
												focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500
												disabled:opacity-50 disabled:cursor-not-allowed"
											disabled={isSaving}
											required
										/>
									</div>
								</FormField>

								<!-- Description -->
								<FormField
									label="Description"
									labelFor="description"
									hint="Describe what this milestone represents"
								>
									<Textarea
										id="description"
										bind:value={description}
										placeholder="What does achieving this milestone mean for the project?"
										enterkeyhint="next"
										rows={3}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<FormField
									label="Milestone Details"
									labelFor="milestone_details"
									hint="Optional extended milestone notes"
								>
									<Textarea
										id="milestone_details"
										bind:value={milestoneDetails}
										placeholder="Add any additional milestone context or criteria..."
										enterkeyhint="next"
										rows={3}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<!-- Initial State -->
								<FormField label="Initial State" labelFor="state" required={true}>
									<Select
										id="state"
										bind:value={stateKey}
										disabled={isSaving}
										size="md"
										placeholder="Select state"
									>
										{#each STATE_OPTIONS as opt}
											<option value={opt.value}
												>{opt.label} - {opt.description}</option
											>
										{/each}
									</Select>
								</FormField>

								{#if error}
									<div
										class="p-4 bg-destructive/10 border border-destructive/30 rounded-lg"
									>
										<p class="text-sm text-destructive">
											{error}
										</p>
									</div>
								{/if}
							</form>
						{/if}
					</div>
				{/key}
			</div>
		</div>
	{/snippet}

	<!-- Footer Actions -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-3 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			{#if showTypeSelection}
				<div class="flex-1"></div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					Cancel
				</Button>
			{:else}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleBack}
					disabled={isSaving}
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					<span class="hidden sm:inline">&larr; Back</span>
					<span class="sm:hidden">&larr;</span>
				</Button>
				<div class="flex flex-row items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={isSaving || !title.trim() || !dueAt}
						onclick={handleSubmit}
						loading={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Create Milestone</span>
						<span class="sm:hidden">Create</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
