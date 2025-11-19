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
	import type { Project, Document, Template } from '$lib/types/onto';
	import { renderMarkdown } from '$lib/utils/markdown';

	interface Props {
		isOpen?: boolean;
		project: Project | null;
		contextDocument?: Document | null;
		template?: Template | null;
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

	type TemplatePropField = {
		key: string;
		schema: Record<string, any>;
		required: boolean;
	};

	let {
		isOpen = $bindable(false),
		project,
		contextDocument = null,
		template = null,
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

	// Context document state - now editable
	let contextDocumentBody = $state('');
	let templatePropValues = $state<Record<string, unknown>>({});
	let templatePropsDirty = $state(false);

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

	const templatePropFields = $derived.by(() => {
		const schema = template?.schema;
		const properties = (schema?.properties ?? {}) as Record<string, any>;
		const requiredList = Array.isArray(schema?.required) ? (schema?.required as string[]) : [];
		return Object.entries(properties).map(
			([key, propSchema]) =>
				({
					key,
					schema: (propSchema ?? {}) as Record<string, any>,
					required: requiredList.includes(key)
				}) as TemplatePropField
		);
	});

	$effect(() => {
		if (!project || !isOpen) return;

		name = project.name ?? '';
		description = project.description ?? '';
		facetContext = project.facet_context ?? '';
		facetScale = project.facet_scale ?? '';
		facetStage = project.facet_stage ?? '';
		startDate = toDateInput(project.start_at);
		endDate = toDateInput(project.end_at);
		contextDocumentBody = initialContextBody;
		error = null;

		const nextTemplateValues: Record<string, unknown> = {};
		for (const field of templatePropFields) {
			const existing = project.props?.[field.key];
			if (existing !== undefined) {
				nextTemplateValues[field.key] = existing;
			} else if (field.schema?.default !== undefined) {
				nextTemplateValues[field.key] = field.schema.default;
			} else if (field.schema?.type === 'boolean') {
				nextTemplateValues[field.key] = false;
			} else {
				nextTemplateValues[field.key] = '';
			}
		}
		templatePropValues = nextTemplateValues;
		templatePropsDirty = false;
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

	function templateFieldLabel(field: TemplatePropField): string {
		const title =
			typeof field.schema?.title === 'string' && field.schema.title.length > 0
				? field.schema.title
				: facetLabel(field.key);
		return field.required ? `${title} *` : title;
	}

	function coerceTemplateValue(field: TemplatePropField, raw: unknown): unknown {
		const type = field.schema?.type;
		if (type === 'number' || type === 'integer') {
			if (raw === '' || raw === null || raw === undefined) {
				return '';
			}
			const parsed = Number(raw);
			return Number.isNaN(parsed) ? '' : parsed;
		}
		if (type === 'boolean') {
			return Boolean(raw);
		}
		return typeof raw === 'string' ? raw : (raw ?? '');
	}

	function updateTemplateProp(field: TemplatePropField, rawValue: unknown) {
		templatePropValues = {
			...templatePropValues,
			[field.key]: coerceTemplateValue(field, rawValue)
		};
		templatePropsDirty = true;
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

		const hasTemplatePropChanges = templatePropsDirty && templatePropFields.length > 0;

		if (hasTemplatePropChanges) {
			payload.props = {
				...(project.props ?? {}),
				...templatePropValues
			};
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
							class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 p-3 sm:p-4 rounded-t-xl border-b border-gray-200 dark:border-gray-700"
						>
							<label
								for="project-name"
								class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5"
							>
								Project Name <span class="text-red-500 ml-0.5">*</span>
							</label>
							<TextInput
								id="project-name"
								bind:value={name}
								placeholder="Enter a clear, memorable project name"
								size="lg"
								required
								disabled={isSaving}
								class="font-semibold text-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
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
									class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5"
								>
									Description
								</label>
								<MarkdownToggleField
									value={description}
									onUpdate={(newValue) => (description = newValue)}
									placeholder="One-line summary of what this project achieves"
									rows={3}
									class="text-sm bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								/>
							</div>

							<!-- Context Document - Main Focus -->
							{#if contextDocument}
								<div
									class="flex-1 flex flex-col pt-3 border-t border-gray-200 dark:border-gray-700"
								>
									<div class="flex items-center justify-between mb-1.5">
										<div class="flex items-center gap-2">
											<FileText
												class="w-4 h-4 text-green-600 dark:text-green-400"
											/>
											<label
												for="context-document"
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
											class="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 hover:bg-green-50 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-green-900/20 transition-colors"
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
											maxRows={20}
											class="flex-1 leading-relaxed bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-green-200 dark:border-green-800 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400"
										/>
									</div>
								</div>
							{/if}

							<!-- Character Counts -->
							<div
								class="flex flex-wrap gap-3 sm:gap-4 text-xs text-gray-500 dark:text-gray-400 pt-2.5 border-t border-gray-200 dark:border-gray-700"
							>
								{#if description.length > 0}
									<span class="flex items-center gap-1.5">
										<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
										<span class="font-medium"
											>{description.length.toLocaleString()}</span
										> description
									</span>
								{/if}
								{#if contextDocumentBody.length > 0}
									<span class="flex items-center gap-1.5">
										<span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
										<span class="font-medium"
											>{contextDocumentBody.length.toLocaleString()}</span
										> context
									</span>
								{/if}
								{#if !description && !contextDocumentBody}
									<span
										class="text-gray-400 dark:text-gray-500 italic text-center flex-1"
									>
										Add project details to enable better organization
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
							class="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 p-3 sm:p-3.5 rounded-t-xl border-b border-gray-200 dark:border-gray-700"
						>
							<h3
								class="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2"
							>
								<span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"
								></span>
								Project Details
							</h3>
						</div>

						<div class="p-3 sm:p-3.5 space-y-3.5">
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

							{#if templatePropFields.length > 0}
								<div class="space-y-2">
									<p
										class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
									>
										🔧 Template Attributes
									</p>
									<div class="space-y-3">
										{#each templatePropFields as field}
											<div class="space-y-1.5">
												<label
													class="text-xs text-gray-600 dark:text-gray-300 font-semibold"
												>
													{templateFieldLabel(field)}
												</label>
												{#if field.schema?.enum}
													<select
														class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
														value={String(
															templatePropValues[field.key] ?? ''
														)}
														onchange={(event) =>
															updateTemplateProp(
																field,
																event.currentTarget.value
															)}
														disabled={isSaving}
													>
														<option value="">Select...</option>
														{#each field.schema.enum as option}
															<option value={option}
																>{facetLabel(option)}</option
															>
														{/each}
													</select>
												{:else if field.schema?.type === 'boolean'}
													<label
														class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
													>
														<input
															type="checkbox"
															class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
															checked={Boolean(
																templatePropValues[field.key]
															)}
															onchange={(event) =>
																updateTemplateProp(
																	field,
																	event.currentTarget.checked
																)}
															disabled={isSaving}
														/>
														<span
															>{field.schema?.description ??
																'Enabled'}</span
														>
													</label>
												{:else if field.schema?.type === 'number' || field.schema?.type === 'integer'}
													<input
														type="number"
														class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
														value={templatePropValues[field.key] === ''
															? ''
															: String(
																	templatePropValues[field.key] ??
																		''
																)}
														oninput={(event) =>
															updateTemplateProp(
																field,
																event.currentTarget.value
															)}
														disabled={isSaving}
													/>
												{:else if (field.schema?.type === 'string' && field.schema?.format === 'textarea') || field.schema?.maxLength > 200}
													<textarea
														class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
														rows={3}
														value={String(
															templatePropValues[field.key] ?? ''
														)}
														oninput={(event) =>
															updateTemplateProp(
																field,
																event.currentTarget.value
															)}
														disabled={isSaving}
													></textarea>
												{:else}
													<input
														type="text"
														class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
														value={String(
															templatePropValues[field.key] ?? ''
														)}
														oninput={(event) =>
															updateTemplateProp(
																field,
																event.currentTarget.value
															)}
														disabled={isSaving}
													/>
												{/if}
												{#if field.schema?.description}
													<p
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														{field.schema.description}
													</p>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

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
