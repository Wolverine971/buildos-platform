<!-- apps/web/src/lib/components/project/emoji/ProjectEmojiPicker.svelte -->
<!--
	Choose a project's two emoji by hand. Two slots on top (tap one, then pick), the
	automatic pick's alternates for this project, search by name, and the whole catalog by group. "Use
	initials" empties both slots. Saving marks the choice as the owner's, so automatic
	re-picks leave it alone. The catalog (~1,700 emoji) loads when the picker first opens.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { LoaderCircle, Search, X } from '$lib/icons/lucide';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import { monogram } from '$lib/components/projects/desktop/desktop-model';
	import {
		placeEmoji,
		searchCatalog,
		slotGlyphs,
		slotsFrom,
		type CatalogEntry,
		type EmojiSlots,
		type ProjectEmoji
	} from './project-emoji';

	let {
		isOpen,
		projectId,
		projectName,
		emoji,
		onClose,
		onSaved
	}: {
		isOpen: boolean;
		projectId: string;
		projectName: string;
		emoji: ProjectEmoji | null;
		onClose: () => void;
		onSaved: (emoji: ProjectEmoji) => void;
	} = $props();

	/** The first emoji of each group stands for it on the group tabs. */
	const GROUP_GLYPH: Record<string, string> = {
		'Smileys & Emotion': '😀',
		'People & Body': '🧑',
		'Animals & Nature': '🐻',
		'Food & Drink': '🍔',
		'Travel & Places': '✈️',
		Activities: '⚽',
		Objects: '💡',
		Symbols: '🔣',
		Flags: '🏁'
	};

	let slots = $state<EmojiSlots>([null, null]);
	let active = $state<0 | 1>(0);
	let query = $state('');
	let group = $state('Smileys & Emotion');
	let catalog = $state.raw<CatalogEntry[]>([]);
	let catalogError = $state(false);
	let saving = $state(false);
	let error = $state('');

	const saved = $derived(emoji?.glyphs ?? []);
	const chosen = $derived(slotGlyphs(slots));
	const changed = $derived(chosen.join(' ') !== saved.join(' '));
	const groups = $derived([...new Set(catalog.map((entry) => entry.group))]);
	const names = $derived(new Map(catalog.map((entry) => [entry.glyph, entry.name])));
	const searching = $derived(query.trim().length > 0);
	const shown = $derived(
		searching ? searchCatalog(catalog, query) : catalog.filter((entry) => entry.group === group)
	);
	const suggestions = $derived(emoji?.suggestions ?? []);

	function reset() {
		slots = slotsFrom(saved);
		active = saved.length === 1 ? 1 : 0;
		query = '';
		error = '';
	}

	async function loadCatalog() {
		if (catalog.length) return;
		try {
			const { EMOJI_CATALOG } = await import('./emoji-catalog.generated');
			catalog = EMOJI_CATALOG.map(([glyph, name, catalogGroup]) => ({
				glyph,
				name,
				group: catalogGroup
			}));
		} catch {
			catalogError = true;
		}
	}

	function pick(glyph: string) {
		({ slots, active } = placeEmoji(slots, active, glyph));
		error = '';
	}

	function clearSlot(index: 0 | 1) {
		const next: EmojiSlots = [...slots];
		next[index] = null;
		slots = next;
		active = index;
	}

	async function save() {
		if (saving) return;
		saving = true;
		error = '';
		try {
			const response = await fetch(`/api/onto/projects/${projectId}/emoji`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ glyphs: chosen })
			});
			const data = await requireApiData<{ emoji: ProjectEmoji }>(
				response,
				'Could not save the emoji'
			);
			onSaved(data.emoji);
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save the emoji';
		} finally {
			saving = false;
		}
	}

	const label = (glyph: string) => names.get(glyph) ?? glyph;
</script>

<Modal
	{isOpen}
	{onClose}
	title="Project emoji"
	size="md"
	onOpen={() => {
		reset();
		void loadCatalog();
	}}
