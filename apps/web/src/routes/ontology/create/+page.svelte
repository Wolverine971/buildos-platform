<!-- apps/web/src/routes/ontology/create/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ProjectSpec, Template } from '$lib/types/onto';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import { AlertCircle } from 'lucide-svelte';

	interface FacetValue {
		facet_key: string;
		value: string;
		label: string;
		description: string | null;
		color: string | null;
	}

	interface JSONSchemaProperty {
		type?: string;
		title?: string;
		description?: string;
		default?: unknown;
		enum?: string[];
		items?: JSONSchemaProperty;
		minimum?: number;
		maximum?: number;
		minLength?: number;
		maxLength?: number;
		pattern?: string;
	}

	interface SchemaField {
		key: string;
		schema: JSONSchemaProperty;
		required: boolean;
	}

	interface Goal {
		name: string;
		type_key?: string;
	}

	interface Task {
		title: string;
		plan_name?: string;
		state_key?: string;
	}

	let { data } = $props();

	const grouped = $derived((data.grouped as Record<string, Template[]>) || {});
	const facets = $derived((data.facets as Record<string, FacetValue[]>) || {});

	const facetOptions = $derived({
		context: facets.context ?? [],
		scale: facets.scale ?? [],
		stage: facets.stage ?? []
	});

	let selectedTemplate = $state<Template | null>(null);
	let projectName = $state('');
	let projectDescription = $state('');
	let facetContext = $state('');
	let facetScale = $state('');
	let facetStage = $state('');

	let customProps = $state<Record<string, unknown>>({});
	let schemaProperties = $state<SchemaField[]>([]);
	let schemaMap = $state<Record<string, JSONSchemaProperty>>({});
	let isSubmitting = $state(false);
	let error = $state('');
	let formErrors = $state<string[]>([]);
	let goals = $state<Goal[]>([]);
	let tasks = $state<Task[]>([]);
	let showGoals = $state(false);
	let showTasks = $state(false);

	function resetForm() {
		projectName = '';
		projectDescription = '';
		facetContext = '';
		facetScale = '';
		facetStage = '';
		customProps = {};
		schemaProperties = [];
		schemaMap = {};
		error = '';
		formErrors = [];
		goals = [];
		tasks = [];
		showGoals = false;
		showTasks = false;
	}

	function selectTemplate(template: Template) {
		selectedTemplate = template;

		// Reset and apply template defaults
		projectName = '';
		projectDescription = '';
		facetContext = template.facet_defaults?.context ?? '';
		facetScale = template.facet_defaults?.scale ?? '';
		facetStage = template.facet_defaults?.stage ?? '';

		const newProps: Record<string, unknown> = {};
		const propertyMap: Record<string, JSONSchemaProperty> = {};
		const props: SchemaField[] = [];

		if (template.schema?.properties) {
			const required = Array.isArray(template.schema?.required)
				? (template.schema.required as string[])
				: [];

			for (const [key, schema] of Object.entries(
				template.schema.properties as Record<string, JSONSchemaProperty>
			)) {
				const isRequired = required.includes(key);
				let initial: unknown;

				if (schema.default !== undefined) {
					initial = schema.default;
				} else {
					switch (schema.type) {
						case 'boolean':
							initial = false;
							break;
						case 'array':
							initial = [];
							break;
						case 'number':
						case 'integer':
							initial = '';
							break;
						default:
							initial = '';
					}
				}

				newProps[key] = initial;
				propertyMap[key] = schema;
				props.push({ key, schema, required: isRequired });
			}
		}

		customProps = newProps;
		schemaMap = propertyMap;
		schemaProperties = props;
		error = '';
		formErrors = [];
		goals = [];
		tasks = [];
		showGoals = false;
		showTasks = false;
	}

	function updateCustomProp(key: string, value: unknown) {
		customProps = { ...customProps, [key]: value };
	}

	function validateForm(): string[] {
		const issues: string[] = [];

		if (!selectedTemplate) {
			issues.push('Choose a template before continuing.');
		}

		if (!projectName.trim()) {
			issues.push('Project name is required.');
		}

		for (const field of schemaProperties) {
			if (!field.required) continue;
			const value = customProps[field.key];

			if (field.schema.type === 'string') {
				if (typeof value !== 'string' || value.trim().length === 0) {
					issues.push(`${field.schema.title ?? field.key} is required.`);
				}
			} else if (field.schema.type === 'number' || field.schema.type === 'integer') {
				if (value === '' || Number.isNaN(Number(value))) {
					issues.push(`${field.schema.title ?? field.key} must be a number.`);
				}
			} else if (field.schema.type === 'array') {
				if (!Array.isArray(value) || value.length === 0) {
					issues.push(`${field.schema.title ?? field.key} needs at least one item.`);
				}
			}
		}

		return issues;
	}

	function validateEntitySections(baseIssues: string[]): string[] {
		let issues = [...baseIssues];

		if (showGoals) {
			goals.forEach((goal, index) => {
				if (!goal.name || goal.name.trim().length === 0) {
					issues.push(`Goal #${index + 1} needs a name.`);
				}
			});
		}

		if (showTasks) {
			tasks.forEach((task, index) => {
				if (!task.title || task.title.trim().length === 0) {
					issues.push(`Task #${index + 1} needs a title.`);
				}
			});
		}

		return issues;
	}

	function normalizeProps(): Record<string, unknown> {
		const normalized: Record<string, unknown> = {};

		for (const field of schemaProperties) {
			const value = customProps[field.key];
			const schema = field.schema;

			if (schema.type === 'string') {
				const trimmed = typeof value === 'string' ? value.trim() : '';
				if (trimmed || field.required) {
					normalized[field.key] = trimmed;
				}
			} else if (schema.type === 'number' || schema.type === 'integer') {
				if (value !== '' && value !== null && !Number.isNaN(Number(value))) {
					const numeric =
						schema.type === 'integer' ? parseInt(value, 10) : parseFloat(value);
					normalized[field.key] = numeric;
				} else if (field.required) {
					normalized[field.key] = schema.type === 'integer' ? 0 : 0;
				}
			} else if (schema.type === 'boolean') {
				if (value !== undefined) {
					normalized[field.key] = Boolean(value);
				}
			} else if (schema.type === 'array') {
				if (Array.isArray(value) && value.length > 0) {
					normalized[field.key] = value;
				} else if (field.required) {
					normalized[field.key] = [];
				}
			} else if (value !== undefined && value !== null) {
				normalized[field.key] = value;
			}
		}

		return normalized;
	}

	function sanitizedGoals() {
		if (!showGoals) return [];
		return goals
			.map((goal) => ({
				name: goal.name?.trim(),
				type_key: goal.type_key?.trim() || undefined,
				props: {}
			}))
			.filter((goal) => goal.name);
	}

	function sanitizedTasks() {
		if (!showTasks) return [];
		return tasks
			.map((task) => ({
				title: task.title?.trim(),
				plan_name: task.plan_name?.trim() || undefined,
				state_key: task.state_key?.trim() || undefined,
				props: {}
			}))
			.filter((task) => task.title);
	}

	function addGoal() {
		showGoals = true;
		goals = [...goals, { name: '' }];
	}

	function updateGoal(index: number, key: 'name' | 'type_key', value: string) {
		goals = goals.map((goal, i) => (i === index ? { ...goal, [key]: value } : goal));
	}

	function removeGoal(index: number) {
		goals = goals.filter((_, i) => i !== index);
		if (goals.length === 0) {
			showGoals = false;
		}
	}

	function addTask() {
		showTasks = true;
		tasks = [...tasks, { title: '', state_key: 'todo' }];
	}

	function updateTask(index: number, key: 'title' | 'plan_name' | 'state_key', value: string) {
		tasks = tasks.map((task, i) => (i === index ? { ...task, [key]: value } : task));
	}

	function removeTask(index: number) {
		tasks = tasks.filter((_, i) => i !== index);
		if (tasks.length === 0) {
			showTasks = false;
		}
	}

	async function createProject() {
		if (!selectedTemplate) {
			error = 'Please select a template and provide required fields.';
			return;
		}

		isSubmitting = true;
		error = '';
		formErrors = [];

		try {
			const validationIssues = validateEntitySections(validateForm());
			if (validationIssues.length) {
				formErrors = validationIssues;
				error = validationIssues[0];
				isSubmitting = false;
				return;
			}

			const normalizedProps = normalizeProps();
			const goalPayload = sanitizedGoals();
			const taskPayload = sanitizedTasks();

			const spec: ProjectSpec = {
				project: {
					name: projectName.trim(),
					description: projectDescription.trim() || undefined,
					type_key: selectedTemplate.type_key,
					state_key: selectedTemplate.fsm?.initial ?? 'draft',
					props: {
						facets: {
							context: facetContext || undefined,
							scale: facetScale || undefined,
							stage: facetStage || undefined
						},
						...normalizedProps
					}
				}
			};

			if (goalPayload.length) {
				spec.goals = goalPayload;
			}

			if (taskPayload.length) {
				spec.tasks = taskPayload;
			}

			const response = await fetch('/api/onto/projects/instantiate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(spec)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || errorData.message || 'Failed to create project');
			}

			const result = await response.json();
			isSubmitting = false;
			// ✅ Extract from ApiResponse.data wrapper
			goto(`/ontology/projects/${result.data.project_id}`);
		} catch (err) {
			console.error('[Create Project] Error:', err);
			error = err instanceof Error ? err.message : 'Failed to create project';
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Create Project | Ontology</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
	<header class="mb-8 sm:mb-12">
		<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
			Create New Project
		</h1>
		<p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
			Select a template and configure your project
		</p>
	</header>

	{#if !selectedTemplate}
		<div class="space-y-8">
			<h2 class="text-2xl font-semibold text-gray-900 dark:text-white">Choose a Template</h2>

			{#each Object.entries(grouped) as [realm, templates]}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300 capitalize">
						{realm}
					</h3>
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
						{#each templates as template}
							<Card
								variant="interactive"
								padding="md"
								onclick={() => selectTemplate(template)}
							>
								<CardBody padding="none">
									<div class="space-y-3">
										<div>
											<h4
												class="text-lg font-semibold text-gray-900 dark:text-white mb-1"
											>
												{template.name}
											</h4>
											<p
												class="text-xs font-mono text-gray-500 dark:text-gray-400"
											>
												{template.type_key}
											</p>
										</div>
										{#if template.metadata?.description}
											<p
												class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed"
											>
												{template.metadata.description}
											</p>
										{/if}
										<div class="flex flex-wrap gap-2">
											<Badge variant="info" size="sm">
												{template.metadata?.output_type || 'project'}
											</Badge>
											<Badge variant="info" size="sm">
												{template.metadata?.typical_scale || 'medium'}
											</Badge>
										</div>
									</div>
								</CardBody>
							</Card>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<Card variant="elevated" padding="none">
			<CardHeader variant="default">
				<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<div>
						<h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
							Configure Project
						</h2>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Template: {selectedTemplate.name}
						</p>
					</div>
					<Button
						variant="outline"
						size="md"
						onclick={() => {
							selectedTemplate = null;
							resetForm();
						}}
					>
						Change Template
					</Button>
				</div>
			</CardHeader>

			<CardBody padding="lg">
				<form
					class="space-y-8"
					onsubmit={(event) => {
						event.preventDefault();
						void createProject();
					}}
				>
					{#if formErrors.length}
						<Alert variant="error" title="Please resolve the following:">
							<ul class="list-disc list-inside space-y-1">
								{#each formErrors as issue}
									<li>{issue}</li>
								{/each}
							</ul>
						</Alert>
					{/if}

					<div class="space-y-6">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Basic Information
						</h3>

						<FormField label="Project Name" labelFor="name" required={true}>
							<TextInput
								id="name"
								bind:value={projectName}
								placeholder="Enter project name"
								required={true}
							/>
						</FormField>

						<FormField label="Description" labelFor="description">
							<Textarea
								id="description"
								bind:value={projectDescription}
								placeholder="Describe the project context (optional)"
								rows={4}
							/>
						</FormField>
					</div>

					<div class="space-y-6">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
							Facet Overrides
						</h3>

						<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<FormField label="Context" labelFor="facet-context">
								<Select
									id="facet-context"
									bind:value={facetContext}
									placeholder="Select context (optional)"
								>
									<option value="">Select context (optional)</option>
									{#each facetOptions.context as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Select>
							</FormField>

							<FormField label="Scale" labelFor="facet-scale">
								<Select
									id="facet-scale"
									bind:value={facetScale}
									placeholder="Select scale (optional)"
								>
									<option value="">Select scale (optional)</option>
									{#each facetOptions.scale as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Select>
							</FormField>

							<FormField label="Stage" labelFor="facet-stage">
								<Select
									id="facet-stage"
									bind:value={facetStage}
									placeholder="Select stage (optional)"
								>
									<option value="">Select stage (optional)</option>
									{#each facetOptions.stage as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</Select>
							</FormField>
						</div>

						<p class="text-xs text-gray-500 dark:text-gray-400">
							Facets power filtering and discovery. Override template defaults if this
							project differs from the baseline.
						</p>
					</div>

					{#if schemaProperties.length > 0}
						<div class="space-y-6">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Template Properties
							</h3>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
								{#each schemaProperties as field (field.key)}
									<FormField
										label={field.schema.title ?? field.key.replace(/_/g, ' ')}
										labelFor={`prop-${field.key}`}
										required={field.required}
										hint={field.schema.description}
									>
										{#if field.schema.type === 'string' && Array.isArray(field.schema.enum)}
											<Select
												id={`prop-${field.key}`}
												value={customProps[field.key] ?? ''}
												onchange={(event) =>
													updateCustomProp(
														field.key,
														(event.currentTarget as HTMLSelectElement)
															.value
													)}
												placeholder="Select {field.schema.title ??
													field.key}"
											>
												<option value=""
													>Select {field.schema.title ??
														field.key}</option
												>
												{#each field.schema.enum as option (option)}
													<option value={option}>{option}</option>
												{/each}
											</Select>
										{:else if field.schema.type === 'string'}
											<TextInput
												id={`prop-${field.key}`}
												value={customProps[field.key] ?? ''}
												oninput={(event) =>
													updateCustomProp(
														field.key,
														(event.currentTarget as HTMLInputElement)
															.value
													)}
												placeholder={field.schema.placeholder ?? ''}
											/>
										{:else if field.schema.type === 'number' || field.schema.type === 'integer'}
											<TextInput
												id={`prop-${field.key}`}
												type="number"
												value={customProps[field.key] ?? ''}
												min={field.schema.minimum}
												max={field.schema.maximum}
												step={field.schema.type === 'integer'
													? 1
													: (field.schema.step ?? 'any')}
												oninput={(event) => {
													const target =
														event.currentTarget as HTMLInputElement;
													updateCustomProp(
														field.key,
														target.value === ''
															? ''
															: Number(target.value)
													);
												}}
											/>
										{:else if field.schema.type === 'boolean'}
											<label
												class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
											>
												<input
													id={`prop-${field.key}`}
													type="checkbox"
													class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-0 transition-colors cursor-pointer"
													checked={Boolean(customProps[field.key])}
													onchange={(event) =>
														updateCustomProp(
															field.key,
															(
																event.currentTarget as HTMLInputElement
															).checked
														)}
												/>
												<span>{field.schema.trueLabel ?? 'Enabled'}</span>
											</label>
										{:else if field.schema.type === 'array'}
											<Textarea
												id={`prop-${field.key}`}
												rows={field.schema.rows ?? 3}
												placeholder={field.schema.placeholder ??
													'Enter one item per line'}
												value={(customProps[field.key] ?? []).join('\n')}
												oninput={(event) => {
													const target =
														event.currentTarget as HTMLTextAreaElement;
													const items = target.value
														.split('\n')
														.map((item) => item.trim())
														.filter(Boolean);
													updateCustomProp(field.key, items);
												}}
											/>
										{:else}
											<TextInput
												id={`prop-${field.key}`}
												value={customProps[field.key] ?? ''}
												oninput={(event) =>
													updateCustomProp(
														field.key,
														(event.currentTarget as HTMLInputElement)
															.value
													)}
											/>
										{/if}
									</FormField>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Optional Goals -->
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Initial Goals
							</h3>
							<Button variant="ghost" size="sm" onclick={() => addGoal()}
								>Add Goal</Button
							>
						</div>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Optional: seed the project with high-level goals. You can always add
							more later.
						</p>

						{#if showGoals}
							{#if goals.length === 0}
								<p class="text-sm text-gray-600 dark:text-gray-400">
									No goals added yet. Use "Add Goal" to create one.
								</p>
							{/if}

							<div class="space-y-4">
								{#each goals as goal, index}
									<Card variant="default" padding="md">
										<CardBody padding="none">
											<div class="space-y-3">
												<div class="flex items-center justify-between">
													<h4
														class="text-sm font-semibold text-gray-800 dark:text-gray-200"
													>
														Goal {index + 1}
													</h4>
													<Button
														variant="ghost"
														size="sm"
														onclick={() => removeGoal(index)}
													>
														Remove
													</Button>
												</div>
												<FormField
													label="Name"
													labelFor={`goal-${index}-name`}
													required={true}
												>
													<TextInput
														id={`goal-${index}-name`}
														value={goal.name}
														oninput={(event) =>
															updateGoal(
																index,
																'name',
																(
																	event.currentTarget as HTMLInputElement
																).value
															)}
														placeholder="Define the outcome"
													/>
												</FormField>
												<FormField
													label="Type Key (optional)"
													labelFor={`goal-${index}-type`}
												>
													<TextInput
														id={`goal-${index}-type`}
														value={goal.type_key ?? ''}
														oninput={(event) =>
															updateGoal(
																index,
																'type_key',
																(
																	event.currentTarget as HTMLInputElement
																).value
															)}
														placeholder="e.g. goal.outcome"
													/>
												</FormField>
											</div>
										</CardBody>
									</Card>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Optional Tasks -->
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Initial Tasks
							</h3>
							<Button variant="ghost" size="sm" onclick={() => addTask()}
								>Add Task</Button
							>
						</div>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Optional: capture starting work items. Each task needs a title.
						</p>

						{#if showTasks}
							{#if tasks.length === 0}
								<p class="text-sm text-gray-600 dark:text-gray-400">
									No tasks added yet. Use "Add Task" to create one.
								</p>
							{/if}

							<div class="space-y-4">
								{#each tasks as task, index}
									<Card variant="default" padding="md">
										<CardBody padding="none">
											<div class="space-y-3">
												<div class="flex items-center justify-between">
													<h4
														class="text-sm font-semibold text-gray-800 dark:text-gray-200"
													>
														Task {index + 1}
													</h4>
													<Button
														variant="ghost"
														size="sm"
														onclick={() => removeTask(index)}
													>
														Remove
													</Button>
												</div>
												<FormField
													label="Title"
													labelFor={`task-${index}-title`}
													required={true}
												>
													<TextInput
														id={`task-${index}-title`}
														value={task.title}
														oninput={(event) =>
															updateTask(
																index,
																'title',
																(
																	event.currentTarget as HTMLInputElement
																).value
															)}
														placeholder="Task title"
													/>
												</FormField>
												<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
													<FormField
														label="Plan Name (optional)"
														labelFor={`task-${index}-plan`}
													>
														<TextInput
															id={`task-${index}-plan`}
															value={task.plan_name ?? ''}
															oninput={(event) =>
																updateTask(
																	index,
																	'plan_name',
																	(
																		event.currentTarget as HTMLInputElement
																	).value
																)}
															placeholder="Attach to plan"
														/>
													</FormField>
													<FormField
														label="State (optional)"
														labelFor={`task-${index}-state`}
													>
														<TextInput
															id={`task-${index}-state`}
															value={task.state_key ?? ''}
															oninput={(event) =>
																updateTask(
																	index,
																	'state_key',
																	(
																		event.currentTarget as HTMLInputElement
																	).value
																)}
															placeholder="Defaults to todo"
														/>
													</FormField>
												</div>
											</div>
										</CardBody>
									</Card>
								{/each}
							</div>
						{/if}
					</div>
				</form>
			</CardBody>

			<CardFooter>
				<div class="flex items-center justify-end gap-4">
					{#if error && !formErrors.length}
						<p class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
							<AlertCircle class="w-4 h-4" />
							{error}
						</p>
					{/if}
					<Button
						variant="primary"
						size="lg"
						loading={isSubmitting}
						onclick={createProject}
					>
						{isSubmitting ? 'Creating…' : 'Create Project'}
					</Button>
				</div>
			</CardFooter>
		</Card>
	{/if}
</div>
