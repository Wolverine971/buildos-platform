<!-- apps/web/src/lib/components/ontology/templates/TemplateAnalyzerModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { getTemplateScopeDefinition } from '$lib/constants/template-scope';
	import type {
		TemplateAnalyzerResponse,
		TemplateAnalyzerSuggestion,
		TemplateBrainDumpPlan
	} from '$lib/types/template-builder';

	type AnalyzerLevel = 'realm' | 'domain' | 'deliverable';

	interface Props {
		isOpen?: boolean;
		scope?: string | null;
		realm?: string | null;
		domain?: string | null;
		targetLevel?: AnalyzerLevel | null;
		onClose?: () => void;
	}

	const dispatch = createEventDispatcher<{
		suggestionSelected: TemplateAnalyzerSuggestion & {
			scope: string | null;
			realm: string | null;
			targetLevel?: AnalyzerLevel | null;
			structuredPlan?: TemplateBrainDumpPlan | null;
		};
	}>();

	let {
		isOpen = $bindable(false),
		scope = null,
		realm = null,
		domain = null,
		targetLevel = null,
		onClose
	}: Props = $props();

	let brainDump = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let responseData = $state<TemplateAnalyzerResponse | null>(null);
	let rejectedFlag = $state(false);
	let priorSuggestionKeys = $state<string[]>([]);
	const primarySuggestion = $derived(responseData?.primary ?? null);
	const structuredPlan = $derived(responseData?.structured_plan ?? null);
	const scopeDefinition = $derived(scope ? getTemplateScopeDefinition(scope) : null);
	const scopedLabel = $derived(scopeDefinition?.label ?? 'Template');
	const scopedLabelLower = $derived(scopedLabel.toLowerCase());
	const scopeInstruction = $derived(
		scopeDefinition
			? `Describe this ${scopedLabelLower} template. ${scopeDefinition.llmCue}`
			: 'Describe the template idea. Include who it serves, desired output, scale, and constraints.'
	);
	const scopePlaceholder = $derived(
		scopeDefinition?.exampleBrainDump ??
			'Example: Marketing campaign plan for our AI writing tool targeting startup founders...'
	);
	const voiceButtonCopy = $derived(
		scopeDefinition ? `Record ${scopedLabelLower} braindump` : 'Record voice braindump'
	);
	const voiceIdleHint = $derived(
		scopeDefinition
			? `Use the mic to dictate your ${scopedLabelLower} idea.`
			: 'Use the mic to dictate your template idea.'
	);

	const unknownScopeMessage =
		'Select a scope and realm first before using the analyzer. They help constrain suggestions.';

	const scopeRealmLabel = $derived.by(() => {
		const scopeLabel = scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : 'Scope';
		const realmLabel = realm ? realm.replace(/_/g, ' ') : 'Realm';
		return `${scopeLabel} · ${realmLabel}`;
	});

	const targetLevelLabel = $derived.by(() => {
		switch (targetLevel) {
			case 'realm':
				return 'New Realm / Sector';
			case 'domain':
				return 'New Domain';
			case 'deliverable':
				return 'New Deliverable';
			default:
				return 'Template';
		}
	});

	const readableScope = $derived(scope ? formatLabel(scope) : 'Select a scope');
	const readableRealm = $derived(
		targetLevel === 'realm' ? 'Will be created' : realm ? formatLabel(realm) : 'Select a realm'
	);
	const canAnalyze = $derived(Boolean(scope && (realm || targetLevel === 'realm')));

	function resetModalState(full: boolean = false) {
		if (full) {
			brainDump = '';
			priorSuggestionKeys = [];
		}
		loading = false;
		error = null;
		responseData = null;
		rejectedFlag = false;
	}

	$effect(() => {
		if (!isOpen) {
			resetModalState(false);
		}
	});

	function collectSuggestionKeys(response: TemplateAnalyzerResponse | null) {
		if (!response) return;
		const keys = [
			response.primary?.type_key,
			...(response.alternatives ?? []).map((s) => s.type_key),
			...(response.new_template_options ?? []).map((s) => s.type_key)
		]
			.filter((key): key is string => Boolean(key))
			.map((key) => key);
		const uniqueKeys = new Set([...priorSuggestionKeys, ...keys]);
		priorSuggestionKeys = Array.from(uniqueKeys);
	}

	async function handleSubmit(retry = false) {
		if (!scope) {
			error = 'Select a scope first.';
			return;
		}

		if (!realm && targetLevel !== 'realm') {
			error = unknownScopeMessage;
			return;
		}

		if (!brainDump.trim()) {
			error = `Tell us about the ${scopedLabelLower} idea first.`;
			return;
		}

		loading = true;
		error = null;

		try {
			const payload: Record<string, unknown> = {
				scope,
				realm,
				brain_dump: brainDump.trim(),
				rejected_suggestions: retry || rejectedFlag,
				prior_suggestions: priorSuggestionKeys,
				target_level: targetLevel ?? undefined
			};

			if (targetLevel === 'deliverable' && domain) {
				payload.domain = domain;
			}

			const response = await fetch('/api/onto/templates/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = await response.json();

			if (!response.ok) {
				error = result?.error || 'Failed to get suggestions';
				return;
			}

			responseData = result.data as TemplateAnalyzerResponse;
			collectSuggestionKeys(responseData);
			rejectedFlag = false;
		} catch (err) {
			console.error('[Template Analyzer Modal] submit failed', err);
			error = err instanceof Error ? err.message : 'Unable to fetch suggestions';
		} finally {
			loading = false;
		}
	}

	async function handleSuggestionSelect(suggestion: TemplateAnalyzerSuggestion) {
		dispatch('suggestionSelected', {
			...suggestion,
			scope,
			realm,
			targetLevel,
			structuredPlan: responseData?.structured_plan ?? null
		});
		resetModalState(true);
		onClose?.();
		isOpen = false;
	}

	function requestDifferentSuggestions() {
		rejectedFlag = true;
		handleSubmit(true);
	}

	function handleClose() {
		resetModalState(false);
		onClose?.();
		isOpen = false;
	}

	// Badge styling by match level (static)
	const badgeClassByMatchLevel: Record<string, string> = {
		variant: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
		deliverable: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
		domain: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
		new: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
	};

	// Utility functions for formatting display values
	function formatLabel(part?: string | null): string {
		if (!part) return '';
		return part.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function getMatchLabel(level: TemplateAnalyzerSuggestion['match_level']): string {
		const labelMap: Record<string, string> = {
			variant: 'Variant Match',
			deliverable: 'Deliverable Match',
			domain: 'Domain Match'
		};
		return labelMap[level] ?? 'Net New';
	}

	function formatFacetValues(values?: string[]): string {
		if (!values?.length) return '—';
		return values.join(', ');
	}

	function formatEntityCategory(category?: string): string {
		const categoryMap: Record<string, string> = {
			project_derived: 'Project-Derived',
			reference: 'Reference/System'
		};
		return category ? (categoryMap[category] ?? 'Autonomous') : 'Autonomous';
	}
</script>

<Modal
	bind:isOpen
	onClose={handleClose}
	title="Template Analyzer"
	size="lg"
	customClasses="sm:max-h-[85vh]"
>
	{#snippet children()}
		<div class="px-4 py-3 sm:px-6 sm:py-4 space-y-4 text-sm">
			<section
				class="rounded border border-gray-200 dark:border-gray-700 bg-surface-clarity/80 dark:bg-surface-panel/60 p-2 sm:p-3 space-y-2"
			>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p
							class="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400"
						>
							Context
						</p>
						<p class="text-base font-semibold text-slate-900 dark:text-white">
							{scopeRealmLabel}
						</p>
					</div>
					<span
						class="inline-flex items-center rounded border border-gray-200 dark:border-gray-700 bg-surface-clarity/80 dark:bg-surface-elevated/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
					>
						{targetLevel ? targetLevelLabel : 'Template Suggestion'}
					</span>
				</div>
				<div class="flex flex-wrap gap-2 text-xs font-semibold">
					<span
						class={`inline-flex items-center gap-1 rounded border px-3 py-1 ${
							scope
								? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200'
								: 'border-gray-200 text-slate-600 dark:border-gray-700 dark:text-slate-400'
						}`}
					>
						Scope: {readableScope}
					</span>
					{#if targetLevel !== 'realm'}
						<span
							class={`inline-flex items-center gap-1 rounded border px-3 py-1 ${
								realm
									? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200'
									: 'border-gray-200 text-slate-600 dark:border-gray-700 dark:text-slate-400'
							}`}
						>
							Realm: {readableRealm}
						</span>
					{/if}
					{#if domain}
						<span
							class="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 px-3 py-1 text-slate-700 dark:text-slate-200"
						>
							Domain: {formatLabel(domain)}
						</span>
					{/if}
					<span
						class="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 px-3 py-1 text-slate-700 dark:text-slate-200"
					>
						Target: {targetLevelLabel}
					</span>
				</div>
				{#if scopeDefinition}
					<div
						class="rounded border border-dashed border-gray-200 dark:border-gray-700 bg-surface-elevated/80 dark:bg-surface-panel/60 p-4 space-y-2"
					>
						<p
							class="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400"
						>
							{scopeDefinition.label} Pattern
						</p>
						<p class="font-mono text-sm text-slate-900 dark:text-white">
							{scopeDefinition.typeKeyPattern}
						</p>
						{#if scopeDefinition.facetUsage}
							<p class="text-xs text-slate-600 dark:text-slate-400">
								Facet focus: {scopeDefinition.facetUsage}
							</p>
						{/if}
						<p class="text-xs text-slate-700 dark:text-slate-300">
							{scopeDefinition.llmCue}
						</p>
					</div>
				{/if}
			</section>

			{#if !responseData}
				<section
					class="rounded border border-gray-200 dark:border-gray-700 bg-surface-elevated dark:bg-surface-panel p-4 sm:p-5 space-y-4 dither-soft"
				>
					<p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
						{scopeInstruction}
					</p>
					<TextareaWithVoice
						rows={6}
						bind:value={brainDump}
						placeholder={scopePlaceholder}
						disabled={loading}
						voiceBlocked={loading}
						voiceBlockedLabel="Analyzing request…"
						idleHint={voiceIdleHint}
						voiceButtonLabel={voiceButtonCopy}
						textareaClass="min-h-[168px]"
						helperText={undefined}
						errorMessage={undefined}
					/>

					{#if error}
						<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
					{/if}
					{#if !canAnalyze}
						<p class="text-xs text-amber-600 dark:text-amber-400">
							{unknownScopeMessage}
						</p>
					{/if}
				</section>
			{:else}
				<section class="space-y-5">
					{#if structuredPlan}
						<div
							class="rounded border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/10 p-5 space-y-3"
						>
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p
										class="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200"
									>
										Structured Plan (per taxonomy spec)
									</p>
									<p
										class="text-lg font-semibold text-emerald-900 dark:text-emerald-50"
									>
										{structuredPlan.type_key}
									</p>
									<p class="text-xs text-emerald-900/80 dark:text-emerald-100">
										{formatEntityCategory(structuredPlan.entity_category)} · Scope{' '}
										{formatLabel(structuredPlan.scope)} · Realm{' '}
										{structuredPlan.realm
											? formatLabel(structuredPlan.realm)
											: 'Unset'}
									</p>
								</div>
								{#if structuredPlan.type_key_override_reason}
									<Badge variant="warning">Override rationale captured</Badge>
								{/if}
							</div>
							{#if structuredPlan.type_key_rationale}
								<p class="text-sm text-emerald-900/80 dark:text-emerald-50">
									{structuredPlan.type_key_rationale}
								</p>
							{/if}
							{#if structuredPlan.metadata?.summary || structuredPlan.metadata?.description}
								<div class="text-sm text-emerald-900/80 dark:text-emerald-50">
									<p class="font-semibold">Summary</p>
									<p>
										{structuredPlan.metadata.summary ||
											structuredPlan.metadata.description}
									</p>
								</div>
							{/if}
							<div class="grid gap-3 md:grid-cols-3 text-xs">
								<div>
									<p class="font-semibold text-emerald-800 dark:text-emerald-200">
										Context
									</p>
									<p class="text-emerald-900/80 dark:text-emerald-50">
										{formatFacetValues(structuredPlan.facet_defaults?.context)}
									</p>
								</div>
								<div>
									<p class="font-semibold text-emerald-800 dark:text-emerald-200">
										Scale
									</p>
									<p class="text-emerald-900/80 dark:text-emerald-50">
										{formatFacetValues(structuredPlan.facet_defaults?.scale)}
									</p>
								</div>
								<div>
									<p class="font-semibold text-emerald-800 dark:text-emerald-200">
										Stage
									</p>
									<p class="text-emerald-900/80 dark:text-emerald-50">
										{formatFacetValues(structuredPlan.facet_defaults?.stage)}
									</p>
								</div>
							</div>
							{#if structuredPlan.open_questions?.length}
								<div
									class="text-xs text-emerald-900/80 dark:text-emerald-50 space-y-1"
								>
									<p class="font-semibold uppercase tracking-wide">
										Open Questions
									</p>
									<ul class="list-disc list-inside space-y-1">
										{#each structuredPlan.open_questions as question}
											<li>{question}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}
					{#if responseData.primary}
						{@const primarySuggestion = responseData.primary}
						<div
							class="rounded border border-blue-200 dark:border-blue-500/40 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 dark:from-blue-500/10 dark:via-indigo-500/10 dark:to-blue-500/5 p-5 space-y-4 shadow-subtle"
						>
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="space-y-1">
									<div class="flex items-center gap-2">
										<p
											class="text-sm font-semibold uppercase text-blue-800 dark:text-blue-200"
										>
											Primary Suggestion
										</p>
										{#if rejectedFlag}
											<Badge variant="info">Requested new ideas</Badge>
										{/if}
									</div>
									<p class="text-lg font-semibold text-slate-900 dark:text-white">
										{formatLabel(primarySuggestion.domain)} ·
										{formatLabel(primarySuggestion.deliverable)}
										{#if primarySuggestion.variant}
											· {formatLabel(primarySuggestion.variant)}
										{/if}
									</p>
									<p class="text-xs font-mono text-slate-700 dark:text-slate-300">
										{primarySuggestion.type_key}
									</p>
								</div>
								<span
									class={`px-2 py-1 rounded text-xs font-semibold ${
										badgeClassByMatchLevel[primarySuggestion.match_level] ??
										badgeClassByMatchLevel.new
									}`}
								>
									{getMatchLabel(primarySuggestion.match_level)}
								</span>
							</div>
							<p class="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
								{primarySuggestion.rationale}
							</p>
							<div
								class="grid gap-3 sm:grid-cols-2 text-xs text-slate-700 dark:text-slate-300"
							>
								<span
									>Confidence: {(primarySuggestion.confidence * 100).toFixed(
										0
									)}%</span
								>
								{#if primarySuggestion.parent_type_key}
									<span>Parent: {primarySuggestion.parent_type_key}</span>
								{/if}
							</div>
							<div class="flex flex-wrap gap-2">
								<Button
									variant="primary"
									size="sm"
									onclick={() => handleSuggestionSelect(primarySuggestion)}
								>
									Use this Type Key
								</Button>
								{#if primarySuggestion.match_level === 'new'}
									<Badge variant="warning">Will create new template</Badge>
								{/if}
							</div>
						</div>
					{:else}
						<p class="text-sm text-slate-700 dark:text-slate-300">
							No strong primary suggestion. Consider the options below or submit more
							context.
						</p>
					{/if}

					{#if responseData.alternatives?.length}
						<section class="space-y-2">
							<h3
								class="text-sm font-semibold uppercase text-slate-700 dark:text-slate-300"
							>
								Alternative Matches
							</h3>
							<div
								class="rounded border border-gray-200 dark:border-gray-700 divide-y divide-slate-700/10 dark:divide-slate-500/10 overflow-hidden bg-surface-elevated dark:bg-surface-panel"
							>
								{#each responseData.alternatives as suggestion (suggestion.type_key)}
									<article class="p-4 space-y-2 flex flex-col gap-2">
										<div
											class="flex flex-wrap items-center justify-between gap-2"
										>
											<div>
												<p
													class="text-sm font-semibold text-slate-900 dark:text-white"
												>
													{formatLabel(suggestion.domain)} ·
													{formatLabel(suggestion.deliverable)}
													{#if suggestion.variant}
														· {formatLabel(suggestion.variant)}
													{/if}
												</p>
												<p
													class="text-xs font-mono text-slate-600 dark:text-slate-400"
												>
													{suggestion.type_key}
												</p>
											</div>
											<span
												class={`px-2 py-1 rounded text-xs font-semibold ${
													badgeClassByMatchLevel[
														suggestion.match_level
													] ?? badgeClassByMatchLevel.new
												}`}
											>
												{getMatchLabel(suggestion.match_level)}
											</span>
										</div>
										<p class="text-sm text-slate-700 dark:text-slate-300">
											{suggestion.rationale}
										</p>
										<div
											class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400"
										>
											<span
												>Confidence: {(suggestion.confidence * 100).toFixed(
													0
												)}%</span
											>
											{#if suggestion.parent_type_key}
												<span>Parent: {suggestion.parent_type_key}</span>
											{/if}
										</div>
										<div class="flex flex-wrap gap-2">
											<Button
												variant="secondary"
												size="sm"
												onclick={() => handleSuggestionSelect(suggestion)}
											>
												Use this Type Key
											</Button>
											{#if suggestion.match_level === 'new'}
												<Badge variant="warning"
													>Will create new template</Badge
												>
											{/if}
										</div>
									</article>
								{/each}
							</div>
						</section>
					{/if}

					{#if responseData.new_template_options?.length}
						<section class="space-y-2">
							<h3
								class="text-sm font-semibold uppercase text-slate-700 dark:text-slate-300"
							>
								Net-New Template Ideas
							</h3>
							<div
								class="rounded border border-gray-200 dark:border-gray-700 divide-y divide-slate-700/10 dark:divide-slate-500/10 overflow-hidden bg-surface-elevated dark:bg-surface-panel"
							>
								{#each responseData.new_template_options as suggestion (suggestion.type_key)}
									<article class="p-4 space-y-2 flex flex-col gap-2">
										<div
											class="flex flex-wrap items-center justify-between gap-2"
										>
											<div>
												<p
													class="text-sm font-semibold text-gray-900 dark:text-white"
												>
													{formatLabel(suggestion.domain)} ·
													{formatLabel(suggestion.deliverable)}
													{#if suggestion.variant}
														· {formatLabel(suggestion.variant)}
													{/if}
												</p>
												<p
													class="text-xs font-mono text-gray-500 dark:text-gray-400"
												>
													{suggestion.type_key}
												</p>
											</div>
											<span
												class={`px-2 py-1 rounded-full text-xs font-semibold ${
													badgeClassByMatchLevel[
														suggestion.match_level
													] ?? badgeClassByMatchLevel.new
												}`}
											>
												{getMatchLabel(suggestion.match_level)}
											</span>
										</div>
										<p class="text-sm text-gray-600 dark:text-gray-300">
											{suggestion.rationale}
										</p>
										<div
											class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"
										>
											<span
												>Confidence: {(suggestion.confidence * 100).toFixed(
													0
												)}%</span
											>
											{#if suggestion.parent_type_key}
												<span>Parent: {suggestion.parent_type_key}</span>
											{/if}
										</div>
										<div class="flex flex-wrap gap-2">
											<Button
												variant="secondary"
												size="sm"
												onclick={() => handleSuggestionSelect(suggestion)}
											>
												Use this Type Key
											</Button>
											<Badge variant="warning">Will create new template</Badge
											>
										</div>
									</article>
								{/each}
							</div>
						</section>
					{/if}

					{#if error}
						<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
					{/if}
				</section>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-surface-panel dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-3"
		>
			<div class="text-xs text-slate-600 dark:text-slate-400">
				{#if responseData}
					{responseData.primary
						? 'Select a suggestion or request fresh ideas.'
						: 'No primary suggestion — refine the brain dump to improve matches.'}
				{:else}
					{canAnalyze
						? 'Include goals, constraints, and audience for higher-confidence matches.'
						: unknownScopeMessage}
				{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				{#if responseData}
					<Button
						variant="secondary"
						size="sm"
						onclick={requestDifferentSuggestions}
						disabled={loading}
					>
						Show different suggestions
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => {
							responseData = null;
							error = null;
						}}
						disabled={loading}
					>
						Edit brain dump
					</Button>
					<Button variant="ghost" size="sm" onclick={handleClose}>Close</Button>
				{:else}
					<Button variant="ghost" size="sm" onclick={handleClose} disabled={loading}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						onclick={() => handleSubmit()}
						disabled={loading || !canAnalyze}
					>
						{loading ? 'Analyzing...' : 'Analyze Idea'}
					</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</Modal>
