<!-- apps/web/src/lib/components/ontology/OutputCreateModal.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { FileText, X, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';
	import { getDeliverablePrimitive, type DeliverablePrimitive } from '$lib/types/onto';

	// ✅ Proper Svelte 5 props interface
	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated: (outputId: string) => void;
		primitive?: DeliverablePrimitive | 'all';
	}

	let { projectId, onClose, onCreated, primitive = 'all' }: Props = $props();

	let templates = $state<ResolvedTemplate[]>([]);
	let selectedTemplate = $state<ResolvedTemplate | null>(null);
	let outputName = $state('');
	let isLoading = $state(false);
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	// ✅ FIX: Track if user has manually edited the name
	let userHasEditedName = $state(false);
	let primitiveFilter = $state<DeliverablePrimitive | 'all'>(
		primitive === 'all' ? 'all' : primitive
	);

	const filteredTemplates = $derived(() =>
		primitiveFilter === 'all'
			? templates
			: templates.filter((t) => getDeliverablePrimitive(t.type_key) === primitiveFilter)
	);

	onMount(async () => {
		await loadTemplates();
		// ✅ FIX: Add keyboard event listener for Escape key
		document.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		// ✅ FIX: Remove event listener to prevent memory leaks
		document.removeEventListener('keydown', handleKeyDown);
	});

	// ✅ FIX: Handle Escape key for accessibility
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isCreating) {
			onClose();
		}
	}

	async function loadTemplates() {
		isLoading = true;
		error = null; // ✅ FIX: Clear error on retry

		try {
			const primitiveParam =
				primitive && primitive !== 'all'
					? `&primitive=${encodeURIComponent(primitive)}`
					: '';
			const response = await fetch(`/api/onto/templates?scope=output${primitiveParam}`);
			if (!response.ok) {
				throw new Error('Failed to load templates');
			}

			const data = await response.json();
			// ✅ FIX: Handle both data.data and data.templates response formats
			const templateList = data.data?.templates || data.templates || [];
			templates = templateList.filter((t: ResolvedTemplate) => !t.is_abstract);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load templates';
			console.error('Failed to load templates:', err);
		} finally {
			isLoading = false;
		}
	}

	async function createOutput() {
		if (!selectedTemplate || !outputName.trim()) return;

		isCreating = true;
		error = null;

		try {
			const response = await fetch('/api/onto/outputs/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					type_key: selectedTemplate.type_key,
					name: outputName.trim(),
					state_key: 'draft',
					props: {}
				})
			});

			if (!response.ok) {
				// ✅ FIX: Better error parsing for ApiResponse format
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
			// ✅ FIX: Handle both data.data and data.output response formats
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

	// ✅ FIX: Only set default name if user hasn't edited it
	function selectTemplate(template: ResolvedTemplate) {
		selectedTemplate = template;
		if (!userHasEditedName && !outputName) {
			outputName = `New ${template.name}`;
		}
	}

	// ✅ FIX: Track when user manually edits the name
	function handleNameInput() {
		userHasEditedName = true;
	}

	const primitiveOptions: Array<{ value: DeliverablePrimitive | 'all'; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'document', label: 'Document' },
		{ value: 'event', label: 'Event' },
		{ value: 'collection', label: 'Collection' },
		{ value: 'external', label: 'External' }
	];
</script>

<!-- Modal Backdrop with BuildOS styling -->
<div
	class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
	onclick={onClose}
	role="presentation"
