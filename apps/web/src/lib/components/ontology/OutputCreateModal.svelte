<!-- apps/web/src/lib/components/ontology/OutputCreateModal.svelte -->
<!--
	Simplified Output Creation Modal (Template-Free)
	Creates outputs without template selection - uses type_key directly
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { FileText, X, Sparkles, Layers } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { getDeliverablePrimitive, type DeliverablePrimitive } from '$lib/types/onto';

	// Output type options (hardcoded since templates are removed)
	interface OutputType {
		type_key: string;
		name: string;
		description: string;
		primitive: DeliverablePrimitive;
	}

	const OUTPUT_TYPES: OutputType[] = [
		{
			type_key: 'output.document',
			name: 'Document',
			description: 'General purpose document or written content',
			primitive: 'document'
		},
		{
			type_key: 'output.report',
			name: 'Report',
			description: 'Formal report with analysis and findings',
			primitive: 'document'
		},
		{
			type_key: 'output.presentation',
			name: 'Presentation',
			description: 'Slide deck or presentation materials',
			primitive: 'document'
		},
		{
			type_key: 'output.spreadsheet',
			name: 'Spreadsheet',
			description: 'Data tables, calculations, or structured data',
			primitive: 'document'
		},
		{
			type_key: 'output.artifact',
			name: 'Artifact',
			description: 'Code, design file, or other deliverable',
			primitive: 'external'
		},
		{
			type_key: 'output.collection',
			name: 'Collection',
			description: 'Bundle of related outputs or resources',
			primitive: 'collection'
		}
	];

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated: (outputId: string) => void;
		primitive?: DeliverablePrimitive | 'all';
	}

	let { projectId, onClose, onCreated, primitive = 'all' }: Props = $props();

	let selectedType = $state<OutputType | null>(null);
	let outputName = $state('');
	let description = $state('');
	let isCreating = $state(false);
	let error = $state<string | null>(null);
	let userHasEditedName = $state(false);
	let primitiveFilter = $state<DeliverablePrimitive | 'all'>(
		primitive === 'all' ? 'all' : primitive
	);

	const filteredTypes = $derived(
		primitiveFilter === 'all'
			? OUTPUT_TYPES
			: OUTPUT_TYPES.filter((t) => t.primitive === primitiveFilter)
	);

	onMount(() => {
		document.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeyDown);
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isCreating) {
			onClose();
		}
	}

	async function createOutput() {
		if (!selectedType || !outputName.trim()) return;

		isCreating = true;
		error = null;

		try {
			const response = await fetch('/api/onto/outputs/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					type_key: selectedType.type_key,
					name: outputName.trim(),
					state_key: 'draft',
					description: description.trim() || null,
					props: {}
				})
			});

			if (!response.ok) {
				let errorMessage = 'Failed to create output';
				try {
					const errorData = await response.json();
					errorMessage = errorData.error || errorData.message || errorMessage;
				} catch {
					errorMessage = `${errorMessage} (${response.status})`;
				}
				throw new Error(errorMessage);
			}

			const responseData = await response.json();
			const output = responseData.data?.output || responseData.output;

			if (!output || !output.id) {
				throw new Error('Invalid response from server');
			}

			onCreated(output.id);
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create output';
			console.error('Failed to create output:', err);
		} finally {
			isCreating = false;
		}
	}

	function selectType(type: OutputType) {
		selectedType = type;
		if (!userHasEditedName && !outputName) {
			outputName = `New ${type.name}`;
		}
	}

	function handleNameInput() {
		userHasEditedName = true;
	}

	const primitiveOptions: Array<{ value: DeliverablePrimitive | 'all'; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'document', label: 'Document' },
		{ value: 'collection', label: 'Collection' },
		{ value: 'external', label: 'External' }
	];
</script>

<!-- Modal Backdrop -->
<div
	class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
	onclick={onClose}
	role="presentation"
