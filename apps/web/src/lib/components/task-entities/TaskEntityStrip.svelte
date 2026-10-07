<!-- apps/web/src/lib/components/task-entities/TaskEntityStrip.svelte -->
<!--
	The chip row of a task's entities: Join, When, Map, Who, Call, Email, Link
	(docs/research/task-entity-layer-2026-10-07.md). Phone numbers, emails and links in the
	text show at once; people, places and times arrive a few seconds after a save, when the
	worker has read the task. Suggestions are dashed: ✓ keeps one through every later edit,
	✕ hides it for good.

	Pass `entities` when a list already loaded them in one request (Today); otherwise the strip
	loads its own and re-checks shortly after the text changes.
-->
<script lang="ts">
	import {
		type TaskEntityChip,
		type TaskEntityKind,
		type TaskEntityRecord,
		type TaskEntityStatus,
		buildTaskEntityChips,
		detectTaskTextEntities
	} from '@buildos/shared-agent-ops/task-entities';
	import {
		Building,
		CalendarClock,
		Check,
		Clock,
		Hash,
		Link,
		Mail,
		MapPin,
		Phone,
		User,
		Video,
		X
	} from '$lib/icons/lucide';

	interface Props {
		taskId: string;
		title: string;
		description?: string | null;
		/** Preloaded rows (one request for a whole list). Omit to let the strip load its own. */
		entities?: TaskEntityRecord[] | null;
		/** Members who can edit the task may confirm and dismiss. */
		canEdit?: boolean;
		/** Today rows: the first few actionable chips, no ✓/✕. */
		compact?: boolean;
		class?: string;
	}

	let {
		taskId,
		title,
		description = null,
		entities = undefined,
		canEdit = false,
		compact = false,
		class: className = ''
	}: Props = $props();

	const RECHECK_AFTER_EDIT_MS = [20_000, 45_000];

	let loaded = $state<TaskEntityRecord[]>([]);
	let overrides = $state<Record<string, TaskEntityStatus>>({});
	let lastDismissed = $state<{ id: string; display: string } | null>(null);
	let errorText = $state<string | null>(null);

	const text = $derived(`${title ?? ''}\n\n${description ?? ''}`.trim());
	const rows = $derived(
		(entities ?? loaded).map((row) => {
			const status = overrides[row.id];
			return status ? { ...row, status } : row;
		})
	);
	const COMPACT_LIMIT = 3;
	const chips = $derived.by(() => {
		// Today rows show only what a model has read: unread text would put the owner's own
		// number and email on half the list. They keep what a tap acts on (Join, Call, Map, …).
		if (compact) {
			return buildTaskEntityChips({ entities: rows })
				.filter((chip) => chip.href && !chip.faded && chip.tone !== 'avoid')
				.slice(0, COMPACT_LIMIT);
		}
		return buildTaskEntityChips({ entities: rows, detected: detectTaskTextEntities(text) });
	});

	async function load(signal?: AbortSignal) {
		try {
			const response = await fetch(
				`/api/onto/task-entities?task_ids=${encodeURIComponent(taskId)}`,
				{ signal }
			);
			if (!response.ok) return;
			const body = await response.json();
			loaded = Array.isArray(body?.data?.entities) ? body.data.entities : [];
			overrides = {};
		} catch {
			// Chips are a convenience: the detected ones still show.
		}
	}

	// Own rows: load for this task, and look again after the worker has had time to re-read.
	let textAtLoad: string | null = null;
	$effect(() => {
		if (entities !== undefined) return;
		const id = taskId;
		if (!id) return;
		const controller = new AbortController();
		textAtLoad = null;
		lastDismissed = null;
		void load(controller.signal);
		return () => controller.abort();
	});
	$effect(() => {
		if (entities !== undefined) return;
		const current = text;
		if (textAtLoad === null) {
			textAtLoad = current;
			return;
		}
		if (current === textAtLoad) return;
		textAtLoad = current;
		const timers = RECHECK_AFTER_EDIT_MS.map((ms) => setTimeout(() => void load(), ms));
		return () => timers.forEach(clearTimeout);
	});

	async function setStatus(id: string, display: string, status: TaskEntityStatus) {
		const previous = overrides[id];
		overrides = { ...overrides, [id]: status };
		lastDismissed = status === 'dismissed' ? { id, display } : null;
		errorText = null;
		try {
			const response = await fetch(`/api/onto/task-entities/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!response.ok) throw new Error(String(response.status));
		} catch {
			const restored = { ...overrides };
			if (previous) restored[id] = previous;
			else delete restored[id];
			overrides = restored;
			if (lastDismissed?.id === id) lastDismissed = null;
			errorText = 'Could not save that. Try again.';
		}
	}

	async function undoDismiss() {
		const target = lastDismissed;
		if (!target) return;
		lastDismissed = null;
		const row = rows.find((entry) => entry.id === target.id);
		if (!row) return;
		await setStatus(
			target.id,
			target.display,
			row.source === 'llm' ? 'suggested' : 'confirmed'
		);
	}

	const ICONS: Record<TaskEntityKind, typeof Phone> = {
		meeting_link: Video,
		time: Clock,
		place: MapPin,
		person: User,
		phone: Phone,
		email: Mail,
		link: Link,
		org: Building,
		reference: Hash
	};

	function iconFor(chip: TaskEntityChip) {
		if (chip.kind === 'time' && chip.role === 'deadline') return CalendarClock;
		return ICONS[chip.kind];
	}

	function tooltip(chip: TaskEntityChip): string {
		const parts = [`${chip.label}: ${chip.display}`];
		if (chip.about) parts.push(chip.about);
		if (chip.quote) parts.push(`From “${chip.quote}”`);
		if (chip.faded && chip.status === 'confirmed') parts.push('No longer in the text');
		else if (chip.role === 'secondary') parts.push('Fallback');
		if (chip.tone === 'understood' && chip.status === 'suggested') parts.push('Suggested');
		return parts.join(' · ');
	}

	const external = (href: string | null) => !!href && /^https?:/i.test(href);
</script>

{#if chips.length || lastDismissed || errorText}
	<div
		class="task-entity-strip flex min-w-0 flex-wrap items-center {compact
			? 'gap-1'
			: 'gap-1.5'} {className}"
		aria-label="Details in this task"
		role="group"
	>
		{#each chips as chip (chip.key)}
			{@const Icon = iconFor(chip)}
			{@const showActions = canEdit && !compact && !!chip.id && chip.status !== 'confirmed'}
			<span
				class="chip inline-flex min-w-0 max-w-full items-center rounded-full border text-xs leading-tight
					{chip.tone === 'avoid'
					? 'border-dashed border-destructive/40 bg-destructive/5 text-destructive'
					: chip.tone === 'understood'
						? chip.status === 'confirmed'
							? 'border-accent/45 bg-accent/5 text-foreground'
							: 'border-dashed border-accent/60 bg-accent/5 text-foreground'
						: 'border-border bg-card text-foreground'}
					{chip.faded ? 'opacity-60' : ''}"
			>
				<svelte:element
					this={chip.href ? 'a' : 'span'}
					href={chip.href ?? undefined}
					target={external(chip.href) ? '_blank' : undefined}
					rel={external(chip.href) ? 'noopener noreferrer' : undefined}
					title={tooltip(chip)}
					class="inline-flex min-w-0 items-center gap-1.5 rounded-full {compact
						? 'px-2 py-0.5'
						: 'px-2.5 py-1'} {chip.href
						? 'pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
						: ''}"
					aria-label={chip.href ? `${chip.label} ${chip.display}` : undefined}
				>
					<Icon
						class="h-3.5 w-3.5 shrink-0 {chip.tone === 'understood'
							? 'text-accent'
							: chip.tone === 'avoid'
								? ''
								: 'text-muted-foreground'}"
						aria-hidden="true"
					/>
					{#if !compact}
						<span class="micro-label shrink-0 !text-[0.625rem]">{chip.label}</span>
					{/if}
					<span class="truncate {chip.tone === 'avoid' ? 'line-through' : ''}"
						>{chip.display}</span
					>
				</svelte:element>
				{#if showActions}
					<span class="flex shrink-0 items-center gap-0.5 pr-1">
						{#if chip.confirmable}
							<button
								type="button"
								class="inline-grid h-6 w-6 place-items-center rounded-full text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Keep {chip.display}"
								title="Keep: stays through later edits"
								onclick={() =>
									chip.id && setStatus(chip.id, chip.display, 'confirmed')}
							>
								<Check class="h-3.5 w-3.5" />
							</button>
						{/if}
						<button
							type="button"
							class="inline-grid h-6 w-6 place-items-center rounded-full text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Hide {chip.display}"
							title="Hide: won't come back"
							onclick={() => chip.id && setStatus(chip.id, chip.display, 'dismissed')}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</span>
				{/if}
			</span>
		{/each}
		{#if lastDismissed}
			<span class="text-xs text-muted-foreground" role="status">
				Hid {lastDismissed.display}.
				<button
					type="button"
					class="font-medium text-foreground underline underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
					onclick={undoDismiss}>Undo</button
				>
			</span>
		{/if}
		{#if errorText}
			<span class="text-xs text-destructive" role="alert">{errorText}</span>
		{/if}
	</div>
{/if}
