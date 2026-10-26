<!-- apps/web/src/lib/components/email-campaigns/ReviewList.svelte -->
<!--
	The heart of a campaign: every person's subject and opening line, with
	what shaped it (tailored / edited / imported), and whether they're in.
-->
<script lang="ts">
	import { ChevronRight, Search } from 'lucide-svelte';
	import { renderCampaignEmail } from '$lib/email-campaigns/render';
	import type { CampaignRecipientView } from '$lib/email-campaigns/types';
	import {
		daysSince,
		displayName,
		firstLine,
		segmentChipLabel
	} from '$lib/email-campaigns/ui-helpers';

	type Filter = 'all' | 'included' | 'excluded' | 'own' | 'template' | 'attention';

	let {
		subjectTemplate,
		bodyTemplate,
		recipients,
		editable,
		pendingIds = new Set<string>(),
		onopen,
		ontoggle
	}: {
		subjectTemplate: string;
		bodyTemplate: string;
		recipients: CampaignRecipientView[];
		editable: boolean;
		pendingIds?: Set<string>;
		onopen: (recipientId: string) => void;
		ontoggle: (recipient: CampaignRecipientView, included: boolean) => void;
	} = $props();

	let search = $state('');
	let filter = $state<Filter>('all');

	interface Row {
		recipient: CampaignRecipientView;
		subject: string;
		opening: string;
		empty: boolean;
		recentDays: number | null;
	}

	const rows = $derived.by<Row[]>(() =>
		recipients.map((recipient) => {
			const rendered = renderCampaignEmail(
				{ subject_template: subjectTemplate, body_template: bodyTemplate },
				recipient
			);
			const days = daysSince(recipient.last_contacted_at);
			return {
				recipient,
				subject: rendered.subject,
				opening: firstLine(rendered.text),
				empty: !rendered.subject || !rendered.text.trim(),
				recentDays: days !== null && days <= 30 ? days : null
			};
		})
	);

	const counts = $derived({
		all: rows.length,
		included: rows.filter((row) => row.recipient.included).length,
		excluded: rows.filter((row) => !row.recipient.included).length,
		own: rows.filter((row) => row.recipient.body_override?.trim()).length,
		template: rows.filter((row) => !row.recipient.body_override?.trim()).length,
		attention: rows.filter(
			(row) =>
				row.recipient.included && (row.empty || row.recipient.tailor_status === 'failed')
		).length
	});

	const visible = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return rows.filter((row) => {
			const recipient = row.recipient;
			if (filter === 'included' && !recipient.included) return false;
			if (filter === 'excluded' && recipient.included) return false;
			if (filter === 'own' && !recipient.body_override?.trim()) return false;
			if (filter === 'template' && recipient.body_override?.trim()) return false;
			if (
				filter === 'attention' &&
				!(recipient.included && (row.empty || recipient.tailor_status === 'failed'))
			)
				return false;
			if (!query) return true;
			return (
				recipient.email.includes(query) ||
				(recipient.name ?? '').toLowerCase().includes(query) ||
				row.subject.toLowerCase().includes(query)
			);
		});
	});

	const FILTERS: { key: Filter; label: string }[] = [
		{ key: 'all', label: 'Everyone' },
		{ key: 'included', label: 'Sending to' },
		{ key: 'excluded', label: 'Skipped' },
		{ key: 'own', label: 'Own version' },
		{ key: 'template', label: 'Template' },
		{ key: 'attention', label: 'Needs a look' }
	];

	const sourceBadge: Record<string, { label: string; classes: string }> = {
		tailored: { label: 'Tailored', classes: 'border-accent/30 bg-accent/10 text-accent' },
		edited: { label: 'Edited', classes: 'border-info/30 bg-info/10 text-info' },
		imported: { label: 'Imported', classes: 'border-border bg-muted text-foreground' }
	};
</script>

