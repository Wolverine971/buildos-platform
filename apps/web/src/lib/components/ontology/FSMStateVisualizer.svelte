<!-- apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type Guard = Record<string, unknown>;
	type TransitionAction = Record<string, unknown>;

	export type FSMTransitionDisplay = {
		event: string;
		to: string;
		guards: Guard[];
		actions: TransitionAction[];
	};

	interface Props {
		entityId: string;
		entityKind: string;
		currentState: string;
		entityName?: string;
		initialTransitions?: FSMTransitionDisplay[];
		confirmBeforeRun?: boolean;
		onstatechange?: (data: { state: string; actions: string[]; event: string }) => void;
		onrefresh?: (data: { transitions: FSMTransitionDisplay[] }) => void;
	}

	const {
		entityId,
		entityKind,
		currentState,
		entityName = '',
		initialTransitions = [],
		confirmBeforeRun = true,
		onstatechange,
		onrefresh
	}: Props = $props();

	let transitions = $state<FSMTransitionDisplay[]>(initialTransitions);
	let loading = $state(false);
	let executingEvent = $state<string | null>(null);
	let fetchError = $state<string | null>(null);
	let transitionError = $state<string | null>(null);
	let successInfo = $state<{ event: string; to: string; actions: string[] } | null>(null);
	let localState = $state(currentState);
	let lastFetchedState = currentState;

	onMount(() => {
		if (transitions.length === 0) {
			void refreshTransitions();
		}
	});

	$effect(() => {
		if (currentState !== localState) {
			localState = currentState;
		}
	});

	$effect(() => {
		if (currentState !== lastFetchedState) {
			void refreshTransitions();
		}
	});

	async function refreshTransitions() {
		if (!entityId || !entityKind) return;

		loading = true;
		fetchError = null;

		try {
			const params = new URLSearchParams({
				id: entityId,
				kind: entityKind
			});
			const response = await fetch(`/api/onto/fsm/transitions?${params.toString()}`);

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error || body.message || 'Failed to load transitions');
			}

			const payload = await response.json();
			// ✅ FIX: Extract from ApiResponse.data wrapper
			transitions = (payload.data?.transitions ?? []) as FSMTransitionDisplay[];
			lastFetchedState = currentState;
			onrefresh?.({ transitions });
		} catch (err) {
			console.error('[FSM] Failed to fetch transitions:', err);
			fetchError = err instanceof Error ? err.message : 'Failed to load transitions';
		} finally {
			loading = false;
		}
	}

	async function executeTransition(event: string, to: string) {
		transitionError = null;
		successInfo = null;

		if (confirmBeforeRun) {
			const name = entityName || entityKind;
			const proceed = confirm(
				`Trigger "${event}" to move ${name} from "${localState}" to "${to}"?`
			);
			if (!proceed) return;
		}

		executingEvent = event;

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

			// ✅ FIX: Extract from ApiResponse.data wrapper
			const stateAfter = payload.data?.state_after as string;
			const actionsRun = (payload.data?.actions_run ?? []) as string[];

			localState = stateAfter;
			successInfo = { event, to: stateAfter, actions: actionsRun };
			onstatechange?.({ state: stateAfter, actions: actionsRun, event });

			await refreshTransitions();
		} catch (err) {
			console.error('[FSM] Transition failed:', err);
			transitionError = err instanceof Error ? err.message : 'Transition failed';
		} finally {
			executingEvent = null;
		}
	}

	function guardLabel(rawGuard: Guard): string {
		if (!rawGuard || typeof rawGuard !== 'object') {
			return String(rawGuard);
		}

		const guard = rawGuard as Record<string, unknown>;
		const type =
			typeof guard.type === 'string' && guard.type.length > 0
				? (guard.type as string)
				: 'guard';
		const key = typeof guard.key === 'string' ? (guard.key as string) : undefined;
		const value = typeof guard.value === 'string' ? (guard.value as string) : undefined;
		const path = typeof guard.path === 'string' ? (guard.path as string) : undefined;
		const pattern = typeof guard.pattern === 'string' ? (guard.pattern as string) : undefined;
		const keys = Array.isArray(guard.keys) ? (guard.keys as string[]) : undefined;
		const values = Array.isArray(guard.values) ? (guard.values as string[]) : undefined;

		switch (type) {
			case 'has_property':
				return path ? `property: ${path}` : 'property set';
			case 'has_facet':
				return key && value ? `facet ${key}=${value}` : 'facet check';
			case 'facet_in':
				return key && values ? `facet ${key} in [${values.join(', ')}]` : 'facet set';
			case 'all_facets_set':
				return keys && keys.length
					? `facets required: ${keys.join(', ')}`
					: 'facets required';
			case 'type_key_matches':
				return pattern ? `type matches ${pattern}` : 'type matches';
			default:
				return type;
		}
	}

	function actionLabel(rawAction: TransitionAction): string {
		if (!rawAction || typeof rawAction !== 'object') {
			return String(rawAction);
		}

		const action = rawAction as Record<string, unknown>;
		const name = typeof action.name === 'string' ? (action.name as string) : undefined;
		const type = typeof action.type === 'string' ? (action.type as string) : undefined;
		const act = typeof action.action === 'string' ? (action.action as string) : undefined;

		if (name) return name;
		if (type) return type;
		if (act) return act;

		try {
			return JSON.stringify(action);
		} catch (err) {
			return String(rawAction);
		}
	}
