<!-- apps/web/src/lib/components/ontology/templates/RealmPicker.svelte -->
<script lang="ts">
	interface RealmMeta {
		realm: string;
		template_count: number;
		exemplar_names: string[];
	}

	interface Props {
		realms: RealmMeta[];
		selected?: string | null;
		onSelect?: (realm: string) => void;
		loading?: boolean;
	}

	let { realms = [], selected = null, onSelect, loading = false }: Props = $props();

	function handleSelect(realm: string) {
		if (loading || selected === realm) return;
		onSelect?.(realm);
	}
</script>

{#if loading}
	<div class="grid gap-4 sm:grid-cols-2">
		{#each Array(4) as _, idx}
			<div
				class="rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse bg-gray-100/50 dark:bg-gray-800/30"
				aria-label={'Loading realm ' + idx}
			>
				<div class="h-4 w-24 bg-gray-300 dark:bg-gray-700 rounded mb-3"></div>
				<div class="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
			</div>
		{/each}
	</div>
{:else if realms.length === 0}
	<div
		class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400"
	>
		No realms found for this scope. Try the analyzer to capture what you need.
	</div>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each realms as realmMeta}
			<button
				type="button"
				class={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 ${
					realmMeta.realm === selected
						? 'border-blue-500 bg-blue-50 dark:border-blue-400/80 dark:bg-blue-500/10'
						: 'border-gray-200 dark:border-gray-800'
				}`}
				onclick={() => handleSelect(realmMeta.realm)}
			>
				<div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
					Realm
				</div>
				<div class="text-lg font-semibold text-gray-900 dark:text-gray-50 capitalize">
					{realmMeta.realm.replace(/_/g, ' ')}
				</div>
				<div
					class="mt-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300"
				>
					<span>{realmMeta.template_count} templates</span>
					<span
						class={`text-xs font-semibold ${
							realmMeta.realm === selected
								? 'text-blue-600 dark:text-blue-400'
								: 'text-gray-400 dark:text-gray-500'
						}`}
					>
						{realmMeta.realm === selected ? 'Selected' : 'Choose'}
					</span>
				</div>
				{#if realmMeta.exemplar_names.length}
					<div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
						E.g. {realmMeta.exemplar_names.join(', ')}
					</div>
				{/if}
			</button>
		{/each}
	</div>
{/if}
