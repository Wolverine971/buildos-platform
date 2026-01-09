<!-- apps/web/src/lib/components/ontology/OutputCreateModal.svelte -->
<!--
	Simplified Output Creation Modal (Auto-Classified Type)
	Creates outputs without type selection. The worker classifies type_key after creation.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { X, Sparkles, Layers } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated: (outputId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let outputName = $state('');
	let description = $state('');
	let isCreating = $state(false);
	let error = $state<string | null>(null);

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
		if (!outputName.trim()) return;

		isCreating = true;
		error = null;

		try {
			const response = await fetch('/api/onto/outputs/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					name: outputName.trim(),
					state_key: 'draft',
					description: description.trim() || null,
					classification_source: 'create_modal'
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
			void logOntologyClientError(err, {
				endpoint: '/api/onto/outputs/create',
				method: 'POST',
				projectId,
				entityType: 'output',
				operation: 'output_create'
			});
		} finally {
			isCreating = false;
		}
	}
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
					class="flex h-9 w-9 items-center justify-center rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
				>
					<Layers class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						id="modal-title"
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{outputName || 'New Output'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						Type will be auto-classified
					</p>
				</div>
			</div>
			<!-- Inkprint close button -->
			<button
				type="button"
				onclick={onClose}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400 tx tx-grain tx-weak"
				aria-label="Close modal"
			>
				<X class="w-5 h-5" />
			</button>
		</div>

		<!-- Content -->
		<CardBody padding="md" class="flex-1 overflow-y-auto">
			<div class="space-y-4">
				<div class="p-3 bg-muted/30 rounded-lg border border-border tx tx-grain tx-weak">
					<p class="text-sm text-foreground flex items-center gap-2 font-medium">
						<Sparkles class="w-4 h-4 text-accent" />
						Output type will be auto-classified after creation.
					</p>
				</div>

				<div>
					<label for="output-name" class="block text-sm font-medium text-foreground mb-2">
						Name <span class="text-destructive">*</span>
					</label>
					<input
						id="output-name"
						type="text"
						bind:value={outputName}
						placeholder="Enter output name..."
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
					></textarea>
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
						onclick={onClose}
						variant="ghost"
						size="sm"
						disabled={isCreating}
						class="tx tx-grain tx-weak"
					>
						Cancel
					</Button>
					<Button
						onclick={createOutput}
						disabled={!outputName.trim() || isCreating}
						loading={isCreating}
						variant="primary"
						size="sm"
						class="tx tx-grain tx-weak"
					>
						Create & Edit
					</Button>
				</div>
			</div>
		</CardBody>
	</Card>
</div>
