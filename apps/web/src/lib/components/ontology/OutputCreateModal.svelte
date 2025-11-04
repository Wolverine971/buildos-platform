<!-- apps/web/src/lib/components/ontology/OutputCreateModal.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { FileText, X, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

	// ✅ Proper Svelte 5 props interface
	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated: (outputId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let templates = $state<ResolvedTemplate[]>([]);
	let selectedTemplate = $state<ResolvedTemplate | null>(null);
	let outputName = $state('');
	let isLoading = $state(false);
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	// ✅ FIX: Track if user has manually edited the name
	let userHasEditedName = $state(false);

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
			const response = await fetch(
				'/api/onto/templates?scope=output&primitive=TEXT_DOCUMENT'
			);
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
		<!-- Header with proper padding -->
		<div class="border-b border-gray-200 dark:border-gray-700 p-5 sm:p-6">
			<div class="flex items-center justify-between">
				<div>
					<h2
						id="modal-title"
						class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"
					>
						Create Text Document
					</h2>
					<p id="modal-description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
						Choose a template for your document
					</p>
				</div>
				<!-- Close button using BuildOS Button -->
				<Button
					variant="ghost"
					size="sm"
					onclick={onClose}
					class="!p-1.5"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</Button>
			</div>
		</div>

		<!-- Content with BuildOS CardBody -->
		<CardBody padding="md" class="flex-1 overflow-y-auto">
			{#if isLoading}
				<!-- Loading state with proper dark mode support -->
				<div class="text-center py-12">
					<div
						class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"
					></div>
					<p class="text-gray-600 dark:text-gray-400 mt-4">Loading templates...</p>
				</div>
			{:else if error && !selectedTemplate}
				<!-- Error state -->
				<div class="text-center py-12">
					<p class="text-red-600 dark:text-red-400 mb-4">{error}</p>
					<Button onclick={loadTemplates} variant="ghost" size="sm">Try Again</Button>
				</div>
			{:else if !selectedTemplate}
				<!-- Template Selection Grid - High information density -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					{#each templates as template}
						<button
							onclick={() => selectTemplate(template)}
							class="text-left p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
						>
							<div class="flex items-start gap-3">
								<div
									class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors duration-200"
								>
									<FileText class="w-5 h-5 text-blue-600 dark:text-blue-400" />
								</div>
								<div class="flex-1 min-w-0">
									<h3
										class="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors"
									>
										{template.name}
									</h3>
									<p
										class="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2"
									>
										{template.metadata.description || template.type_key}
									</p>
									{#if template.metadata.typical_use_by && Array.isArray(template.metadata.typical_use_by)}
										<div class="flex flex-wrap gap-1">
											{#each template.metadata.typical_use_by.slice(0, 3) as persona}
												<span
													class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
												>
													{persona}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<!-- Output Name Input Form -->
				<div class="space-y-4">
					<!-- Selected template indicator -->
					<div
						class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
					>
						<p
							class="text-sm text-blue-800 dark:text-blue-300 flex items-center gap-2 font-medium"
						>
							<Sparkles class="w-4 h-4" />
							Creating: <strong>{selectedTemplate.name}</strong>
						</p>
					</div>

					<!-- Name input field -->
					<div>
						<label
							for="output-name"
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
						>
							Document Name <span class="text-red-500">*</span>
						</label>
						<input
							id="output-name"
							type="text"
							bind:value={outputName}
							oninput={handleNameInput}
							placeholder={`Enter name for your ${selectedTemplate.name.toLowerCase()}...`}
							class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-shadow"
							autofocus
							aria-required="true"
						/>
					</div>

					<!-- Error display -->
					{#if error}
						<div
							class="p-3 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800 rounded-lg"
							role="alert"
						>
							<p class="text-sm text-red-800 dark:text-red-300 font-medium">
								{error}
							</p>
						</div>
					{/if}

					<!-- Action buttons - Responsive -->
					<div class="flex flex-col sm:flex-row gap-3 justify-end pt-2">
						<Button
							onclick={() => {
								selectedTemplate = null;
								error = null;
							}}
							variant="ghost"
							size="md"
							class="w-full sm:w-auto order-2 sm:order-1"
						>
							Back to Templates
						</Button>
						<Button
							onclick={createOutput}
							disabled={!outputName.trim() || isCreating}
							loading={isCreating}
							variant="primary"
							size="md"
							class="w-full sm:w-auto order-1 sm:order-2"
						>
							{isCreating ? 'Creating...' : 'Create & Edit'}
						</Button>
					</div>
				</div>
			{/if}
		</CardBody>
	</Card>
</div>
