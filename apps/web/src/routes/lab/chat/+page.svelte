<!-- apps/web/src/routes/lab/chat/+page.svelte -->
<!--
  "Chat with threads" lab (DJ, 2026-11-05). A chat where each message is planned into one
  thread per project, the threads run in parallel and show every step (index, related
  records, each read, each decision), and the reply is written from their reports. Safe
  changes show as saved; anything the thread is unsure of becomes a numbered question with
  Yes / No, which sends a follow-up. Lab: nothing is written yet.

  Stream contract: POST /api/lab/thread-chat returns JSON lines (ChatTurnEvent). Each turn
  sends the earlier turns' short reports back, so follow-ups land on the right project.
  Times are measured in the browser from Send, so they include the network.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import type { DumpItem, DumpSentence } from '$lib/server/dump-sort/dump-sort-core';
	import type { ThreadRecord } from '$lib/server/dump-sort/dump-sort-thread-core';
	import type {
		ChatChange,
		ChatHistoryTurn,
		ThreadReport
	} from '$lib/server/thread-chat/thread-chat-core';
	import type { ThreadStage, ThreadStep } from '$lib/server/thread-chat/thread-chat-thread';
	import type {
		ChatTurnEvent,
		ChatTurnTotals
	} from '$lib/server/thread-chat/thread-chat.service';

	let { data } = $props();

	type ThreadView = {
		alias: string;
		name: string;
		pieces: number[];
		stage: ThreadStage;
		note?: string;
		steps: ThreadStep[];
		related: ThreadRecord[];
		changes: ChatChange[];
		calls?: number;
		cost?: number;
		ms?: number;
		report?: ThreadReport;
	};
	type Turn = {
		id: number;
		mode: 'live' | 'replay';
		message: string;
		sentences: DumpSentence[];
		items: DumpItem[];
		threads: ThreadView[];
		answer: string;
		status: 'running' | 'done' | 'error';
		error?: string;
		planModel: string | null;
		planCost: number | null;
		totals?: ChatTurnTotals;
		/** Browser ms from Send. */
		clock: { planned?: number; firstChange?: number; answerStart?: number; done?: number };
		open: boolean;
	};

	const TONES = [
		{ dot: 'bg-accent', mark: 'bg-accent/20 decoration-accent' },
		{ dot: 'bg-info', mark: 'bg-info/20 decoration-info' },
		{ dot: 'bg-success', mark: 'bg-success/20 decoration-success' },
		{ dot: 'bg-warning', mark: 'bg-warning/25 decoration-warning' },
		{ dot: 'bg-destructive', mark: 'bg-destructive/15 decoration-destructive' }
	];
	const STAGE_LABEL: Record<ThreadStage, string> = {
		reading: 'Reading the project',
		searching: 'Finding related records',
		working: 'Working',
		done: 'Done',
		failed: 'Could not check'
	};
	const KIND_LABEL: Record<string, string> = {
		task: 'Task',
		goal: 'Goal',
		milestone: 'Milestone',
		document: 'Doc',
		doc: 'Doc',
		plan: 'Plan',
		risk: 'Risk',
		note: 'Note'
	};
	const FIELD_LABEL = { title: 'Name', state: 'Status', due: 'Date', add: 'Adds' } as const;

	let mode = $state<'live' | 'replay'>('replay');
	let scope = $state<string>('');
	let draft = $state('');
	let turns = $state<Turn[]>([]);
	let answered = $state<Record<string, 'yes' | 'no'>>({});
	let controller: AbortController | null = null;
	let listEl = $state<HTMLElement | null>(null);

	const running = $derived(turns.some((turn) => turn.status === 'running'));
	const replayNext = $derived(
		data.replayMessages[turns.length % data.replayMessages.length] ?? ''
	);
	const conversation = $derived.by(() => {
		const done = turns.filter((turn) => turn.totals);
		const sum = (pick: (totals: ChatTurnTotals) => number) =>
			done.reduce((total, turn) => total + pick(turn.totals!), 0);
		return {
			messages: done.length,
			threads: sum((totals) => totals.threads),
			calls: sum((totals) => totals.calls),
			cost: sum((totals) => totals.cost),
			avgMs: done.length
				? done.reduce((total, turn) => total + (turn.clock.done ?? 0), 0) / done.length
				: 0
		};
	});

	$effect(() => {
		if (mode === 'replay' && !running) draft = replayNext;
	});

	function seconds(ms: number | undefined): string {
		return ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`;
	}
	function money(value: number | undefined | null): string {
		if (!value) return '$0';
		return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(3)}`;
	}
	function chars(value: number | undefined): string {
		if (value === undefined) return '';
		return value >= 1000 ? `${(value / 1000).toFixed(1)}k chars` : `${value} chars`;
	}
	function tone(turn: Turn, alias: string) {
		const index = turn.threads.findIndex((thread) => thread.alias === alias);
		const order =
			index >= 0 ? index : [...new Set(turn.items.map((item) => item.to))].indexOf(alias);
		return TONES[Math.max(0, order) % TONES.length]!;
	}

	/** The message split into plain text and the pieces the plan placed. */
	function segments(turn: Turn) {
		const marks = turn.items
			.filter((item) => item.match !== 'none' && item.end > item.start)
			.sort((a, b) => a.start - b.start);
		const out: { text: string; item: DumpItem | null }[] = [];
		let at = 0;
		for (const item of marks) {
			if (item.start < at) continue;
			if (item.start > at) out.push({ text: turn.message.slice(at, item.start), item: null });
			out.push({ text: turn.message.slice(item.start, item.end), item });
			at = item.end;
		}
		if (at < turn.message.length) out.push({ text: turn.message.slice(at), item: null });
		return out;
	}

	function history(): ChatHistoryTurn[] {
		return turns
			.filter((turn) => turn.status === 'done')
			.map((turn) => ({
				user: turn.message,
				answer: turn.answer,
				threads: turn.threads.flatMap((thread) => (thread.report ? [thread.report] : []))
			}));
	}

	function threadFor(turn: Turn, alias: string): ThreadView {
		let thread = turn.threads.find((entry) => entry.alias === alias);
		if (!thread) {
			turn.threads.push({
				alias,
				name: alias,
				pieces: [],
				stage: 'reading',
				steps: [],
				related: [],
				changes: []
			});
			thread = turn.threads.at(-1)!;
		}
		return thread;
	}

	async function send(text = draft) {
		const message = text.trim();
		if (running || (mode === 'live' && !message)) return;
		const priorHistory = history();
		for (const turn of turns) turn.open = false;
		turns.push({
			id: Date.now(),
			mode,
			message,
			sentences: [],
			items: [],
			threads: [],
			answer: '',
			status: 'running',
			planModel: null,
			planCost: null,
			clock: {},
			open: true
		});
		const turn = turns.at(-1)!;
		draft = '';
		const sentAt = performance.now();
		const now = () => Math.round(performance.now() - sentAt);
		controller = new AbortController();
		await tick();
		listEl?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });

		try {
			const response = await fetch('/api/lab/thread-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					history: priorHistory,
					projectId: scope || null,
					mode
				}),
				signal: controller.signal
			});
			if (!response.ok || !response.body) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.error ?? `Request failed (${response.status})`);
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let pending = '';
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				pending += decoder.decode(value, { stream: true });
				const lines = pending.split('\n');
				pending = lines.pop() ?? '';
				for (const line of lines)
					if (line.trim()) apply(turn, JSON.parse(line) as ChatTurnEvent, now);
			}
			if (pending.trim()) apply(turn, JSON.parse(pending) as ChatTurnEvent, now);
			if (turn.status === 'running') turn.status = 'done';
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				turn.status = 'error';
				turn.error = 'Stopped.';
			} else {
				turn.status = 'error';
				turn.error = error instanceof Error ? error.message : 'Something went wrong';
			}
		} finally {
			controller = null;
		}
	}

	function apply(turn: Turn, event: ChatTurnEvent, now: () => number) {
		switch (event.type) {
			case 'start':
				turn.message = event.message;
				turn.sentences = event.sentences;
				break;
			case 'item':
				turn.items.push(event.item);
				break;
			case 'planned':
				turn.clock.planned = now();
				turn.planModel = event.model;
				turn.planCost = event.cost;
				for (const planned of event.threads) {
					const thread = threadFor(turn, planned.alias);
					thread.name = planned.name;
					thread.pieces = planned.pieces;
				}
				break;
			case 'thread_status': {
				const thread = threadFor(turn, event.alias);
				thread.stage = event.stage;
				thread.note = event.note;
				break;
			}
			case 'thread_step': {
				const thread = threadFor(turn, event.alias);
				const at = thread.steps.findIndex((step) => step.id === event.step.id);
				if (at >= 0) thread.steps[at] = event.step;
				else thread.steps.push(event.step);
				break;
			}
			case 'thread_found':
				threadFor(turn, event.alias).related = event.records;
				break;
			case 'thread_change':
				turn.clock.firstChange ??= now();
				threadFor(turn, event.alias).changes.push(event.change);
				break;
			case 'thread_done': {
				const thread = threadFor(turn, event.alias);
				thread.calls = event.calls;
				thread.cost = event.cost;
				thread.ms = event.ms;
				thread.report = event.report;
				break;
			}
			case 'answer_start':
				turn.clock.answerStart = now();
				break;
			case 'answer_delta':
				turn.answer += event.text;
				break;
			case 'answer_done':
				turn.answer = event.text;
				break;
			case 'done':
				turn.clock.done = now();
				turn.totals = event.totals;
				turn.status = 'done';
				break;
			case 'error':
				turn.status = 'error';
				turn.error = event.message;
				break;
		}
	}

	function reply(turn: Turn, change: ChatChange, choice: 'yes' | 'no') {
		answered[`${turn.id}:${change.qn}`] = choice;
		void send(choice === 'yes' ? `Yes to ${change.qn}.` : `No to ${change.qn}, leave it.`);
	}

	function reset() {
		controller?.abort();
		turns = [];
		answered = {};
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void send();
		}
	}

	function summary(turn: Turn): string {
		const all = turn.threads.flatMap((thread) => thread.changes);
		const saved = all.filter((change) => change.status === 'applied').length;
		const asked = all.filter((change) => change.status === 'ask').length;
		const reads = turn.threads.reduce(
			(total, thread) => total + thread.steps.filter((step) => step.kind === 'read').length,
			0
		);
		return [
			`${turn.threads.length} thread${turn.threads.length === 1 ? '' : 's'}`,
			`${reads} read${reads === 1 ? '' : 's'}`,
			`${saved} saved`,
			asked ? `${asked} to confirm` : ''
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<svelte:head>
	<title>Chat with threads · Lab</title>
</svelte:head>

{#snippet spinner(size = 'h-3.5 w-3.5')}
	<span
		class="inline-block {size} shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-accent align-[-2px]"
		aria-hidden="true"
	></span>
{/snippet}

{#snippet stepIcon(state: ThreadStep['state'])}
	{#if state === 'running'}
		{@render spinner('h-3 w-3')}
	{:else if state === 'failed'}
		<span class="w-3 text-center text-xs text-destructive" aria-label="failed">✕</span>
	{:else}
		<span class="w-3 text-center text-xs text-success" aria-label="done">✓</span>
	{/if}
{/snippet}

{#snippet changeRow(turn: Turn, change: ChatChange)}
	{@const key = `${turn.id}:${change.qn}`}
	<li
		class="rounded-md border px-2.5 py-2 text-sm {change.status === 'ask'
			? 'border-warning/50 bg-warning/10'
			: change.status === 'info'
				? 'border-border bg-muted/40'
				: 'border-success/40 bg-success/5'}"
	>
		{#if change.op === 'answer'}
			<div class="flex gap-2">
				<span
					class="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
					>Answer</span
				>
				<p class="text-foreground">{change.text}</p>
			</div>
			{#if change.records.length}
				<p class="mt-1 text-xs text-muted-foreground">
					From {change.records.map((record) => record.title).join(', ')}
				</p>
			{/if}
		{:else}
			<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				{#if change.status === 'ask'}
					<span class="rounded bg-warning/30 px-1.5 text-xs font-semibold text-foreground"
						>{change.qn}</span
					>
				{:else if change.status === 'applied'}
					<span class="text-xs font-semibold text-success">Saved</span>
				{:else}
					<span class="text-xs font-semibold text-muted-foreground">Already there</span>
				{/if}
				{#if change.op === 'update'}
					<span class="text-xs text-muted-foreground"
						>{KIND_LABEL[change.record.kind]}</span
					>
					<span class="font-medium text-foreground">{change.record.title}</span>
				{:else if change.op === 'create'}
					<span class="text-xs text-muted-foreground"
						>New {KIND_LABEL[change.kind]?.toLowerCase()}</span
					>
					<span class="font-medium text-foreground">{change.title}</span>
					{#if change.due}<span class="text-xs text-muted-foreground"
							>due {change.due}</span
						>{/if}
				{:else if change.op === 'archive'}
					<span class="text-xs text-muted-foreground"
						>Archive {KIND_LABEL[change.record.kind]?.toLowerCase()}</span
					>
					<span class="font-medium text-foreground line-through decoration-destructive/60"
						>{change.record.title}</span
					>
				{:else if change.op === 'covered'}
					<span class="font-medium text-foreground">{change.record.title}</span>
				{/if}
			</div>
			{#if change.op === 'update'}
				<ul class="mt-1 space-y-0.5 text-xs">
					{#each change.fields as field (field.field)}
						<li class="flex flex-wrap gap-x-1.5">
							<span class="text-muted-foreground">{FIELD_LABEL[field.field]}</span>
							{#if field.field === 'add'}
								<span class="text-foreground">+ {field.after}</span>
							{:else}
								<span class="text-muted-foreground line-through"
									>{field.before ?? 'none'}</span
								>
								<span class="text-muted-foreground">→</span>
								<span class="font-medium text-foreground">{field.after}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if change.op === 'create' && change.body}
				<details class="mt-1">
					<summary class="cursor-pointer text-xs text-muted-foreground"
						>Show the draft</summary
					>
					<pre
						class="mt-1 whitespace-pre-wrap rounded bg-muted/60 p-2 font-sans text-xs text-foreground">{change.body}</pre>
				</details>
			{/if}
			{#if change.status === 'ask'}
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<span class="text-sm text-foreground">{change.question}</span>
					{#if answered[key]}
						<span class="text-xs text-muted-foreground">You said {answered[key]}.</span>
					{:else}
						<button
							type="button"
							class="rounded border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
							disabled={running}
							onclick={() => reply(turn, change, 'yes')}>Yes</button
						>
						<button
							type="button"
							class="rounded border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
							disabled={running}
							onclick={() => reply(turn, change, 'no')}>No</button
						>
					{/if}
				</div>
			{:else if 'why' in change && change.why}
				<p class="mt-0.5 text-xs text-muted-foreground">{change.why}</p>
			{/if}
		{/if}
	</li>
{/snippet}

{#snippet threadCard(turn: Turn, thread: ThreadView)}
	{@const color = tone(turn, thread.alias)}
	<article class="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
		<header class="flex items-center gap-2">
			<span class="h-2.5 w-2.5 shrink-0 rounded-full {color.dot}" aria-hidden="true"></span>
			<h3 class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
				{thread.name}
			</h3>
			{#if thread.stage === 'done'}
				<span class="font-mono text-xs tabular-nums text-muted-foreground">
					{seconds(thread.ms)}{thread.calls ? ` · ${thread.calls} calls` : ''}{thread.cost
						? ` · ${money(thread.cost)}`
						: ''}
				</span>
			{:else if thread.stage === 'failed'}
				<span class="text-xs text-destructive">Failed</span>
			{:else}
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					{@render spinner('h-3 w-3')}{STAGE_LABEL[thread.stage]}
				</span>
			{/if}
		</header>
		{#if thread.pieces.length}
			<ul class="flex flex-wrap gap-1">
				{#each thread.pieces as n (n)}
					{@const item = turn.items.find((entry) => entry.n === n)}
					{#if item}
						<li
							class="rounded px-1.5 py-0.5 text-xs text-foreground {color.mark}"
							title={item.title}
						>
							“{item.quote || item.title}”
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
		{#if thread.note}
			<p class="text-xs text-destructive">{thread.note}</p>
		{/if}
		{#if thread.steps.length}
			<ol class="space-y-1 border-l border-border pl-2.5">
				{#each thread.steps as step (step.id)}
					<li class="flex items-start gap-2 text-xs">
						<span class="mt-0.5">{@render stepIcon(step.state)}</span>
						<span class="min-w-0 flex-1">
							<span class="font-medium text-foreground">{step.label}</span>
							{#if step.detail}<span class="text-muted-foreground">
									— {step.detail}</span
								>{/if}
						</span>
						<span class="shrink-0 font-mono tabular-nums text-muted-foreground">
							{step.chars !== undefined ? `${chars(step.chars)} · ` : ''}{step.ms !==
							undefined
								? `${(step.ms / 1000).toFixed(1)} s`
								: ''}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
		{#if thread.changes.length}
			<ul class="flex flex-col gap-1.5">
				{#each thread.changes as change, index (index)}
					{@render changeRow(turn, change)}
				{/each}
			</ul>
		{/if}
	</article>
{/snippet}

<div class="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold text-foreground">Chat with threads</h1>
			<p class="text-sm text-muted-foreground">
				Lab. Each message splits into one thread per project; every read and change shows
				below the reply. Changes are shown, not saved yet.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<div
				class="flex rounded-md border border-border bg-card p-0.5"
				role="group"
				aria-label="Mode"
			>
				<button
					type="button"
					class="rounded px-2.5 py-1 {mode === 'replay'
						? 'bg-foreground text-background'
						: 'text-muted-foreground'}"
					disabled={running}
					onclick={() => (mode = 'replay')}>Replay (free)</button
				>
				<button
					type="button"
					class="rounded px-2.5 py-1 {mode === 'live'
						? 'bg-foreground text-background'
						: 'text-muted-foreground'}"
					disabled={running}
					onclick={() => {
						mode = 'live';
						draft = '';
					}}>Live (paid)</button
				>
			</div>
			{#if mode === 'live'}
				<label class="sr-only" for="scope">Projects</label>
				<select
					id="scope"
					bind:value={scope}
					disabled={running}
					class="max-w-48 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
				>
					<option value="">All active projects</option>
					{#each data.projects as project (project.id)}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
			{/if}
			<button
				type="button"
				class="rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
				disabled={!turns.length}
				onclick={reset}>New chat</button
			>
		</div>
	</header>

	{#if conversation.messages}
		<section
			aria-label="Conversation so far"
			class="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm sm:grid-cols-5"
		>
			<div>
				<div class="text-xs text-muted-foreground">Messages</div>
				<div class="font-mono tabular-nums">{conversation.messages}</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Threads</div>
				<div class="font-mono tabular-nums">{conversation.threads}</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Model calls</div>
				<div class="font-mono tabular-nums">{conversation.calls}</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Cost so far</div>
				<div class="font-mono tabular-nums">{money(conversation.cost)}</div>
			</div>
			<div>
				<div class="text-xs text-muted-foreground">Avg. reply time</div>
				<div class="font-mono tabular-nums">{seconds(conversation.avgMs)}</div>
			</div>
		</section>
	{/if}

	<div bind:this={listEl} class="flex flex-1 flex-col gap-6">
		{#if !turns.length}
			<p
				class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
			>
				{mode === 'replay'
					? 'Replay runs a scripted three-message conversation over sample projects, through the same code as a live turn. Press Send.'
					: 'Talk about one or several projects: updates, questions, things to drop, or a bigger job like "look at what we have and draft a plan". Each message costs about a cent.'}
			</p>
		{/if}

		{#each turns as turn (turn.id)}
			<section class="flex flex-col gap-3" aria-label="Message">
				<!-- The person's message, with each placed piece marked in its thread's color. -->
				<div
					class="ml-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-base leading-relaxed text-foreground"
				>
					{#each segments(turn) as segment, index (index)}
						{#if segment.item}
							<mark
								class="rounded px-0.5 text-foreground underline decoration-2 underline-offset-4 {tone(
									turn,
									segment.item.to
								).mark}"
								title="{segment.item.kind} → {turn.threads.find(
									(thread) => thread.alias === segment.item?.to
								)?.name ?? segment.item.to}">{segment.text}</mark
							>
						{:else}{segment.text}{/if}
					{/each}
				</div>

				<div class="flex flex-col gap-2">
					<!-- Plan -->
					<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						{#if turn.clock.planned === undefined && turn.status === 'running'}
							{@render spinner('h-3 w-3')}<span>Planning…</span>
						{:else if turn.threads.length}
							<span
								>Split into {turn.threads.length} thread{turn.threads.length === 1
									? ''
									: 's'} at {seconds(turn.clock.planned)}</span
							>
							{#if !turn.open}
								<span>· {summary(turn)}</span>
							{/if}
							<button
								type="button"
								class="ml-auto underline-offset-2 hover:underline"
								onclick={() => (turn.open = !turn.open)}
								>{turn.open ? 'Hide threads' : 'Show threads'}</button
							>
						{:else if turn.clock.planned !== undefined}
							<span>No project work in this message.</span>
						{/if}
					</div>

					{#if turn.open && turn.threads.length}
						<div class="grid gap-3 {turn.threads.length > 1 ? 'md:grid-cols-2' : ''}">
							{#each turn.threads as thread (thread.alias)}
								{@render threadCard(turn, thread)}
							{/each}
						</div>
					{/if}

					<!-- Reply -->
					{#if turn.answer || turn.clock.answerStart !== undefined}
						<div
							class="rounded-lg border border-border bg-card px-3 py-2.5 text-base leading-relaxed whitespace-pre-line text-foreground"
						>
							{turn.answer}{#if turn.status === 'running'}<span
									class="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/50 align-[-2px]"
								></span>{/if}
						</div>
					{:else if turn.threads.length && turn.status === 'running'}
						<p class="flex items-center gap-2 text-xs text-muted-foreground">
							{@render spinner('h-3 w-3')}Reply comes when every thread is done
						</p>
					{/if}

					{#if turn.error}
						<p
							class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
						>
							{turn.error}
						</p>
					{/if}

					{#if turn.totals}
						<p class="font-mono text-xs tabular-nums text-muted-foreground">
							{turn.mode === 'replay' ? 'replay · ' : ''}first change {seconds(
								turn.clock.firstChange
							)} · reply started {seconds(turn.clock.answerStart)} · done {seconds(
								turn.clock.done
							)}
							· {turn.totals.threads} thread{turn.totals.threads === 1 ? '' : 's'}
							{#if turn.totals.threads > 1}({seconds(turn.totals.threadMsSum)} of thread
								work in {seconds(turn.totals.slowestThreadMs)}){/if}
							· {turn.totals.calls} calls · {money(turn.totals.cost)} · {Math.round(
								turn.totals.promptChars / 1000
							)}k prompt chars
							{#if turn.planModel && turn.mode === 'live'}· {turn.planModel}{/if}
						</p>
					{/if}
				</div>
			</section>
		{/each}
	</div>

	<form
		class="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background pt-3 pb-2"
		onsubmit={(event) => {
			event.preventDefault();
			void send();
		}}
	>
		<label for="chat-input" class="sr-only">Message</label>
		<textarea
			id="chat-input"
			bind:value={draft}
			onkeydown={onKeydown}
			rows="3"
			readonly={mode === 'replay'}
			placeholder="Finished the sampler video. Push the Priya email to Friday. What did we decide about uploads?"
			class="w-full resize-y rounded-lg border border-border bg-card p-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
		></textarea>
		<div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
			<span
				>{mode === 'replay'
					? 'Replay sends the next scripted message.'
					: '⌘ Enter to send · about a cent a message'}</span
			>
			<div class="flex gap-2">
				{#if running}
					<button
						type="button"
						class="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
						onclick={() => controller?.abort()}>Stop</button
					>
				{/if}
				<button
					type="submit"
					class="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
					disabled={running || (mode === 'live' && !draft.trim())}>Send</button
				>
			</div>
		</div>
	</form>
</div>
