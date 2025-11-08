<!-- apps/web/src/lib/components/ontology/templates/TemplateTypeKeyBuilder.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type {
		CatalogCascade,
		CatalogCascadeTemplate,
		BuilderSelection
	} from '$lib/types/template-builder';

	interface Props {
		cascade: CatalogCascade | null;
		selection: BuilderSelection | null;
		loading?: boolean;
		onSelectionChange?: (selection: BuilderSelection) => void;
		onTemplateSelect?: (template: CatalogCascadeTemplate | null) => void;
		onRequestAnalyzer?: () => void;
		onCreateDomain?: () => void;
		onCreateDeliverable?: () => void;
		scope?: string | null;
		realm?: string | null;
	}

	let {
		cascade = null,
		selection = null,
		loading = false,
		onSelectionChange,
		onTemplateSelect,
		onRequestAnalyzer,
		onCreateDomain,
		onCreateDeliverable,
		scope = null,
		realm = null
	}: Props = $props();

	const scopeLabel = (value: string | null) => {
		if (!value) return '';
		return value.charAt(0).toUpperCase() + value.slice(1);
	};

	const formatLabel = (value?: string | null) => {
		if (!value) return '';
		return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	};

	const selectedDomain = $derived(selection?.domain?.slug ?? null);
	const selectedDeliverable = $derived(selection?.deliverable?.slug ?? null);
	const selectedVariant = $derived(selection?.variant?.slug ?? null);

	const domainExists = $derived.by(() => {
		if (!selectedDomain || !cascade) return false;
		return cascade.domains.some((domain) => domain.slug === selectedDomain);
	});

	const deliverableExists = $derived.by(() => {
		if (!selectedDeliverable || !selectedDomain || !cascade) return false;
		return cascade.deliverables.some(
			(deliverable) =>
				deliverable.slug === selectedDeliverable &&
				deliverable.domains.includes(selectedDomain)
		);
	});

	const variantExists = $derived.by(() => {
		if (!selectedVariant || !selectedDeliverable || !selectedDomain || !cascade) return false;
		const parentKey = `${selectedDomain}.${selectedDeliverable}`;
		return cascade.variants.some(
			(variant) => variant.slug === selectedVariant && variant.parent === parentKey
		);
	});

	const deliverableOptions = $derived.by(() => {
		if (!cascade || !selectedDomain) return [];
		return cascade.deliverables.filter((deliverable) =>
			deliverable.domains.includes(selectedDomain)
		);
	});

	const variantOptions = $derived.by(() => {
		if (!cascade || !selectedDomain || !selectedDeliverable) return [];
		const parentKey = `${selectedDomain}.${selectedDeliverable}`;
		return cascade.variants.filter((variant) => variant.parent === parentKey);
	});

	const matchingTemplates = $derived.by(() => {
		if (!cascade || !selectedDomain || !selectedDeliverable) return [];
		return cascade.templates.filter((template) => {
			if (template.domain !== selectedDomain) return false;
			if (template.deliverable !== selectedDeliverable) return false;
			if (selectedVariant && template.variant !== selectedVariant) return false;
			if (!selectedVariant && template.variant) return false;
			return true;
		});
	});

	const suggestedTypeKey = $derived.by(() => {
		if (!selectedDomain || !selectedDeliverable) return '';
		return [selectedDomain, selectedDeliverable, selectedVariant].filter(Boolean).join('.');
	});

	function updateSelection(partial: Partial<BuilderSelection>) {
		if (!selection || !scope || !realm) {
			// initialize base selection
			selection = {
				scope: scope ?? '',
				realm: realm ?? '',
				...partial
			};
		} else {
			selection = {
				...selection,
				...partial
			};
		}
		onSelectionChange?.(selection);
	}

	function selectDomain(slug: string) {
		updateSelection({
			domain: { slug, label: slug.replace(/_/g, ' ') },
			deliverable: undefined,
			variant: undefined,
			parent_template_id: undefined,
			parent_type_key: undefined
		});
		onTemplateSelect?.(null);
	}

	function selectDeliverable(slug: string) {
		if (!selection?.domain) return;
		updateSelection({
			deliverable: { slug, label: slug.replace(/_/g, ' ') },
			variant: undefined,
			parent_template_id: undefined,
			parent_type_key: undefined
		});
		onTemplateSelect?.(null);
	}

	function selectVariant(slug: string | null) {
		if (!selection?.domain || !selection?.deliverable) return;
		updateSelection({
			variant: slug ? { slug, label: slug.replace(/_/g, ' ') } : undefined,
			parent_template_id: undefined,
			parent_type_key: undefined
		});
		onTemplateSelect?.(null);
	}

	function chooseTemplate(template: CatalogCascadeTemplate) {
		updateSelection({
			parent_template_id: template.id,
			parent_type_key: template.type_key,
			variant: template.variant
				? { slug: template.variant, label: template.variant.replace(/_/g, ' ') }
				: undefined
		});
		onTemplateSelect?.(template);
	}