>
	<Card
		variant="elevated"
		padding="none"
		class="max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<!-- Header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
				>
					<Layers class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						id="modal-title"
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{selectedType ? outputName || 'New Output' : 'New Output'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{selectedType ? 'Name your deliverable' : 'Choose an output type'}
					</p>
				</div>
			</div>
			<!-- Inkprint close button -->
			<button
				type="button"
				onclick={onClose}
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Content -->
		<CardBody padding="md" class="flex-1 overflow-y-auto">
			{#if !selectedType}
				<div class="flex flex-wrap items-center gap-2 mb-4">
					<p class="text-xs uppercase tracking-wide text-muted-foreground">Type</p>
					{#each primitiveOptions as option}
						<button
							type="button"
							onclick={() => (primitiveFilter = option.value)}
							class="px-3 py-1.5 text-sm rounded-lg border border-border transition-colors {primitiveFilter ===
							option.value
								? 'bg-accent text-accent-foreground'
								: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
						>
							{option.label}
						</button>
					{/each}
				</div>

				<!-- Output Type Selection Grid -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					{#each filteredTypes as type}
						<button
							onclick={() => selectType(type)}
							class="text-left p-4 border border-border rounded-lg bg-card hover:border-accent shadow-ink transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<div class="flex items-start gap-3">
								<div
									class="p-2 bg-muted rounded-lg group-hover:bg-accent/10 transition-colors duration-200"
								>
									<FileText class="w-5 h-5 text-accent" />
								</div>
								<div class="flex-1 min-w-0">
									<h3
										class="font-semibold text-foreground mb-1 group-hover:text-accent transition-colors"
									>
										{type.name}
									</h3>
									<p class="text-xs text-muted-foreground mb-1 line-clamp-2">
										{type.description}
									</p>
									<p
										class="text-[11px] text-muted-foreground uppercase tracking-wide"
									>
										{type.primitive}
									</p>
								</div>
							</div>
						</button>
					{:else}
						<div
							class="col-span-full p-6 border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground"
						>
							No types for this filter. Try another.
						</div>
					{/each}
				</div>
			{:else}
				<!-- Output Name Input Form -->
				<div class="space-y-4">
					<div
						class="p-4 bg-muted/30 rounded-lg border border-border tx tx-grain tx-weak"
					>
						<p class="text-sm text-foreground flex items-center gap-2 font-medium">
							<Sparkles class="w-4 h-4 text-accent" />
							Creating: <strong>{selectedType.name}</strong>
						</p>
					</div>

					<div>
						<label
							for="output-name"
							class="block text-sm font-medium text-foreground mb-2"
						>
							Name <span class="text-destructive">*</span>
						</label>
						<input
							id="output-name"
							type="text"
							bind:value={outputName}
							oninput={handleNameInput}
							placeholder={`Enter name for your ${selectedType.name.toLowerCase()}...`}
							class="w-full px-4 py-2.5 border border-border rounded-lg bg-card focus:ring-2 focus:ring-ring focus:border-ring text-foreground placeholder-muted-foreground transition-shadow"
							aria-required="true"
						/>
					</div>

					<div>
						<label
							for="output-description"
							class="block text-sm font-medium text-foreground mb-2"
						>
							Description
						</label>
						<textarea
							id="output-description"
							bind:value={description}
							placeholder="What is this output about?"
							rows="3"
							class="w-full px-4 py-2.5 border border-border rounded-lg bg-card focus:ring-2 focus:ring-ring focus:border-ring text-foreground placeholder-muted-foreground transition-shadow"
						/>
					</div>

					{#if error}
						<div
							class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg"
							role="alert"
						>
							<p class="text-sm text-destructive font-medium">{error}</p>
						</div>
					{/if}

					<div class="flex flex-row items-center justify-between gap-2 pt-2">
						<Button
							onclick={() => {
								selectedType = null;
								error = null;
							}}
							variant="ghost"
							size="sm"
						>
							← Back
						</Button>
						<Button
							onclick={createOutput}
							disabled={!outputName.trim() || isCreating}
							loading={isCreating}
							variant="primary"
							size="sm"
						>
							Create & Edit
						</Button>
					</div>
				</div>
			{/if}
		</CardBody>
	</Card>
</div>
