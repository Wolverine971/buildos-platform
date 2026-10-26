<!-- apps/web/src/lib/components/email-campaigns/AudiencePanel.svelte -->
<script lang="ts">
	import {
		Check,
		ClipboardPaste,
		Loader2,
		Search,
		UserPlus,
		X,
		ChevronDown
	} from 'lucide-svelte';
	import {
		AUDIENCE_SEGMENTS,
		type AudienceExclusion,
		type AudienceSegment,
		type CampaignAudience,
		type CampaignRecipientView,
		type ExclusionReason,
		type PersonSearchResult,
		type SegmentCount
	} from '$lib/email-campaigns/types';
	import { campaignApi, errorMessage, isAbortError } from '$lib/email-campaigns/client';
	import { parsePastedAddresses } from '$lib/email-campaigns/ui-helpers';

	let {
		audience,
		segments,
		segmentsLoading = false,
		recipients,
		exclusions,
		editable,
		busy = false,
		onchange
	}: {
		audience: CampaignAudience;
		segments: SegmentCount[];
		segmentsLoading?: boolean;
		recipients: CampaignRecipientView[];
		exclusions: AudienceExclusion[];
		editable: boolean;
		busy?: boolean;
		onchange: (audience: CampaignAudience) => void;
	} = $props();

	const SEGMENT_ORDER: AudienceSegment[] = ['no_project', 'went_quiet', 'beta_no_account'];

	const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
		unsubscribed: 'unsubscribed',
		bounced: 'bounced',
		admin: 'admin',
		deleting_account: 'deleting account',
		invalid_email: 'bad address',
		removed: 'removed by you'
	};

	let searchQuery = $state('');
	let searchResults = $state<PersonSearchResult[]>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let showPaste = $state(false);
	let pasteText = $state('');
	let showLeftOut = $state(false);

	const segmentCounts = $derived(
		new Map(segments.map((segment) => [segment.segment, segment.count] as const))
	);
	const selected = $derived(new Set(audience.segments ?? []));
	const recipientEmails = $derived(new Set(recipients.map((recipient) => recipient.email)));
	const importedCount = $derived(
		recipients.filter((recipient) => recipient.segment === 'imported').length
	);
	const pasted = $derived(parsePastedAddresses(pasteText));

	const exclusionSummary = $derived.by(() => {
		const counts = new Map<ExclusionReason, number>();
		for (const exclusion of exclusions) {
			counts.set(exclusion.reason, (counts.get(exclusion.reason) ?? 0) + 1);
		}
		return [...counts.entries()].map(
			([reason, count]) => `${count} ${EXCLUSION_LABELS[reason]}`
		);
	});

	function emit(next: Partial<CampaignAudience>) {
		onchange({
			segments: next.segments ?? audience.segments ?? [],
			people: next.people ?? audience.people ?? [],
			removed_emails: next.removed_emails ?? audience.removed_emails ?? []
		});
	}

	function toggleSegment(segment: AudienceSegment) {
		if (!editable) return;
		const next = new Set(selected);
		if (next.has(segment)) next.delete(segment);
		else next.add(segment);
		emit({ segments: SEGMENT_ORDER.filter((key) => next.has(key)) });
	}

	function addPeople(people: CampaignAudience['people']) {
		const existing = new Set(
			(audience.people ?? []).map((person) => person.email.toLowerCase())
		);
		const additions = people
			.map((person) => ({ ...person, email: person.email.trim().toLowerCase() }))
			.filter((person) => person.email && !existing.has(person.email));
		if (additions.length === 0) return;
		const addedEmails = new Set(additions.map((person) => person.email));
		emit({
			people: [...(audience.people ?? []), ...additions],
			removed_emails: (audience.removed_emails ?? []).filter(
				(email) => !addedEmails.has(email)
			)
		});
	}

	function removePerson(email: string) {
		emit({
			people: (audience.people ?? []).filter((person) => person.email.toLowerCase() !== email)
		});
	}

	function restore(email: string) {
		emit({
			removed_emails: (audience.removed_emails ?? []).filter((removed) => removed !== email)
		});
	}

	function addPasted() {
		if (pasted.valid.length === 0) return;
		addPeople(pasted.valid.map((email) => ({ email })));
		pasteText = '';
		showPaste = false;
	}

	$effect(() => {
		const query = searchQuery.trim();
		if (query.length < 2) {
			searchResults = [];
			searching = false;
			searchError = null;
			return;
		}

		const controller = new AbortController();
		searching = true;
		const timer = window.setTimeout(async () => {
			try {
				searchResults = await campaignApi.searchPeople(query, controller.signal);
				searchError = null;
			} catch (error) {
				if (isAbortError(error)) return;
				searchError = errorMessage(error, 'Search failed');
			} finally {
				if (!controller.signal.aborted) searching = false;
			}
		}, 250);

		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	});