<div class="space-y-3">
	<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
		<div
			class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0"
			role="tablist"
			aria-label="Filter people"
		>
			{#each FILTERS as option (option.key)}
				{@const count = counts[option.key]}
				{#if option.key === 'all' || count > 0 || filter === option.key}
					<button
						type="button"
						role="tab"
						aria-selected={filter === option.key}
						onclick={() => (filter = option.key)}
						class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {filter ===
						option.key
							? 'border-accent bg-accent/10 text-accent'
							: 'border-border bg-background text-muted-foreground hover:text-foreground'} {option.key ===
							'attention' && count > 0
							? 'border-warning/50'
							: ''}"
					>
						{option.label}
						<span class="stamp">{count}</span>
					</button>
				{/if}
			{/each}
		</div>
		<div class="relative lg:w-64">
			<Search
				class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
			/>
			<label for="campaign-review-search" class="sr-only">Search people</label>
			<input
				id="campaign-review-search"
				type="search"
				bind:value={search}
				placeholder="Find a person"
				class="w-full rounded-lg border border-border-strong bg-background py-1.5 pl-9 pr-3 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent sm:text-sm"
			/>
		</div>
	</div>

	{#if visible.length === 0}
		<p
			class="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
		>
			{rows.length === 0
				? 'Pick an audience in step 1 to see everyone here.'
				: 'No one matches.'}
		</p>
	{:else}
		<ul
			class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background"
		>
			{#each visible as row (row.recipient.id)}
				{@const recipient = row.recipient}
				{@const source = recipient.override_source
					? sourceBadge[recipient.override_source]
					: null}
				<li class="flex items-stretch {recipient.included ? '' : 'bg-muted/40'}">
					<div class="flex shrink-0 items-start px-3 pt-3.5">
						<input
							type="checkbox"
							checked={recipient.included}
							disabled={!editable || pendingIds.has(recipient.id)}
							aria-label="{recipient.included ? 'Skip' : 'Include'} {displayName(
								recipient
							)}"
							onchange={(event) =>
								ontoggle(
									recipient,
									(event.currentTarget as HTMLInputElement).checked
								)}
							class="h-5 w-5 cursor-pointer rounded border-border-strong bg-background text-accent focus:ring-ring disabled:cursor-not-allowed"
						/>
					</div>
					<button
						type="button"
						onclick={() => onopen(recipient.id)}
						class="group flex min-w-0 flex-1 items-start gap-2 py-3 pr-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					>
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
								<span
									class="truncate text-sm font-semibold {recipient.included
										? 'text-foreground'
										: 'text-muted-foreground line-through decoration-muted-foreground/50'}"
								>
									{displayName(recipient)}
								</span>
								{#if recipient.name}
									<span class="truncate text-xs text-muted-foreground"
										>{recipient.email}</span
									>
								{/if}
							</div>
							<div class="flex flex-wrap items-center gap-1">
								{#if recipient.segment !== 'imported' || !source}
									<span
										class="rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-muted-foreground"
									>
										{segmentChipLabel(recipient.segment)}
									</span>
								{/if}
								{#if source}
									<span
										class="rounded-full border px-2 py-0.5 text-2xs font-medium {source.classes}"
									>
										{source.label}
									</span>
								{/if}
								{#if recipient.tailor_status === 'failed'}
									<span
										class="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-2xs font-medium text-destructive"
									>
										Tailoring failed
									</span>
								{/if}
								{#if row.recentDays !== null}
									<span
										class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-foreground"
										title="Last campaign email to this address"
									>
										Emailed {row.recentDays === 0
											? 'today'
											: `${row.recentDays} day${row.recentDays === 1 ? '' : 's'} ago`}
									</span>
								{/if}
								{#if row.empty && recipient.included}
									<span
										class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-foreground"
									>
										Empty
									</span>
								{/if}
							</div>
							<p class="truncate text-sm text-foreground">
								{row.subject || '(no subject)'}
							</p>
							<p class="line-clamp-2 text-xs text-muted-foreground">
								{row.opening || '(empty email)'}
							</p>
						</div>
						<ChevronRight
							class="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
						/>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
