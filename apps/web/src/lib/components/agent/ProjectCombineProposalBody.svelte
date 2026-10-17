<!-- apps/web/src/lib/components/agent/ProjectCombineProposalBody.svelte -->
<!--
	The combine card's body (tasker 122, WP5). Says plainly what moves (counts
	by kind, the "From <source>" folder), that the source is archived and
	forwards with its chats, who loses or gains access (the member choice is
	the user's, never the model's, and has no default), which past events stay
	behind, which upcoming events block (named), and what Undo can't put back.
	INKPRINT: lives inside the card's Frame; blockers use Static.
-->
<script lang="ts">
	import { CalendarX2, TriangleAlert, UserMinus, UserPlus } from '$lib/icons/lucide';
	import type { ProjectCombineProposalPayloadV1 } from '@buildos/shared-agent-ops/chat-cards/project-combine-card';
	import {
		combineCountParts,
		combineMembersRemovable,
		eventWhen,
		foldBlockerText,
		joinAnd,
		namesLine
	} from './proposal-cards';

	let {
		payload,
		memberChoice = $bindable(null),
		disabled = false,
		uid
	}: {
		payload: ProjectCombineProposalPayloadV1;
		/** remove: they lose access; add: they're added to the destination. No default. */
		memberChoice?: 'remove' | 'add' | null;
		/** The card can't take a choice right now (decided, busy, or Jev still replying). */
		disabled?: boolean;
		/** Id prefix from the card frame. */
		uid: string;
	} = $props();

	const source = $derived(payload.source.name);
	const destination = $derived(payload.destination.name);
	const moving = $derived(joinAnd(combineCountParts(payload.counts)));
	const missingNames = $derived(payload.members_missing.map((member) => member.name));
	const canRemove = $derived(combineMembersRemovable(payload));
	const owners = $derived(
		payload.members_missing.filter((member) => !member.removable).map((member) => member.name)
	);
	const otherBlockers = $derived(
		payload.blockers.filter(
			(blocker) =>
				!(
					blocker.code === 'standalone_events_not_supported' &&
					payload.upcoming_events_total > 0
				)
		)
	);
	const grantsNotCopied = $derived(
		payload.connector_grants_not_copied.project_permissions +
			payload.connector_grants_not_copied.oauth_grants_naming_source
	);
	const missingTotal = $derived(payload.members_missing_total);
	const peopleWord = $derived(missingTotal === 1 ? 'person' : 'people');

	const optionBase =
		'flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-border-strong bg-card px-2.5 py-2 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 motion-reduce:transition-none';
</script>

<div
	class="mt-2 space-y-2.5 px-3 text-xs leading-snug text-foreground"
	data-testid="project-combine-proposal-body"
