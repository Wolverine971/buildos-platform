<!-- apps/web/src/lib/components/ontology/templates/TemplateDetailModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

	type TemplateSummary = {
		id: string;
		name: string;
		type_key: string;
		scope: string;
		status: string;
		is_abstract: boolean;
		metadata?: Record<string, unknown> | null;
	};

	interface Props {
		open: boolean;
		loading: boolean;
		error?: string | null;
		template: ResolvedTemplate | null;
		children?: TemplateSummary[];
		onclose?: () => void;
		oncreateproject?: (data: { template: ResolvedTemplate }) => void;
		onselecttemplate?: (data: { typeKey: string; scope: string }) => void;
		ondelete?: () => void;
		isAdmin?: boolean;
	}

	let {
		open,
		loading,
		error = null,
		template = null,
		children = [],
		onclose,
		oncreateproject,
		onselecttemplate,
		ondelete,
		isAdmin = false
	}: Props = $props();

	let dialogRef = $state<HTMLDivElement | undefined>(undefined);

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			close();
		}
	}

	function close() {
		onclose?.();
	}

	function handleEsc(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleEsc);
			return () => window.removeEventListener('keydown', handleEsc);
		}
	});

	const localeNumber = (value: unknown) =>
		typeof value === 'number' ? value.toLocaleString() : String(value);

	const hasTransitions = $derived(Boolean(template?.fsm?.transitions?.length));
	const hasSchemaProps = $derived(
		Boolean(template?.schema?.properties && Object.keys(template.schema.properties).length)
	);

	const schemaEntries = $derived(
		template?.schema?.properties
			? Object.entries(template.schema.properties as Record<string, any>)
			: []
	);

	const defaultPropsEntries = $derived(
		template?.default_props ? Object.entries(template.default_props) : []
	);

	const facetDefaultsEntries = $derived(
		template?.facet_defaults ? Object.entries(template.facet_defaults) : []
	);

	function selectChild(child: TemplateSummary) {
		onselecttemplate?.({ typeKey: child.type_key, scope: child.scope });
	}

	function handleDelete() {
		ondelete?.();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4 py-8 sm:px-6 lg:px-8"
		role="dialog"
		aria-modal="true"
		aria-label="Template details dialog"
		tabindex="0"
		onclick={handleBackdropClick}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				close();
			}
		}}
		bind:this={dialogRef}
	>
		<div
			class="max-w-5xl w-full bg-surface-elevated dark:bg-surface-panel rounded shadow-elevated border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]"
		>
			<!-- Header -->
			<div
				class="px-6 sm:px-8 py-5 border-b border-gray-200 dark:border-gray-700 bg-surface-panel dark:bg-slate-900/30"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="space-y-1">
						<p
							class="text-xs font-mono text-slate-600 dark:text-slate-400 uppercase tracking-wide"
						>
							{template?.type_key}
						</p>
						<h2 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
							{template?.name ?? 'Template Details'}
						</h2>
						<div
							class="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
						>
							{#if template}
								<span
									class="inline-flex items-center px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium capitalize"
								>
									{template.scope}
								</span>
								{#if template.metadata?.realm}
									<span
										class="inline-flex items-center px-2.5 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium capitalize"
									>
										{template.metadata.realm as string}
									</span>
								{/if}
								<span
									class="inline-flex items-center px-2.5 py-1 rounded bg-surface-clarity dark:bg-surface-elevated text-slate-700 dark:text-slate-300 font-medium border border-gray-200 dark:border-gray-700"
								>
									Status: {template.status}
								</span>
								{#if template.is_abstract}
									<span
										class="inline-flex items-center px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium"
									>
										Abstract Template
									</span>
								{/if}
							{/if}
						</div>
					</div>

					<button
						type="button"
						onclick={close}
						class="flex items-center justify-center w-9 h-9 rounded bg-surface-clarity/70 dark:bg-surface-elevated/70 border border-gray-200 dark:border-gray-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-surface-clarity dark:hover:bg-surface-elevated shadow-subtle transition-colors"
						aria-label="Close"
					>
						<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-8">
				{#if loading}
					<div class="flex items-center justify-center py-16">
						<div
							class="flex flex-col items-center gap-3 text-slate-700 dark:text-slate-300"
						>
							<div
								class="h-10 w-10 border-3 border-accent-orange/40 border-t-accent-orange rounded-full animate-spin"
							></div>
							<p class="text-sm font-medium">Loading template details…</p>
						</div>
					</div>
				{:else if error}
					<div
						class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-300"
					>
						{error}
					</div>
				{:else if template}
					<!-- Description -->
					{#if template.metadata?.description}
						<section class="space-y-2">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Overview
							</h3>
							<p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
								{template.metadata.description as string}
							</p>
						</section>
					{/if}

					<!-- Inheritance -->
					{#if template.inheritance_chain.length > 1}
						<section class="space-y-3">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Inheritance
							</h3>
							<div
								class="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
							>
								{#each template.inheritance_chain as typeKey, index}
									<span
										class="inline-flex items-center px-2.5 py-1 rounded bg-surface-clarity dark:bg-surface-elevated text-slate-700 dark:text-slate-300 font-medium border border-gray-200 dark:border-gray-700"
									>
										{typeKey}
									</span>
									{#if index < template.inheritance_chain.length - 1}
										<svg
											class="w-4 h-4 text-slate-500 dark:text-slate-400"
											viewBox="0 0 16 16"
											fill="none"
										>
											<path
												d="M6 13L11 8L6 3"
												stroke="currentColor"
												stroke-width="1.5"
												stroke-linecap="round"
											/>
										</svg>
									{/if}
								{/each}
							</div>
						</section>
					{/if}

					<!-- FSM Section -->
					<section class="space-y-4">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Workflow (FSM)
							</h3>
							{#if template.fsm}
								<span class="text-xs text-slate-600 dark:text-slate-400">
									{template.fsm.states?.length ?? 0} states · {template.fsm
										.transitions?.length ?? 0} transitions
								</span>
							{/if}
						</div>

						{#if template.fsm}
							<div class="grid md:grid-cols-2 gap-6">
								<!-- States -->
								<div
									class="rounded border border-gray-200 dark:border-gray-700 bg-surface-clarity dark:bg-surface-elevated p-4"
								>
									<h4
										class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3"
									>
										States
									</h4>
									<div class="flex flex-wrap gap-2">
										{#each template.fsm.states as state}
											<span
												class="px-2.5 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
											>
												{state}
											</span>
										{/each}
									</div>
								</div>

								<!-- Transitions -->
								<div
									class="rounded border border-gray-200 dark:border-gray-700 bg-surface-clarity dark:bg-surface-elevated p-4"
								>
									<h4
										class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3"
									>
										Transitions
									</h4>
									<div class="space-y-3 max-h-64 overflow-y-auto pr-1">
										{#each template.fsm.transitions as transition}
											<div
												class="rounded bg-surface-elevated dark:bg-surface-panel border border-gray-200 dark:border-gray-700 px-3 py-2 shadow-subtle"
											>
												<div
													class="flex items-center justify-between text-sm font-medium text-slate-900 dark:text-white mb-1"
												>
													<span>{transition.event}</span>
													<span
														class="text-xs text-slate-600 dark:text-slate-400"
													>
														{transition.from} → {transition.to}
													</span>
												</div>
												<div
													class="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400"
												>
													{#if transition.guards?.length}
														<span
															class="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
														>
															{transition.guards.length} guard{transition
																.guards.length !== 1
																? 's'
																: ''}
														</span>
													{/if}
													{#if transition.actions?.length}
														<span
															class="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
														>
															{transition.actions.length} action{transition
																.actions.length !== 1
																? 's'
																: ''}
														</span>
													{/if}
												</div>
											</div>
										{/each}
										{#if !template.fsm.transitions?.length}
											<p class="text-xs text-slate-600 dark:text-slate-400">
												No transitions defined.
											</p>
										{/if}
									</div>
								</div>
							</div>
						{:else}
							<p class="text-sm text-slate-600 dark:text-slate-400">
								No FSM defined for this template.
							</p>
						{/if}
					</section>

					<!-- Schema -->
					<section class="space-y-4">
						<div class="flex items-center justify-between">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Schema
							</h3>
							{#if template.schema?.required?.length}
								<span class="text-xs text-slate-600 dark:text-slate-400">
									Required: {template.schema.required.join(', ')}
								</span>
							{/if}
						</div>

						{#if hasSchemaProps}
							<div class="grid md:grid-cols-2 gap-4">
								{#each schemaEntries as [propName, schema]}
									<div
										class="rounded border border-gray-200 dark:border-gray-700 bg-surface-elevated dark:bg-surface-panel p-4 space-y-2"
									>
										<div class="flex items-center justify-between gap-2">
											<h4
												class="text-sm font-semibold text-slate-900 dark:text-white"
											>
												{propName}
											</h4>
											<span
												class="px-2 py-0.5 text-xs rounded bg-surface-clarity dark:bg-surface-elevated text-slate-700 dark:text-slate-300 capitalize border border-gray-200 dark:border-gray-700"
											>
												{schema.type ?? 'unknown'}
											</span>
										</div>
										{#if schema.description}
											<p class="text-xs text-slate-700 dark:text-slate-300">
												{schema.description}
											</p>
										{/if}
										{#if schema.enum}
											<p class="text-xs text-slate-600 dark:text-slate-400">
												Allowed: {(schema.enum as unknown[]).join(', ')}
											</p>
										{/if}
										{#if schema.default !== undefined}
											<p class="text-xs text-slate-600 dark:text-slate-400">
												Default: {String(schema.default)}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-slate-600 dark:text-slate-400">
								This template does not define custom properties.
							</p>
						{/if}
					</section>

					<!-- Defaults -->
					<section class="grid md:grid-cols-2 gap-6">
						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Default Properties
							</h3>
							{#if defaultPropsEntries.length}
								<ul class="space-y-2 text-sm text-slate-700 dark:text-slate-300">
									{#each defaultPropsEntries as [key, value]}
										<li class="flex justify-between gap-4">
											<span
												class="font-medium text-slate-800 dark:text-slate-200"
												>{key}</span
											>
											<span
												class="truncate text-right text-slate-600 dark:text-slate-400"
											>
												{typeof value === 'object'
													? JSON.stringify(value)
													: String(value)}
											</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-sm text-slate-600 dark:text-slate-400">
									No default properties defined.
								</p>
							{/if}
						</div>

						<div class="space-y-3">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Facet Defaults
							</h3>
							{#if facetDefaultsEntries.length}
								<ul class="space-y-2 text-sm text-slate-700 dark:text-slate-300">
									{#each facetDefaultsEntries as [key, value]}
										<li class="flex justify-between gap-4">
											<span
												class="font-medium text-slate-800 dark:text-slate-200 capitalize"
											>
												{key}
											</span>
											<span
												class="text-right text-slate-600 dark:text-slate-400"
												>{String(value)}</span
											>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-sm text-slate-600 dark:text-slate-400">
									No facet defaults set.
								</p>
							{/if}
						</div>
					</section>

					<!-- Child Templates -->
					{#if children.length}
						<section class="space-y-3">
							<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
								Derived Templates
							</h3>
							<div class="grid md:grid-cols-2 gap-3">
								{#each children as child}
									<button
										onclick={() => selectChild(child)}
										class="text-left px-4 py-3 rounded border border-gray-200 dark:border-gray-700 bg-surface-elevated dark:bg-surface-panel hover:border-accent-orange hover:shadow-elevated transition-all focus:ring-2 focus:ring-accent-orange"
									>
										<div class="flex items-center justify-between gap-2">
											<p
												class="text-sm font-semibold text-slate-900 dark:text-white"
											>
												{child.name}
											</p>
											<span
												class="text-xs px-2 py-0.5 rounded bg-surface-clarity dark:bg-surface-elevated text-slate-700 dark:text-slate-300 capitalize border border-gray-200 dark:border-gray-700"
											>
												{child.scope}
											</span>
										</div>
										<p
											class="mt-1 text-xs font-mono text-slate-600 dark:text-slate-400 truncate"
										>
											{child.type_key}
										</p>
										{#if child.is_abstract}
											<p
												class="mt-2 text-xs text-amber-600 dark:text-amber-400"
											>
												Abstract template
											</p>
										{/if}
									</button>
								{/each}
							</div>
						</section>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="px-6 sm:px-8 py-4 border-t border-gray-200 dark:border-gray-700 bg-surface-panel dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-3"
			>
				<div class="text-xs text-slate-600 dark:text-slate-400">
					Generated: {template ? new Date().toLocaleString() : ''}
				</div>
				<div class="flex gap-3">
					<button
						type="button"
						onclick={close}
						class="px-4 py-2 rounded border border-gray-200 dark:border-gray-700 bg-surface-clarity dark:bg-surface-elevated text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-elevated dark:hover:bg-surface-panel transition-colors focus:ring-2 focus:ring-accent-orange"
					>
						Close
					</button>
					{#if template && isAdmin}
						<!-- Delete Template Button (Admin only) -->
						<button
							type="button"
							onclick={handleDelete}
							class="px-4 py-2 rounded border border-red-300 dark:border-red-800 bg-surface-clarity dark:bg-surface-elevated text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors inline-flex items-center gap-2 focus:ring-2 focus:ring-accent-orange"
							aria-label="Delete template"
						>
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
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
							Delete Template
						</button>
						<!-- Edit Template Button (Admin only) -->
						<a
							href="/ontology/templates/{template.id}/edit"
							class="px-4 py-2 rounded border border-accent-orange/50 dark:border-accent-orange/40 bg-surface-clarity dark:bg-surface-elevated text-sm font-medium text-accent-orange hover:bg-accent-orange/10 dark:hover:bg-accent-orange/20 transition-colors inline-flex items-center gap-2 focus:ring-2 focus:ring-accent-orange"
						>
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
									d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
								/>
							</svg>
							Edit Template
						</a>
					{/if}
					{#if template && template.scope === 'project' && !template.is_abstract}
						<button
							type="button"
							class="px-4 py-2 rounded bg-accent-orange text-white text-sm font-semibold shadow-subtle hover:bg-accent-orange/90 focus:outline-none focus:ring-2 focus:ring-accent-orange transition-all"
							onclick={() => oncreateproject?.({ template })}
						>
							Create Project
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
