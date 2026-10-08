<!-- apps/web/src/lib/components/task-entities/TaskEntityPopover.svelte -->
<!--
	The card a name in a task opens: who or what it is, what the task ties to it (Casey Fenske →
	Dauntless Dogs, 410-360-6761), the people around it, and the other tasks that name it, with
	numbers those tasks know (docs/research/task-entity-layer-2026-10-07.md). Anchored on desktop,
	a bottom sheet on phones (TablePopover).
-->
<script lang="ts">
	import {
		type TaskEntityCard,
		type TaskEntityContact,
		formatPhone,
		mapsSearchUrl
	} from '@buildos/shared-agent-ops/task-entities';
	import TablePopover from '$lib/components/tables/TablePopover.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		Building,
		ChevronRight,
		Copy,
		EyeOff,
		Link,
		Mail,
		MapPin,
		Phone,
		User,
		Video,
		X
	} from '$lib/icons/lucide';
	import type { TaskEntities } from './task-entities.svelte';

	interface Props {
		entities: TaskEntities;
		taskId: string;
		/** Members who can edit the task may hide a wrong entity. */
		canEdit?: boolean;
	}

	let { entities, taskId, canEdit = false }: Props = $props();

	type Related = {
		tasks: Array<{
			id: string;
			title: string;
			project_id: string;
			project_name: string | null;
			state_key: string | null;
		}>;
		contacts: Array<{
			kind: 'phone' | 'email' | 'link' | 'place';
			value: string;
			display: string;
		}>;
		total: number;
	};

	// One read per entity per page visit.
	const relatedCache = new Map<string, Related>();
	let related = $state<Related | null>(null);
	let relatedLoading = $state(false);

	const card = $derived(entities.openCard);

	// Moving between cards (Casey → Dauntless Dogs) replaces the button that had focus: put focus
	// on the new card's name so Esc still closes and a screen reader hears where it went.
	let heading = $state<HTMLElement | null>(null);
	let shownId: string | null = null;
	$effect(() => {
		const id = card?.id ?? null;
		if (shownId && id && id !== shownId) heading?.focus({ preventScroll: true });
		shownId = id;
	});

	$effect(() => {
		const open = card;
		related = null;
		relatedLoading = false;
		if (!open) return;
		const cacheKey = `${taskId}|${open.kind}|${open.key}`;
		const cached = relatedCache.get(cacheKey);
		if (cached) {
			related = cached;
			return;
		}
		const controller = new AbortController();
		relatedLoading = true;
		const params = new URLSearchParams({ kind: open.kind, key: open.key, task_id: taskId });
		fetch(`/api/onto/task-entities/related?${params}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) return;
				const body = await response.json();
				const data = body?.data as Related | undefined;
				if (!data) return;
				relatedCache.set(cacheKey, data);
				related = data;
			})
			.catch(() => {})
			.finally(() => {
				if (!controller.signal.aborted) relatedLoading = false;
			});
		return () => controller.abort();
	});

	const KIND_LABEL: Record<TaskEntityCard['kind'], string> = {
		person: 'Person',
		org: 'Organization',
		place: 'Place'
	};

	// Numbers and emails other tasks tie to this entity, that this task does not already hold.
	const elsewhere = $derived.by(() => {
		if (!card || !related) return [];
		const here = new Set(entities.entities.map((row) => `${row.kind}:${row.value}`));
		return related.contacts
			.filter((contact) => !here.has(`${contact.kind}:${contact.value}`))
			.slice(0, 4);
	});

	function hrefFor(kind: string, value: string): string | null {
		if (kind === 'phone') return `tel:${value}`;
		if (kind === 'email') return `mailto:${value}`;
		if (kind === 'place') return mapsSearchUrl(value);
		if (kind === 'link' || kind === 'meeting_link') return value;
		return null;
	}

	function iconFor(kind: string) {
		if (kind === 'phone') return Phone;
		if (kind === 'email') return Mail;
		if (kind === 'place') return MapPin;
		if (kind === 'meeting_link') return Video;
		return Link;
	}

	function actionFor(kind: string): string {
		if (kind === 'phone') return 'Call';
		if (kind === 'email') return 'Email';
		if (kind === 'place') return 'Map';
		if (kind === 'meeting_link') return 'Join';
		return 'Open';
	}

	const external = (href: string | null) => !!href && /^https?:/i.test(href);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toastService.success('Copied');
		} catch {
			toastService.error('Could not copy');
		}
	}

	function copyText(contact: Pick<TaskEntityContact, 'kind' | 'value' | 'display'>) {
		if (contact.kind === 'phone') return formatPhone(contact.value);
		return contact.kind === 'place' ? contact.value : contact.display;
	}
</script>

{#snippet contactRow(contact: Pick<TaskEntityContact, 'kind' | 'value' | 'display'>, note?: string)}
	{@const Icon = iconFor(contact.kind)}
	{@const href = hrefFor(contact.kind, contact.value)}
	<li class="flex min-w-0 items-center gap-1">
		<a
			{href}
			target={external(href) ? '_blank' : undefined}
			rel={external(href) ? 'noopener noreferrer' : undefined}
			class="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
			aria-label="{actionFor(contact.kind)} {contact.display}"
		>
			<Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate">{contact.display}</span>
			{#if note}<span class="max-w-[45%] shrink truncate text-xs text-muted-foreground"
					>{note}</span
				>{/if}
			<span class="shrink-0 text-xs font-medium text-accent">{actionFor(contact.kind)}</span>
		</a>
		<button
			type="button"
			class="inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="Copy {contact.display}"
			title="Copy"
			onclick={() => void copy(copyText(contact))}
		>
			<Copy class="h-3.5 w-3.5" />
		</button>
	</li>
{/snippet}

{#if card && entities.open}
	<TablePopover
		anchor={entities.open.anchor}
		label="About {card.name}"
		width="w-80"
		onClose={() => entities.close()}
	>
		<div class="flex min-w-0 flex-col gap-3 p-3.5">
			<div class="flex items-start gap-2">
				<span
					class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
					aria-hidden="true"
				>
					{#if card.kind === 'person'}<User
							class="h-4 w-4"
						/>{:else if card.kind === 'org'}<Building class="h-4 w-4" />{:else}<MapPin
							class="h-4 w-4"
						/>{/if}
				</span>
				<div class="min-w-0 flex-1">
					<p
						bind:this={heading}
						tabindex="-1"
						class="text-sm font-semibold leading-snug text-foreground focus:outline-none"
					>
						{card.name}
					</p>
					<p
						class="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground"
					>
						<span>{KIND_LABEL[card.kind]}</span>
						{#if card.partOf}
							<span aria-hidden="true">·</span>
							{#if card.partOf.id}
								{@const target = card.partOf.id}
								<button
									type="button"
									class="truncate rounded font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onclick={() => entities.showCard(target)}
									>{card.kind === 'place' ? 'for ' : ''}{card.partOf.name}</button
								>
							{:else}
								<span class="truncate"
									>{card.kind === 'place' ? 'for ' : ''}{card.partOf.name}</span
								>
							{/if}
						{/if}
					</p>
				</div>
				<button
					type="button"
					class="-mr-1.5 -mt-1 inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Close"
					onclick={() => entities.close()}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if card.kind === 'place'}
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
					{@render contactRow({ kind: 'place', value: card.value, display: card.value })}
				</ul>
			{/if}

			{#if card.contacts.length}
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5" aria-label="Contact">
					{#each card.contacts as contact (contact.id)}
						{@render contactRow(
							contact,
							contact.role === 'secondary' ? 'fallback' : undefined
						)}
					{/each}
				</ul>
			{/if}

			{#if card.people.length}
				<div class="flex min-w-0 flex-col gap-1">
					<p class="micro-label text-muted-foreground">
						{card.kind === 'org'
							? 'People'
							: card.partOf
								? `Also at ${card.partOf.name}`
								: 'With'}
					</p>
					<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
						{#each card.people as person (person.id)}
							<li>
								<button
									type="button"
									class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
									onclick={() => entities.showCard(person.id)}
								>
									<User
										class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<span class="min-w-0 flex-1 truncate">{person.name}</span>
									{#if person.contact}<span
											class="shrink-0 text-xs text-muted-foreground"
											>{person.contact.display}</span
										>{/if}
									<ChevronRight
										class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if elsewhere.length}
				<div class="flex min-w-0 flex-col gap-1">
					<p class="micro-label text-muted-foreground">From other tasks</p>
					<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
						{#each elsewhere as contact (`${contact.kind}:${contact.value}`)}
							{@render contactRow(contact)}
						{/each}
					</ul>
				</div>
			{/if}

			{#if related?.tasks.length}
				<div class="flex min-w-0 flex-col gap-1">
					<p class="micro-label text-muted-foreground">
						Also in {related.total} other task{related.total === 1 ? '' : 's'}
					</p>
					<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
						{#each related.tasks as other (other.id)}
							<li>
								<a
									href="/projects/{other.project_id}/tasks/{other.id}"
									class="flex min-h-9 min-w-0 flex-col justify-center rounded-md px-2 py-1 text-sm pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
									onclick={() => entities.close()}
								>
									<span
										class="truncate text-foreground {other.state_key === 'done'
											? 'text-muted-foreground line-through'
											: ''}">{other.title}</span
									>
									{#if other.project_name}<span
											class="truncate text-xs text-muted-foreground"
											>{other.project_name}</span
										>{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{:else if relatedLoading}
				<p class="text-xs text-muted-foreground" role="status">Looking for other tasks…</p>
			{/if}

			{#if canEdit}
				<div class="flex items-center justify-between gap-2 border-t border-border pt-2">
					<span class="min-w-0 truncate text-xs text-muted-foreground"
						>{card.status === 'confirmed'
							? 'Kept on this task'
							: 'Read from this task'}</span
					>
					<button
						type="button"
						class="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Not a real {KIND_LABEL[card.kind].toLowerCase()}? Stop linking it."
						onclick={() => void entities.hide(card)}
					>
						<EyeOff class="h-3.5 w-3.5" /> Hide
					</button>
				</div>
			{/if}
		</div>
	</TablePopover>
{/if}