</script>

<section
	class="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-6"
>
	<header class="flex flex-col gap-1">
		<p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
			Scope · Realm
		</p>
		<h3 class="text-xl font-semibold text-gray-900 dark:text-gray-50">
			{scopeLabel(scope)} · {realm?.replace(/_/g, ' ') ?? 'Select realm'}
		</h3>
		<p class="text-sm text-gray-600 dark:text-gray-400">
			Pick a domain, deliverable, and optional variant to build the type key.
		</p>
	</header>

	{#if !cascade}
		<div
			class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
		>
			Select a realm to load domains and deliverables.
		</div>
	{:else if loading}
		<div class="space-y-4">
			{#each Array(3) as _, idx}
				<div
					class="h-16 rounded-xl bg-gray-100 dark:bg-gray-800/50 animate-pulse"
					aria-label={'Loading builder section ' + idx}
				></div>
			{/each}
		</div>
	{:else}
		<div class="space-y-6">
			<div>
				<div class="flex items-center justify-between mb-3 gap-2">
					<div>
						<h4
							class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase"
						>
							Domain
						</h4>
						<span class="text-xs text-gray-500 dark:text-gray-400">
							{cascade.domains.length} options
						</span>
					</div>
					{#if onCreateDomain}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={onCreateDomain}
							disabled={!realm}
						>
							New Domain
						</Button>
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					{#each cascade.domains as domain}
						<Button
							type="button"
							variant={domain.slug === selectedDomain ? 'primary' : 'secondary'}
							size="sm"
							onclick={() => selectDomain(domain.slug)}
						>
							{formatLabel(domain.slug)} ({domain.template_count})
						</Button>
					{/each}
					{#if selectedDomain && selection?.domain?.isNew && !domainExists}
						<Button type="button" variant="primary" size="sm" disabled>
							{formatLabel(selectedDomain)} (New)
						</Button>
					{/if}
				</div>
			</div>

			<div>
				<div class="flex items-center justify-between mb-3 gap-2">
					<div>
						<h4
							class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase"
						>
							Deliverable
						</h4>
						{#if !selectedDomain}
							<span class="text-xs text-gray-500">Select a domain first</span>
						{/if}
					</div>
					{#if onCreateDeliverable}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={onCreateDeliverable}
							disabled={!selectedDomain}
						>
							New Deliverable
						</Button>
					{/if}
				</div>
				{#if !selectedDomain}
					<div
						class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
					>
						Choose a domain to see deliverables.
					</div>
				{:else if deliverableOptions.length === 0}
					<div
						class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
					>
						No deliverables for this domain yet. Try the analyzer to propose one.
					</div>
				{:else}
					<div class="flex flex-wrap gap-2">
						{#each deliverableOptions as deliverable}
							<Button
								type="button"
								variant={deliverable.slug === selectedDeliverable
									? 'primary'
									: 'secondary'}
								size="sm"
								onclick={() => selectDeliverable(deliverable.slug)}
							>
								{formatLabel(deliverable.slug)}
							</Button>
						{/each}
					</div>
				{/if}
				{#if selectedDeliverable && selection?.deliverable?.isNew && !deliverableExists}
					<div class="flex flex-wrap gap-2 mt-3">
						<Button type="button" variant="primary" size="sm" disabled>
							{formatLabel(selectedDeliverable)} (New)
						</Button>
					</div>
				{/if}
			</div>

			<div>
				<div class="flex items-center justify-between mb-3">
					<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase">
						Variant (Optional)
					</h4>
					{#if !selectedDeliverable}
						<span class="text-xs text-gray-500">Select a deliverable first</span>
					{/if}
				</div>
				{#if !selectedDeliverable}
					<div
						class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
					>
						Pick a deliverable to see variants.
					</div>
				{:else if variantOptions.length === 0}
					<div
						class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
					>
						No variants yet. Use analyzer to suggest a new specialization.
					</div>
				{:else}
					<div class="flex flex-wrap gap-2 items-center">
						<Button
							type="button"
							variant={!selectedVariant ? 'primary' : 'secondary'}
							size="sm"
							onclick={() => selectVariant(null)}
						>
							Base Variant
						</Button>
						{#each variantOptions as variant}
							<Button
								type="button"
								variant={variant.slug === selectedVariant ? 'primary' : 'secondary'}
								size="sm"
								onclick={() => selectVariant(variant.slug)}
							>
								{formatLabel(variant.slug)}
							</Button>
						{/each}
					</div>
				{/if}
				{#if selectedVariant && selection?.variant?.isNew && !variantExists}
					<div class="flex flex-wrap gap-2 mt-3">
						<Button type="button" variant="primary" size="sm" disabled>
							{formatLabel(selectedVariant)} (New)
						</Button>
					</div>
				{/if}
			</div>

			<div class="border-t border-gray-200 dark:border-gray-800 pt-4">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
							Computed type key
						</p>
						<p class="text-xs text-gray-500 dark:text-gray-400">
							Format: domain.deliverable.variant
						</p>
					</div>
					<Badge variant={suggestedTypeKey ? 'default' : 'secondary'}>
						{suggestedTypeKey || 'Select options to generate'}
					</Badge>
				</div>
			</div>

			{#if selectedDomain && selectedDeliverable}
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h4
							class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase"
						>
							Existing Templates
						</h4>
						<Button
							variant="ghost"
							size="sm"
							onclick={onCreateDeliverable ?? onRequestAnalyzer}
							disabled={!onCreateDeliverable && !onRequestAnalyzer}
						>
							Need a new template?
						</Button>
					</div>

					{#if matchingTemplates.length === 0}
						<div
							class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400"
						>
							No existing templates match this combination. Use the analyzer to
							propose one.
						</div>
					{:else}
						<div class="space-y-2">
							{#each matchingTemplates as template}
								<button
									type="button"
									class={`w-full rounded-xl border p-3 text-left hover:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${
										template.type_key === selection?.parent_type_key
											? 'border-blue-500 bg-blue-50 dark:border-blue-400/80 dark:bg-blue-500/10'
											: 'border-gray-200 dark:border-gray-700'
									}`}
									onclick={() => chooseTemplate(template)}
								>
									<div class="flex items-center justify-between">
										<div>
											<p
												class="text-sm font-semibold text-gray-900 dark:text-gray-50"
											>
												{template.name}
											</p>
											<p class="text-xs font-mono text-gray-500 break-words">
												{template.type_key}
											</p>
										</div>
										{#if template.is_abstract}
											<Badge variant="secondary">Abstract</Badge>
										{/if}
									</div>
									{#if template.summary}
										<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
											{template.summary}
										</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</section>
