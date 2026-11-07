<!-- apps/web/src/lib/components/ontology/RiskCreateModal.svelte -->
<!--
	Risk Creation Modal Component

	Creates risks within the BuildOS ontology system.
	Type is auto-classified after creation.

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/risks/create/+server.ts
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
	- Goal Creation: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte
-->
<script lang="ts">
	import {
		ChevronLeft,
		ChevronRight,
		AlertTriangle,
		Save,
		Shield,
		Zap,
		Users,
		Target,
		Lock,
		Bug,
		X
	} from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { RISK_STATES } from '$lib/types/onto';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (riskId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	// Risk type definitions (built-in, not fetched from templates)
	const RISK_TYPES = [
		{
			type_key: 'risk.technical',
			name: 'Technical risk',
			description: 'Code, architecture, or infrastructure issues',
			icon: Bug,
			category: 'Project'
		},
		{
			type_key: 'risk.resource',
			name: 'Resource risk',
			description: 'Team, time, or budget constraints',
			icon: Users,
			category: 'Project'
		},
		{
			type_key: 'risk.dependency',
			name: 'Dependency risk',
			description: 'External dependencies or third-party issues',
			icon: Zap,
			category: 'Project'
		},
		{
			type_key: 'risk.scope',
			name: 'Scope risk',
			description: 'Requirements creep or unclear scope',
			icon: Target,
			category: 'Project'
		},
		{
			type_key: 'risk.quality',
			name: 'Quality risk',
			description: 'Testing gaps or technical debt',
			icon: Shield,
			category: 'Quality'
		},
		{
			type_key: 'risk.security',
			name: 'Security risk',
			description: 'Vulnerabilities or compliance issues',
			icon: Lock,
			category: 'Quality'
		}
	];

	const IMPACT_OPTIONS = [
		{
			value: 'low',
			label: 'Low',
			description: 'Minor impact, easily recoverable',
			color: 'text-success'
		},
		{
			value: 'medium',
			label: 'Medium',
			description: 'Moderate impact, requires attention',
			color: 'text-warning'
		},
		{
			value: 'high',
			label: 'High',
			description: 'Significant impact on timeline or quality',
			color: 'text-accent'
		},
		{
			value: 'critical',
			label: 'Critical',
			description: 'Project-threatening, immediate action needed',
			color: 'text-destructive'
		}
	];

	const PROBABILITY_OPTIONS = [
		{ value: '0.1', label: 'Rare (10%)', description: 'Very unlikely to occur' },
		{ value: '0.25', label: 'Unlikely (25%)', description: 'Could happen but not expected' },
		{ value: '0.5', label: 'Possible (50%)', description: 'May or may not occur' },
		{ value: '0.75', label: 'Likely (75%)', description: 'More likely than not' },
		{ value: '0.9', label: 'Almost certain (90%)', description: 'Expected to occur' }
	];

	let selectedType = $state<(typeof RISK_TYPES)[0] | null>(null);
	let showTypeSelection = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1);

	// Form fields
	let title = $state('');
	let content = $state('');
	let impact = $state<string>('medium');
	let probability = $state<string>('0.5');
	let mitigationStrategy = $state('');
	let stateKey = $state('identified');

	// Group risk types by category
	const typesByCategory = $derived(
		RISK_TYPES.reduce((acc: Record<string, typeof RISK_TYPES>, type) => {
			const category = type.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(type);
			return acc;
		}, {})
	);

	function selectType(type: (typeof RISK_TYPES)[0]) {
		selectedType = type;
		slideDirection = 1;
		showTypeSelection = false;
	}

	function skipTypeSelection() {
		selectedType = {
			type_key: 'risk.general',
			name: 'General risk',
			description: 'A general project risk',
			icon: AlertTriangle,
			category: 'General'
		};
		slideDirection = 1;
		showTypeSelection = false;
	}

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();

		if (!title.trim()) {
			error = 'Risk title is required';
			return;
		}

		if (!impact) {
			error = 'Impact level is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				project_id: projectId,
				title: title.trim(),
				impact,
				probability: probability ? parseFloat(probability) : null,
				state_key: stateKey || 'identified',
				content: content.trim() || null,
				description: content.trim() || null,
				mitigation_strategy: mitigationStrategy.trim() || null,
				classification_source: 'create_modal'
			};

			const response = await fetch('/api/onto/risks/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create risk');
			}

			// Success! Call the callback
			if (onCreated) {
				onCreated(result.data.risk.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating risk:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/risks/create',
				method: 'POST',
				projectId,
				entityType: 'risk',
				operation: 'risk_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create risk';
			isSaving = false;
		}
	}

	function handleBack() {
		slideDirection = -1;
		showTypeSelection = true;
		selectedType = null;
		// Reset form
		title = '';
		content = '';
		impact = 'medium';
		probability = '0.5';
		mitigationStrategy = '';
		stateKey = 'identified';
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
			class="flex-shrink-0 bg-muted border-b border-border px-3 py-2 sm:px-4 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center shrink-0 text-muted-foreground"
				>
					<AlertTriangle class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-medium leading-tight truncate text-foreground"
					>
						{title || 'New risk'}
					</h2>
					<p class="text-2xs sm:text-xs text-muted-foreground">
						Type will be auto-classified
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				disabled={isSaving}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				aria-label="Close modal"
			>
				<X class="w-5 h-5" />
			</button>
		</div>
	{/snippet}

	<div class="px-2 py-2 sm:px-6 sm:py-4">
		<!-- Horizontal Slide Animation Between Views -->
		<div class="relative overflow-hidden" style="min-height: 420px;">
			{#key showTypeSelection}
				<div
					in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
					out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
					class="absolute inset-0 overflow-y-auto"
				>
					{#if showTypeSelection}
						<!-- RISK TYPE SELECTION VIEW -->
						<div class="space-y-3 sm:space-y-4">
							<!-- Header -->
							<div class="flex items-center gap-3 pb-4 border-b border-border">
								<AlertTriangle class="w-5 h-5 shrink-0 text-muted-foreground" />
								<div>
									<h3 class="text-lg font-medium text-foreground">
										What type of risk?
									</h3>
									<p class="text-sm text-muted-foreground">
										Select a category to help organize and track this risk
									</p>
								</div>
							</div>

							<div class="space-y-4 sm:space-y-6">
								{#each Object.entries(typesByCategory) as [category, types] (category)}
									<div>
										<h3 class="text-xs font-medium text-muted-foreground mb-3">
											{category}
										</h3>
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
											{#each types as type (type.type_key)}
												{@const TypeIcon = type.icon}
												<button
													type="button"
													onclick={() => selectType(type)}
													class="bg-card border border-border p-3 sm:p-4 rounded-lg text-left group hover:border-foreground/20 hover:bg-muted/50 transition-colors tx tx-frame tx-weak"
												>
													<div
														class="flex items-start justify-between mb-2"
													>
														<div class="flex items-center gap-2">
															<TypeIcon
																class="w-4 h-4 text-muted-foreground"
															/>
															<h4 class="font-medium text-foreground">
																{type.name}
															</h4>
														</div>
														<ChevronRight
															class="w-5 h-5 text-muted-foreground group-hover:text-foreground flex-shrink-0"
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
										class="w-full bg-muted border border-dashed border-border p-3 sm:p-4 rounded-lg text-left hover:border-foreground/20 transition-colors"
									>
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-3">
												<AlertTriangle
													class="w-5 h-5 text-muted-foreground"
												/>
												<div>
													<h4 class="font-medium text-foreground">
														General risk
													</h4>
													<p class="text-sm text-muted-foreground">
														Skip categorization and create a general
														risk
													</p>
												</div>
											</div>
											<ChevronRight class="w-5 h-5 text-muted-foreground" />
										</div>
									</button>
								</div>
							</div>
						</div>
					{:else}
						<!-- RISK DETAILS FORM -->
						<form class="space-y-3 sm:space-y-4" onsubmit={handleSubmit}>
							<!-- Selected Type Badge -->
							{#if selectedType}
								{@const SelectedTypeIcon = selectedType.icon}
								<div
									class="rounded-lg border border-border bg-muted p-3 sm:p-4 tx tx-grain tx-weak"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-3 flex-1 min-w-0">
											<SelectedTypeIcon
												class="w-4 h-4 shrink-0 text-muted-foreground"
											/>
											<div class="flex-1 min-w-0">
												<h4 class="text-sm font-medium text-foreground">
													{selectedType.name}
												</h4>
												<p class="text-xs text-muted-foreground truncate">
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

							<!-- Risk Title -->
							<FormField
								label="Title"
								labelFor="title"
								required={true}
								error={!title.trim() && error ? 'Risk title is required' : ''}
							>
								<TextInput
									id="title"
									bind:value={title}
									placeholder="What could go wrong?"
									inputmode="text"
									enterkeyhint="next"
									required={true}
									disabled={isSaving}
									error={!title.trim() && error ? true : false}
									size="md"
								/>
							</FormField>

							<!-- Description -->
							<FormField
								label="Details"
								labelFor="content"
								hint="Explain the risk in detail"
							>
								<Textarea
									id="content"
									bind:value={content}
									placeholder="What could happen, and why"
									enterkeyhint="next"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<!-- Impact & Probability Grid -->
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField label="Impact" labelFor="impact" required={true}>
									<Select
										id="impact"
										bind:value={impact}
										disabled={isSaving}
										size="md"
										placeholder="Select impact level"
									>
										{#each IMPACT_OPTIONS as opt (opt.value)}
											<option value={opt.value}
												>{opt.label} - {opt.description}</option
											>
										{/each}
									</Select>
								</FormField>

								<FormField
									label="Probability"
									labelFor="probability"
									hint="How likely is this to occur?"
								>
									<Select
										id="probability"
										bind:value={probability}
										disabled={isSaving}
										size="md"
										placeholder="Select likelihood"
									>
										{#each PROBABILITY_OPTIONS as opt (opt.value)}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</Select>
								</FormField>
							</div>

							<!-- Mitigation Strategy -->
							<FormField
								label="Mitigation"
								labelFor="mitigation_strategy"
								hint="How will you prevent or reduce this risk?"
							>
								<Textarea
									id="mitigation_strategy"
									bind:value={mitigationStrategy}
									placeholder="Steps to prevent or soften it"
									enterkeyhint="next"
									rows={3}
									disabled={isSaving}
									size="md"
								/>
							</FormField>

							<!-- Initial State -->
							<FormField label="Initial state" labelFor="state" required={true}>
								<Select
									id="state"
									bind:value={stateKey}
									disabled={isSaving}
									size="md"
									placeholder="Select state"
								>
									{#each RISK_STATES as state (state)}
										<option value={state}>
											{state === 'identified'
												? 'Identified'
												: state === 'mitigated'
													? 'Mitigated'
													: state === 'occurred'
														? 'Occurred'
														: state === 'closed'
															? 'Closed'
															: state}
										</option>
									{/each}
								</Select>
							</FormField>

							{#if error}
								<div
									class="p-4 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
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

	<!-- Footer Actions -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
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
					<ChevronLeft class="w-4 h-4" />
					<span class="hidden sm:inline">Back</span>
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
						disabled={isSaving || !title.trim()}
						onclick={handleSubmit}
						loading={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Create risk</span>
						<span class="sm:hidden">Create</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
