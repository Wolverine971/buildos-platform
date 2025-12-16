<!-- apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Copy, Calendar, FileText, X, FolderKanban, Trash2 } from 'lucide-svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { PROJECT_STATES, type Project, type Document } from '$lib/types/onto';
	import type { ComponentType } from 'svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

	// Lazy-loaded AgentChatModal for better initial load performance
	let AgentChatModalComponent = $state<ComponentType<any> | null>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

	interface Props {
		isOpen?: boolean;
		project: Project | null;
		contextDocument?: Document | null;
		onClose?: () => void;
		onSaved?: (project: Project) => void;
		onDeleted?: () => void;
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
		onSaved,
		onDeleted
	}: Props = $props();

	let name = $state('');
	let description = $state('');
	let stateKey = $state('planning');
	let facetContext = $state('');
	let facetScale = $state('');
	let facetStage = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let showDeleteConfirm = $state(false);
	let error = $state<string | null>(null);
	let showChatModal = $state(false);

	// Build focus for chat about this project
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!project) return null;
		return {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId: project.id,
			projectName: project.name || 'Project'
		};
	});

	// Context document state - now editable
	let contextDocumentBody = $state('');

	// Initialize context document from props
	const initialContextBody = $derived.by(() => {
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

	const modalTitle = $derived(project ? `Edit ${project.name}` : 'Edit Ontology Project');

	$effect(() => {
		if (!project || !isOpen) return;

		name = project.name ?? '';
		description = project.description ?? '';
		stateKey = project.state_key ?? 'planning';
		facetContext = project.facet_context ?? '';
		facetScale = project.facet_scale ?? '';
		facetStage = project.facet_stage ?? '';
		startDate = toDateInput(project.start_at);
		endDate = toDateInput(project.end_at);
		contextDocumentBody = initialContextBody;
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
		if (isSaving || isDeleting) return;
		onClose?.();
	}

	async function handleDelete() {
		if (!project) return;

		isDeleting = true;
		error = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`, {
				method: 'DELETE'
			});

			const result = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(result.error ?? 'Failed to delete project');
			}

			toastService.success('Project deleted');
			onDeleted?.();
			onClose?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to delete project';
			error = message;
			toastService.error(message);
			showDeleteConfirm = false;
		} finally {
			isDeleting = false;
		}
	}

	// Copy context to clipboard
	async function copyContext() {
		if (!contextDocumentBody) {
			toastService.add({
				type: 'info',
				message: 'No context to copy'
			});
			return;
		}

		try {
			await navigator.clipboard.writeText(contextDocumentBody);
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

		if ((stateKey || '') !== (project.state_key || '')) {
			payload.state_key = stateKey || null;
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

		// Check if context document changed
		const hasContextDocChanges = contextDocument && contextDocumentBody !== initialContextBody;
		const hasProjectChanges = Object.keys(payload).length > 0;

		if (!hasProjectChanges && !hasContextDocChanges) {
			toastService.info('No changes to save');
			return;
		}

		try {
			isSaving = true;
			console.log('[OntologyProjectEditModal] Starting save...', {
				hasProjectChanges,
				hasContextDocChanges
			});

			let updatedProject = project;

			// Update project if there are changes
			if (hasProjectChanges) {
				console.log('[OntologyProjectEditModal] Updating project with payload:', payload);
				const response = await fetch(`/api/onto/projects/${project.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});

				const result = await response.json().catch(() => ({}));
				console.log('[OntologyProjectEditModal] Project update response:', {
					ok: response.ok,
					status: response.status,
					result
				});

				if (!response.ok) {
					throw new Error(result.error ?? 'Failed to update project');
				}

				if (result.project) {
					updatedProject = result.project as Project;
				}
			}

			// Update context document if it exists and changed
			if (hasContextDocChanges && contextDocument) {
				console.log(
					'[OntologyProjectEditModal] Updating context document:',
					contextDocument.id
				);
				const docResponse = await fetch(`/api/onto/documents/${contextDocument.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						props: {
							body_markdown: contextDocumentBody
						}
					})
				});

				const docResult = await docResponse.json().catch(() => ({}));
				console.log('[OntologyProjectEditModal] Document update response:', {
					ok: docResponse.ok,
					status: docResponse.status,
					result: docResult
				});

				if (!docResponse.ok) {
					throw new Error(docResult.error ?? 'Failed to update context document');
				}
			}

			console.log('[OntologyProjectEditModal] Save completed successfully');
			toastService.success('Project updated');
			onSaved?.(updatedProject);
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

	// Chat about this project handlers
	async function openChatAbout() {
		if (!project) return;
		await loadAgentChatModal();
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
	}
</script>

<Modal bind:isOpen onClose={handleClose} title="" size="xl" showCloseButton={false}>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0"
				>
					<FolderKanban class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{name || project?.name || 'Project Settings'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{#if project?.created_at}Created {new Date(
								project.created_at
							).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}{#if project?.updated_at && project.updated_at !== project.created_at}
							· Updated {new Date(project.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1">
				<!-- Chat about this project button -->
				<Button
					type="button"
					onclick={openChatAbout}
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
					disabled={isSaving || !project}
					title="Chat about this project"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this project"
						class="w-4 h-4 sm:w-5 sm:h-5 rounded object-cover transition-transform hover:scale-110"
					/>
				</Button>
				<!-- Close button -->
				<Button
					type="button"
					onclick={handleClose}
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
					disabled={isSaving}
					aria-label="Close modal"
				>
					<X class="w-4 h-4" />
				</Button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		{#if !project}
			<div class="px-4 sm:px-6 lg:px-8 py-8">
				<p class="text-muted-foreground">Project data is unavailable.</p>
			</div>
		{:else}
			<div
				class="flex flex-col flex-1 min-h-0 space-y-4 px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto"
			>
				<!-- Main Content Area -->
				<div class="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-5 min-h-[50vh] flex-1">
					<!-- Content Section (Takes most space) -->
					<div
						class="lg:col-span-3 flex flex-col space-y-3 h-full min-h-0 bg-card rounded border border-border shadow-ink transition-all duration-200"
					>
						<!-- Project Name Header -->
						<div
							class="bg-muted/30 p-3 sm:p-4 rounded-t border-b border-border tx tx-frame tx-weak"
						>
							<label
								for="project-name"
								class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
							>
								Project Name <span class="text-destructive ml-0.5">*</span>
							</label>
							<TextInput
								id="project-name"
								bind:value={name}
								placeholder="Enter a clear, memorable project name"
								size="lg"
								required
								disabled={isSaving}
								class="font-semibold text-lg"
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
									class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
								>
									Description
								</label>
								<MarkdownToggleField
									value={description}
									onUpdate={(newValue) => (description = newValue)}
									placeholder="One-line summary of what this project achieves"
									rows={3}
								/>
							</div>

							<!-- Context Document - Main Focus -->
							{#if contextDocument}
								<div class="flex-1 flex flex-col pt-3 border-t border-border">
									<div class="flex items-center justify-between mb-1.5">
										<div class="flex items-center gap-2">
											<FileText class="w-4 h-4 text-accent" />
											<label
												for="context-document"
												class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
											>
												Context Document
											</label>
										</div>
										<Button
											type="button"
											onclick={copyContext}
											variant="ghost"
											size="sm"
											class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
										>
											<Copy class="w-3.5 h-3.5" />
											<span class="hidden sm:inline">Copy</span>
										</Button>
									</div>
									<div class="flex-1 flex flex-col">
										<MarkdownToggleField
											value={contextDocumentBody}
											onUpdate={(newValue) =>
												(contextDocumentBody = newValue)}
											placeholder="## Background\nWhy this project exists and its importance\n\n## Key Decisions\nImportant technical and business decisions\n\n## Resources\nTools, documentation, and dependencies\n\n## Challenges\nCurrent blockers or areas needing attention"
											rows={10}
										/>
									</div>
								</div>
							{/if}

							<!-- Character Counts -->
							<div
								class="flex flex-wrap gap-3 sm:gap-4 text-xs text-muted-foreground pt-2.5 border-t border-border"
							>
								{#if description.length > 0}
									<span class="flex items-center gap-1.5">
										<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
										<span class="font-medium"
											>{description.length.toLocaleString()}</span
										> description
									</span>
								{/if}
								{#if contextDocumentBody.length > 0}
									<span class="flex items-center gap-1.5">
										<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
										<span class="font-medium"
											>{contextDocumentBody.length.toLocaleString()}</span
										> context
									</span>
								{/if}
								{#if !description && !contextDocumentBody}
									<span class="text-muted-foreground italic text-center flex-1">
										Add project details to enable better organization
									</span>
								{/if}
							</div>
						</div>
					</div>

					<!-- Metadata Sidebar -->
					<div
						class="lg:col-span-1 bg-card rounded border border-border shadow-ink transition-all duration-200 lg:max-h-full lg:overflow-y-auto tx tx-grain tx-weak"
					>
						<div class="bg-muted/30 p-3 sm:p-3.5 rounded-t border-b border-border">
							<h3
								class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2"
							>
								<span class="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"
								></span>
								Project Details
							</h3>
						</div>

						<div class="p-3 sm:p-3.5 space-y-3.5">
							<!-- Facet Context -->
							<div>
								<label
									for="facet-context"
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block"
								>
									📂 Context
								</label>
								<Select
									id="facet-context"
									bind:value={facetContext}
									size="sm"
									disabled={isSaving}
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
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block"
								>
									📏 Scale
								</label>
								<Select
									id="facet-scale"
									bind:value={facetScale}
									size="sm"
									disabled={isSaving}
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
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block"
								>
									🎯 Stage
								</label>
								<Select
									id="facet-stage"
									bind:value={facetStage}
									size="sm"
									disabled={isSaving}
								>
									<option value="">Not set</option>
									{#each FACET_STAGE_OPTIONS as option}
										<option value={option}>{facetLabel(option)}</option>
									{/each}
								</Select>
							</div>

							<!-- Project State -->
							<div>
								<label
									for="project-state"
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block"
								>
									📊 Status
								</label>
								<Select
									id="project-state"
									bind:value={stateKey}
									size="sm"
									disabled={isSaving}
								>
									{#each PROJECT_STATES as state}
										<option value={state}>
											{state === 'planning'
												? 'Planning'
												: state === 'active'
													? 'Active'
													: state === 'completed'
														? 'Completed'
														: state === 'cancelled'
															? 'Cancelled'
															: state}
										</option>
									{/each}
								</Select>
							</div>

							<!-- Timeline Section -->
							<div class="space-y-3">
								<div
									class="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
								>
									<Calendar class="w-3.5 h-3.5" />
									Timeline
								</div>

								<!-- Start Date -->
								<div>
									<label
										for="start-date"
										class="text-xs text-muted-foreground mb-1 block"
									>
										Start Date
									</label>
									<TextInput
										id="start-date"
										type="date"
										bind:value={startDate}
										size="sm"
										disabled={isSaving}
									/>
								</div>

								<!-- End Date -->
								<div>
									<label
										for="end-date"
										class="text-xs text-muted-foreground mb-1 block"
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
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				{#if error}
					<div class="p-3 bg-destructive/10 border border-destructive/30 rounded">
						<p class="text-sm text-destructive">{error}</p>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		{#if project}
			<!-- Footer Actions - delete on left, cancel/save on right -->
			<form onsubmit={handleSubmit} class="contents">
				<div
					class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-t border-border bg-muted/30 tx tx-grain tx-weak"
				>
					<!-- Delete button on left -->
					<div class="flex items-center gap-1.5 sm:gap-2">
						<Trash2 class="w-3 h-3 sm:w-4 sm:h-4 text-red-500 shrink-0" />
						<Button
							type="button"
							variant="danger"
							size="sm"
							onclick={() => (showDeleteConfirm = true)}
							disabled={isDeleting || isSaving}
							class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
						>
							<span class="hidden sm:inline">Delete</span>
							<span class="sm:hidden">Del</span>
						</Button>
					</div>

					<!-- Cancel and Save on right -->
					<div class="flex flex-row items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={handleClose}
							disabled={isSaving || isDeleting}
							class="text-xs sm:text-sm px-2 sm:px-4"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							size="sm"
							loading={isSaving}
							disabled={isSaving || isDeleting}
							class="text-xs sm:text-sm px-2 sm:px-4"
						>
							<span class="hidden sm:inline">Save Changes</span>
							<span class="sm:hidden">Save</span>
						</Button>
					</div>
				</div>
			</form>
		{/if}
	{/snippet}
</Modal>

{#if showDeleteConfirm}
	<ConfirmationModal
		isOpen={showDeleteConfirm}
		title="Delete Project"
		confirmText="Delete Project"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		on:confirm={handleDelete}
		on:cancel={() => (showDeleteConfirm = false)}
	>
		<p class="text-sm text-gray-600 dark:text-gray-300" slot="content">
			This action cannot be undone. The project and all its associated data will be
			permanently deleted.
		</p>
	</ConfirmationModal>
{/if}

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	<svelte:component
		this={AgentChatModalComponent}
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={handleChatClose}
	/>
{/if}

<style>
	/* Mobile grab handle - Scratchpad Ops styling */
	:global(.modal-grab-handle) {
		width: 36px;
		height: 4px;
		background: rgb(62 68 89 / 0.4); /* slate-500 */
		border-radius: 2px;
		margin: 0.5rem auto 1rem;
	}

	:global(.dark .modal-grab-handle) {
		background: rgb(142 149 170 / 0.3); /* slate-400 */
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
		border-color: var(--accent-orange);
		box-shadow:
			0 0 0 3px rgba(216, 138, 58, 0.15),
			0 2px 4px 0 rgba(0, 0, 0, 0.05);
	}

	:global(.dark .modal-content input:focus),
	:global(.dark .modal-content textarea:focus),
	:global(.dark .modal-content select:focus) {
		border-color: var(--accent-orange);
		box-shadow:
			0 0 0 3px rgba(216, 138, 58, 0.25),
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