</script>

<div class="space-y-5">
	<div>
		<p class="micro-label mb-2">Groups</p>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
			{#each SEGMENT_ORDER as segment (segment)}
				{@const isOn = selected.has(segment)}
				{@const count = segmentCounts.get(segment)}
				<button
					type="button"
					aria-pressed={isOn}
					disabled={!editable || busy}
					onclick={() => toggleSegment(segment)}
					class="group relative flex min-h-[88px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed pressable {isOn
						? 'border-accent bg-accent/5'
						: 'border-border bg-background hover:border-accent/60'} {!editable
						? 'opacity-80'
						: ''}"
				>
					<span class="flex w-full items-start justify-between gap-2">
						<span class="text-sm font-semibold text-foreground">
							{AUDIENCE_SEGMENTS[segment].label}
						</span>
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {isOn
								? 'border-accent bg-accent text-accent-foreground'
								: 'border-border-strong bg-background'}"
							aria-hidden="true"
						>
							{#if isOn}<Check class="h-3 w-3" />{/if}
						</span>
					</span>
					<span class="text-xs text-muted-foreground">
						{AUDIENCE_SEGMENTS[segment].description}
					</span>
					<span class="stamp mt-auto text-xs text-foreground">
						{#if segmentsLoading && count === undefined}
							counting…
						{:else if count !== undefined}
							{count} {count === 1 ? 'person' : 'people'}
						{/if}
					</span>
				</button>
			{/each}
		</div>
	</div>

	{#if editable}
		<div class="space-y-2">
			<label for="campaign-people-search" class="micro-label block">Add people</label>
			<div class="relative">
				<Search
					class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					id="campaign-people-search"
					type="search"
					bind:value={searchQuery}
					placeholder="Search users and beta signups by name or email"
					autocomplete="off"
					class="w-full rounded-lg border border-border-strong bg-background py-2 pl-9 pr-9 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 sm:text-sm"
				/>
				{#if searching}
					<Loader2
						class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
					/>
				{/if}
			</div>
			{#if searchError}
				<p class="text-xs text-destructive">{searchError}</p>
			{/if}
			{#if searchResults.length > 0}
				<ul
					class="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background"
				>
					{#each searchResults as person (person.email)}
						{@const already =
							recipientEmails.has(person.email.toLowerCase()) ||
							(audience.people ?? []).some(
								(added) => added.email.toLowerCase() === person.email.toLowerCase()
							)}
						<li class="flex items-center justify-between gap-3 px-3 py-2">
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-foreground">
									{person.name || person.email}
								</p>
								<p class="truncate text-xs text-muted-foreground">
									{person.email} · {person.kind === 'user'
										? 'has an account'
										: 'beta signup'}
								</p>
							</div>
							<button
								type="button"
								disabled={already || busy}
								onclick={() =>
									addPeople([
										{
											email: person.email,
											name: person.name,
											user_id: person.user_id,
											beta_signup_id: person.beta_signup_id
										}
									])}
								class="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:border-transparent disabled:text-muted-foreground pressable"
							>
								{#if already}
									<Check class="h-3.5 w-3.5" /> Added
								{:else}
									<UserPlus class="h-3.5 w-3.5" /> Add
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{:else if searchQuery.trim().length >= 2 && !searching && !searchError}
				<p class="text-xs text-muted-foreground">No one matches “{searchQuery.trim()}”.</p>
			{/if}

			<button
				type="button"
				onclick={() => (showPaste = !showPaste)}
				aria-expanded={showPaste}
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<ClipboardPaste class="h-3.5 w-3.5" />
				Paste addresses
			</button>
			{#if showPaste}
				<div class="space-y-2 rounded-lg border border-border bg-background p-3">
					<label for="campaign-paste" class="sr-only">Email addresses</label>
					<textarea
						id="campaign-paste"
						bind:value={pasteText}
						rows="4"
						placeholder="One per line, or separated by commas"
						class="w-full resize-y rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent sm:text-sm"
					></textarea>
					{#if pasted.invalid.length > 0}
						<p class="text-xs text-destructive">
							Not valid: {pasted.invalid.slice(0, 5).join(', ')}{pasted.invalid
								.length > 5
								? ` and ${pasted.invalid.length - 5} more`
								: ''}
						</p>
					{/if}
					<div class="flex justify-end">
						<button
							type="button"
							disabled={pasted.valid.length === 0 || busy}
							onclick={addPasted}
							class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring tx-button tx-button-accent"
						>
							Add {pasted.valid.length || ''}
							{pasted.valid.length === 1 ? 'address' : 'addresses'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if (audience.people ?? []).length > 0}
		<div>
			<p class="micro-label mb-2">Added by hand</p>
			<ul class="flex flex-wrap gap-1.5">
				{#each audience.people as person (person.email)}
					<li
						class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-xs text-foreground"
					>
						<span class="truncate">{person.name || person.email}</span>
						{#if editable}
							<button
								type="button"
								disabled={busy}
								onclick={() => removePerson(person.email.toLowerCase())}
								class="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Remove {person.name || person.email}"
							>
								<X class="h-3 w-3" />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div
		class="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
		aria-live="polite"
	>
		<p class="text-sm text-foreground">
			{#if busy}
				<Loader2 class="mr-1 inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
				Updating the list…
			{:else}
				<span class="font-semibold">{recipients.length}</span>
				{recipients.length === 1 ? 'person' : 'people'}
				{#if importedCount > 0}
					<span class="text-muted-foreground">· {importedCount} imported</span>
				{/if}
				{#if exclusions.length > 0}
					<span class="text-muted-foreground">
						· {exclusions.length} left out ({exclusionSummary.join(', ')})
					</span>
				{/if}
			{/if}
		</p>
		{#if exclusions.length > 0}
			<button
				type="button"
				onclick={() => (showLeftOut = !showLeftOut)}
				aria-expanded={showLeftOut}
				class="inline-flex min-h-9 items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
			>
				{showLeftOut ? 'Hide' : 'Show'} who's left out
				<ChevronDown
					class="h-3.5 w-3.5 transition-transform {showLeftOut ? 'rotate-180' : ''}"
				/>
			</button>
		{/if}
	</div>

	{#if showLeftOut && exclusions.length > 0}
		<ul class="divide-y divide-border rounded-lg border border-border bg-background">
			{#each exclusions as exclusion (exclusion.email)}
				<li class="flex items-center justify-between gap-3 px-3 py-2">
					<div class="min-w-0">
						<p class="truncate text-sm text-foreground">
							{exclusion.name || exclusion.email}
						</p>
						<p class="truncate text-xs text-muted-foreground">
							{exclusion.email} · {EXCLUSION_LABELS[exclusion.reason]}
						</p>
					</div>
					{#if exclusion.reason === 'removed' && editable}
						<button
							type="button"
							disabled={busy}
							onclick={() => restore(exclusion.email)}
							class="min-h-9 shrink-0 rounded-md px-2 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Put back
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
