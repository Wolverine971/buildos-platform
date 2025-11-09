<!-- apps/web/src/lib/components/ontology/templates/MetadataEditor.svelte -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { X } from 'lucide-svelte';
	import type { TemplateMetadata } from '$lib/types/onto';

	interface Props {
		metadata?: TemplateMetadata;
		loading?: boolean;
		scopeLabel?: string | null;
		scopeDescription?: string | null;
		scopeFacetUsage?: string | null;
		scopeTypeKeyPattern?: string | null;
		lockedRealm?: string | null;
	}

	let {
		metadata = {},
		loading = false,
		scopeLabel = null,
		scopeDescription = null,
		scopeFacetUsage = null,
		scopeTypeKeyPattern = null,
		lockedRealm = null
	}: Props = $props();

	// Metadata fields using Svelte 5 runes
	let description = $state(metadata.description || '');
	let realm = $state(metadata.realm || 'realm:unset');
	let keywords = $state<string[]>(metadata.keywords || []);
	let customFields = $state<Array<{ key: string; value: string }>>([]);

	function hydrateCustomFields(source?: Record<string, unknown>) {
		if (!source) {
			customFields = [];
			return;
		}
		customFields = Object.entries(source).map(([key, value]) => ({
			key,
			value: String(value ?? '')
		}));
	}

	$effect(() => {
		hydrateCustomFields((metadata as any)?.custom);
	});

	// Keyword input state
	let keywordInput = $state('');

	// Export function to get current metadata
	export function getMetadata(): TemplateMetadata {
		const result: TemplateMetadata = {
			description: description.trim() || undefined,
			realm: (lockedRealm ?? realm) || undefined,
			keywords: keywords.length > 0 ? keywords : undefined
		};

		// Add custom fields
		const custom: Record<string, string> = {};
		for (const field of customFields) {
			if (field.key.trim()) {
				custom[field.key.trim()] = field.value.trim();
			}
		}
		if (Object.keys(custom).length > 0) {
			result.custom = custom;
		}

		return result;
	}

	export function setMetadata(
		newMetadata: TemplateMetadata & { custom?: Record<string, unknown> } = {}
	) {
		metadata = newMetadata || {};
		description = metadata.description || '';
		realm = lockedRealm ?? metadata.realm ?? 'realm:unset';
		keywords = Array.isArray(metadata.keywords) ? [...metadata.keywords] : [];
		hydrateCustomFields(newMetadata.custom as Record<string, unknown> | undefined);
		keywordInput = '';
	}

	function addKeyword() {
		const keyword = keywordInput.trim().toLowerCase();
		if (keyword && !keywords.includes(keyword)) {
			keywords = [...keywords, keyword];
			keywordInput = '';
		}
	}

	function removeKeyword(index: number) {
		keywords = keywords.filter((_, i) => i !== index);
	}

	function handleKeywordKeypress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addKeyword();
		}
	}

	function addCustomField() {
		customFields = [...customFields, { key: '', value: '' }];
	}

	function removeCustomField(index: number) {
		customFields = customFields.filter((_, i) => i !== index);
	}

	$effect(() => {
		if (lockedRealm && lockedRealm !== realm) {
			realm = lockedRealm;
		}
	});
</script>

<Card variant="elevated">
	<CardHeader variant="default">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">Metadata</h3>
		<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
			Additional information about this template
		</p>
	</CardHeader>

	<CardBody padding="lg" class="space-y-6">
		{#if scopeLabel || lockedRealm}
			<div class="rounded-2xl border border-blue-100 dark:border-blue-500/30 bg-blue-50/70 dark:bg-blue-500/10 p-4 space-y-2 text-sm text-blue-900 dark:text-blue-50">
				<p class="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-200 font-semibold">
					{scopeLabel ?? 'Template'} Context
				</p>
				{#if scopeDescription}
					<p>{scopeDescription}</p>
				{/if}
				{#if scopeTypeKeyPattern}
					<p class="text-xs font-mono text-blue-900/80 dark:text-blue-200">
						Type key: {scopeTypeKeyPattern}
					</p>
				{/if}
				{#if scopeFacetUsage}
					<p class="text-xs text-blue-900/70 dark:text-blue-200">
						Facet focus: {scopeFacetUsage}
					</p>
				{/if}
				{#if lockedRealm}
					<p class="text-xs text-blue-900/70 dark:text-blue-200">
						Realm locked to <strong>{lockedRealm.replace(/_/g, ' ')}</strong>. Adjust earlier in the flow if needed.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Description -->
		<FormField label="Description" labelFor="description">
			<textarea
				id="description"
				bind:value={description}
				placeholder="Describe what this template is for and when to use it..."
				rows="4"
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
				disabled={loading}
			></textarea>
			<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
				Appears in template cards and detail views
			</p>
		</FormField>

		<!-- Keywords -->
		<FormField label="Keywords" labelFor="keywords">
			<div class="space-y-2">
				<div class="flex gap-2">
					<TextInput
						id="keywords"
						bind:value={keywordInput}
						onkeypress={handleKeywordKeypress}
						placeholder="Add keyword and press Enter..."
						class="flex-1"
						disabled={loading}
					/>
					<button
						type="button"
						onclick={addKeyword}
						disabled={loading || !keywordInput.trim()}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Add
					</button>
				</div>

				{#if keywords.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each keywords as keyword, index}
							<span
								class="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm"
							>
								{keyword}
								<button
									type="button"
									onclick={() => removeKeyword(index)}
									disabled={loading}
									class="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5 transition-colors"
									aria-label="Remove keyword"
								>
									<X class="w-3 h-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
			</div>
			<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
				Tags for searching and filtering
			</p>
		</FormField>
		<!-- Custom Fields -->
		<div>
			<div class="flex items-center justify-between mb-3">
				<p class="block text-sm font-medium text-gray-700 dark:text-gray-300">
					Custom Fields
				</p>
				<button
					type="button"
					onclick={addCustomField}
					disabled={loading}
					class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
				>
					+ Add Field
				</button>
			</div>

			{#if customFields.length > 0}
				<div class="space-y-3">
					{#each customFields as field, index}
						<div class="flex gap-2">
							<TextInput
								bind:value={field.key}
								placeholder="Field name"
								class="flex-1"
								disabled={loading}
							/>
							<TextInput
								bind:value={field.value}
								placeholder="Field value"
								class="flex-1"
								disabled={loading}
							/>
							<button
								type="button"
								onclick={() => removeCustomField(index)}
								disabled={loading}
								class="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
								aria-label="Remove custom field"
							>
								<X class="w-5 h-5" />
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">No custom fields added</p>
			{/if}
			<p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
				Add any additional metadata specific to this template
			</p>
		</div>
	</CardBody>
</Card>
