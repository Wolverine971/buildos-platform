<!-- apps/web/src/lib/components/inbox/InboxEmailUpdatesStrip.svelte -->
<!--
	Tasker 154 (Gmail half): project updates the nightly email read proposed. Open by default
	(each card needs an answer); Apply makes the change, Not now drops the card. Nothing changes
	until the user presses Apply.
-->
<script lang="ts">
	import { buildEntityHref } from '@buildos/shared-types';
	import { ArrowUpRight, ChevronDown, ExternalLink, Mail } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatRelativeTime } from '$lib/utils/date-utils';

	export type EmailUpdateEntry = {
		id: string;
		project_id: string;
		project_name: string | null;
		action: 'create_task' | 'update_task';
		task_id?: string | null;
		proposal?: { title?: string; due_date?: string; state_key?: string };
		current?: { title: string; due_at: string | null; state_key: string | null } | null;
		title: string;
		why: string | null;
		email: {
			subject: string;
			from: string;
			account_email: string;
			received_at: string | null;
			/** Where in the subject the words the change came from sit. */
			subject_quote?: { start: number; end: number };
		};
		gmail_url: string | null;
		created_at: string;
	};

	let {
		entries,
		onDecided
	}: {
		entries: EmailUpdateEntry[];
		/** After a card is applied or dismissed. */
		onDecided?: (entry: EmailUpdateEntry, decision: 'apply' | 'dismiss') => void;
	} = $props();

	const uid = $props.id();
	let open = $state(true);
	let busy = $state<{ id: string; decision: 'apply' | 'dismiss' } | null>(null);
	let decided = $state.raw<Map<string, 'apply' | 'dismiss'>>(new Map());
	let errors = $state.raw<Map<string, string>>(new Map());

	const visible = $derived(entries.filter((entry) => !decided.has(entry.id)));
	const appliedCount = $derived([...decided.values()].filter((d) => d === 'apply').length);

	type ChangeRow = { label: string; before: string | null; after: string };

	// Display only: a status key as words ("in_progress" → "In progress").
	function stateLabel(stateKey: string | null | undefined): string | null {
		const words = (stateKey ?? '').replaceAll('_', ' ').trim();
		if (!words) return null;
		if (words === 'todo') return 'To do';
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	// A civil date ("2026-11-13") or a timestamp, as "Nov 13". Civil dates stay on their day.
	function dayLabel(value: string | null | undefined): string | null {
		if (!value) return null;
		const civil = /^\d{4}-\d{2}-\d{2}$/.test(value);
		const date = new Date(civil ? `${value}T12:00:00Z` : value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			...(civil ? { timeZone: 'UTC' } : {})
		});
	}

	/** What Apply will change, before → after, from the card's own proposal (tasker 156). */
	function changeRows(entry: EmailUpdateEntry): ChangeRow[] {
		const proposal = entry.proposal ?? {};
		const current = entry.action === 'update_task' ? (entry.current ?? null) : null;
		const rows: ChangeRow[] = [];
		if (proposal.title && proposal.title !== current?.title) {
			rows.push({
				label: entry.action === 'create_task' ? 'New task' : 'Title',
				before: current?.title || null,
				after: proposal.title
			});
		}
		const due = dayLabel(proposal.due_date);
		if (due) rows.push({ label: 'Due', before: dayLabel(current?.due_at), after: due });
		const status = stateLabel(proposal.state_key);
		if (status) {
			rows.push({ label: 'Status', before: stateLabel(current?.state_key), after: status });
		}
		return rows.filter((row) => row.before !== row.after);
	}

	/** The subject split around the words the change came from, for a highlight. */
	function subjectParts(email: EmailUpdateEntry['email']): [string, string, string] | null {
		const span = email.subject_quote;
		if (!span) return null;
		const { start, end } = span;
		if (!(start >= 0 && end > start && end <= email.subject.length)) return null;
		return [
			email.subject.slice(0, start),
			email.subject.slice(start, end),
			email.subject.slice(end)
		];
	}

	function senderName(from: string): string {
		// "Jane Doe <jane@acme.com>" → "Jane Doe" (a header format, not language).
		const name = from.split('<')[0]?.trim().replace(/^"|"$/g, '');
		return name || from;
	}

	async function decide(entry: EmailUpdateEntry, decision: 'apply' | 'dismiss') {
		if (busy) return;
		busy = { id: entry.id, decision };
		const nextErrors = new Map(errors);
		nextErrors.delete(entry.id);
		errors = nextErrors;
		try {
			const res = await fetch(`/api/inbox/email-updates/${encodeURIComponent(entry.id)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ decision })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok || json?.data?.ok === false) {
				throw new Error(json?.data?.message ?? json?.error ?? 'Could not save that');
			}
			decided = new Map(decided).set(entry.id, decision);
			onDecided?.(entry, decision);
		} catch (error) {
			errors = new Map(errors).set(
				entry.id,
				error instanceof Error ? error.message : 'Could not save that'
			);
		} finally {
			busy = null;
		}
	}
</script>

{#if visible.length || appliedCount}
	<div class="border-b border-border bg-accent/5 px-3 py-1.5">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-controls={`${uid}-list`}
			class="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span class="flex min-w-0 items-center gap-1.5">
				<Mail class="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
				<span class="min-w-0 truncate">
					<span class="font-semibold text-foreground">From your email:</span>
					<span class="text-muted-foreground">
						{#if visible.length}
							{visible.length} suggested update{visible.length === 1 ? '' : 's'}
						{:else}
							all handled
						{/if}
						{#if appliedCount}· {appliedCount} applied{/if}
					</span>
				</span>
			</span>
			<ChevronDown
				class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {open
					? 'rotate-180'
					: ''}"
				aria-hidden="true"
			/>
		</button>
		{#if open && visible.length}
			<ul
				id={`${uid}-list`}
				class="max-h-[40dvh] space-y-1.5 overflow-y-auto overscroll-contain pb-1.5 pt-0.5"
			>
				{#each visible as entry (entry.id)}
					{@const error = errors.get(entry.id)}
					{@const rows = changeRows(entry)}
					{@const parts = subjectParts(entry.email)}
					{@const taskHref =
						entry.action === 'update_task' && entry.task_id
							? buildEntityHref('task', entry.task_id, entry.project_id)
							: null}
					<li
						class="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="min-w-0">
							<p class="break-words text-xs font-medium text-foreground">
								{entry.title}
							</p>
							{#if entry.why}
								<p class="mt-0.5 break-words text-2xs text-foreground/80">
									{entry.why}
								</p>
							{/if}
							<p class="mt-0.5 break-words text-2xs text-muted-foreground">
								{#if entry.project_name}{entry.project_name} ·
								{/if}{senderName(entry.email.from)}: “{#if parts}{parts[0]}<mark
										class="rounded-sm bg-accent/20 px-0.5 text-foreground"
										>{parts[1]}</mark
									>{parts[2]}{:else}{entry.email
										.subject}{/if}”{#if entry.email.received_at}
									· {formatRelativeTime(entry.email.received_at)}{/if}
								{#if entry.gmail_url}
									<a
										href={entry.gmail_url}
										target="_blank"
										rel="noopener noreferrer"
										class="ml-1 inline-flex items-center gap-0.5 text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										aria-label={`Open the email “${entry.email.subject}” in Gmail`}
									>
										Open<ExternalLink class="h-3 w-3" aria-hidden="true" />
									</a>
								{/if}
							</p>
							{#if rows.length || taskHref}
								<ul class="mt-1 space-y-0.5" aria-label="What Apply changes">
									{#if taskHref && entry.current?.title}
										<li class="text-2xs">
											<span class="font-medium text-muted-foreground"
												>Task:</span
											>
											<a
												href={taskHref}
												target="_blank"
												rel="noopener"
												class="inline-flex items-center gap-0.5 font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>{entry.current.title}<ArrowUpRight
													class="h-3 w-3 shrink-0"
													aria-hidden="true"
												/><span class="sr-only">(opens in a new tab)</span
												></a
											>
										</li>
									{/if}
									{#each rows as row (row.label)}
										<li class="break-words text-2xs">
											<span class="font-medium text-muted-foreground"
												>{row.label}:</span
											>
											{#if row.before}
												<span class="text-muted-foreground"
													>{row.before}</span
												>
												<span
													class="text-muted-foreground"
													aria-hidden="true">→</span
												>
												<span class="sr-only">changes to</span>
											{/if}
											<span class="text-foreground/90">{row.after}</span>
										</li>
									{/each}
								</ul>
							{/if}
							{#if error}
								<p role="alert" class="mt-0.5 text-2xs text-destructive">{error}</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-1.5">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => decide(entry, 'dismiss')}
								loading={busy?.id === entry.id && busy.decision === 'dismiss'}
								disabled={Boolean(busy)}
								aria-label={`Not now: ${entry.title}`}
								class="text-xs"
							>
								Not now
							</Button>
							<Button
								variant="primary"
								size="sm"
								onclick={() => decide(entry, 'apply')}
								loading={busy?.id === entry.id && busy.decision === 'apply'}
								disabled={Boolean(busy)}
								aria-label={`Apply: ${entry.title}`}
								class="text-xs"
							>
								Apply
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
