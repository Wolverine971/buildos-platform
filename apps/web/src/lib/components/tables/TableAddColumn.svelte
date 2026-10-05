<!-- apps/web/src/lib/components/tables/TableAddColumn.svelte -->
<!--
	New column: a name and a type, or a question the agent answers for every row.
-->
<script lang="ts">
	import type { TableColumnInput, TableColumnType } from '@buildos/shared-agent-ops/tables';
	import { Sparkles } from '$lib/icons/lucide';
	import TableColumnTypeIcon from './TableColumnTypeIcon.svelte';
	import { COLUMN_TYPE_OPTIONS } from './table-cell-format';

	let {
		existingNames,
		rowCount = 0,
		presetType = null,
		onAdd,
		onClose
	}: {
		existingNames: string[];
		rowCount?: number;
		presetType?: TableColumnType | null;
		onAdd: (input: TableColumnInput, opts: { fill: boolean }) => void;
		onClose: () => void;
	} = $props();

	let mode = $state<'plain' | 'question'>('plain');
	let name = $state('');
	// svelte-ignore state_referenced_locally
	let type = $state<TableColumnType>(presetType ?? 'text');
	let prompt = $state('');
	let research = $state(true);
	let error = $state<string | null>(null);

	const types = COLUMN_TYPE_OPTIONS.filter((option) => option.type !== 'link');

	function uniqueName(base: string): string {
		const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
		if (!taken.has(base.toLowerCase())) return base;
		for (let i = 2; i < 100; i += 1) {
			const candidate = `${base} ${i}`;
			if (!taken.has(candidate.toLowerCase())) return candidate;
		}
		return `${base} ${Date.now()}`;
	}

	function submit(fill = false) {
		const trimmed = name.trim();
		if (mode === 'question' && !prompt.trim()) {
			error = 'Write the question to ask for each row.';
			return;
		}
		const fallback =
			mode === 'question'
				? 'Answer'
				: (COLUMN_TYPE_OPTIONS.find((o) => o.type === type)?.label ?? 'Column');
		const finalName = trimmed || uniqueName(fallback);
		if (existingNames.some((n) => n.trim().toLowerCase() === finalName.toLowerCase())) {
			error = `There's already a column called ${finalName}.`;
			return;
		}
		const input: TableColumnInput =
			mode === 'question'
				? {
						name: finalName,
						type: 'text',
						ai: {
							prompt: prompt.trim(),
							research,
							updated_at: new Date().toISOString()
						}
					}
				: {
						name: finalName,
						type,
						...(type === 'select' || type === 'multi_select'
							? { options: { choices: [] } }
							: {}),
						...(type === 'number' ? { options: { format: 'number' } } : {})
					};
		onAdd(input, { fill: mode === 'question' && fill });
		onClose();
	}
</script>

<form
	class="grid gap-3 p-3.5"
	onsubmit={(event) => {
		event.preventDefault();
		submit(mode === 'question');
	}}
>
	<div
		class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
		role="tablist"
		aria-label="Kind of column"
	>
		<button
			type="button"
			role="tab"
			aria-selected={mode === 'plain'}
			class="min-h-9 rounded-md text-sm font-medium {mode === 'plain'
				? 'bg-card text-foreground shadow-ink'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (mode = 'plain')}
		>
			Column
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={mode === 'question'}
			class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium {mode ===
			'question'
				? 'bg-card text-foreground shadow-ink'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (mode = 'question')}
		>
			<Sparkles class="h-3.5 w-3.5 text-accent" />
			Question
		</button>
	</div>

	<label class="grid gap-1">
		<span class="micro-label text-muted-foreground">Name</span>
		<input
			bind:value={name}
			data-autofocus
			placeholder={mode === 'question' ? 'e.g. Hiring manager' : 'e.g. Follow-up date'}
			class="min-h-9 w-full rounded-md border border-border-strong bg-background px-2.5 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm"
			oninput={() => (error = null)}
		/>
	</label>

	{#if mode === 'plain'}
		<fieldset class="grid gap-1">
			<legend class="micro-label mb-1 text-muted-foreground">Type</legend>
			<div class="grid grid-cols-2 gap-1">
				{#each types as option (option.type)}
					<label
						class="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 sm:min-h-9 {type ===
						option.type
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-border-strong'}"
					>
						<input
							type="radio"
							class="sr-only"
							name="column-type"
							value={option.type}
							bind:group={type}
						/>
						<span class="text-muted-foreground"
							><TableColumnTypeIcon column={{ type: option.type }} /></span
						>
						<span class="text-sm text-foreground">{option.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{:else}
		<label class="grid gap-1">
			<span class="micro-label text-muted-foreground">Ask for each row</span>
			<textarea
				bind:value={prompt}
				rows="3"
				placeholder="e.g. Who is the hiring manager for this role?"
				class="w-full resize-y rounded-md border border-border-strong bg-background px-2.5 py-2 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm"
				oninput={() => (error = null)}
			></textarea>
		</label>
		<label
			class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border border-border bg-background px-2.5 py-2"
		>
			<input
				type="checkbox"
				bind:checked={research}
				class="mt-0.5 h-4 w-4 rounded border-border-strong text-accent focus:ring-ring"
			/>
			<span class="text-sm text-foreground">
				Search the web for each row
				<span class="block text-xs text-muted-foreground"
					>Off: answers from the row's other columns only.</span
				>
			</span>
		</label>
		<p class="text-xs text-muted-foreground">
			Each row is one AI request; answers arrive with sources.
		</p>
	{/if}

	{#if error}
		<p class="text-xs text-destructive" role="alert">{error}</p>
	{/if}

	<div class="flex justify-end gap-2">
		<button
			type="button"
			class="min-h-9 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={onClose}
		>
			Cancel
		</button>
		{#if mode === 'question'}
			<button
				type="button"
				class="min-h-9 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:border-accent"
				onclick={() => submit(false)}
			>
				Add only
			</button>
			<button
				type="submit"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground tx-button tx-button-accent disabled:opacity-50"
				disabled={rowCount === 0}
			>
				<Sparkles class="h-3.5 w-3.5" />
				Add and fill {rowCount}
				{rowCount === 1 ? 'row' : 'rows'}
			</button>
		{:else}
			<button
				type="submit"
				class="min-h-9 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground tx-button tx-button-accent"
			>
				Add column
			</button>
		{/if}
	</div>
</form>