>
	<!-- Modal Card with BuildOS Card component -->
	<Card
		variant="elevated"
		padding="none"
		class="max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		aria-describedby="modal-description"
	>
		<!-- Inkprint header with strip texture -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-3 sm:px-6 sm:py-5 tx tx-strip tx-weak"
		>
			<div class="flex items-start justify-between gap-2 sm:gap-4">
				<div class="space-y-1 sm:space-y-2 min-w-0 flex-1">
					<p
						id="modal-description"
						class="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-muted-foreground"
					>
						{selectedTemplate ? 'New Output • Step 2' : 'New Output • Step 1'}
					</p>
					<h2
						id="modal-title"
						class="text-lg sm:text-2xl font-bold leading-tight truncate text-foreground"
					>
						{selectedTemplate
							? outputName || 'Name your document'
							: 'Choose a Template'}
					</h2>
					{#if selectedTemplate}
						<div
							class="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm"
						>
							<span
								class="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-accent/20 text-accent-foreground"
								>{selectedTemplate.name}</span
							>
						</div>
					{/if}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onclick={onClose}
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1.5 sm:!p-2"
					aria-label="Close modal"
				>
					<X class="w-4 h-4 sm:w-5 sm:h-5" />
				</Button>
			</div>
		</div>

		<!-- Content with BuildOS CardBody -->
		<CardBody padding="md" class="flex-1 overflow-y-auto">
			{#if isLoading}
				<!-- Loading state -->
				<div class="text-center py-12">
					<div
						class="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"
					></div>
					<p class="text-muted-foreground mt-4">Loading templates...</p>
				</div>
			{:else if error && !selectedTemplate}
				<!-- Error state -->
				<div class="text-center py-12">
					<p class="text-destructive mb-4">{error}</p>
					<Button onclick={loadTemplates} variant="ghost" size="sm">Try Again</Button>
				</div>
			{:else if !selectedTemplate}
				<div class="flex flex-wrap items-center gap-2 mb-4">
					<p class="text-xs uppercase tracking-wide text-muted-foreground">Primitive</p>
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

				<!-- Template Selection Grid -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					{#each filteredTemplates as template}
						<button
							onclick={() => selectTemplate(template)}
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
										{template.name}
									</h3>
									<p class="text-xs text-muted-foreground mb-1 line-clamp-2">
										{template.metadata?.description || template.type_key}
									</p>
									<p
										class="text-[11px] text-muted-foreground uppercase tracking-wide"
									>
										{getDeliverablePrimitive(template.type_key) || 'document'}
									</p>
									{#if template.metadata?.typical_use_by && Array.isArray(template.metadata.typical_use_by)}
										<div class="flex flex-wrap gap-1">
											{#each template.metadata.typical_use_by.slice(0, 3) as persona}
												<span
													class="px-2 py-0.5 bg-muted text-foreground rounded text-xs"
												>
													{persona}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</button>
					{:else}
						<div
							class="col-span-full p-6 border border-dashed border-border rounded-lg text-center text-sm text-muted-foreground"
						>
							No templates for this primitive. Try another filter.
						</div>
					{/each}
				</div>
			{:else}
				<!-- Output Name Input Form -->
				<div class="space-y-4">
					<!-- Selected template indicator -->
					<div
						class="p-4 bg-muted/30 rounded-lg border border-border tx tx-grain tx-weak"
					>
						<p class="text-sm text-foreground flex items-center gap-2 font-medium">
							<Sparkles class="w-4 h-4 text-accent" />
							Creating: <strong>{selectedTemplate.name}</strong>
						</p>
					</div>

					<!-- Name input field -->
					<div>
						<label
							for="output-name"
							class="block text-sm font-medium text-foreground mb-2"
						>
							Document Name <span class="text-destructive">*</span>
						</label>
						<input
							id="output-name"
							type="text"
							bind:value={outputName}
							oninput={handleNameInput}
							placeholder={`Enter name for your ${selectedTemplate.name.toLowerCase()}...`}
							class="w-full px-4 py-2.5 border border-border rounded-lg bg-card focus:ring-2 focus:ring-ring focus:border-ring text-foreground placeholder-muted-foreground transition-shadow"
							aria-required="true"
						/>
					</div>

					<!-- Error display -->
					{#if error}
						<div
							class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg"
							role="alert"
						>
							<p class="text-sm text-destructive font-medium">
								{error}
							</p>
						</div>
					{/if}

					<!-- Action buttons - compact on mobile -->
					<div class="flex flex-row items-center justify-between gap-2 pt-2">
						<Button
							onclick={() => {
								selectedTemplate = null;
								error = null;
							}}
							variant="ghost"
							size="sm"
							class="text-xs sm:text-sm px-2 sm:px-4"
						>
							<span class="hidden sm:inline">← Back</span>
							<span class="sm:hidden">←</span>
						</Button>
						<Button
							onclick={createOutput}
							disabled={!outputName.trim() || isCreating}
							loading={isCreating}
							variant="primary"
							size="sm"
							class="text-xs sm:text-sm px-2 sm:px-4"
						>
							<span class="hidden sm:inline">Create & Edit</span>
							<span class="sm:hidden">Create</span>
						</Button>
					</div>
				</div>
			{/if}
		</CardBody>
	</Card>
</div>
