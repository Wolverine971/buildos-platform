<!-- apps/web/src/lib/components/ontology/templates/TemplateForm.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Template } from '$lib/types/onto';

	interface TemplateFormData {
		name: string;
		type_key: string;
		scope: string;
		status: string;
		parent_template_id: string | null;
		is_abstract: boolean;
	}

	interface Props {
		mode?: 'create' | 'edit';
		initialData?: Partial<Template>;
		availableParents?: Array<{ id: string; name: string; type_key: string }>;
		loading?: boolean;
		onsubmit?: (data: TemplateFormData) => void;
		oncancel?: () => void;
		lockTypeKey?: boolean;
		showParentField?: boolean;
		showScopeField?: boolean;
		showTypeKeyField?: boolean;
		disableScopeSelect?: boolean;
		typeKeyHelperText?: string;
		hideHeader?: boolean;
	}

	let {
		mode = 'create',
		initialData = {},
		availableParents = [],
		loading = false,
		onsubmit,
		oncancel,
		lockTypeKey = mode === 'edit',
		showParentField = true,
		showScopeField = true,
		showTypeKeyField = true,
		disableScopeSelect = false,
		typeKeyHelperText,
		hideHeader = false
	}: Props = $props();

	const dispatch = createEventDispatcher<{
		submit: TemplateFormData;
		cancel: void;
	}>();

	// Form state using Svelte 5 runes
	let name = $state(initialData.name || '');
	let typeKey = $state(initialData.type_key || '');
	let scope = $state<string>(initialData.scope || 'project');
	let status = $state<string>(initialData.status || 'draft');
	let parentTemplateId = $state<string | null>(initialData.parent_template_id || null);
	let isAbstract = $state(initialData.is_abstract || false);

	// Validation state
	let errors = $state<Record<string, string>>({});
	let touched = $state<Record<string, boolean>>({});

	// Derived validation
	const isValid = $derived(
		name.trim().length > 0 &&
			typeKey.trim().length > 0 &&
			scope.length > 0 &&
			Object.keys(errors).length === 0
	);

	const scopes = [
		{ value: 'project', label: 'Project' },
		{ value: 'plan', label: 'Plan' },
		{ value: 'task', label: 'Task' },
		{ value: 'output', label: 'Output' },
		{ value: 'document', label: 'Document' },
		{ value: 'goal', label: 'Goal' },
		{ value: 'requirement', label: 'Requirement' },
		{ value: 'risk', label: 'Risk' },
		{ value: 'milestone', label: 'Milestone' },
		{ value: 'metric', label: 'Metric' }
	];

	const statuses = [
		{ value: 'draft', label: 'Draft' },
		{ value: 'active', label: 'Active' },
		{ value: 'deprecated', label: 'Deprecated' }
	];

	// Validation functions
	function validateName() {
		touched.name = true;
		if (!name.trim()) {
			errors.name = 'Template name is required';
		} else if (name.length > 200) {
			errors.name = 'Name must be 200 characters or less';
		} else {
			delete errors.name;
		}
	}

	function validateTypeKey() {
		touched.type_key = true;
		if (!typeKey.trim()) {
			errors.type_key = 'Type key is required';
		} else if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(typeKey)) {
			errors.type_key =
				'Type key must be lowercase, dot-separated (e.g., creative.writing.novel)';
		} else {
			delete errors.type_key;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		// Validate all fields
		validateName();
		validateTypeKey();

		if (!isValid) {
			return;
		}

		const formData: TemplateFormData = {
			name: name.trim(),
			type_key: typeKey.trim(),
			scope,
			status,
			parent_template_id: parentTemplateId,
			is_abstract: isAbstract
		};

		onsubmit?.(formData);
		dispatch('submit', formData);
	}

	function handleCancel() {
		oncancel?.();
		dispatch('cancel');
	}

	// Auto-generate type_key from name
	function autoGenerateTypeKey() {
		if (!name.trim() || typeKey.trim().length > 0) return;

		const generated = name
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.trim()
			.replace(/\s+/g, '.');

		if (generated && /^[a-z][a-z0-9.]*$/.test(generated)) {
			typeKey = generated;
		}
	}
</script>