</script>

<div
	class="fsm-visualizer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 space-y-4"
>
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
		<div>
			<p
				class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
			>
				Current State
			</p>
			<div
				class="inline-flex items-center gap-2 px-3 py-1.5 mt-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold capitalize"
			>
				{localState}
			</div>
			{#if successInfo}
				<p class="mt-2 text-xs text-emerald-600 dark:text-emerald-300">
					Transition "{successInfo.event}" succeeded → <strong>{successInfo.to}</strong>
					{#if successInfo.actions.length}
						· actions: {successInfo.actions.join(', ')}
					{/if}
				</p>
			{/if}
		</div>

		<Button
			variant="outline"
			size="sm"
			onclick={() => refreshTransitions()}
			disabled={loading}
			{loading}
		>
			<RefreshCw class="w-4 h-4" />
			<span>{loading ? 'Refreshing…' : 'Refresh Transitions'}</span>
		</Button>
	</div>

	{#if fetchError}
		<div
			class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
		>
			{fetchError}
		</div>
	{/if}

	{#if transitionError}
		<div
			class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300"
		>
			{transitionError}
		</div>
	{/if}

	{#if loading && transitions.length === 0}
		<div class="text-sm text-gray-600 dark:text-gray-400">Loading available transitions…</div>
	{:else if transitions.length === 0}
		<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
			<ShieldCheck class="w-4 h-4" />
			<span>No transitions available from this state.</span>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each transitions as transition (transition.event)}
				<div
					class="flex flex-col gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/60 dark:bg-gray-900/40"
				>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p
								class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold"
							>
								Event
							</p>
							<p class="text-base font-semibold text-gray-900 dark:text-white">
								{transition.event}
							</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								→ <span class="font-medium">{transition.to}</span>
							</p>
						</div>
						<Button
							variant="primary"
							size="sm"
							onclick={() => executeTransition(transition.event, transition.to)}
							disabled={Boolean(executingEvent) || loading}
							loading={executingEvent === transition.event}
						>
							{executingEvent === transition.event ? 'Running…' : 'Run'}
						</Button>
					</div>

					{#if transition.guards?.length}
						<div class="space-y-1.5">
							<p
								class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								<AlertTriangle class="w-3.5 h-3.5" />
								Guards
							</p>
							<div class="flex flex-wrap gap-1.5">
								{#each transition.guards as guard, index (index)}
									<span
										class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
										title={JSON.stringify(guard, null, 2)}
									>
										{guardLabel(guard)}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if transition.actions?.length}
						<div class="space-y-1">
							<p
								class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
							>
								Actions ({transition.actions.length})
							</p>
							<ul class="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
								{#each transition.actions as action, index (index)}
									<li>{actionLabel(action)}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