>
	{#snippet children()}
		<div class="space-y-4 px-4 py-4 sm:px-5">
			<!-- The two slots, drawn like the Projects tile. -->
			<div class="flex items-center gap-3">
				<div class="flex gap-2" role="group" aria-label="Emoji slots">
					{#each [0, 1] as const as index (index)}
						{@const glyph = slots[index]}
						<div class="relative">
							<button
								type="button"
								class="slot grid h-14 w-14 place-items-center rounded-xl border bg-card text-3xl shadow-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {active ===
								index
									? 'border-accent ring-2 ring-accent/40'
									: 'border-border hover:border-foreground/30'}"
								aria-pressed={active === index}
								aria-label={glyph
									? `${index === 0 ? 'First' : 'Second'} emoji: ${label(glyph)}. Pick to replace it.`
									: `${index === 0 ? 'First' : 'Second'} emoji: empty. Pick one to fill it.`}
								onclick={() => (active = index)}
							>
								{#if glyph}
									<span class="emoji-glyph">{glyph}</span>
								{:else}
									<span class="text-base font-medium text-muted-foreground"
										>+</span
									>
								{/if}
							</button>
							{#if glyph}
								<button
									type="button"
									class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-ink hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label="Remove {label(glyph)}"
									onclick={() => clearSlot(index)}
								>
									<X class="h-3 w-3" />
								</button>
							{/if}
						</div>
					{/each}
				</div>
				<div class="min-w-0 text-sm">
					<p class="truncate font-medium text-foreground">{projectName}</p>
					<p class="text-muted-foreground">
						{#if chosen.length === 0}
							Shows its initials, <span class="font-mono"
								>{monogram(projectName)}</span
							>.
						{:else}
							Tap a slot, then pick an emoji for it.
						{/if}
					</p>
				</div>
			</div>

			{#if suggestions.length}
				<section aria-labelledby="emoji-suggested-heading">
					<h3
						id="emoji-suggested-heading"
						class="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
					>
						Suggested for this project
					</h3>
					<div class="flex flex-wrap gap-1">
						{#each suggestions as glyph (glyph)}
							<button
								type="button"
								class="cell"
								class:picked={chosen.includes(glyph)}
								aria-label={label(glyph)}
								title={label(glyph)}
								onclick={() => pick(glyph)}
							>
								<span class="emoji-glyph">{glyph}</span>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<div class="relative">
				<Search
					class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					type="search"
					bind:value={query}
					placeholder="Search emoji (money, door, book…)"
					aria-label="Search emoji by name"
					class="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>

			{#if !searching && groups.length}
				<div
					class="-mx-1 flex gap-0.5 overflow-x-auto px-1"
					role="tablist"
					aria-label="Emoji groups"
				>
					{#each groups as name (name)}
						<button
							type="button"
							role="tab"
							aria-selected={group === name}
							aria-label={name}
							title={name}
							class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {group ===
							name
								? 'bg-muted'
								: 'hover:bg-muted/60'}"
							onclick={() => (group = name)}
						>
							<span class="emoji-glyph">{GROUP_GLYPH[name] ?? name.slice(0, 1)}</span>
						</button>
					{/each}
				</div>
			{/if}

			<div
				class="h-64 overflow-y-auto rounded-lg border border-border bg-background/60 p-1.5"
				aria-label={searching ? 'Search results' : group}
				role="group"
			>
				{#if catalogError}
					<p class="p-3 text-sm text-muted-foreground">Couldn’t load the emoji list.</p>
				{:else if !catalog.length}
					<p class="flex items-center gap-2 p-3 text-sm text-muted-foreground">
						<LoaderCircle class="h-4 w-4 animate-spin" /> Loading emoji…
					</p>
				{:else if !shown.length}
					<p class="p-3 text-sm text-muted-foreground">
						No emoji named “{query.trim()}”.
					</p>
				{:else}
					<div class="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-0.5">
						{#each shown as entry (entry.glyph)}
							<button
								type="button"
								class="cell"
								class:picked={chosen.includes(entry.glyph)}
								aria-label={entry.name}
								title={entry.name}
								onclick={() => pick(entry.glyph)}
							>
								<span class="emoji-glyph">{entry.glyph}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if error}
				<p class="text-sm text-destructive" role="alert">{error}</p>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-5"
		>
			<Button
				variant="ghost"
				size="sm"
				disabled={chosen.length === 0}
				onclick={() => {
					slots = [null, null];
					active = 0;
				}}
			>
				Use initials
			</Button>
			<div class="flex items-center gap-2">
				<Button variant="secondary" size="sm" onclick={onClose}>Cancel</Button>
				<Button
					variant="primary"
					size="sm"
					loading={saving}
					disabled={!changed || saving}
					onclick={save}
				>
					Save
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>

<style>
	.emoji-glyph {
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
		line-height: 1;
	}
	.cell {
		display: grid;
		place-items: center;
		height: 2.5rem;
		min-width: 2.5rem;
		border-radius: 0.5rem;
		font-size: 1.5rem;
		transition: background-color 120ms ease;
	}
	.cell:hover {
		background: hsl(var(--muted));
	}
	.cell:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.cell.picked {
		background: hsl(var(--accent) / 0.16);
		box-shadow: inset 0 0 0 1px hsl(var(--accent) / 0.5);
	}
	@media (prefers-reduced-motion: reduce) {
		.cell {
			transition: none;
		}
	}
</style>
