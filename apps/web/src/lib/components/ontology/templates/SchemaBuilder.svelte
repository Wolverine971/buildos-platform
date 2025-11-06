<!-- apps/web/src/lib/components/ontology/templates/SchemaBuilder.svelte -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type {
		JsonSchemaProperty,
		JsonSchemaDefinition,
		JsonSchemaType
	} from './schema-builder.types';

	interface Props {
		schema?: JsonSchemaDefinition;
		loading?: boolean;
	}

	let { schema = { type: 'object', properties: {}, required: [] }, loading = false }: Props =
		$props();

	// Working schema state
	let workingSchema = $state<JsonSchemaDefinition>(structuredClone(schema));

	// UI state
	let selectedProperty = $state<string | null>(null);
	let editingProperty = $state<JsonSchemaProperty | null>(null);
	let showAddProperty = $state(false);
	let showJsonPreview = $state(false);

	// New property form
	let newPropertyName = $state('');
	let newPropertyType = $state<JsonSchemaType>('string');

	// Enum editor state
	let enumValues = $state<string[]>([]);
	let newEnumValue = $state('');

	// Export function to get current schema
	export function getSchema(): JsonSchemaDefinition {
		return structuredClone(workingSchema);
	}

	// Property type options
	const typeOptions: Array<{ value: JsonSchemaType; label: string; description: string }> = [
		{ value: 'string', label: 'String', description: 'Text value' },
		{ value: 'number', label: 'Number', description: 'Numeric value' },
		{ value: 'integer', label: 'Integer', description: 'Whole number' },
		{ value: 'boolean', label: 'Boolean', description: 'True or false' },
		{ value: 'object', label: 'Object', description: 'Nested object' },
		{ value: 'array', label: 'Array', description: 'List of items' }
	];

	// Computed
	let propertyCount = $derived(Object.keys(workingSchema.properties || {}).length);
	let requiredCount = $derived((workingSchema.required || []).length);
	let schemaJson = $derived(JSON.stringify(workingSchema, null, 2));

	function handleAddProperty() {
		if (!newPropertyName.trim()) {
			alert('Property name is required');
			return;
		}

		if (workingSchema.properties?.[newPropertyName]) {
			alert('Property name already exists');
			return;
		}

		const newProp: JsonSchemaProperty = {
			type: newPropertyType,
			description: ''
		};

		// Add type-specific defaults
		if (newPropertyType === 'string') {
			newProp.minLength = undefined;
			newProp.maxLength = undefined;
		} else if (newPropertyType === 'number' || newPropertyType === 'integer') {
			newProp.minimum = undefined;
			newProp.maximum = undefined;
		} else if (newPropertyType === 'array') {
			newProp.items = { type: 'string' };
		} else if (newPropertyType === 'object') {
			newProp.properties = {};
			newProp.required = [];
		}

		workingSchema.properties = {
			...workingSchema.properties,
			[newPropertyName]: newProp
		};

		// Reset form
		newPropertyName = '';
		newPropertyType = 'string';
		showAddProperty = false;

		// Select the new property for editing
		selectedProperty = newPropertyName;
		editingProperty = { ...newProp };
	}

	function handleSelectProperty(propName: string) {
		selectedProperty = propName;
		editingProperty = structuredClone(workingSchema.properties?.[propName] || null);
		// Load enum values if present
		enumValues = editingProperty?.enum ? [...editingProperty.enum] : [];
		newEnumValue = '';
	}

	function handleSaveProperty() {
		if (!selectedProperty || !editingProperty) return;

		// Save enum values if present
		if (enumValues.length > 0) {
			editingProperty.enum = [...enumValues];
		} else {
			delete editingProperty.enum;
		}

		workingSchema.properties = {
			...workingSchema.properties,
			[selectedProperty]: { ...editingProperty }
		};

		selectedProperty = null;
		editingProperty = null;
		enumValues = [];
		newEnumValue = '';
	}

	function handleDeleteProperty() {
		if (!selectedProperty) return;

		const { [selectedProperty]: deleted, ...rest } = workingSchema.properties || {};
		workingSchema.properties = rest;

		// Remove from required if present
		workingSchema.required = (workingSchema.required || []).filter(
			(r) => r !== selectedProperty
		);

		selectedProperty = null;
		editingProperty = null;
	}

	function handleToggleRequired(propName: string) {
		const required = workingSchema.required || [];
		if (required.includes(propName)) {
			workingSchema.required = required.filter((r) => r !== propName);
		} else {
			workingSchema.required = [...required, propName];
		}
	}

	function handleCancelEdit() {
		selectedProperty = null;
		editingProperty = null;
		enumValues = [];
		newEnumValue = '';
	}

	function handleCancelAdd() {
		showAddProperty = false;
		newPropertyName = '';
		newPropertyType = 'string';
	}

	// Enum value management
	function handleAddEnumValue() {
		const trimmed = newEnumValue.trim();
		if (!trimmed) return;
		if (enumValues.includes(trimmed)) {
			alert('This value already exists in the enum');
			return;
		}
		enumValues = [...enumValues, trimmed];
		newEnumValue = '';
	}

	function handleRemoveEnumValue(value: string) {
		enumValues = enumValues.filter((v) => v !== value);
	}

	function handleEnumKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddEnumValue();
		}
	}