>
	<section aria-labelledby="{uid}-moves">
		<h4 id="{uid}-moves" class="micro-label text-muted-foreground">What moves</h4>
		<p class="mt-0.5 [overflow-wrap:anywhere]">
			{#if moving}
				{moving} move into {destination}.
			{:else}
				Nothing in {source} needs to move.
			{/if}
			{#if payload.counts.documents > 0}
				Docs land in a “{payload.folder_title}” folder.
			{/if}
		</p>
		<p class="mt-0.5 [overflow-wrap:anywhere]">
			{source} is archived and forwards to {destination}.
			{#if payload.chats_follow > 0}
				Its {payload.chats_follow}
				{payload.chats_follow === 1 ? 'chat continues' : 'chats continue'} there.
			{:else}
				Its chats continue there.
			{/if}
		</p>
	</section>

	<section aria-labelledby="{uid}-access">
		<h4 id="{uid}-access" class="micro-label text-muted-foreground">Who can see it</h4>
		{#if missingTotal === 0}
			<p class="mt-0.5 [overflow-wrap:anywhere]">
				No one loses access: everyone in {source} can already open {destination}. Everyone
				who can open {destination} will see what moves.
			</p>
		{:else}
			<p class="mt-0.5 [overflow-wrap:anywhere]">
				{namesLine(missingNames, missingTotal)}
				can open {source} but not {destination}. Everyone who can open {destination} will see
				what moves.
			</p>
			{#if missingTotal > 3}
				<details class="mt-1">
					<summary
						class="inline-flex min-h-11 cursor-pointer items-center rounded-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
					>
						Show all {missingTotal}
						{peopleWord}
					</summary>
					<ul class="mt-1 space-y-0.5 pl-4 text-muted-foreground">
						{#each payload.members_missing as member (member.actor_id)}
							<li class="[overflow-wrap:anywhere]">
								{member.name}
								<span class="text-2xs">({member.role_key})</span>
							</li>
						{/each}
						{#if missingTotal > payload.members_missing.length}
							<li class="text-2xs">
								+{missingTotal - payload.members_missing.length} more
							</li>
						{/if}
					</ul>
				</details>
			{/if}
			<fieldset class="mt-1.5" {disabled}>
				<legend class="font-semibold"> Choose what happens to their access </legend>
				<div class="mt-1 flex flex-col gap-1.5">
					<label class={optionBase}>
						<input
							type="radio"
							name="{uid}-members"
							value="remove"
							class="mt-0.5 h-4 w-4 shrink-0 accent-accent"
							bind:group={memberChoice}
							disabled={disabled || !canRemove}
						/>
						<span class="min-w-0">
							<span class="flex items-center gap-1 font-semibold">
								<UserMinus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
								They lose access
							</span>
							<span class="block text-muted-foreground [overflow-wrap:anywhere]">
								{#if canRemove}
									Remove {missingTotal === 1
										? 'them'
										: `these ${missingTotal} ${peopleWord}`}
									from {source} first. They won’t see this material in {destination}.
								{:else}
									{namesLine(owners, owners.length)}
									{owners.length === 1 ? 'owns' : 'own'}
									{source} and can’t be removed.
								{/if}
							</span>
						</span>
					</label>
					<label class={optionBase}>
						<input
							type="radio"
							name="{uid}-members"
							value="add"
							class="mt-0.5 h-4 w-4 shrink-0 accent-accent"
							bind:group={memberChoice}
							{disabled}
						/>
						<span class="min-w-0">
							<span
								class="flex items-center gap-1 font-semibold [overflow-wrap:anywhere]"
							>
								<UserPlus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
								Add them to {destination}
							</span>
							<span class="block text-muted-foreground [overflow-wrap:anywhere]">
								They keep this material and can also open everything else in {destination}.
							</span>
						</span>
					</label>
				</div>
			</fieldset>
		{/if}
	</section>

	{#if payload.upcoming_events_total > 0}
		<div
			class="rounded-md border border-border bg-background/60 px-3 py-2 tx tx-static tx-weak"
			data-testid="combine-upcoming-events"
		>
			<p class="flex items-start gap-1.5 font-semibold">
				<CalendarX2 class="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
				<span>
					{payload.upcoming_events_total} upcoming
					{payload.upcoming_events_total === 1 ? 'event blocks' : 'events block'} combining
				</span>
			</p>
			<ul class="mt-1 space-y-0.5 pl-5">
				{#each payload.upcoming_events as event (event.id)}
					<li class="[overflow-wrap:anywhere]">
						{event.title}
						{#if eventWhen(event.start_at)}
							<span class="stamp text-2xs text-muted-foreground"
								>· {eventWhen(event.start_at)}</span
							>
						{/if}
					</li>
				{/each}
				{#if payload.upcoming_events_total > payload.upcoming_events.length}
					<li class="text-2xs text-muted-foreground">
						+{payload.upcoming_events_total - payload.upcoming_events.length} more
					</li>
				{/if}
			</ul>
			<p class="mt-1 text-muted-foreground">
				Move or delete {payload.upcoming_events_total === 1 ? 'it' : 'them'} first (Jev can help),
				then Check again.
			</p>
		</div>
	{/if}

	{#each otherBlockers as blocker (blocker.code)}
		<p
			class="flex items-start gap-1.5 rounded-md border border-border bg-background/60 px-3 py-2 tx tx-static tx-weak"
			data-testid="combine-blocker"
		>
			<TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
			<span class="[overflow-wrap:anywhere]">{foldBlockerText(blocker.code, payload)}</span>
		</p>
	{/each}

	{#if payload.past_events_total > 0}
		<details>
			<summary
				class="inline-flex min-h-11 cursor-pointer items-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
			>
				{payload.past_events_total} past
				{payload.past_events_total === 1 ? 'event stays' : 'events stay'} with {source} as history
			</summary>
			<ul class="mt-1 space-y-0.5 pl-4 text-muted-foreground">
				{#each payload.past_events_left_with_source as event (event.id)}
					<li class="[overflow-wrap:anywhere]">
						{event.title}
						{#if eventWhen(event.start_at)}
							<span class="stamp text-2xs">· {eventWhen(event.start_at)}</span>
						{/if}
					</li>
				{/each}
				{#if payload.past_events_total > payload.past_events_left_with_source.length}
					<li class="text-2xs">
						+{payload.past_events_total - payload.past_events_left_with_source.length} more
					</li>
				{/if}
			</ul>
		</details>
	{/if}

	{#if grantsNotCopied > 0}
		<p class="text-muted-foreground [overflow-wrap:anywhere]">
			AI connectors given access to {source} don’t carry over. Grant {destination} if they need
			it.
		</p>
	{/if}

	<p
		class="text-2xs text-muted-foreground [overflow-wrap:anywhere]"
		data-testid="combine-undo-limits"
	>
		Undo works once, for 7 days. It brings back what hasn’t been edited since; items edited
		after combining stay in {destination}. People removed before combining aren’t re-added, and
		people added stay.
	</p>
</div>
