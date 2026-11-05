<!-- apps/web/src/routes/lab/sort/+page.svelte -->
<!--
  "Watch it sort" prototype (DJ, 2026-11-04), round 2.
  Stage 1: one streamed call routes each piece of the dump to a project; the phrase highlights
  and flies to that project's card. Stage 2: every project card becomes a thread that reads the
  project, shows the records Jev pulled, and then shows each decision: an update next to the
  record it changes (before → after), a new item, an answer, or "already there".
  Plan only: Merge / Skip are on-screen choices; nothing is saved.

  Stream contract: POST /api/lab/dump-sort returns JSON lines (DumpSortEvent). Times shown are
  measured in the browser from the click, so they include the network.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { MediaQuery, SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import type { DumpItem, DumpKind, DumpProject } from '$lib/server/dump-sort/dump-sort-core';
	import type { DumpSortEvent } from '$lib/server/dump-sort/dump-sort.service';
	import type { ThreadStage } from '$lib/server/dump-sort/dump-sort-thread';
	import type { ThreadChange, ThreadRecord } from '$lib/server/dump-sort/dump-sort-thread-core';

	type Status = 'idle' | 'running' | 'done' | 'error';
	type Rect = { x: number; y: number; w: number; h: number };
	type Flyer = { key: number; item: DumpItem; from: Rect; to: Rect };
	type Piece = { key: string; text: string; item: DumpItem | null };
	type Thread = {
		stage: ThreadStage;
		note?: string;
		startedAt: number;
		doneAt?: number;
		counts?: Record<string, number>;
		records: ThreadRecord[];
		source?: 'jev' | 'recent';
		changes: ThreadChange[];
		cost?: number | null;
	};
	type Op = ThreadChange['op'];

	const KIND_LABEL: Record<DumpKind, string> = {
		project: 'New project',
		context: 'About',
		goal: 'Goal',
		milestone: 'Milestone',
		task: 'Task',
		doc: 'Doc',
		risk: 'Risk',
		update: 'Update',
		ask: 'Question',
		work: 'Work'
	};
	const KIND_TONE: Record<DumpKind, string> = {
		project: 'bg-foreground/15',
		context: 'bg-foreground/10',
		goal: 'bg-accent/25',
		milestone: 'bg-success/25',
		task: 'bg-info/25',
		doc: 'bg-warning/25',
		risk: 'bg-destructive/25',
		update: 'bg-success/35',
		ask: 'bg-info/35',
		work: 'bg-accent/35'
	};
	const OP_LABEL: Record<Op, string> = {
		update: 'updates',
		create: 'new',
		answer: 'answered',
		covered: 'already there',
		archive: 'archives'
	};
	const OP_TONE: Record<Op, string> = {
		update: 'bg-accent/20 text-foreground',
		create: 'bg-info/20 text-foreground',
		answer: 'bg-success/20 text-foreground',
		covered: 'bg-muted text-muted-foreground',
		archive: 'bg-destructive/20 text-foreground'
	};
	const RECORD_LETTER: Record<ThreadRecord['kind'], string> = {
		task: 'T',
		goal: 'G',
		milestone: 'M',
		document: 'D',
		plan: 'P',
		risk: 'R'
	};
	const STAGE_LABEL: Record<ThreadStage, string> = {
		reading: 'Reading the project',
		searching: 'Jev is finding related records',
		deciding: 'Deciding what changes',
		done: 'Done',
		failed: 'Could not check'
	};
	const FIELD_LABEL = { title: 'Name', state: 'Status', due: 'Date', add: 'Adds' } as const;
	/** Pieces about the project itself land on the card; they don't wait for a thread. */
	const THREAD_KINDS = new Set<DumpKind>([
		'goal',
		'milestone',
		'task',
		'doc',
		'risk',
		'update',
		'ask'
	]);
	const FLIGHT_MS = 750;

	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	let draft = $state('');
	let status = $state<Status>('idle');
	let mode = $state<'live' | 'replay'>('replay');
	let errorMessage = $state('');
	let text = $state('');
	let sentenceCount = $state(0);
	let projects = $state<DumpProject[]>([]);
	let focus = $state<string[]>([]);
	let created = $state<{ alias: string; name: string }[]>([]);
	let items = $state<DumpItem[]>([]);
	let skips = $state<{ where: string; line: string; reason: string }[]>([]);
	let flyers = $state<Flyer[]>([]);
	let routeModel = $state<string | null>(null);
	let routeCost = $state<number | null>(null);
	let routed = $state(false);
	let threads = $state<Record<string, Thread>>({});
	/** Browser-measured ms from the click. */
	let clock = $state<Record<string, number>>({});
	const landed = new SvelteSet<number>();
	const choices = new SvelteMap<string, 'merged' | 'skipped'>();

	let dumpEl = $state<HTMLElement | null>(null);
	let deskEl = $state<HTMLElement | null>(null);
	let controller: AbortController | null = null;
	let clickAt = 0;
	let run = 0;

	const now = () => Math.round(performance.now() - clickAt);

	const cardAliases = $derived.by(() => {
		const order: string[] = [];
		const add = (alias: string) => {
			if (alias && !order.includes(alias)) order.push(alias);
		};
		focus.forEach(add);
		created.forEach((project) => add(project.alias));
		items.forEach((item) => add(item.to));
		return order;
	});
	const resting = $derived(
		projects.filter((project) => project.alias !== 'W' && !cardAliases.includes(project.alias))
	);

	/** The decision for each piece, once its thread makes one. */
	const decided = $derived.by(() => {
		const map = new Map<number, ThreadChange>();
		for (const thread of Object.values(threads)) {
			for (const change of thread.changes)
				if (!map.has(change.piece)) map.set(change.piece, change);
		}
		return map;
	});

	const pieces = $derived.by((): Piece[] => {
		if (!text) return [];
		const spans = items
			.filter((item) => item.match !== 'none' && item.end > item.start)
			.sort((a, b) => a.start - b.start);
		const out: Piece[] = [];
		let cursor = 0;
		for (const item of spans) {
			if (item.start < cursor) continue;
			if (item.start > cursor) {
				out.push({ key: `t${cursor}`, text: text.slice(cursor, item.start), item: null });
			}
			out.push({ key: `m${item.n}`, text: text.slice(item.start, item.end), item });
			cursor = item.end;
		}
		if (cursor < text.length)
			out.push({ key: `t${cursor}`, text: text.slice(cursor), item: null });
		return out;
	});

	const tally = $derived.by(() => {
		const counts: Partial<Record<Op, number>> = {};
		for (const change of decided.values()) counts[change.op] = (counts[change.op] ?? 0) + 1;
		return counts;
	});

	function cardName(alias: string): string {
		return (
			created.find((project) => project.alias === alias)?.name ??
			projects.find((project) => project.alias === alias)?.name ??
			alias
		);
	}

	function isNew(alias: string): boolean {
		return created.some((project) => project.alias === alias);
	}

	function piecesFor(alias: string): DumpItem[] {
		return items.filter((item) => item.to === alias);
	}

	/** True while a piece is waiting on its project's thread. */
	function pending(item: DumpItem): boolean {
		return THREAD_KINDS.has(item.kind) && !decided.has(item.n) && status === 'running';
	}

	function referenced(alias: string, record: ThreadRecord): boolean {
		return (threads[alias]?.changes ?? []).some((change) =>
			change.op === 'answer'
				? change.records.some((entry) => entry.ref === record.ref)
				: 'record' in change && change.record.ref === record.ref
		);
	}

	function seconds(ms: number | undefined): string {
		return ms === undefined ? '…' : `${(ms / 1000).toFixed(1)} s`;
	}

	function reset() {
		controller?.abort();
		run += 1;
		status = 'idle';
		errorMessage = '';
		text = '';
		sentenceCount = 0;
		projects = [];
		focus = [];
		created = [];
		items = [];
		skips = [];
		flyers = [];
		routeModel = null;
		routeCost = null;
		routed = false;
		threads = {};
		clock = {};
		landed.clear();
		choices.clear();
	}

	async function start(nextMode: 'live' | 'replay') {
		reset();
		mode = nextMode;
		status = 'running';
		const myRun = run;
		controller = new AbortController();
		clickAt = performance.now();
		try {
			const response = await fetch('/api/lab/dump-sort', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: draft, mode: nextMode }),
				signal: controller.signal
			});
			if (!response.ok || !response.body) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.error ?? `Request failed (${response.status})`);
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffered = '';
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffered += decoder.decode(value, { stream: true });
				const lines = buffered.split('\n');
				buffered = lines.pop() ?? '';
				for (const line of lines) {
					if (line.trim() && myRun === run) handle(JSON.parse(line) as DumpSortEvent);
				}
			}
			if (buffered.trim() && myRun === run) handle(JSON.parse(buffered) as DumpSortEvent);
			if (myRun === run && status === 'running') status = 'done';
		} catch (error) {
			if (myRun !== run || (error instanceof DOMException && error.name === 'AbortError'))
				return;
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Sorting failed';
		}
	}

	function mark(name: string) {
		if (clock[name] === undefined) clock[name] = now();
	}

	function thread(alias: string): Thread {
		if (!threads[alias])
			threads[alias] = { stage: 'reading', startedAt: now(), records: [], changes: [] };
		return threads[alias]!;
	}

	function handle(event: DumpSortEvent) {
		switch (event.type) {
			case 'start':
				text = event.text;
				sentenceCount = event.sentences.length;
				if (event.mode === 'replay') draft = event.text;
				break;
			case 'context':
				projects = event.projects;
				mark('context');
				break;
			case 'thinking':
				mark('thinking');
				break;
			case 'first_token':
				routeModel = event.model;
				mark('firstToken');
				break;
			case 'focus':
				focus = event.focus.focus;
				created = event.focus.created;
				mark('focus');
				break;
			case 'item':
				items.push(event.item);
				mark('firstItem');
				void fly(event.item, run);
				break;
			case 'skip':
				skips.push({ where: 'Routing', line: event.line, reason: event.reason });
				break;
			case 'routed':
				routed = true;
				routeModel = event.model ?? routeModel;
				routeCost = event.usage?.cost ?? null;
				mark('routed');
				if (event.items === 0) {
					status = 'error';
					errorMessage =
						event.finishReason === 'length'
							? 'The model used its whole answer budget without sorting anything. Try again; if it repeats, the dump may be too long.'
							: `The model finished without sorting anything${event.finishReason ? ` (${event.finishReason})` : ''}.`;
				}
				break;
			case 'thread_status': {
				const entry = thread(event.alias);
				entry.stage = event.stage;
				if (event.note) entry.note = event.note;
				if (event.stage === 'done' || event.stage === 'failed') entry.doneAt = now();
				break;
			}
			case 'thread_read':
				thread(event.alias).counts = event.counts;
				break;
			case 'thread_found': {
				const entry = thread(event.alias);
				entry.records = event.records;
				entry.source = event.source;
				break;
			}
			case 'thread_change':
				thread(event.alias).changes.push(event.change);
				mark('firstChange');
				break;
			case 'thread_skip':
				skips.push({
					where: cardName(event.alias),
					line: event.line,
					reason: event.reason
				});
				break;
			case 'thread_done':
				thread(event.alias).cost = event.cost;
				break;
			case 'done':
				mark('done');
				status = 'done';
				break;
			case 'error':
				status = 'error';
				errorMessage = event.message;
				break;
		}
	}

	function rectOf(element: Element | null | undefined): Rect | null {
		const rect = element?.getClientRects()[0];
		return rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null;
	}

	async function fly(item: DumpItem, myRun: number) {
		await tick();
		if (myRun !== run) return;
		const from = rectOf(dumpEl?.querySelector(`[data-mark="${item.n}"]`)) ?? rectOf(dumpEl);
		const to = rectOf(deskEl?.querySelector(`[data-slot="${item.n}"]`));
		if (!from || !to || reducedMotion.current) {
			landed.add(item.n);
			return;
		}
		flyers.push({ key: item.n, item, from: { ...from, w: Math.min(from.w, 280) }, to });
	}

	function flight(flyer: Flyer): Attachment<HTMLElement> {
		return (node) => {
			const dx = flyer.to.x - flyer.from.x;
			const dy = flyer.to.y - flyer.from.y;
			const lift = Math.min(80, Math.abs(dx) * 0.12 + 24);
			const animation = node.animate(
				[
					{ transform: 'translate(0px, 0px) scale(1)', opacity: 0.95, offset: 0 },
					{ transform: 'translate(0px, -6px) scale(1.05)', opacity: 1, offset: 0.12 },
					{
						transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1)`,
						opacity: 1,
						offset: 0.55
					},
					{
						transform: `translate(${dx}px, ${dy}px) scale(0.95)`,
						opacity: 1,
						offset: 0.9
					},
					{ transform: `translate(${dx}px, ${dy}px) scale(0.95)`, opacity: 0, offset: 1 }
				],
				{ duration: FLIGHT_MS, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }
			);
			animation.onfinish = () => {
				flyers = flyers.filter((entry) => entry.key !== flyer.key);
				landed.add(flyer.item.n);
			};
			return () => animation.cancel();
		};
	}

	function choose(key: string, choice: 'merged' | 'skipped') {
		if (choices.get(key) === choice) choices.delete(key);
		else choices.set(key, choice);
	}

	function countLine(counts: Record<string, number>): string {
		const parts = Object.entries(counts)
			.filter(([, count]) => count > 0)
			.map(([name, count]) => `${count} ${count === 1 ? name.slice(0, -1) : name}`);
		return parts.length ? `Read ${parts.join(' · ')}` : 'Nothing in this project yet';
	}
</script>

<svelte:head>
	<title>Sort Lab | BuildOS</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#snippet spinner(size = 'h-3.5 w-3.5')}
	<span
		class="inline-block {size} shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-accent align-[-2px]"
		aria-hidden="true"
	></span>
{/snippet}

<div class="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold text-foreground">Watch it sort</h1>
			<p class="text-sm text-muted-foreground">
				Prototype, round 2. Routes the dump, then checks each project in parallel. Nothing
				is saved.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
				disabled={status === 'running'}
				onclick={() => start('replay')}
			>
				Replay sample (free)
			</button>
			<button
				type="button"
				class="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
				disabled={status === 'running' || !draft.trim()}
				onclick={() => start('live')}
			>
				Sort it (live, about 1¢)
			</button>
		</div>
	</header>

	<!-- Timing strip: browser-measured from the click. -->
	<section
		aria-label="Timing"
		class="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-5"
	>
		<div>
			<div class="text-xs text-muted-foreground">Projects in focus</div>
			<div class="font-mono tabular-nums text-foreground">{seconds(clock.focus)}</div>
		</div>
		<div>
			<div class="text-xs text-muted-foreground">First piece placed</div>
			<div class="font-mono text-lg font-semibold tabular-nums text-foreground">
				{seconds(clock.firstItem)}
			</div>
		</div>
		<div>
			<div class="text-xs text-muted-foreground">Routing done</div>
			<div class="font-mono tabular-nums text-foreground">{seconds(clock.routed)}</div>
		</div>
		<div>
			<div class="text-xs text-muted-foreground">First change ready</div>
			<div class="font-mono text-lg font-semibold tabular-nums text-foreground">
				{seconds(clock.firstChange)}
			</div>
		</div>
		<div>
			<div class="text-xs text-muted-foreground">Every project checked</div>
			<div class="font-mono text-lg font-semibold tabular-nums text-foreground">
				{seconds(clock.done)}
			</div>
		</div>
		{#if status !== 'idle'}
			<p class="col-span-2 text-xs text-muted-foreground sm:col-span-5">
				{mode === 'replay'
					? 'Replay (scripted pace, no model or Jev)'
					: (routeModel ?? 'model pending')}
				· {items.length} pieces → {Object.keys(threads).length} project threads
				{#if Object.keys(tally).length}
					· {Object.entries(tally)
						.map(([op, count]) => `${count} ${OP_LABEL[op as Op]}`)
						.join(', ')}
				{/if}
				{#if routeCost}· routing ${routeCost.toFixed(5)}{/if}
			</p>
		{/if}
	</section>

	{#if status === 'error'}
		<p
			class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
		>
			{errorMessage}
		</p>
	{/if}

	<div class="grid gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
		<!-- The dump -->
		<section class="flex min-w-0 flex-col gap-2" aria-label="Your dump">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-foreground">Your dump</h2>
				{#if status !== 'idle'}
					<button
						type="button"
						class="text-xs text-muted-foreground underline-offset-2 hover:underline"
						onclick={reset}
					>
						Edit
					</button>
				{/if}
			</div>
			{#if status === 'idle'}
				<label for="dump-input" class="sr-only">Brain dump</label>
				<textarea
					id="dump-input"
					bind:value={draft}
					rows="12"
					placeholder="Ramble about a few of your projects. Things to do, things you finished, dates that moved, questions…"
					class="w-full resize-y rounded-lg border border-border bg-card p-4 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
				></textarea>
			{:else}
				<div
					bind:this={dumpEl}
					class="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-base leading-loose text-foreground"
				>
					{#each pieces as piece (piece.key)}{#if piece.item}{@const change = decided.get(
								piece.item.n
							)}<mark
								data-mark={piece.item.n}
								title={`${KIND_LABEL[piece.item.kind]} → ${cardName(piece.item.to)}`}
								class="rounded px-0.5 text-foreground {KIND_TONE[piece.item.kind]}"
								>{piece.text}</mark
							>{#if pending(piece.item)}<span class="ml-1"
									>{@render spinner('h-3 w-3')}</span
								>{:else if change}<span
									class="op-in ml-1 rounded px-1 align-[1px] text-2xs font-medium {OP_TONE[
										change.op
									]}">{OP_LABEL[change.op]}</span
								>{/if}{:else}{piece.text}{/if}{/each}
				</div>
				<p class="text-xs text-muted-foreground">
					{sentenceCount} sentences numbered for the model. A spinner means that project's
					thread is still deciding.
				</p>
			{/if}
		</section>

		<!-- The desk: one thread per project -->
		<section bind:this={deskEl} class="flex min-w-0 flex-col gap-3" aria-label="Where it went">
			<h2 class="text-sm font-semibold text-foreground">Where it went</h2>
			{#if status === 'idle'}
				<div
					class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
				>
					Your projects show up here. The ones your dump is about move to the front, then
					each one checks what it already holds and shows what would change.
				</div>
			{:else}
				{#if cardAliases.length === 0 && status === 'running'}
					<p class="flex items-center gap-2 text-sm text-muted-foreground">
						{@render spinner()}
						{clock.context === undefined
							? 'Loading your projects…'
							: 'Reading your dump…'}
					</p>
				{/if}
				<div class="grid gap-3 xl:grid-cols-2">
					{#each cardAliases as alias (alias)}
						{@const entry = threads[alias]}
						<article
							class="focus-in flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm {isNew(
								alias
							)
								? 'border-dashed border-accent'
								: 'border-border'}"
						>
							<header class="flex flex-col gap-1">
								<div class="flex items-baseline justify-between gap-2">
									<h3 class="min-w-0 truncate font-semibold text-foreground">
										{cardName(alias)}
									</h3>
									{#if isNew(alias)}
										<span class="shrink-0 text-xs font-medium text-accent"
											>New project</span
										>
									{:else if alias === 'W'}
										<span class="shrink-0 text-xs text-muted-foreground"
											>Workspace</span
										>
									{/if}
								</div>
								<div class="flex items-center gap-2 text-xs text-muted-foreground">
									{#if !entry}
										{#if !routed}{@render spinner('h-3 w-3')} Collecting pieces…{:else}Nothing
											to check{/if}
									{:else if entry.stage === 'done' && !entry.counts}
										Nothing to look inside yet, so everything here is new
									{:else if entry.stage === 'done'}
										<span class="text-success">✓</span>
										Checked in {seconds(
											(entry.doneAt ?? 0) - entry.startedAt
										)}{entry.cost ? ` · $${entry.cost.toFixed(5)}` : ''}
									{:else if entry.stage === 'failed'}
										<span class="text-destructive"
											>{STAGE_LABEL.failed}: {entry.note}</span
										>
									{:else}
										{@render spinner('h-3 w-3')}
										{STAGE_LABEL[entry.stage]}…
									{/if}
								</div>
							</header>

							<!-- Pieces routed here (the flight lands on these rows) -->
							<div class="flex flex-col gap-1">
								<div class="text-xs font-medium text-muted-foreground">
									From your dump
								</div>
								<ul class="flex flex-col gap-1">
									{#each piecesFor(alias) as item (item.n)}
										{@const change = decided.get(item.n)}
										<li
											data-slot={item.n}
											class="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground {KIND_TONE[
												item.kind
											]} {landed.has(item.n) ? 'is-landed' : 'opacity-0'}"
										>
											<span
												class="shrink-0 text-xs font-medium text-muted-foreground"
												>{KIND_LABEL[item.kind]}</span
											>
											<span class="min-w-0 flex-1 truncate">{item.title}</span
											>
											{#if change}
												<span
													class="op-in shrink-0 rounded px-1 text-2xs font-medium {OP_TONE[
														change.op
													]}">{OP_LABEL[change.op]}</span
												>
											{:else if pending(item)}
												{@render spinner('h-3 w-3')}
											{/if}
										</li>
									{/each}
								</ul>
							</div>

							<!-- What the thread looked at -->
							{#if entry?.counts}
								<div class="flex flex-col gap-1.5">
									<div class="text-xs font-medium text-muted-foreground">
										{countLine(entry.counts)}{#if entry.source}
											· {entry.source === 'jev'
												? 'Jev pulled'
												: 'Most recent'}
											{entry.records.length}{/if}
									</div>
									{#if entry.records.length}
										<div class="flex flex-wrap gap-1.5">
											{#each entry.records as record (record.ref)}
												<span
													class="pull-in inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors {referenced(
														alias,
														record
													)
														? 'border-accent bg-accent/10 text-foreground'
														: 'border-border bg-background text-muted-foreground'}"
												>
													<span class="font-mono text-2xs opacity-70"
														>{RECORD_LETTER[record.kind]}</span
													>
													<span class="truncate">{record.title}</span>
													{#if record.p !== null}
														<span class="font-mono text-2xs opacity-60"
															>{Math.round(record.p * 100)}%</span
														>
													{/if}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/if}

							<!-- Decisions -->
							{#if entry?.changes.length}
								<div class="flex flex-col gap-2">
									<div class="text-xs font-medium text-muted-foreground">
										What changes
									</div>
									{#each entry.changes as change, index (`${change.piece}-${index}`)}
										{@const key = `${alias}:${change.piece}:${index}`}
										{@const choice = choices.get(key)}
										<div
											class="change-in flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm {choice ===
											'skipped'
												? 'opacity-50'
												: ''}"
										>
											{#if change.op === 'update'}
												<div class="min-w-0">
													<span class="text-xs font-medium text-accent"
														>Update</span
													>
													<span class="text-xs text-muted-foreground"
														>· {change.record.kind}</span
													>
													<div
														class="truncate font-medium text-foreground"
													>
														{change.record.title}
													</div>
												</div>
												<dl
													class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm"
												>
													{#each change.fields as field (field.field)}
														<dt class="text-xs text-muted-foreground">
															{FIELD_LABEL[field.field]}
														</dt>
														<dd class="min-w-0">
															{#if field.field === 'add'}
																{#if field.before}
																	<span
																		class="block text-xs text-muted-foreground"
																		>{field.before}</span
																	>
																{/if}
																<span
																	class="block rounded bg-success/15 px-1 text-foreground"
																	>+ {field.after}</span
																>
															{:else}
																<span
																	class="text-muted-foreground line-through"
																	>{field.before ?? 'none'}</span
																>
																<span class="text-muted-foreground">
																	→
																</span>
																<span
																	class="rounded bg-accent/15 px-1 font-medium text-foreground"
																	>{field.after}</span
																>
															{/if}
														</dd>
													{/each}
												</dl>
											{:else if change.op === 'create'}
												<div>
													<span class="text-xs font-medium text-info"
														>New {change.kind}</span
													>
													<div class="font-medium text-foreground">
														{change.title}
													</div>
													{#if change.description}
														<p class="text-xs text-muted-foreground">
															{change.description}
														</p>
													{/if}
													{#if change.due}
														<p class="text-xs text-muted-foreground">
															Date {change.due}
														</p>
													{/if}
												</div>
											{:else if change.op === 'answer'}
												<div>
													<span class="text-xs font-medium text-success"
														>Answer</span
													>
													<p class="text-foreground">{change.text}</p>
													{#if change.records.length}
														<p
															class="mt-1 text-xs text-muted-foreground"
														>
															From {change.records
																.map((record) => record.title)
																.join(', ')}
														</p>
													{/if}
												</div>
											{:else if change.op === 'covered'}
												<div class="text-muted-foreground">
													<span class="text-xs font-medium"
														>Already there</span
													>
													<div class="text-foreground">
														{change.record.title}
													</div>
												</div>
											{:else}
												<div>
													<span
														class="text-xs font-medium text-destructive"
														>Archive</span
													>
													<div class="font-medium text-foreground">
														{change.record.title}
													</div>
												</div>
											{/if}
											{#if 'why' in change && change.why}
												<p class="text-xs text-muted-foreground">
													{change.why}
												</p>
											{/if}
											{#if change.op === 'update' || change.op === 'create' || change.op === 'archive'}
												<div class="flex gap-2">
													<button
														type="button"
														class="rounded border px-2 py-0.5 text-xs font-medium {choice ===
														'merged'
															? 'border-accent bg-accent text-accent-foreground'
															: 'border-border text-foreground hover:bg-muted'}"
														onclick={() => choose(key, 'merged')}
													>
														{choice === 'merged'
															? 'Kept'
															: change.op === 'update'
																? 'Merge'
																: 'Keep'}
													</button>
													<button
														type="button"
														class="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
														onclick={() => choose(key, 'skipped')}
													>
														{choice === 'skipped' ? 'Skipped' : 'Skip'}
													</button>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</article>
					{/each}
				</div>
				{#if resting.length}
					<div class="flex flex-wrap gap-1.5 opacity-60">
						{#each resting as project (project.alias)}
							<span
								class="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
								>{project.name}</span
							>
						{/each}
					</div>
				{/if}
			{/if}
		</section>
	</div>

	{#if skips.length}
		<details class="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
			<summary class="cursor-pointer">{skips.length} lines the page couldn't use</summary>
			<ul class="mt-2 flex flex-col gap-1 font-mono">
				{#each skips as skip, index (index)}
					<li>{skip.where} · {skip.reason}: {skip.line}</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<!-- Flying pieces -->
<div class="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
	{#each flyers as flyer (flyer.key)}
		<div
			{@attach flight(flyer)}
			class="absolute overflow-hidden rounded-md bg-card text-sm text-foreground shadow-md ring-1 ring-border"
			style="left:{flyer.from.x}px; top:{flyer.from.y}px; max-width:{Math.max(
				flyer.from.w,
				160
			)}px;"
		>
			<div class="truncate px-2 py-1 {KIND_TONE[flyer.item.kind]}">
				<span class="font-medium">{KIND_LABEL[flyer.item.kind]}</span> · {flyer.item.title}
			</div>
		</div>
	{/each}
</div>

<style>
	.focus-in,
	.change-in {
		animation: rise 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.pull-in {
		animation: rise 260ms ease-out;
	}
	.op-in {
		animation: pop 300ms ease-out;
	}
	.is-landed {
		animation: land 420ms ease-out;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.8);
		}
	}
	@keyframes land {
		0% {
			box-shadow: 0 0 0 2px hsl(var(--accent) / 0.55);
		}
		100% {
			box-shadow: 0 0 0 0 hsl(var(--accent) / 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.focus-in,
		.change-in,
		.pull-in,
		.op-in,
		.is-landed {
			animation: none;
		}
	}
</style>
