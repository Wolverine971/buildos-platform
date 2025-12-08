<!-- apps/web/src/lib/components/ontology/FSMStateBar.svelte -->
<!--
	FSM State Bar - Inkprint Design System

	Shows current state → next state in a compact one-line format.
	- Single runnable transition: Execute button
	- Multiple transitions: Transition button (opens modal)
	- Blocked transition: Blockers button (opens modal)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { ChevronRight, Play, AlertTriangle, Loader2, GitBranch } from 'lucide-svelte';

	type Guard = Record<string, unknown>;
	type TransitionAction = Record<string, unknown>;

	export type FSMTransition = {
		event: string;
		to: string;
		guards: Guard[];
		actions: TransitionAction[];
		failedGuards: Guard[];
		can_run: boolean;
	};

	interface Props {
		entityId: string;
		entityKind: string;
		currentState: string;
		entityName?: string;
		initialTransitions?: FSMTransition[];
		onstatechange?: (data: { state: string; actions: string[]; event: string }) => void;
	}

	const {
		entityId,
		entityKind,
		currentState,
		entityName = '',
		initialTransitions = [],
		onstatechange
	}: Props = $props();

	const normalizeTransition = (
		transition: Partial<FSMTransition> & { failed_guards?: Guard[] }
	): FSMTransition => ({
		event: transition.event ?? '',
		to: transition.to ?? '',
		guards: Array.isArray(transition.guards) ? (transition.guards as Guard[]) : [],
		actions: Array.isArray(transition.actions)
			? (transition.actions as TransitionAction[])
			: [],
		failedGuards: Array.isArray(transition.failedGuards)
			? (transition.failedGuards as Guard[])
			: Array.isArray(transition.failed_guards)
				? ((transition.failed_guards as Guard[]) ?? [])
				: [],
		can_run: typeof transition.can_run === 'boolean' ? transition.can_run : true
	});

	const normalizedInitial = Array.isArray(initialTransitions)
		? initialTransitions.map((t) => normalizeTransition(t))
		: [];

	let transitions = $state<FSMTransition[]>(normalizedInitial);
	let loading = $state(false);
	let executing = $state(false);
	let fetchError = $state<string | null>(null);
	let localState = $state(currentState);

	// Modal states
	let showTransitionModal = $state(false);
	let showBlockersModal = $state(false);
	let blockedTransition = $state<FSMTransition | null>(null);

	// Derived states
	const runnableTransitions = $derived(transitions.filter((t) => t.can_run));
	const hasMultipleTransitions = $derived(transitions.length > 1);
	const hasSingleRunnableTransition = $derived(
		transitions.length === 1 && transitions[0]?.can_run === true
	);
	const hasSingleBlockedTransition = $derived(
		transitions.length === 1 && transitions[0]?.can_run === false
	);
	const primaryTransition = $derived(transitions.length > 0 ? transitions[0] : null);

	onMount(() => {
		if (transitions.length === 0) {
			void refreshTransitions();
		}
	});

	$effect(() => {
		// Only fetch on client-side to avoid SSR fetch warning
		if (browser && currentState !== localState) {
			localState = currentState;
			void refreshTransitions();
		}
	});

	async function refreshTransitions() {
		if (!entityId || !entityKind) return;

		loading = true;
		fetchError = null;

		try {
			const params = new URLSearchParams({ id: entityId, kind: entityKind });
			const response = await fetch(`/api/onto/fsm/transitions?${params.toString()}`);

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error || body.message || 'Failed to load transitions');
			}

			const payload = await response.json();
			transitions =
				(payload.data?.transitions ?? []).map((t: Partial<FSMTransition>) =>
					normalizeTransition(t)
				) ?? [];
		} catch (err) {
			console.error('[FSMStateBar] Failed to fetch transitions:', err);
			fetchError = err instanceof Error ? err.message : 'Failed to load transitions';
		} finally {
			loading = false;
		}
	}

	async function executeTransition(event: string) {
		executing = true;

		try {
			const response = await fetch('/api/onto/fsm/transition', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					object_kind: entityKind,
					object_id: entityId,
					event
				})
			});

			const payload = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(payload.error || payload.message || 'Transition failed');
			}

			const stateAfter = payload.data?.state_after as string;
			const actionsRun = (payload.data?.actions_run ?? []) as string[];

			localState = stateAfter;
			onstatechange?.({ state: stateAfter, actions: actionsRun, event });
			showTransitionModal = false;

			await refreshTransitions();
		} catch (err) {
			console.error('[FSMStateBar] Transition failed:', err);
			// Could show a toast here
		} finally {
			executing = false;
		}
	}

	function handleExecuteClick() {
		if (hasSingleRunnableTransition && primaryTransition) {
			void executeTransition(primaryTransition.event);
		}
	}

	function handleTransitionClick() {
		showTransitionModal = true;
	}

	function handleBlockersClick() {
		if (hasSingleBlockedTransition && primaryTransition) {
			blockedTransition = primaryTransition;
			showBlockersModal = true;
		}
	}

	function openBlockersForTransition(transition: FSMTransition) {
		blockedTransition = transition;
		showBlockersModal = true;
		showTransitionModal = false;
	}

	function guardLabel(rawGuard: Guard): string {
		if (!rawGuard || typeof rawGuard !== 'object') return String(rawGuard);

		const guard = rawGuard as Record<string, unknown>;
		const type = typeof guard.type === 'string' ? guard.type : 'guard';
		const key = typeof guard.key === 'string' ? guard.key : undefined;
		const value = typeof guard.value === 'string' ? guard.value : undefined;
		const path = typeof guard.path === 'string' ? guard.path : undefined;
		const pattern = typeof guard.pattern === 'string' ? guard.pattern : undefined;
		const keys = Array.isArray(guard.keys) ? (guard.keys as string[]) : undefined;
		const values = Array.isArray(guard.values) ? (guard.values as string[]) : undefined;

		switch (type) {
			case 'has_property':
				return path ? `Property "${path}" required` : 'Property required';
			case 'has_facet':
				return key && value ? `Facet ${key} must be "${value}"` : 'Facet check required';
			case 'facet_in':
				return key && values
					? `Facet ${key} must be one of: ${values.join(', ')}`
					: 'Facet value required';
			case 'all_facets_set':
				return keys && keys.length
					? `Required facets: ${keys.join(', ')}`
					: 'Facets required';
			case 'type_key_matches':
				return pattern ? `Type must match "${pattern}"` : 'Type match required';
			default:
				return type.replace(/_/g, ' ');
		}
	}
