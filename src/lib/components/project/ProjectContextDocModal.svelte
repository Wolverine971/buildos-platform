<!-- src/lib/components/project/ProjectContextDocModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Copy, FileText, Settings, Edit3, Save, X, AlertCircle } from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';
	import Modal from '$lib/components/ui/Modal.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { format } from 'date-fns/format';
	import type { Project, Task, Note } from '$lib/types/project';
	import type { FormConfig } from '$lib/types/form';

	export let isOpen = false;
	export let project: Project;
	export let tasks: Task[] = [];
	export let outdatedTasks: Task[] = [];
	export let notes: Note[] = [];
	export let taskStats: {
		total: number;
		completed: number;
		inProgress: number;
		blocked: number;
		outdated: number;
	};

	const dispatch = createEventDispatcher();

	let copyButtonText = 'Copy Document';
	let copySuccess = false;
	let editingProject = false;
	let projectFormData: Record<string, any> = {};
	let projectContext = '';
	let currentContextValue = '';
	let originalContextValue = '';
	let projectErrors: string[] = [];
	let contextErrors: string[] = [];
	let savingContext = false;
	let savingProject = false;

	// Form configuration for project editing (without context field)
	const projectFormConfig: FormConfig = {
		name: {
			type: 'text',
			label: 'Project Name',
			placeholder: 'Enter project name',
			required: true
		},
		description: {
			type: 'textarea',
			label: 'Description',
			placeholder: 'Brief description of the project',
			rows: 3,
			markdown: true
		},
		status: {
			type: 'select',
			label: 'Status',
			options: ['active', 'paused', 'completed', 'archived'],
			required: true
		},
		tags: {
			type: 'tags',
			label: 'Tags',
			placeholder: 'tag1, tag2, tag3'
		},
		start_date: {
			type: 'date',
			label: 'Start Date'
		},
		end_date: {
			type: 'date',
			label: 'End Date'
		},
		executive_summary: {
			type: 'textarea',
			label: 'Executive Summary',
			placeholder: 'Brief overview of the project goals and current status',
			rows: 3,
			markdown: true
		}
	};

	$: completionRate =
		taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;

	// Initialize project form data and context
	$: if (project && isOpen) {
		projectFormData = {
			name: project?.name || '',
			description: project?.description || '',
			status: project?.status || 'active',
			start_date: project?.start_date || '',
			end_date: project?.end_date || '',
			tags: project?.tags || [],
			executive_summary: project?.executive_summary || ''
		};
		projectContext = project?.context || '';
		currentContextValue = project?.context || '';
		originalContextValue = project?.context || '';
	}

	// Check if context has changes
	$: hasContextChanges = currentContextValue?.trim() !== originalContextValue?.trim();

	// Check if project has changes
	$: hasProjectChanges =
		editingProject &&
		(projectFormData.name !== project?.name ||
			projectFormData.description !== project?.description ||
			projectFormData.status !== project?.status ||
			projectFormData.start_date !== project?.start_date ||
			projectFormData.end_date !== project?.end_date ||
			JSON.stringify(projectFormData.tags) !== JSON.stringify(project?.tags || []) ||
			projectFormData.executive_summary !== project?.executive_summary);

	function handleClose() {
		editingProject = false;
		// Reset context to original value if there are unsaved changes
		if (hasContextChanges) {
			currentContextValue = originalContextValue;
		}
		dispatch('close');
	}

	function startEditingProject() {
		editingProject = true;
	}

	function handleContextUpdate(newValue: string) {
		currentContextValue = newValue;
	}

	function cancelContextChanges() {
		currentContextValue = originalContextValue;
		contextErrors = [];
	}

	async function saveContextChanges() {
		if (!hasContextChanges) {
			toastService.info('No changes to save');
			return;
		}

		contextErrors = [];
		savingContext = true;

		try {
			// Update project context
			const response = await fetch(`/api/projects/${project.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					context: currentContextValue?.trim() || null
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to update project context');
			}

			const result = await response.json();
			const updatedProject = result.data?.project || result.project || result;

			// Update local project data
			project = { ...project, ...updatedProject };
			projectContext = updatedProject.context || '';
			currentContextValue = updatedProject.context || '';
			originalContextValue = updatedProject.context || '';

			// Show success message
			toastService.success('Project context updated successfully');

			// Dispatch event to parent
			dispatch('updated', updatedProject);
		} catch (error) {
			const errorMessage = (error as Error).message || 'Failed to update project context';
			contextErrors = [errorMessage];
			toastService.error(errorMessage);
		} finally {
			savingContext = false;
		}
	}

	function cancelEditing() {
		editingProject = false;
		projectErrors = [];
		// Reset form data
		projectFormData = {
			name: project?.name || '',
			description: project?.description || '',
			status: project?.status || 'active',
			start_date: project?.start_date || '',
			end_date: project?.end_date || '',
			tags: project?.tags || [],
			executive_summary: project?.executive_summary || ''
		};
	}

	async function saveProjectChanges() {
		if (!hasProjectChanges) {
			toastService.info('No changes to save');
			return;
		}

		projectErrors = [];
		savingProject = true;

		// Validate required fields
		for (const [field, config] of Object.entries(projectFormConfig)) {
			if (config.required && !projectFormData[field]?.toString().trim()) {
				projectErrors.push(`${config.label} is required`);
			}
		}

		if (projectErrors.length > 0) {
			savingProject = false;
			return;
		}

		try {
			// Prepare project data
			const projectData: Record<string, any> = {};

			for (const [key, value] of Object.entries(projectFormData)) {
				if (key === 'tags' && Array.isArray(value)) {
					projectData[key] = value;
				} else {
					const trimmedValue = typeof value === 'string' ? value.trim() : value;
					projectData[key] = trimmedValue || null;
				}
			}

			// Update project
			const response = await fetch(`/api/projects/${project.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(projectData)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to update project');
			}

			const result = await response.json();
			const updatedProject = result.data?.project || result.project || result;

			// Update local project data
			project = { ...project, ...updatedProject };
			editingProject = false;

			// Update form data to reflect saved changes
			projectFormData = {
				name: updatedProject?.name || '',
				description: updatedProject?.description || '',
				status: updatedProject?.status || 'active',
				start_date: updatedProject?.start_date || '',
				end_date: updatedProject?.end_date || '',
				tags: updatedProject?.tags || [],
				executive_summary: updatedProject?.executive_summary || ''
			};

			// Show success message
			toastService.success('Project updated successfully');

			// Dispatch event to parent
			dispatch('updated', updatedProject);
		} catch (error) {
			const errorMessage = (error as Error).message || 'Failed to update project';
			projectErrors = [errorMessage];
			toastService.error(errorMessage);
		} finally {
			savingProject = false;
		}
	}

	function handleTagsInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const tags = input.value
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag);
		projectFormData.tags = tags;
	}

	function getFieldValue(field: string): string {
		const value = projectFormData[field];
		const fieldType = projectFormConfig[field].type;

		if (fieldType === 'tags' && Array.isArray(value)) {
			return value.join(', ');
		}

		return value || '';
	}

	function handleMarkdownUpdate(field: string, newValue: string) {
		projectFormData[field] = newValue;
		projectFormData = { ...projectFormData };
	}

	function getStatusColor(status: string | null): string {
		switch (status) {
			case 'active':
				return 'bg-emerald-500';
			case 'paused':
				return 'bg-amber-500';
			case 'completed':
				return 'bg-primary-500';
			default:
				return 'bg-gray-500';
		}
	}

	function getStatusBadgeColor(status: string | null): string {
		switch (status) {
			case 'active':
				return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
			case 'paused':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
			case 'completed':
				return 'bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300';
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
		}
	}

	function getStatusLabel(status: string | null): string {
		return status ? status?.charAt(0).toUpperCase() + status?.slice(1) : 'Unknown';
	}

	function generateFullContext(): string {
		return currentContextValue?.trim() || '';
	}

	async function copyFullContext() {
		try {
			const fullContext = generateFullContext();
			await navigator.clipboard.writeText(fullContext);

			copySuccess = true;
			copyButtonText = `Copied! (${Math.ceil(fullContext.split(' ').length)} words)`;

			setTimeout(() => {
				copySuccess = false;
				copyButtonText = 'Copy Document';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy context:', err);
			copyButtonText = 'Copy Failed - Try Again';

			setTimeout(() => {
				copyButtonText = 'Copy Document';
			}, 2000);
		}
	}

	$: fullContextMarkdown = generateFullContext();
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	size="xl"
	showCloseButton={true}
	title="Project Context Document"
	customClasses="max-w-4xl"
>
	<!-- Header Info Bar -->
	<div
		class="flex flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-primary-50 dark:bg-primary-900/20 border-b border-gray-200 dark:border-gray-700"
	>
		<div class="flex items-center space-x-3">
			<div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex-shrink-0">
				<FileText class="w-5 h-5 text-primary-600 dark:text-primary-400" />
			</div>
			<div class="min-w-0">
				<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
					Overview of {project.name}
				</p>
			</div>
		</div>
		<Button
			type="button"
			on:click={copyFullContext}
			disabled={copySuccess}
			variant={copySuccess ? 'primary' : 'outline'}
			size="sm"
			class={copySuccess ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600' : ''}
		>
			<Copy class="w-3 h-3 mr-1.5" />
			<span class="hidden sm:inline">{copyButtonText}</span>
			<span class="sm:hidden">Copy</span>
		</Button>
	</div>

	<!-- Modal Body -->
	<div class="max-h-[65vh] sm:max-h-[70vh] overflow-y-auto p-3 sm:p-4">
		<!-- Project Info Section -->
		<div
			class="mb-4 sm:mb-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4"
		>
			{#if !editingProject}
				<!-- Display Mode -->
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<div class="flex items-center space-x-2 mb-3">
							<Settings class="w-4 h-4 text-primary-600 dark:text-primary-400" />
							<h3 class="text-sm font-medium text-gray-900 dark:text-white">
								{project.name}
							</h3>
						</div>

						<div class="space-y-2">
							<div
								class="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm"
							>
								<span
									class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getStatusBadgeColor(
										project.status
									)}"
								>
									<div
										class="w-1.5 h-1.5 rounded-full {getStatusColor(
											project.status
										)} mr-1.5"
									></div>
									{getStatusLabel(project.status)}
								</span>

								<span class="text-gray-600 dark:text-gray-400">
									{taskStats.completed}/{taskStats.total} tasks ({completionRate}%)
								</span>

								{#if project.start_date}
									<span class="text-gray-600 dark:text-gray-400">
										Started {format(
											new Date(project.start_date),
											'MMM d, yyyy'
										)}
									</span>
								{/if}

								{#if project.end_date}
									<span class="text-gray-600 dark:text-gray-400">
										Due {format(new Date(project.end_date), 'MMM d, yyyy')}
									</span>
								{/if}
							</div>

							{#if project.tags?.length}
								<div class="flex flex-wrap gap-1">
									{#each project.tags as tag}
										<span
											class="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded text-xs"
										>
											{tag}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<Button
						type="button"
						on:click={startEditingProject}
						variant="outline"
						size="sm"
					>
						<Edit3 class="w-4 h-4 mr-1.5" />
						Edit
					</Button>
				</div>
			{:else}
				<!-- Edit Mode -->
				<div>
					<div class="flex items-center space-x-2 mb-4">
						<Settings class="w-4 h-4 text-primary-600 dark:text-primary-400" />
						<h3 class="text-sm font-medium text-gray-900 dark:text-white">
							Edit Project Information
						</h3>
					</div>

					{#if projectErrors.length > 0}
						<div
							class="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4"
						>
							<div class="flex items-start space-x-2">
								<AlertCircle
									class="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5"
								/>
								<div class="text-xs sm:text-sm text-rose-700 dark:text-rose-300">
									{#each projectErrors as error}
										<p>{error}</p>
									{/each}
								</div>
							</div>
						</div>
					{/if}

					<div class="space-y-4">
						<!-- Project Name -->
						<FormField label="Project Name" labelFor="project-name" required={true}>
							<TextInput
								id="project-name"
								bind:value={projectFormData.name}
								placeholder="Enter project name"
								size="md"
							/>
						</FormField>

						<!-- Description -->
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Description
							</label>
							<MarkdownToggleField
								value={projectFormData.description || ''}
								onUpdate={(newValue) =>
									handleMarkdownUpdate('description', newValue)}
								placeholder="Brief description of the project"
								rows={3}
							/>
						</div>

						<!-- Status and Tags Row -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<FormField label="Status" labelFor="project-status" required={true}>
									<Select
										id="project-status"
										bind:value={projectFormData.status}
										on:change={(e) => (projectFormData.status = e.detail)}
										size="md"
									>
										<option value="">Select Status</option>
										{#each ['active', 'paused', 'completed', 'archived'] as option}
											<option value={option}>
												{option.charAt(0).toUpperCase() +
													option.slice(1).replace('_', ' ')}
											</option>
										{/each}
									</Select>
								</FormField>
							</div>

							<div>
								<FormField label="Tags" labelFor="project-tags">
									<TextInput
										id="project-tags"
										value={getFieldValue('tags')}
										on:input={(e) => handleTagsInput(e)}
										placeholder="tag1, tag2, tag3"
										size="md"
									/>
								</FormField>
							</div>
						</div>

						<!-- Start Date and End Date Row -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<FormField label="Start Date" labelFor="project-start-date">
									<TextInput
										id="project-start-date"
										type="date"
										bind:value={projectFormData.start_date}
										size="md"
									/>
								</FormField>
							</div>

							<div>
								<FormField label="End Date" labelFor="project-end-date">
									<TextInput
										id="project-end-date"
										type="date"
										bind:value={projectFormData.end_date}
										size="md"
									/>
								</FormField>
							</div>
						</div>

						<!-- Executive Summary -->
						<div>
							<label
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Executive Summary
							</label>
							<MarkdownToggleField
								value={projectFormData.executive_summary || ''}
								onUpdate={(newValue) =>
									handleMarkdownUpdate('executive_summary', newValue)}
								placeholder="Brief overview of the project goals and current status"
								rows={3}
							/>
						</div>
					</div>

					<!-- Action Buttons -->
					<div
						class="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600"
					>
						<Button
							type="button"
							on:click={cancelEditing}
							variant="outline"
							size="md"
							class="order-2 sm:order-1 w-full sm:w-auto"
						>
							<X class="w-4 h-4 mr-1.5" />
							Cancel
						</Button>
						<Button
							type="button"
							on:click={saveProjectChanges}
							disabled={savingProject || !hasProjectChanges}
							variant="primary"
							size="md"
							loading={savingProject}
							class="order-1 sm:order-2 w-full sm:w-auto"
						>
							<Save class="w-4 h-4 mr-1.5" />
							{savingProject ? 'Saving...' : 'Save Changes'}
						</Button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Context Section -->
		<div>
			<div class="flex items-center justify-between px-3 sm:px-4">
				<div class="flex items-center space-x-2">
					<FileText class="w-5 h-5 text-primary-600 dark:text-primary-400" />
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
						Project Context
					</h3>
					{#if hasContextChanges}
						<span
							class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
						>
							Unsaved changes
						</span>
					{/if}
				</div>
				<div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
					<span>{fullContextMarkdown.split('\n').length} lines</span>
					<span>{fullContextMarkdown.length} chars</span>
				</div>
			</div>

			{#if contextErrors.length > 0}
				<div
					class="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4"
				>
					<div class="flex items-start space-x-2">
						<AlertCircle class="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5" />
						<div class="text-xs sm:text-sm text-rose-700 dark:text-rose-300">
							{#each contextErrors as error}
								<p>{error}</p>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Context Editor -->

			<div class="p-3 sm:p-4">
				<MarkdownToggleField
					value={currentContextValue || ''}
					onUpdate={handleContextUpdate}
					placeholder="## Goals&#10;Describe your goals here&#10;&#10;## Current Status&#10;Describe current status here&#10;&#10;## Key Information&#10;Add important context here"
					rows={15}
					disabled={savingContext}
				/>
			</div>

			<!-- Context Action Buttons - Show when there are changes -->
			{#if hasContextChanges}
				<div
					class="flex flex-col sm:flex-row sm:justify-end gap-3 mt-3 sm:mt-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700"
				>
					<Button
						type="button"
						on:click={cancelContextChanges}
						disabled={savingContext}
						variant="outline"
						size="md"
						class="order-2 sm:order-1 w-full sm:w-auto"
					>
						<X class="w-4 h-4 mr-1.5" />
						Cancel Changes
					</Button>
					<Button
						type="button"
						on:click={saveContextChanges}
						disabled={savingContext || !hasContextChanges}
						variant="primary"
						size="md"
						loading={savingContext}
						class="order-1 sm:order-2 w-full sm:w-auto"
					>
						<Save class="w-4 h-4 mr-1.5" />
						{savingContext ? 'Saving...' : 'Save Context'}
					</Button>
				</div>
			{/if}

			<!-- Raw Markdown Preview -->
			{#if fullContextMarkdown.trim()}
				<details class="mt-4">
					<summary
						class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
					>
						View Raw Markdown
					</summary>
					<div class="mt-2 bg-gray-900 dark:bg-gray-800 rounded-lg overflow-hidden">
						<div
							class="bg-gray-800 dark:bg-gray-700 px-4 py-2 border-b border-gray-700"
						>
							<span class="text-xs text-gray-400 font-mono">
								{project.slug ||
									project?.name?.toLowerCase().replace(/\s+/g, '-')}-context.md
							</span>
						</div>
						<div class="p-4 overflow-x-auto max-h-80">
							<pre
								class="text-xs text-gray-300 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{fullContextMarkdown}</pre>
						</div>
					</div>
				</details>
			{/if}
		</div>

		<!-- Document Quality Summary -->
		<div class="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
			<div class="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3">
				<div class="text-sm font-medium text-primary-700 dark:text-primary-300">
					Content
				</div>
				<div class="text-xs text-primary-600 dark:text-primary-400 mt-1">
					{fullContextMarkdown.trim() ? '✅ Context defined' : '⚠️ No context'}
				</div>
			</div>

			<div class="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-3">
				<div class="text-sm font-medium text-violet-700 dark:text-violet-300">
					Document Size
				</div>
				<div class="text-xs text-violet-600 dark:text-violet-400 mt-1">
					{Math.ceil(fullContextMarkdown.split(' ').length)} words<br />
					{fullContextMarkdown.length} characters
				</div>
			</div>
		</div>
	</div>
</Modal>