<Card variant="elevated">
	{#if !hideHeader}
		<CardHeader variant="gradient">
			<h2 class="text-xl font-bold text-white">
				{mode === 'create' ? 'Create New Template' : 'Edit Template'}
			</h2>
			<p class="text-sm text-white/80 mt-1">
				{mode === 'create'
					? 'Define the basic information for your template'
					: 'Update template information'}
			</p>
		</CardHeader>
	{/if}

	<CardBody padding="lg">
		<form onsubmit={handleSubmit} class="space-y-6">
			<!-- Template Name -->
			<FormField
				label="Template Name"
				labelFor="name"
				required
				error={touched.name ? errors.name : undefined}
			>
				<TextInput
					id="name"
					bind:value={name}
					onblur={() => {
						validateName();
						autoGenerateTypeKey();
					}}
					placeholder="e.g., Novel Writing Project"
					class="w-full"
					disabled={loading}
				/>
				<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
					A descriptive name for this template
				</p>
			</FormField>

			<!-- Type Key -->
			{#if showTypeKeyField}
				<FormField
					label="Type Key"
					labelFor="type_key"
					required
					error={touched.type_key ? errors.type_key : undefined}
				>
					<TextInput
						id="type_key"
						bind:value={typeKey}
						onblur={validateTypeKey}
						placeholder="e.g., creative.writing.novel"
						class="w-full font-mono text-sm"
						disabled={loading || lockTypeKey}
					/>
					<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
						{typeKeyHelperText ??
							`Unique identifier in dot notation (lowercase). ${
								lockTypeKey ? 'Locked by builder.' : 'Auto-generated from name.'
							}`}
					</p>
				</FormField>
			{/if}

			<!-- Scope -->
			{#if showScopeField}
				<FormField label="Scope" labelFor="scope" required>
					<Select
						id="scope"
						bind:value={scope}
						class="w-full"
						disabled={loading || disableScopeSelect}
					>
						{#each scopes as scopeOption}
							<option value={scopeOption.value}>{scopeOption.label}</option>
						{/each}
					</Select>
					<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
						What type of entity does this template represent?
					</p>
				</FormField>
			{/if}

			<!-- Parent Template -->
			{#if showParentField && availableParents.length > 0}
				<FormField label="Parent Template" labelFor="parent">
					<Select
						id="parent"
						bind:value={parentTemplateId}
						class="w-full"
						disabled={loading}
					>
						<option value={null}>None (Base Template)</option>
						{#each availableParents as parent}
							<option value={parent.id}>
								{parent.name} ({parent.type_key})
							</option>
						{/each}
					</Select>
					<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
						Inherit properties from another template (optional)
					</p>
				</FormField>
			{/if}

			<!-- Status -->
			<FormField label="Status" labelFor="status" required>
				<Select id="status" bind:value={status} class="w-full" disabled={loading}>
					{#each statuses as statusOption}
						<option value={statusOption.value}>{statusOption.label}</option>
					{/each}
				</Select>
				<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
					Draft templates are not visible to users
				</p>
			</FormField>

			<!-- Abstract Template -->
			<FormField label="Template Type" labelFor="abstract">
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						id="abstract"
						bind:checked={isAbstract}
						class="rounded border-gray-200 dark:border-gray-700 text-accent-orange focus:ring-2 focus:ring-accent-orange"
						disabled={loading}
					/>
					<span class="text-sm text-slate-700 dark:text-slate-300">
						Abstract Template
					</span>
				</label>
				<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
					Abstract templates are only used for inheritance, not direct instantiation
				</p>
			</FormField>

			<!-- Form Actions -->
			<div
				class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700"
			>
				<Button
					type="submit"
					variant="primary"
					size="md"
					fullWidth={true}
					disabled={loading || !isValid}
					class="sm:flex-1"
				>
					{loading
						? 'Saving...'
						: mode === 'create'
							? 'Create Template'
							: 'Update Template'}
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="md"
					fullWidth={true}
					disabled={loading}
					onclick={handleCancel}
					class="sm:flex-1"
				>
					Cancel
				</Button>
			</div>
		</form>
	</CardBody>
</Card>

<style>
	/* Custom styles if needed */
</style>
