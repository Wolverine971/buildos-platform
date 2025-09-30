<!-- apps/web/src/lib/components/templates/TemplateManager.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Settings,
		Plus,
		Edit3,
		Trash2,
		Eye,
		Check,
		X,
		AlertCircle,
		Code,
		BookOpen
	} from 'lucide-svelte';
	import type { ProjectBriefTemplate } from '$lib/types/project-brief-template';

	// UI Components
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let isOpen = false;
	export let onClose: () => void = () => {};

	let projectTemplates: ProjectBriefTemplate[] = [];
	let isLoading = false;
	let error: string | null = null;

	// Template editing state
	let editingTemplate: ProjectBriefTemplate | null = null;
	let isCreating = false;
	let showPreview = false;

	// Form state
	let formData = {
		name: '',
		description: '',
		template_content: '',
		is_default: false,
		variables: [] as string[]
	};

	// Template variable syntax - using this to avoid Svelte conflicts
	const VARIABLE_START = '{{';
	const VARIABLE_END = '}}';

	// Default template content as a constant to avoid Svelte parsing issues
	const DEFAULT_PROJECT_TEMPLATE = `You are generating a daily brief for the project "${VARIABLE_START}project_name${VARIABLE_END}".

**Project Context:**
${VARIABLE_START}project_context${VARIABLE_END}

**Current Tasks:**
${VARIABLE_START}current_tasks${VARIABLE_END}

**Recent Progress:**
${VARIABLE_START}recent_progress${VARIABLE_END}

**Current Problems:**
${VARIABLE_START}current_problems${VARIABLE_END}

Generate a concise daily brief that includes:
1. **Status Summary**: Current state and momentum
2. **Key Accomplishments**: What was completed recently
3. **Active Focus Areas**: What needs attention today
4. **Blockers & Challenges**: Current obstacles and suggested solutions
5. **Next Steps**: Immediate actions to maintain momentum
6. **Strategic Alignment**: How today's work connects to project goals

Keep the brief actionable, specific, and under 300 words. Focus on what matters most for forward progress.`;

	onMount(() => {
		if (isOpen) {
			loadTemplates();
		}
	});

	$: if (isOpen && projectTemplates.length === 0) {
		loadTemplates();
	}

	async function loadTemplates() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/brief-templates/project');

			if (!response.ok) {
				throw new Error('Failed to fetch project brief templates');
			}

			const data = await response.json();
			projectTemplates = data.templates || [];
		} catch (err) {
			console.error('Error loading templates:', err);
			error = err instanceof Error ? err.message : 'Failed to load templates';
		} finally {
			isLoading = false;
		}
	}

	function startCreate() {
		isCreating = true;
		editingTemplate = null;
		formData = {
			name: '',
			description: '',
			template_content: DEFAULT_PROJECT_TEMPLATE,
			is_default: false,
			variables: []
		};
	}

	function startEdit(template: ProjectBriefTemplate) {
		isCreating = false;
		editingTemplate = template;
		formData = {
			name: template.name,
			description: template.description || '',
			template_content: template.template_content,
			is_default: template.is_default || false,
			variables: Array.isArray(template.variables) ? template.variables : []
		};
	}

	function cancelEdit() {
		isCreating = false;
		editingTemplate = null;
		showPreview = false;
		formData = {
			name: '',
			description: '',
			template_content: '',
			is_default: false,
			variables: []
		};
	}

	async function saveTemplate() {
		if (!formData.name.trim() || !formData.template_content.trim()) {
			error = 'Name and template content are required';
			return;
		}

		try {
			const url = isCreating
				? '/api/brief-templates/project'
				: `/api/brief-templates/project/${editingTemplate?.id}`;

			const method = isCreating ? 'POST' : 'PUT';

			const response = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					...formData,
					variables: formData.variables // Include detected variables
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.error || `Failed to ${isCreating ? 'create' : 'update'} template`
				);
			}

			await loadTemplates();
			cancelEdit();
			error = null;
		} catch (err) {
			console.error('Error saving template:', err);
			error = err instanceof Error ? err.message : 'Failed to save template';
		}
	}

	async function deleteTemplate(template: ProjectBriefTemplate) {
		if (!confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/brief-templates/project/${template.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to delete template');
			}

			await loadTemplates();
			error = null;
		} catch (err) {
			console.error('Error deleting template:', err);
			error = err instanceof Error ? err.message : 'Failed to delete template';
		}
	}

	function extractVariables(content: string): string[] {
		// Create regex to find variables in the format {{variable_name}}
		const variableRegex = new RegExp(`\\${VARIABLE_START}(\\w+)\\${VARIABLE_END}`, 'g');
		const variables = new Set<string>();
		let match;

		while ((match = variableRegex.exec(content)) !== null) {
			variables.add(match[1]);
		}

		return Array.from(variables);
	}

	// Auto-detect variables when template content changes
	$: if (formData.template_content) {
		formData.variables = extractVariables(formData.template_content);
	}

	// Helper function to show variable syntax in UI
	function getVariableExample(varName: string): string {
		return `${VARIABLE_START}${varName}${VARIABLE_END}`;
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div
			class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden"
		>
			<!-- Enhanced Header -->
			<div
				class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
			>
				<div class="flex items-center">
					<div class="bg-blue-100 dark:bg-blue-900/30 rounded-lg p-2 mr-3">
						<Settings class="h-6 w-6 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
							Template Manager
						</h2>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Create and customize your daily brief templates
						</p>
					</div>
				</div>
				<Button on:click={onClose} variant="ghost" size="sm" class="p-2">
					<X class="h-5 w-5" />
				</Button>
			</div>

			<div class="flex h-[calc(95vh-120px)]">
				<!-- Enhanced Sidebar -->
				<div
					class="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col"
				>
					<div class="p-4">
						<!-- Create Button -->
						<Button
							on:click={startCreate}
							variant="primary"
							size="md"
							class="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
						>
							<Plus class="mr-2 h-4 w-4" />
							New Template
						</Button>

						<!-- Section Header -->
						<div class="flex items-center justify-between mt-6 mb-4">
							<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
								Project Templates
							</h3>
							<span
								class="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full"
							>
								{projectTemplates.length}
							</span>
						</div>
					</div>

					<!-- Template List -->
					<div class="flex-1 overflow-y-auto px-4 pb-4">
						{#if isLoading}
							<div class="space-y-3">
								{#each Array(3) as _}
									<div class="animate-pulse">
										<div
											class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"
										></div>
										<div
											class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"
										></div>
									</div>
								{/each}
							</div>
						{:else if projectTemplates.length === 0}
							<div class="text-center py-8">
								<BookOpen class="h-12 w-12 text-gray-400 mx-auto mb-3" />
								<p class="text-sm text-gray-500 dark:text-gray-400">
									No templates yet
								</p>
								<p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
									Create your first template to get started
								</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each projectTemplates as template}
									<div
										class="group bg-white dark:bg-gray-800 rounded-lg p-3 hover:shadow-sm transition-all duration-200 border border-gray-200 dark:border-gray-700"
									>
										<div class="flex items-start justify-between">
											<div class="flex-1 min-w-0">
												<div class="flex items-center mb-1">
													<h4
														class="text-sm font-medium text-gray-900 dark:text-white truncate"
													>
														{template.name}
													</h4>
													{#if template.is_default}
														<span
															class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
														>
															Default
														</span>
													{/if}
												</div>
												<p
													class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
												>
													{template.description ||
														'No description provided'}
												</p>
												{#if template.variables && template.variables.length > 0}
													<div class="flex flex-wrap gap-1 mt-2">
														{#each template.variables.slice(0, 3) as variable}
															<span
																class="inline-block px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded dark:bg-blue-900 dark:text-blue-300"
															>
																{variable}
															</span>
														{/each}
														{#if template.variables.length > 3}
															<span class="text-xs text-gray-400">
																+{template.variables.length - 3}
															</span>
														{/if}
													</div>
												{/if}
											</div>
											<div
												class="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
											>
												<Button
													on:click={() => startEdit(template)}
													variant="ghost"
													size="sm"
													class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
													title="Edit template"
												>
													<Edit3 class="h-3.5 w-3.5" />
												</Button>
												{#if !template.is_default}
													<Button
														on:click={() => deleteTemplate(template)}
														variant="ghost"
														size="sm"
														class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
														title="Delete template"
													>
														<Trash2 class="h-3.5 w-3.5" />
													</Button>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Enhanced Main Content -->
				<div class="flex-1 flex flex-col overflow-hidden">
					<div class="flex-1 p-6 overflow-y-auto">
						{#if error}
							<div
								class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 dark:bg-red-900/20 dark:border-red-800"
							>
								<div class="flex items-start">
									<AlertCircle
										class="h-5 w-5 text-red-600 dark:text-red-400 mr-3 mt-0.5 flex-shrink-0"
									/>
									<div>
										<h4
											class="text-sm font-medium text-red-800 dark:text-red-200"
										>
											Error
										</h4>
										<p class="text-sm text-red-700 dark:text-red-300 mt-1">
											{error}
										</p>
									</div>
									<Button
										on:click={() => (error = null)}
										variant="ghost"
										size="sm"
										class="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
									>
										<X class="h-4 w-4" />
									</Button>
								</div>
							</div>
						{/if}

						{#if isCreating || editingTemplate}
							<!-- Enhanced Template Editor -->
							<div class="space-y-6">
								<!-- Form Header with Actions -->
								<div class="flex items-center justify-between">
									<div>
										<h3
											class="text-xl font-semibold text-gray-900 dark:text-white"
										>
											{isCreating ? 'Create New' : 'Edit'} Project Template
										</h3>
										<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
											{isCreating
												? 'Design a new template for your project briefs'
												: 'Modify your existing template'}
										</p>
									</div>
									<div class="flex items-center space-x-2">
										<Button
											on:click={() => (showPreview = !showPreview)}
											variant="outline"
											size="sm"
										>
											<Eye class="mr-2 h-4 w-4" />
											{showPreview ? 'Hide' : 'Show'} Preview
										</Button>
									</div>
								</div>

								<!-- Enhanced Form Layout -->
								<div
									class="grid grid-cols-1 {showPreview
										? 'lg:grid-cols-2'
										: ''} gap-8"
								>
									<!-- Form Fields -->
									<div class="space-y-6">
										<!-- Basic Information -->
										<div
											class="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700"
										>
											<h4
												class="text-lg font-medium text-gray-900 dark:text-white mb-4"
											>
												Basic Information
											</h4>

											<div class="space-y-4">
												<!-- Template Name -->
												<FormField
													label="Template Name"
													labelFor="template-name"
													required
												>
													<TextInput
														id="template-name"
														bind:value={formData.name}
														placeholder="e.g., Sprint Planning Template"
														size="md"
													/>
												</FormField>

												<!-- Description -->
												<FormField
													label="Description"
													labelFor="template-description"
												>
													<TextInput
														id="template-description"
														bind:value={formData.description}
														placeholder="Brief description of when to use this template"
														size="md"
													/>
												</FormField>

												<!-- Default Template Toggle -->
												<FormField>
													<div class="flex items-center">
														<input
															type="checkbox"
															id="is_default"
															bind:checked={formData.is_default}
															class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:checked:bg-blue-600"
														/>
														<label
															for="is_default"
															class="ml-3 text-sm text-gray-700 dark:text-gray-300"
														>
															Set as default template for new projects
														</label>
													</div>
												</FormField>
											</div>
										</div>

										<!-- Template Content -->
										<div
											class="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700"
										>
											<div class="flex items-center justify-between mb-4">
												<h4
													class="text-lg font-medium text-gray-900 dark:text-white"
												>
													Template Content
												</h4>
												<div
													class="flex items-center text-xs text-gray-500 dark:text-gray-400"
												>
													<Code class="h-3 w-3 mr-1" />
													Use {getVariableExample('variable_name')} for dynamic
													content
												</div>
											</div>

											<FormField>
												<Textarea
													id="template-content"
													bind:value={formData.template_content}
													rows={20}
													size="md"
													class="font-mono text-sm leading-relaxed resize-none"
													placeholder="Enter your template content here. Use {getVariableExample(
														'project_name'
													)} syntax for variables."
												/>
											</FormField>
										</div>

										<!-- Detected Variables -->
										{#if formData.variables.length > 0}
											<div
												class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800"
											>
												<h4
													class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3"
												>
													Detected Variables ({formData.variables.length})
												</h4>
												<div class="flex flex-wrap gap-2">
													{#each formData.variables as variable}
														<span
															class="inline-flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full dark:bg-blue-900 dark:text-blue-300"
														>
															<Code class="h-3 w-3 mr-1" />
															{variable}
														</span>
													{/each}
												</div>
												<p
													class="text-xs text-blue-700 dark:text-blue-300 mt-3"
												>
													These variables will be automatically replaced
													with actual project data when generating briefs.
												</p>
											</div>
										{/if}

										<!-- Action Buttons -->
										<div class="flex items-center space-x-3 pt-4">
											<Button
												on:click={saveTemplate}
												disabled={!formData.name.trim() ||
													!formData.template_content.trim()}
												variant="primary"
												size="md"
											>
												<Check class="mr-2 h-4 w-4" />
												{isCreating ? 'Create' : 'Update'} Template
											</Button>
											<Button
												on:click={cancelEdit}
												variant="outline"
												size="md"
											>
												<X class="mr-2 h-4 w-4" />
												Cancel
											</Button>
										</div>
									</div>

									<!-- Enhanced Preview Panel -->
									{#if showPreview}
										<div
											class="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700 h-fit"
										>
											<h4
												class="text-lg font-medium text-gray-900 dark:text-white mb-4"
											>
												Template Preview
											</h4>
											<div
												class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
											>
												<pre
													class="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono leading-relaxed overflow-auto max-h-96">{formData.template_content}</pre>
											</div>
											{#if formData.variables.length > 0}
												<div
													class="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
												>
													<p
														class="text-xs text-amber-800 dark:text-amber-200"
													>
														💡 Variables like <code
															class="bg-amber-100 dark:bg-amber-900 px-1 rounded"
															>{getVariableExample(
																'project_name'
															)}</code
														> will be replaced with actual data when generating
														briefs.
													</p>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{:else}
							<!-- Enhanced Welcome/Instructions -->
							<div class="text-center py-16">
								<div
									class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-xl p-8 max-w-2xl mx-auto"
								>
									<div
										class="bg-blue-100 dark:bg-blue-900/30 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6"
									>
										<Settings
											class="h-8 w-8 text-blue-600 dark:text-blue-400"
										/>
									</div>
									<h3
										class="text-2xl font-semibold text-gray-900 dark:text-white mb-4"
									>
										Template Manager
									</h3>
									<p
										class="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed"
									>
										Create and manage templates for your daily briefs. Templates
										use variables like
										<code
											class="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm"
											>{getVariableExample('project_name')}</code
										>
										that get automatically replaced with actual project data when
										generating briefs.
									</p>
									<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-sm">
										<div
											class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
										>
											<h4
												class="font-medium text-gray-900 dark:text-white mb-2"
											>
												Available Variables
											</h4>
											<ul
												class="text-gray-600 dark:text-gray-400 space-y-1 text-left"
											>
												<li>
													• <code
														>{getVariableExample('project_name')}</code
													>
												</li>
												<li>
													• <code
														>{getVariableExample(
															'project_context'
														)}</code
													>
												</li>
												<li>
													• <code
														>{getVariableExample('current_tasks')}</code
													>
												</li>
												<li>
													• <code
														>{getVariableExample(
															'recent_progress'
														)}</code
													>
												</li>
											</ul>
										</div>
										<div
											class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
										>
											<h4
												class="font-medium text-gray-900 dark:text-white mb-2"
											>
												Getting Started
											</h4>
											<ul
												class="text-gray-600 dark:text-gray-400 space-y-1 text-left"
											>
												<li>
													• Select a template to edit from the sidebar
												</li>
												<li>
													• Click "New Template" to create from scratch
												</li>
												<li>• Use variables to make templates dynamic</li>
												<li>
													• Set one template as default for new projects
												</li>
											</ul>
										</div>
									</div>
									<Button on:click={startCreate} variant="primary" size="lg">
										<Plus class="mr-2 h-5 w-5" />
										Create Your First Template
									</Button>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	code {
		font-family:
			'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
	}
</style>
