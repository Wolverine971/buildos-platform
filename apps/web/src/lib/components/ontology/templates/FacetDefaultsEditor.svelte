<!-- apps/web/src/lib/components/ontology/templates/FacetDefaultsEditor.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	interface FacetValue {
		facet_key: string;
		value: string;
		label: string;
		description: string | null;
		color: string | null;
	}

	interface Props {
		facetDefaults?: Record<string, string>;
		loading?: boolean;
	}

	let { facetDefaults = {}, loading = false }: Props = $props();

	// Facet selections using Svelte 5 runes
	let selectedContext = $state(facetDefaults.context || '');
	let selectedScale = $state(facetDefaults.scale || '');
	let selectedStage = $state(facetDefaults.stage || '');

	// Facet options loaded from database
	let contextOptions = $state<FacetValue[]>([]);
	let scaleOptions = $state<FacetValue[]>([]);
	let stageOptions = $state<FacetValue[]>([]);
	let loadingFacets = $state(true);
	let facetError = $state<string | null>(null);

	// Export function to get current facet defaults
	export function getFacetDefaults(): Record<string, string> {
		const defaults: Record<string, string> = {};

		if (selectedContext) defaults.context = selectedContext;
		if (selectedScale) defaults.scale = selectedScale;
		if (selectedStage) defaults.stage = selectedStage;

		return defaults;
	}

	export function setFacetDefaults(newDefaults?: Record<string, string>) {
		const defaults = newDefaults ?? {};
		selectedContext = defaults.context || '';
		selectedScale = defaults.scale || '';
		selectedStage = defaults.stage || '';
	}

	onMount(async () => {
		await loadFacetOptions();
	});

	async function loadFacetOptions() {
		try {
			loadingFacets = true;
			facetError = null;

			const response = await fetch('/api/onto/facets/values');

			if (!response.ok) {
				throw new Error('Failed to load facet options');
			}

			const data = await response.json();

			// Handle ApiResponse format
			const facetValues = data.success && data.data ? data.data : data;

			// Group by facet_key
			const grouped: Record<string, FacetValue[]> = {};
			for (const facet of facetValues) {
				if (!grouped[facet.facet_key]) {
					grouped[facet.facet_key] = [];
				}
				grouped[facet.facet_key].push(facet);
			}

			contextOptions = grouped.context || [];
			scaleOptions = grouped.scale || [];
			stageOptions = grouped.stage || [];
		} catch (err) {
			console.error('[Facet Defaults Editor] Error loading facets:', err);
			facetError = 'Failed to load facet options. Using defaults.';

			// Fallback to hardcoded options
			contextOptions = [
				{
					facet_key: 'context',
					value: 'personal',
					label: 'Personal',
					description: null,
					color: null
				},
				{
					facet_key: 'context',
					value: 'professional',
					label: 'Professional',
					description: null,
					color: null
				}
			];
			scaleOptions = [
				{
					facet_key: 'scale',
					value: 'micro',
					label: 'Micro',
					description: null,
					color: null
				},
				{
					facet_key: 'scale',
					value: 'small',
					label: 'Small',
					description: null,
					color: null
				},
				{
					facet_key: 'scale',
					value: 'medium',
					label: 'Medium',
					description: null,
					color: null
				},
				{
					facet_key: 'scale',
					value: 'large',
					label: 'Large',
					description: null,
					color: null
				},
				{ facet_key: 'scale', value: 'epic', label: 'Epic', description: null, color: null }
			];
			stageOptions = [
				{
					facet_key: 'stage',
					value: 'ideation',
					label: 'Ideation',
					description: null,
					color: null
				},
				{
					facet_key: 'stage',
					value: 'planning',
					label: 'Planning',
					description: null,
					color: null
				},
				{
					facet_key: 'stage',
					value: 'execution',
					label: 'Execution',
					description: null,
					color: null
				},
				{
					facet_key: 'stage',
					value: 'review',
					label: 'Review',
					description: null,
					color: null
				}
			];
		} finally {
			loadingFacets = false;
		}
	}

	function getFacetBadgeColor(facetKey: string, value: string): string {
		// Find the facet option to get its color
		let options: FacetValue[] = [];
		if (facetKey === 'context') options = contextOptions;
		else if (facetKey === 'scale') options = scaleOptions;
		else if (facetKey === 'stage') options = stageOptions;

		const option = options.find((opt) => opt.value === value);

		if (option?.color) {
			return option.color;
		}

		// Fallback colors by facet type
		const colorMap: Record<string, string> = {
			context: '#3b82f6', // blue
			scale: '#8b5cf6', // purple
			stage: '#10b981' // green
		};

		return colorMap[facetKey] || '#6b7280'; // gray fallback
	}

	function getFacetLabel(facetKey: string, value: string): string {
		let options: FacetValue[] = [];
		if (facetKey === 'context') options = contextOptions;
		else if (facetKey === 'scale') options = scaleOptions;
		else if (facetKey === 'stage') options = stageOptions;

		const option = options.find((opt) => opt.value === value);
		return option?.label || value;
	}
