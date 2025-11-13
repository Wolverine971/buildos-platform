<!-- apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Copy, Calendar, FileText, X } from 'lucide-svelte';
	import type { Project, Document } from '$lib/types/onto';
	import { renderMarkdown } from '$lib/utils/markdown';

	interface Props {
		isOpen?: boolean;
		project: Project | null;
		contextDocument?: Document | null;
		onClose?: () => void;
		onSaved?: (project: Project) => void;
	}

	const FACET_CONTEXT_OPTIONS = [
		'personal',
		'client',
		'commercial',
		'internal',
		'open_source',
		'community',
		'academic',
		'nonprofit',
		'startup'
	];

	const FACET_SCALE_OPTIONS = ['micro', 'small', 'medium', 'large', 'epic'];
	const FACET_STAGE_OPTIONS = [
		'discovery',
		'planning',
		'execution',
		'launch',
		'maintenance',
		'complete'
	];

	let {
		isOpen = $bindable(false),
		project,
		contextDocument = null,
		onClose,
		onSaved
	}: Props = $props();

	let name = $state('');
	let description = $state('');
	let facetContext = $state('');
	let facetScale = $state('');
	let facetStage = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	// Context document state
	const contextBody = $derived.by(() => {
		if (!contextDocument) return '';
		const props = contextDocument.props ?? {};
		if (typeof props.body_markdown === 'string') {
			return props.body_markdown;
		}
		if (typeof props.content === 'string') {
			return props.content;
		}
		return '';
	});

	const renderedContext = $derived(contextBody ? renderMarkdown(contextBody) : '');

	const modalTitle = $derived(project ? `Edit ${project.name}` : 'Edit Ontology Project');

	$effect(() => {
		if (!project || !isOpen) return;

		name = project.name ?? '';
		description = project.description ?? '';
		facetContext = project.facet_context ?? '';
		facetScale = project.facet_scale ?? '';
		facetStage = project.facet_stage ?? '';
		startDate = toDateInput(project.start_at);
		endDate = toDateInput(project.end_at);
		error = null;
	});

	function toDateInput(value?: string | null): string {
		if (!value) return '';
		const date = new Date(value);
		if (isNaN(date.getTime())) return '';
		return date.toISOString().slice(0, 10);
	}

	function parseDateInput(value: string): string | null {
		if (!value) return null;
		const date = new Date(`${value}T00:00:00Z`);
		if (isNaN(date.getTime())) {
			return null;
		}
		return date.toISOString();
	}

	function handleClose() {
		if (isSaving) return;
		onClose?.();
	}

	// Copy context to clipboard
	async function copyContext() {
		if (!contextBody) {
			toastService.add({
				type: 'info',
				message: 'No context to copy'
			});
			return;
		}

		try {
			await navigator.clipboard.writeText(contextBody);
			toastService.add({
				type: 'success',
				message: 'Context copied to clipboard'
			});
		} catch (error) {
			toastService.add({
				type: 'error',
				message: 'Failed to copy context'
			});
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!project) return;

		error = null;

		const payload: Record<string, unknown> = {};

		if (name.trim() && name.trim() !== project.name) {
			payload.name = name.trim();
		}

		if ((description || '') !== (project.description || '')) {
			payload.description = description.trim() || null;
		}

		if ((facetContext || '') !== (project.facet_context || '')) {
			payload.facet_context = facetContext || null;
		}

		if ((facetScale || '') !== (project.facet_scale || '')) {
			payload.facet_scale = facetScale || null;
		}

		if ((facetStage || '') !== (project.facet_stage || '')) {
			payload.facet_stage = facetStage || null;
		}

		const parsedStart = parseDateInput(startDate);
		const parsedEnd = parseDateInput(endDate);

		if (parsedStart !== (project.start_at ?? null)) {
			payload.start_at = parsedStart;
		}

		if (parsedEnd !== (project.end_at ?? null)) {
			payload.end_at = parsedEnd;
		}

		if (Object.keys(payload).length === 0) {
			toastService.info('No changes to save');
			return;
		}

		try {
			isSaving = true;
			const response = await fetch(`/api/onto/projects/${project.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(result.error ?? 'Failed to update project');
			}

			const updated = result.project as Project;
			toastService.success('Project updated');
			onSaved?.(updated);
			onClose?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update project';
			error = message;
			toastService.error(message);
		} finally {
			isSaving = false;
		}
	}

	function facetLabel(value: string) {
		return value
			.split('_')
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ');
	}
</script>

<Modal bind:isOpen onClose={handleClose} title="" size="xl">
	<div slot="header">
		<div class="sm:hidden">
			<div class="modal-grab-handle"></div>
		</div>
		<div
			class="relative bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-800 dark:via-gray-800/95 dark:to-gray-800 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700"
		>
			<!-- Mobile Layout -->
			<div class="sm:hidden">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white flex-1 pr-2">
						{modalTitle}
					</h2>
					<Button
						type="button"
						onclick={handleClose}
						variant="ghost"
						size="sm"
						class="!p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
						aria-label="Close modal"
					>
						<X class="w-5 h-5" />
					</Button>
				</div>
				<p class="text-xs text-gray-600 dark:text-gray-400">
					Update project details and metadata
				</p>
			</div>

			<!-- Desktop Layout -->
			<div class="hidden sm:flex sm:items-start sm:justify-between">
				<div class="flex-1">
					<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
						{modalTitle}
					</h2>
					<p class="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
						Manage project information and context
					</p>
				</div>
				<Button
					type="button"
					onclick={handleClose}
					variant="ghost"
					size="sm"
					class="!p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</Button>
			</div>
		</div>
	</div>

	{#if !project}
		<div class="px-4 sm:px-6 lg:px-8 py-8">
			<p class="text-gray-600 dark:text-gray-300">Project data is unavailable.</p>
		</div>
	{:else}
		<form onsubmit={handleSubmit} class="flex flex-col flex-1 min-h-0">
			<div
				class="flex flex-col flex-1 min-h-0 space-y-4 px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto"
			>
				<!-- Main Content Area -->
				<div class="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-5 min-h-[50vh] flex-1">
					<!-- Content Section (Takes most space) -->
					<div
						class="lg:col-span-3 flex flex-col space-y-3 h-full min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200"
					>
						<!-- Project Name Header -->
						<div
							class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 p-4 sm:p-5 rounded-t-xl border-b border-gray-200 dark:border-gray-700"
						>
							<label
								for="project-name"
								class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2"
							>
								Project Name <span class="text-red-500">*</span>
							</label>
							<TextInput
								id="project-name"
								bind:value={name}
								placeholder="Enter a clear, memorable project name"
								size="lg"
								required
								disabled={isSaving}
								class="font-semibold bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
							/>
						</div>

						<!-- Content Body -->
						<div
							class="flex-1 flex flex-col space-y-4 px-4 sm:px-5 pb-4 sm:pb-5 overflow-y-auto"
						>
							<!-- Description -->
							<div>
								<label
									for="project-description"
									class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2"
								>
									Description
								</label>
								<MarkdownToggleField
									value={description}
									onUpdate={(newValue) => (description = newValue)}
									placeholder="One-line summary of what this project achieves"
									rows={3}
									class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								/>
							</div>

							<!-- Context Document - Main Focus -->
							{#if contextDocument && contextBody}
								<div
									class="flex-1 flex flex-col pt-4 border-t border-gray-200 dark:border-gray-700"
								>
									<div class="flex items-center justify-between mb-2">
										<div class="flex items-center gap-2">
											<FileText
												class="w-4 h-4 text-green-600 dark:text-green-400"
											/>
											<label
												class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
											>
												Context Document
											</label>
										</div>
										<Button
											type="button"
											onclick={copyContext}
											variant="ghost"
											size="sm"
											class="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
										>
											<Copy class="w-3.5 h-3.5" />
											<span class="hidden sm:inline">Copy</span>
										</Button>
									</div>
									<div
										class="flex-1 p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 overflow-y-auto"
									>
										<div
											class="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
										>
											{@html renderedContext}
										</div>
									</div>
								</div>
							{/if}

							<!-- Character Counts -->
							<div
								class="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-700"
							>
								{#if description.length > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-blue-500 rounded-full"></span>
										{description.length.toLocaleString()} description
									</span>
								{/if}
								{#if contextBody.length > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-green-500 rounded-full"></span>
										{contextBody.length.toLocaleString()} context
									</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Metadata Sidebar -->
					<div
						class="lg:col-span-1 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 lg:max-h-full lg:overflow-y-auto"
					>
						<div
							class="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 p-3 sm:p-4 rounded-t-xl border-b border-gray-200 dark:border-gray-700"
						>
							<h3
								class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center"
							>
								<span class="w-2 h-2 bg-indigo-500 rounded-full mr-2 animate-pulse"
								></span>
								Project Details
							</h3>
						</div>

						<div class="p-3 sm:p-4 space-y-4">
							<!-- Facet Context -->
							<div>
								<label
									for="facet-context"
									class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 block"
								>
									📂 Context
								</label>
								<Select
									id="facet-context"
									bind:value={facetContext}
									size="sm"
									disabled={isSaving}
									class="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								>
									<option value="">Not set</option>
									{#each FACET_CONTEXT_OPTIONS as option}
										<option value={option}>{facetLabel(option)}</option>
									{/each}
								</Select>
							</div>

							<!-- Facet Scale -->
							<div>
								<label
									for="facet-scale"
									class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 block"
								>
									📏 Scale
								</label>
								<Select
									id="facet-scale"
									bind:value={facetScale}
									size="sm"
									disabled={isSaving}
									class="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								>
									<option value="">Not set</option>
									{#each FACET_SCALE_OPTIONS as option}
										<option value={option}>{facetLabel(option)}</option>
									{/each}
								</Select>
							</div>

							<!-- Facet Stage -->
							<div>
								<label
									for="facet-stage"
									class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 block"
								>
									🎯 Stage
								</label>
								<Select
									id="facet-stage"
									bind:value={facetStage}
									size="sm"
									disabled={isSaving}
									class="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								>
									<option value="">Not set</option>
									{#each FACET_STAGE_OPTIONS as option}
										<option value={option}>{facetLabel(option)}</option>
									{/each}
								</Select>
							</div>

							<!-- Timeline Section -->
							<div class="space-y-3">
								<div
									class="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
								>
									<Calendar class="w-3.5 h-3.5" />
									Timeline
								</div>

								<!-- Start Date -->
								<div>
									<label
										for="start-date"
										class="text-xs text-gray-500 dark:text-gray-400 mb-1 block"
									>
										Start Date
									</label>
									<TextInput
										id="start-date"
										type="date"
										bind:value={startDate}
										size="sm"
										disabled={isSaving}
										class="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
									/>
								</div>

								<!-- End Date -->
								<div>
									<label
										for="end-date"
										class="text-xs text-gray-500 dark:text-gray-400 mb-1 block"
									>
										End Date
									</label>
									<TextInput
										id="end-date"
										type="date"
										bind:value={endDate}
										min={startDate}
										size="sm"
										disabled={isSaving}
										class="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				{#if error}
					<div
						class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
					>
						<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
					</div>
				{/if}
			</div>

			<!-- Footer Actions -->
			<div
				class="flex flex-col sm:flex-row justify-end gap-3 px-4 sm:px-6 lg:px-8 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
			>
				<Button
					type="button"
					variant="ghost"
					onclick={handleClose}
					disabled={isSaving}
					class="order-2 sm:order-1 w-full sm:w-auto"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					disabled={isSaving}
					class="order-1 sm:order-2 w-full sm:w-auto"
				>
					{isSaving ? 'Saving...' : 'Save Changes'}
				</Button>
			</div>
		</form>
	{/if}
</Modal>

<style>
	/* Mobile grab handle */
	:global(.modal-grab-handle) {
		width: 36px;
		height: 4px;
		background: rgb(209 213 219);
		border-radius: 2px;
		margin: 0.5rem auto 1rem;
	}

	:global(.dark .modal-grab-handle) {
		background: rgb(75 85 99);
	}

	/* Premium Apple-style shadows and effects */
	:global(.modal-content > div > div) {
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Premium focus states */
	:global(.modal-content input),
	:global(.modal-content textarea),
	:global(.modal-content select) {
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.modal-content input:focus),
	:global(.modal-content textarea:focus),
	:global(.modal-content select:focus) {
		outline: none;
		border-color: rgb(59, 130, 246);
		box-shadow:
			0 0 0 4px rgba(59, 130, 246, 0.1),
			0 2px 4px 0 rgba(0, 0, 0, 0.05);
	}

	:global(.dark .modal-content input:focus),
	:global(.dark .modal-content textarea:focus),
	:global(.dark .modal-content select:focus) {
		border-color: rgb(96, 165, 250);
		box-shadow:
			0 0 0 4px rgba(96, 165, 250, 0.15),
			0 2px 4px 0 rgba(0, 0, 0, 0.2);
	}

	/* Premium gradient animations */
	:global(.modal-content .bg-gradient-to-r) {
		background-size: 200% 200%;
		animation: gradient-shift 15s ease infinite;
	}

	@keyframes gradient-shift {
		0% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
		100% {
			background-position: 0% 50%;
		}
	}

	/* Premium scrollbar styling */
	:global(.modal-content *::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}

	:global(.modal-content *::-webkit-scrollbar-track) {
		background: rgba(0, 0, 0, 0.05);
		border-radius: 4px;
	}

	:global(.modal-content *::-webkit-scrollbar-thumb) {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	:global(.modal-content *::-webkit-scrollbar-thumb:hover) {
		background: rgba(0, 0, 0, 0.3);
	}

	:global(.dark .modal-content *::-webkit-scrollbar-track) {
		background: rgba(255, 255, 255, 0.05);
	}

	:global(.dark .modal-content *::-webkit-scrollbar-thumb) {
		background: rgba(255, 255, 255, 0.2);
	}

	:global(.dark .modal-content *::-webkit-scrollbar-thumb:hover) {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
