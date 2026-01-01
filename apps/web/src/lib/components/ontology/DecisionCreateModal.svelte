<!-- apps/web/src/lib/components/ontology/DecisionCreateModal.svelte -->
<!--
	Decision Creation Modal Component

	Creates decisions within the BuildOS ontology system.
	Decisions record key choices made during project execution.

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Mobile Command Center: /apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/decisions/+server.ts
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
-->
<script lang="ts">
	import { Scale, Save, Loader } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (decisionId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	// State options
	const STATE_OPTIONS = [
		{ value: 'pending', label: 'Pending', description: 'Decision not yet made' },
		{ value: 'made', label: 'Made', description: 'Decision has been finalized' },
		{ value: 'deferred', label: 'Deferred', description: 'Decision postponed' },
		{ value: 'reversed', label: 'Reversed', description: 'Decision overturned' }
	];

	let isSaving = $state(false);
	let error = $state('');

	// Form fields
	let title = $state('');
	let description = $state('');
	let outcome = $state('');
	let rationale = $state('');
	let stateKey = $state('pending');
	let decisionAt = $state('');

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();

		if (!title.trim()) {
			error = 'Decision title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody: Record<string, unknown> = {
				project_id: projectId,
				title: title.trim(),
				state_key: stateKey
			};

			if (description.trim()) {
				requestBody.description = description.trim();
			}

			if (outcome.trim()) {
				requestBody.outcome = outcome.trim();
			}

			if (rationale.trim()) {
				requestBody.rationale = rationale.trim();
			}

			if (decisionAt) {
				requestBody.decision_at = new Date(decisionAt).toISOString();
			}

			const response = await fetch('/api/onto/decisions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create decision');
			}

			if (onCreated) {
				onCreated(result.data.decision.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating decision:', err);
			error = err instanceof Error ? err.message : 'Failed to create decision';
			isSaving = false;
		}
	}

	function handleClose() {
		onClose();
	}
</script>

<Modal
	isOpen={true}
	onClose={handleClose}
	size="lg"
	closeOnEscape={!isSaving}
	showCloseButton={false}
>
	{#snippet header()}
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
				>
					<Scale class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || 'New Decision'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						Record a key project decision
					</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isSaving}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-2 py-2 sm:px-6 sm:py-4">
			<form class="space-y-3 sm:space-y-4" onsubmit={handleSubmit}>
				<!-- Decision Title -->
				<FormField
					label="Decision Title"
					labelFor="title"
					required={true}
					error={!title.trim() && error ? 'Decision title is required' : ''}
				>
					<TextInput
						id="title"
						bind:value={title}
						placeholder="What decision needs to be made?"
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
					label="Context"
					labelFor="description"
					hint="Background for this decision"
				>
					<Textarea
						id="description"
						bind:value={description}
						placeholder="What context led to this decision?"
						enterkeyhint="next"
						rows={2}
						disabled={isSaving}
						size="md"
					/>
				</FormField>

				<!-- Outcome -->
				<FormField label="Outcome" labelFor="outcome" hint="What was decided">
					<Textarea
						id="outcome"
						bind:value={outcome}
						placeholder="The actual decision made..."
						enterkeyhint="next"
						rows={2}
						disabled={isSaving}
						size="md"
					/>
				</FormField>

				<!-- Rationale -->
				<FormField label="Rationale" labelFor="rationale" hint="Why this choice was made">
					<Textarea
						id="rationale"
						bind:value={rationale}
						placeholder="The reasoning behind this decision..."
						enterkeyhint="next"
						rows={2}
						disabled={isSaving}
						size="md"
					/>
				</FormField>

				<!-- State & Date Grid -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<FormField label="State" labelFor="state" required={true}>
						<Select id="state" bind:value={stateKey} disabled={isSaving} size="md">
							{#each STATE_OPTIONS as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</Select>
					</FormField>

					<FormField
						label="Decision Date"
						labelFor="decision_at"
						hint="When was this decided?"
					>
						<TextInput
							id="decision_at"
							type="datetime-local"
							bind:value={decisionAt}
							disabled={isSaving}
							size="md"
						/>
					</FormField>
				</div>

				{#if error}
					<div
						class="p-3 sm:p-4 bg-destructive/10 border border-destructive/30 rounded-lg"
					>
						<p class="text-xs sm:text-sm text-destructive">
							{error}
						</p>
					</div>
				{/if}
			</form>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-end gap-2 sm:gap-3 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted/30"
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={handleClose}
				disabled={isSaving}
				class="text-xs sm:text-sm px-2 sm:px-4"
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
				class="text-xs sm:text-sm px-2 sm:px-4"
			>
				<Save class="w-3 h-3 sm:w-4 sm:h-4" />
				<span class="hidden sm:inline">Create Decision</span>
				<span class="sm:hidden">Create</span>
			</Button>
		</div>
	{/snippet}
</Modal>