</script>

<Card variant="elevated">
	<CardHeader variant="default">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">JSON Schema</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
					Define the structure and validation rules for entity properties
				</p>
			</div>
			<div class="flex gap-2">
				<Button
					variant={showJsonPreview ? 'primary' : 'secondary'}
					size="sm"
					onclick={() => (showJsonPreview = !showJsonPreview)}
				>
					<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
						/>
					</svg>
					{showJsonPreview ? 'Hide' : 'Show'} JSON
				</Button>
				<span
					class="text-xs text-gray-600 dark:text-gray-400 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-full"
				>
					{propertyCount} properties
				</span>
			</div>
		</div>
	</CardHeader>

	<CardBody padding="sm">
		<div class="flex h-[600px]">
			<!-- Properties List -->
			<div
				class="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto"
			>
				<div class="p-4">
					<div class="flex items-center justify-between mb-4">
						<h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
							Properties
						</h4>
						<Button
							variant="primary"
							size="sm"
							onclick={() => (showAddProperty = true)}
							disabled={loading || showAddProperty}
						>
							<svg
								class="w-4 h-4 mr-1"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/>
							</svg>
							Add
						</Button>
					</div>

					{#if showAddProperty}
						<div
							class="mb-4 p-3 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg"
						>
							<FormField label="Property Name" labelFor="new-prop-name">
								<TextInput
									id="new-prop-name"
									bind:value={newPropertyName}
									placeholder="e.g., title, priority"
									disabled={loading}
								/>
							</FormField>
							<FormField label="Type" labelFor="new-prop-type">
								<Select
									id="new-prop-type"
									bind:value={newPropertyType}
									disabled={loading}
								>
									{#each typeOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</Select>
							</FormField>
							<div class="flex gap-2 mt-3">
								<Button
									variant="primary"
									size="sm"
									fullWidth
									onclick={handleAddProperty}
									disabled={loading}
								>
									Add Property
								</Button>
								<Button
									variant="secondary"
									size="sm"
									fullWidth
									onclick={handleCancelAdd}
									disabled={loading}
								>
									Cancel
								</Button>
							</div>
						</div>
					{/if}

					<div class="space-y-1">
						{#each Object.entries(workingSchema.properties || {}) as [propName, prop]}
							<button
								type="button"
								onclick={() => handleSelectProperty(propName)}
								class="w-full text-left px-3 py-2 rounded-lg transition-colors {selectedProperty ===
								propName
									? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
									: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'} border"
							>
								<div class="flex items-center justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<span
												class="font-medium text-sm text-gray-900 dark:text-white"
												>{propName}</span
											>
											{#if (workingSchema.required || []).includes(propName)}
												<span
													class="text-xs text-red-600 dark:text-red-400 font-bold"
													>*</span
												>
											{/if}
										</div>
										<div
											class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
										>
											{prop.type}
										</div>
									</div>
									<div
										role="button"
										tabindex="0"
										onclick={(e) => {
											e.stopPropagation();
											handleToggleRequired(propName);
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												e.stopPropagation();
												handleToggleRequired(propName);
											}
										}}
										class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
										title={`${(workingSchema.required || []).includes(propName) ? 'Remove from' : 'Mark as'} required`}
									>
										<svg
											class="w-4 h-4 {(workingSchema.required || []).includes(
												propName
											)
												? 'text-red-600 dark:text-red-400'
												: 'text-gray-400'}"
											fill={(workingSchema.required || []).includes(propName)
												? 'currentColor'
												: 'none'}
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									</div>
								</div>
							</button>
						{:else}
							<div class="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">
								No properties defined yet
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Property Editor / JSON Preview -->
			<div class="flex-1 bg-white dark:bg-gray-800 overflow-y-auto">
				{#if showJsonPreview}
					<!-- JSON Preview -->
					<div class="p-4">
						<div class="flex items-center justify-between mb-3">
							<h4 class="text-sm font-semibold text-gray-900 dark:text-white">
								JSON Schema Preview
							</h4>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									navigator.clipboard.writeText(schemaJson);
									alert('Schema copied to clipboard');
								}}
							>
								<svg
									class="w-4 h-4 mr-1"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
								Copy
							</Button>
						</div>
						<pre
							class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono overflow-x-auto"><code
								>{schemaJson}</code
							></pre>
					</div>
				{:else if editingProperty && selectedProperty}
					<!-- Property Editor -->
					<div class="p-4">
						<div class="flex items-center justify-between mb-4">
							<h4 class="text-sm font-semibold text-gray-900 dark:text-white">
								Edit Property: <code class="text-blue-600 dark:text-blue-400"
									>{selectedProperty}</code
								>
							</h4>
							<Button variant="ghost" size="sm" onclick={handleCancelEdit}>
								<svg
									class="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</Button>
						</div>

						<div class="space-y-4">
							<FormField label="Type" labelFor="prop-type">
								<Select
									id="prop-type"
									bind:value={editingProperty.type}
									disabled={loading}
								>
									{#each typeOptions as opt}
										<option value={opt.value}
											>{opt.label} - {opt.description}</option
										>
									{/each}
								</Select>
							</FormField>

							<FormField label="Description" labelFor="prop-description">
								<TextInput
									id="prop-description"
									bind:value={editingProperty.description}
									placeholder="Describe this property"
									disabled={loading}
								/>
							</FormField>

							{#if editingProperty.type === 'string'}
								<div class="grid grid-cols-2 gap-4">
									<FormField label="Min Length" labelFor="prop-minlength">
										<TextInput
											id="prop-minlength"
											type="number"
											bind:value={editingProperty.minLength}
											placeholder="Optional"
											disabled={loading}
										/>
									</FormField>
									<FormField label="Max Length" labelFor="prop-maxlength">
										<TextInput
											id="prop-maxlength"
											type="number"
											bind:value={editingProperty.maxLength}
											placeholder="Optional"
											disabled={loading}
										/>
									</FormField>
								</div>
								<FormField label="Pattern (Regex)" labelFor="prop-pattern">
									<TextInput
										id="prop-pattern"
										bind:value={editingProperty.pattern}
										placeholder="e.g., ^[A-Z].*"
										disabled={loading}
									/>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										Examples: <code>^[A-Z].*</code> (starts with uppercase),{' '}
										<code>^\d{3}-\d{2}-\d{4}$</code> (SSN format)
									</p>
								</FormField>

								<!-- Enum Values Editor -->
								{#if enumValues.length > 0 || true}
									<FormField
										label="Enum Values (Optional)"
										labelFor="prop-enum"
										hint="Restrict to specific allowed values"
									>
										<div class="space-y-2">
											{#if enumValues.length > 0}
												<div class="flex flex-wrap gap-2 mb-2">
													{#each enumValues as value}
														<span
															class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-sm"
														>
															{value}
															<button
																type="button"
																onclick={() =>
																	handleRemoveEnumValue(value)}
																class="hover:text-red-600 dark:hover:text-red-400"
																title="Remove value"
																aria-label="Remove {value}"
															>
																<svg
																	class="w-3 h-3"
																	fill="none"
																	stroke="currentColor"
																	viewBox="0 0 24 24"
																>
																	<path
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		stroke-width="2"
																		d="M6 18L18 6M6 6l12 12"
																	/>
																</svg>
															</button>
														</span>
													{/each}
												</div>
											{/if}
											<div class="flex gap-2">
												<TextInput
													id="prop-enum"
													bind:value={newEnumValue}
													placeholder="Add enum value"
													disabled={loading}
													onkeydown={handleEnumKeydown}
												/>
												<Button
													variant="secondary"
													size="sm"
													onclick={handleAddEnumValue}
													disabled={loading || !newEnumValue.trim()}
												>
													Add
												</Button>
											</div>
										</div>
									</FormField>
								{/if}
							{:else if editingProperty.type === 'number' || editingProperty.type === 'integer'}
								<div class="grid grid-cols-2 gap-4">
									<FormField label="Minimum" labelFor="prop-min">
										<TextInput
											id="prop-min"
											type="number"
											bind:value={editingProperty.minimum}
											placeholder="Optional"
											disabled={loading}
										/>
									</FormField>
									<FormField label="Maximum" labelFor="prop-max">
										<TextInput
											id="prop-max"
											type="number"
											bind:value={editingProperty.maximum}
											placeholder="Optional"
											disabled={loading}
										/>
									</FormField>
								</div>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Example: Set min=1, max=5 for a priority field
								</p>
							{:else if editingProperty.type === 'array'}
								<FormField label="Item Type" labelFor="prop-items-type">
									<Select
										id="prop-items-type"
										value={editingProperty.items?.type || 'string'}
										onchange={(e) => {
											if (editingProperty && editingProperty.items) {
												editingProperty.items.type =
													e.value as JsonSchemaType;
											}
										}}
										disabled={loading}
									>
										<option value="string">String</option>
										<option value="number">Number</option>
										<option value="integer">Integer</option>
										<option value="boolean">Boolean</option>
										<option value="object">Object</option>
									</Select>
								</FormField>
							{/if}

							<div
								class="pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3"
							>
								<Button
									variant="primary"
									size="md"
									fullWidth
									onclick={handleSaveProperty}
									disabled={loading}
								>
									Save Changes
								</Button>
								<Button
									variant="danger"
									size="md"
									fullWidth
									onclick={handleDeleteProperty}
									disabled={loading}
								>
									Delete Property
								</Button>
							</div>
						</div>
					</div>
				{:else}
					<!-- Help Text -->
					<div
						class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
					>
						<div class="text-center">
							<svg
								class="w-16 h-16 mx-auto mb-4 opacity-50"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							<p class="text-sm">Select a property to edit</p>
							<p class="text-xs mt-2">Or click "Add" to create a new property</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</CardBody>
</Card>