</script>

<Card variant="elevated">
	<CardHeader variant="default">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Facet Defaults</h3>
		<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
			Set default facet values for this template
		</p>
	</CardHeader>

	<CardBody padding="lg">
		{#if loadingFacets}
			<div class="flex items-center justify-center py-8">
				<div
					class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"
				></div>
				<span class="ml-3 text-sm text-gray-600 dark:text-gray-400"
					>Loading facet options...</span
				>
			</div>
		{:else}
			<div class="space-y-6">
				{#if facetError}
					<div
						class="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
					>
						<p class="text-sm text-amber-800 dark:text-amber-300">{facetError}</p>
					</div>
				{/if}

				<!-- Context -->
				<FormField label="Context" labelFor="context">
					<Select
						id="context"
						bind:value={selectedContext}
						class="w-full"
						disabled={loading}
					>
						<option value="">Not specified</option>
						{#each contextOptions as option}
							<option value={option.value}>
								{option.label}
								{#if option.description}
									- {option.description}
								{/if}
							</option>
						{/each}
					</Select>
					<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
						The typical context or setting for this template
					</p>
				</FormField>

				<!-- Scale -->
				<FormField label="Scale" labelFor="scale">
					<Select id="scale" bind:value={selectedScale} class="w-full" disabled={loading}>
						<option value="">Not specified</option>
						{#each scaleOptions as option}
							<option value={option.value}>
								{option.label}
								{#if option.description}
									- {option.description}
								{/if}
							</option>
						{/each}
					</Select>
					<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
						The typical size or time investment for this template
					</p>
				</FormField>

				<!-- Stage -->
				<FormField label="Stage" labelFor="stage">
					<Select id="stage" bind:value={selectedStage} class="w-full" disabled={loading}>
						<option value="">Not specified</option>
						{#each stageOptions as option}
							<option value={option.value}>
								{option.label}
								{#if option.description}
									- {option.description}
								{/if}
							</option>
						{/each}
					</Select>
					<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
						The typical lifecycle stage for this template
					</p>
				</FormField>

				<!-- Preview -->
				{#if selectedContext || selectedScale || selectedStage}
					<div class="pt-4 border-t border-gray-200 dark:border-gray-700">
						<p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Selected Facets Preview
						</p>
						<div class="flex flex-wrap gap-2">
							{#if selectedContext}
								<span
									class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
									style="background-color: {getFacetBadgeColor(
										'context',
										selectedContext
									)}20; color: {getFacetBadgeColor('context', selectedContext)};"
								>
									Context: {getFacetLabel('context', selectedContext)}
								</span>
							{/if}
							{#if selectedScale}
								<span
									class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
									style="background-color: {getFacetBadgeColor(
										'scale',
										selectedScale
									)}20; color: {getFacetBadgeColor('scale', selectedScale)};"
								>
									Scale: {getFacetLabel('scale', selectedScale)}
								</span>
							{/if}
							{#if selectedStage}
								<span
									class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
									style="background-color: {getFacetBadgeColor(
										'stage',
										selectedStage
									)}20; color: {getFacetBadgeColor('stage', selectedStage)};"
								>
									Stage: {getFacetLabel('stage', selectedStage)}
								</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</CardBody>
</Card>