</script>

<!-- Main State Bar - Inkprint Compact Design -->
<div
	class="fsm-state-bar flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak"
>
	<!-- Current State -->
	<span
		class="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wide bg-accent/10 text-accent"
	>
		{localState}
	</span>

	<!-- Arrow & Next State (if transition available) -->
	{#if loading}
		<Loader2 class="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin text-muted-foreground" />
	{:else if transitions.length === 0}
		<span class="text-[10px] sm:text-xs text-muted-foreground italic">final</span>
	{:else}
		<ChevronRight
			class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground flex-shrink-0"
			strokeWidth={2.5}
		/>

		<!-- Next State Display -->
		{#if hasMultipleTransitions}
			<span
				class="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium text-muted-foreground bg-muted"
			>
				{runnableTransitions.length} next
			</span>
		{:else if primaryTransition}
			<span
				class="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wide {primaryTransition.can_run
					? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
					: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}"
			>
				{primaryTransition.to}
			</span>
		{/if}

		<!-- Action Button -->
		<div class="flex-shrink-0 ml-auto">
			{#if hasMultipleTransitions}
				<button
					onclick={handleTransitionClick}
					disabled={executing}
					class="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:border-accent hover:text-accent text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-colors shadow-ink pressable"
				>
					<GitBranch class="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2.5} />
					<span class="hidden xs:inline">CHOOSE</span>
				</button>
			{:else if hasSingleRunnableTransition}
				<button
					onclick={handleExecuteClick}
					disabled={executing}
					class="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50 shadow-ink pressable"
				>
					{#if executing}
						<Loader2 class="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
					{:else}
						<Play class="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2.5} />
					{/if}
					<span class="hidden xs:inline">{executing ? 'WAIT' : 'GO'}</span>
				</button>
			{:else if hasSingleBlockedTransition}
				<button
					onclick={handleBlockersClick}
					class="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-[10px] sm:text-xs font-semibold uppercase tracking-wide transition-colors shadow-ink pressable"
				>
					<AlertTriangle class="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2.5} />
					<span class="hidden xs:inline">FIX</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<!-- Transition Selection Modal -->
{#if showTransitionModal}
	{#await import('$lib/components/ui/Modal.svelte') then { default: Modal }}
		<Modal isOpen={showTransitionModal} onClose={() => (showTransitionModal = false)} size="md">
			{#snippet header()}
				<div class="flex items-center gap-3">
					<div class="p-2 rounded-lg bg-muted">
						<GitBranch
							class="w-5 h-5 text-muted-foreground"
							strokeWidth={2}
						/>
					</div>
					<div>
						<h2 class="text-lg font-bold text-foreground">
							Select Transition
						</h2>
						<p class="text-sm text-muted-foreground">
							Choose how to progress {entityName || 'this ' + entityKind}
						</p>
					</div>
				</div>
			{/snippet}

			{#snippet children()}
				<div class="space-y-3">
					<!-- Current State -->
					<div
						class="flex items-center gap-2 p-3 rounded-lg bg-muted"
					>
						<span
							class="text-xs font-bold uppercase tracking-wider text-muted-foreground"
						>
							Current:
						</span>
						<span
							class="px-2 py-0.5 rounded-lg text-xs font-bold uppercase bg-accent/10 text-accent"
						>
							{localState}
						</span>
					</div>

					<!-- Available Transitions -->
					<div class="space-y-2">
						{#each transitions as transition (transition.event)}
							<div
								class="p-3 rounded-lg border {transition.can_run
									? 'border-border hover:border-accent'
									: 'border-amber-500/30 bg-amber-500/5'} transition-colors shadow-ink"
							>
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span
												class="text-sm font-semibold text-foreground"
											>
												{transition.event}
											</span>
											<ChevronRight class="w-4 h-4 text-muted-foreground" />
											<span
												class="text-sm font-bold uppercase text-accent"
											>
												{transition.to}
											</span>
										</div>
									</div>

									{#if transition.can_run}
										<button
											onclick={() => executeTransition(transition.event)}
											disabled={executing}
											class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-xs uppercase tracking-wide transition-all duration-150 disabled:opacity-50 shadow-ink pressable"
										>
											{#if executing}
												<Loader2 class="w-3.5 h-3.5 animate-spin" />
											{:else}
												<Play class="w-3.5 h-3.5" strokeWidth={2.5} />
											{/if}
											EXECUTE
										</button>
									{:else}
										<button
											onclick={() => openBlockersForTransition(transition)}
											class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold text-xs uppercase tracking-wide transition-all duration-150 shadow-ink pressable"
										>
											<AlertTriangle class="w-3.5 h-3.5" strokeWidth={2.5} />
											BLOCKED
										</button>
									{/if}
								</div>

								{#if !transition.can_run && transition.failedGuards.length > 0}
									<div
										class="mt-2 pt-2 border-t border-amber-500/20"
									>
										<p class="text-xs text-amber-600 dark:text-amber-400">
											{transition.failedGuards.length} blocker{transition
												.failedGuards.length !== 1
												? 's'
												: ''} preventing this transition
										</p>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/snippet}

			{#snippet footer()}
				<div class="flex justify-end">
					<button
						onclick={() => (showTransitionModal = false)}
						class="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted font-semibold text-sm uppercase tracking-wide transition-colors shadow-ink pressable"
					>
						CANCEL
					</button>
				</div>
			{/snippet}
		</Modal>
	{/await}
{/if}

<!-- Blockers Modal -->
{#if showBlockersModal && blockedTransition}
	{#await import('$lib/components/ui/Modal.svelte') then { default: Modal }}
		<Modal
			isOpen={showBlockersModal}
			onClose={() => {
				showBlockersModal = false;
				blockedTransition = null;
			}}
			size="sm"
		>
			{#snippet header()}
				{@const transition = blockedTransition!}
				<div class="flex items-center gap-3">
					<div class="p-2 rounded-lg bg-amber-500/10">
						<AlertTriangle
							class="w-5 h-5 text-amber-600 dark:text-amber-400"
							strokeWidth={2}
						/>
					</div>
					<div>
						<h2 class="text-lg font-bold text-foreground">
							Transition Blocked
						</h2>
						<p class="text-sm text-muted-foreground">
							Requirements not met for "{transition.event}"
						</p>
					</div>
				</div>
			{/snippet}

			{#snippet children()}
				{@const transition = blockedTransition!}
				<div class="space-y-4">
					<!-- Transition Summary -->
					<div
						class="flex items-center gap-2 p-3 rounded-lg bg-muted"
					>
						<span
							class="text-xs font-bold uppercase text-muted-foreground"
						>
							{localState}
						</span>
						<ChevronRight class="w-4 h-4 text-muted-foreground" />
						<span
							class="text-xs font-bold uppercase text-amber-600 dark:text-amber-400"
						>
							{transition.to}
						</span>
					</div>

					<!-- Blockers List -->
					<div class="space-y-2">
						<p
							class="text-xs font-bold uppercase tracking-wider text-muted-foreground"
						>
							Blockers ({transition.failedGuards.length})
						</p>
						<div class="space-y-2">
							{#each transition.failedGuards as guard, index (index)}
								<div
									class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 tx tx-static tx-weak"
								>
									<div
										class="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center"
									>
										<span
											class="text-xs font-bold text-amber-600 dark:text-amber-400"
										>
											{index + 1}
										</span>
									</div>
									<div class="flex-1 min-w-0">
										<p
											class="text-sm font-medium text-amber-700 dark:text-amber-300"
										>
											{guardLabel(guard)}
										</p>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<p class="text-xs text-muted-foreground">
						Resolve these requirements to enable this transition.
					</p>
				</div>
			{/snippet}

			{#snippet footer()}
				<div class="flex justify-end">
					<button
						onclick={() => {
							showBlockersModal = false;
							blockedTransition = null;
						}}
						class="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted font-semibold text-sm uppercase tracking-wide transition-colors shadow-ink pressable"
					>
						CLOSE
					</button>
				</div>
			{/snippet}
		</Modal>
	{/await}
{/if}
