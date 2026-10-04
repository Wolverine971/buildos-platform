<!-- apps/web/src/lib/components/consolidation/ConsolidationQuestionCard.svelte -->
<!--
	One consolidation question, asked the way Claude Code asks in the terminal: a
	short header, the question, the evidence, 2-4 options with the recommended one
	first, then "Type something" and "Chat about this". Keys 1-N pick, arrows
	move, Enter confirms. Typed text and chat end in a read-back the owner
	confirms; nothing runs on words alone.
-->
<script lang="ts">
	import {
		orderedOptions,
		type ConsolidationQuestion
	} from '@buildos/shared-agent-ops/consolidation';
	import Button from '$lib/components/ui/Button.svelte';
	import { MessageSquare, PencilLine } from '$lib/icons/lucide';

	type SubmitResult = { reply?: string | null } | void;

	let {
		question,
		describe,
		busy = false,
		onSubmit
	}: {
		question: ConsolidationQuestion;
		/** Plain words for an option's operations ("Moves 11 docs to Beyond Exit Planning."). */
		describe: (optionId: string) => string;
		busy?: boolean;
		onSubmit: (body: Record<string, unknown>) => Promise<SubmitResult>;
	} = $props();

	type Row =
		| { kind: 'option'; id: string; label: string; description: string; recommended: boolean }
		| {
				kind: 'type' | 'chat';
				id: string;
				label: string;
				description: string;
				recommended: false;
		  };

	const rows = $derived<Row[]>([
		...orderedOptions(question).map((option) => ({
			kind: 'option' as const,
			id: option.id,
			label: option.label,
			description: option.description,
			recommended: option.id === question.recommended_option_id
		})),
		{
			kind: 'type',
			id: '__type',
			label: 'Type something',
			description: 'Say it your way. You see how it was read before anything runs.',
			recommended: false
		},
		{
			kind: 'chat',
			id: '__chat',
			label: 'Chat about this',
			description: 'Talk it through here. The rest of the run keeps going.',
			recommended: false
		}
	]);

	// The card opens on its draft when one exists, so a reload keeps the thread.
	let selected = $state(0);
	let mode = $state<'pick' | 'type' | 'chat'>('pick');
	let typed = $state('');
	let chatInput = $state('');
	let reply = $state<string | null>(null);
	let error = $state<string | null>(null);
	let seeded = $state<string | null>(null);

	$effect(() => {
		// Re-seed only when a different question arrives.
		if (seeded === question.id) return;
		seeded = question.id;
		selected = 0;
		reply = null;
		error = null;
		typed = question.draft?.via === 'text' ? (question.draft.text ?? '') : '';
		mode =
			question.draft?.via === 'chat'
				? 'chat'
				: question.draft?.via === 'text'
					? 'type'
					: 'pick';
		if (mode !== 'pick') selected = rows.findIndex((row) => row.kind === mode);
	});

	const current = $derived(rows[selected]);
	const draft = $derived(question.draft);
	const reading = $derived(draft?.reading ?? null);
	const thread = $derived(draft?.via === 'chat' ? draft.thread : []);
	const radioName = $derived(`consolidation-${question.id}`);

	async function run(body: Record<string, unknown>) {
		error = null;
		try {
			const result = await onSubmit(body);
			reply = result && 'reply' in result ? (result.reply ?? null) : null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'That did not save. Try again.';
		}
	}

	function choose(index: number) {
		selected = index;
		const row = rows[index];
		if (row?.kind === 'type' || row?.kind === 'chat') mode = row.kind;
		else mode = 'pick';
	}

	async function confirm() {
		if (busy || !current) return;
		if (current.kind === 'option') return run({ via: 'option', option_id: current.id });
		if (current.kind === 'type') {
			if (reading && draft?.via === 'text' && draft.text === typed.trim())
				return run({ via: 'confirm' });
			if (typed.trim()) return run({ via: 'text', text: typed });
			focusField('type');
			return;
		}
		if (reading && draft?.via === 'chat') return run({ via: 'confirm' });
		focusField('chat');
	}

	let cardEl = $state<HTMLElement | null>(null);
	function focusField(kind: 'type' | 'chat') {
		queueMicrotask(() => cardEl?.querySelector<HTMLElement>(`[data-field="${kind}"]`)?.focus());
	}
	function focusRow(index: number) {
		queueMicrotask(() => cardEl?.querySelector<HTMLElement>(`[data-row="${index}"]`)?.focus());
	}

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
		if (typing) {
			if (event.key === 'Escape') {
				event.preventDefault();
				focusRow(selected);
			}
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const digit = Number.parseInt(event.key, 10);
		if (digit >= 1 && digit <= rows.length) {
			event.preventDefault();
			choose(digit - 1);
			const row = rows[digit - 1];
			if (row?.kind === 'type' || row?.kind === 'chat') focusField(row.kind);
			else focusRow(digit - 1);
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const next =
				(selected + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
			choose(next);
			focusRow(next);
			return;
		}
		// Enter on Skip or Send does that button's own thing, never the selected row.
		if (
			event.key === 'Enter' &&
			!(target?.closest('button') && !target.closest('[data-row]'))
		) {
			event.preventDefault();
			void confirm();
		}
	}

	/**
	 * What confirming will do. A reading that maps to an option shows that
	 * option's own effect, never the model's sentence about it.
	 */
	function readingEffect(value: NonNullable<typeof reading>): string {
		if (!value.option_id) return value.readback;
		const option = question.options.find((item) => item.id === value.option_id);
		return option ? `${option.label}: ${describe(option.id)}` : value.readback;
	}

	function onFieldKeydown(event: KeyboardEvent, kind: 'type' | 'chat') {
		if (event.key !== 'Enter' || event.shiftKey || busy) return;
		event.preventDefault();
		if (kind === 'type' && typed.trim()) void run({ via: 'text', text: typed });
		if (kind === 'chat' && chatInput.trim()) {
			const message = chatInput;
			chatInput = '';
			void run({ via: 'chat', message });
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	bind:this={cardEl}
	class="card tx tx-frame tx-weak wt-card"
	aria-labelledby="{radioName}-q"
	onkeydown={onKeydown}
>
	<div class="grid gap-3 p-4 sm:p-5">
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
			<span class="chip font-mono">{question.header}</span>
			<h3
				id="{radioName}-q"
				class="min-w-0 text-base font-semibold leading-snug text-foreground"
			>
				{question.question}
			</h3>
		</div>

		{#if question.evidence.length}
			<ul class="evidence grid gap-1 text-sm text-muted-foreground">
				{#each question.evidence as item (item.document_id + item.quote)}
					<li class="min-w-0">
						<span class="font-medium text-foreground">{item.source}</span>
						<q class="italic">{item.quote}</q>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="grid gap-0.5" role="radiogroup" aria-labelledby="{radioName}-q">
			{#each rows as row, index (row.id)}
				<button
					type="button"
					role="radio"
					class="row"
					class:alt={row.kind !== 'option'}
					data-row={index}
					aria-checked={index === selected}
					tabindex={index === selected ? 0 : -1}
					disabled={busy}
					onclick={() => {
						if (index === selected && row.kind === 'option') void confirm();
						else {
							choose(index);
							if (row.kind !== 'option') focusField(row.kind);
						}
					}}
				>
					<span class="key font-mono">{index + 1}.</span>
					<span class="label">
						{#if row.kind === 'type'}<PencilLine class="mr-1 inline h-3.5 w-3.5" />{/if}
						{#if row.kind === 'chat'}<MessageSquare
								class="mr-1 inline h-3.5 w-3.5"
							/>{/if}
						{row.label}
						{#if row.recommended}<span class="rec font-mono">Recommended</span>{/if}
					</span>
					<span class="desc">{row.description}</span>
				</button>
			{/each}
		</div>

		{#if current?.kind === 'option'}
			<p class="effect text-sm">
				<span class="font-mono">Will do</span>
				{describe(current.id)}
			</p>
		{:else if current?.kind === 'type'}
			<div class="grid gap-2">
				<label class="sr-only" for="{radioName}-type">Your answer</label>
				<textarea
					id="{radioName}-type"
					data-field="type"
					class="field"
					rows="3"
					maxlength="2000"
					placeholder="e.g. move them, but keep the May meeting prep in Wayne"
					bind:value={typed}
					onkeydown={(event) => onFieldKeydown(event, 'type')}
					disabled={busy}
				></textarea>
				{#if reply && !reading}
					<p class="text-sm text-foreground">{reply}</p>
				{/if}
				{#if reading && draft?.via === 'text' && draft.text === typed.trim()}
					<p class="effect text-sm">
						<span class="font-mono">Read as</span>
						{readingEffect(reading)}
					</p>
				{/if}
			</div>
		{:else if current?.kind === 'chat'}
			<div class="grid gap-2">
				{#if thread.length}
					<ol
						class="thread grid gap-2 text-sm"
						aria-label="Conversation about this question"
					>
						{#each thread as line, index (index)}
							<li class:me={line.role === 'user'}>{line.text}</li>
						{/each}
					</ol>
				{/if}
				<label class="sr-only" for="{radioName}-chat">Message</label>
				<textarea
					id="{radioName}-chat"
					data-field="chat"
					class="field"
					rows="2"
					maxlength="2000"
					placeholder="Ask about these docs, or say what you want"
					bind:value={chatInput}
					onkeydown={(event) => onFieldKeydown(event, 'chat')}
					disabled={busy}
				></textarea>
				{#if reading && draft?.via === 'chat'}
					<p class="effect text-sm">
						<span class="font-mono">Use this answer</span>
						{readingEffect(reading)}
					</p>
				{/if}
			</div>
		{/if}

		{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
	</div>

	<div class="foot">
		<span class="hint font-mono">1–{rows.length} pick · Enter confirm</span>
		<div class="flex flex-wrap gap-2">
			<Button variant="ghost" size="sm" disabled={busy} onclick={() => run({ via: 'skip' })}>
				Skip
			</Button>
			{#if current?.kind === 'chat' && !(reading && draft?.via === 'chat')}
				<Button
					variant="secondary"
					size="sm"
					loading={busy}
					disabled={!chatInput.trim()}
					onclick={() => {
						const message = chatInput;
						chatInput = '';
						void run({ via: 'chat', message });
					}}
				>
					Send
				</Button>
			{:else}
				<Button variant="primary" size="sm" loading={busy} onclick={confirm}>
					{#if current?.kind === 'type' && !(reading && draft?.via === 'text' && draft.text === typed.trim())}
						Read it back
					{:else}
						Confirm
					{/if}
				</Button>
			{/if}
		</div>
	</div>
</section>

<style>
	.card {
		border: 1px solid hsl(var(--foreground) / 0.85);
		border-radius: 12px;
		background: hsl(var(--card));
		overflow: hidden;
	}
	.chip {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 4px;
		background: hsl(var(--foreground));
		color: hsl(var(--background));
		white-space: nowrap;
	}
	.evidence {
		border-left: 2px solid hsl(var(--border));
		padding-left: 12px;
	}
	.evidence q {
		margin-left: 4px;
	}
	.row {
		display: grid;
		grid-template-columns: 1.75rem minmax(0, 1fr);
		gap: 0 6px;
		text-align: left;
		padding: 7px 10px;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.row:hover:not(:disabled) {
		background: hsl(var(--muted));
	}
	.row[aria-checked='true'] {
		border-color: hsl(var(--accent));
		background: hsl(var(--accent) / 0.06);
	}
	.row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.row:disabled {
		cursor: default;
		opacity: 0.7;
	}
	.key {
		font-size: 13px;
		color: hsl(var(--muted-foreground));
		padding-top: 1px;
	}
	.row[aria-checked='true'] .key {
		color: hsl(var(--accent));
	}
	.label {
		font-weight: 600;
		font-size: 14px;
	}
	.alt .label {
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}
	.rec {
		margin-left: 8px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--accent));
	}
	.desc {
		grid-column: 2;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	.effect {
		padding: 8px 10px;
		border-radius: 8px;
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.effect span {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--success));
		margin-right: 6px;
	}
	.field {
		width: 100%;
		font: inherit;
		font-size: 14px;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		resize: vertical;
	}
	.field:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.thread li {
		max-width: 85%;
		padding: 7px 10px;
		border-radius: 10px;
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
		justify-self: start;
	}
	.thread li.me {
		justify-self: end;
		background: hsl(var(--accent) / 0.12);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		border-top: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
	}
	.hint {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
</style>
