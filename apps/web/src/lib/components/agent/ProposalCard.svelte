<!-- apps/web/src/lib/components/agent/ProposalCard.svelte -->
<!--
	A chat proposal card (tasker 122, proposal-card rail): Jev proposes a change,
	the user's click is the only consent. One frame and state machine for every
	card kind: pending → working → applied / cancelled / stale / unknown /
	expired, then Undo (confirmed, once, for 7 days). The body is per kind (nest,
	combine, and the Workspace's file / start-a-project cards). Resolves in place
	and stays resolved after reload: the server mirrors the outcome onto the
	card's tool result.
	INKPRINT: Frame texture (a decision), card weight.
-->
<script lang="ts">
	import {
		Ban,
		Check,
		ExternalLink,
		FolderInput,
		FolderPlus,
		FolderTree,
		GitMerge,
		LoaderCircle,
		RefreshCw,
		TriangleAlert,
		Undo2
	} from '$lib/icons/lucide';
	import {
		describeProposalCardResolution,
		describeProposalCardUndo,
		isProposalCardExpired,
		proposalCardSpec,
		proposalCardVisibleDigest,
		type ProposalCardEnvelopeV1,
		type ProposalCardResolutionV1,
		type ProposalCardUndoV1,
		type WorkspaceFileProposalPayloadV1,
		type WorkspaceProjectProposalPayloadV1
	} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
	import type { ProjectParentProposalPayloadV1 } from '@buildos/shared-agent-ops/chat-cards/project-parent-card';
	import type {
		ProjectCombineProposalPayloadV1,
		ProjectCombineReceiptV1,
		ProjectCombineUndoViewV1
	} from '@buildos/shared-agent-ops/chat-cards/project-combine-card';
	import ProjectParentProposalBody from './ProjectParentProposalBody.svelte';
	import ProjectCombineProposalBody from './ProjectCombineProposalBody.svelte';
	import WorkspaceProposalBody from './WorkspaceProposalBody.svelte';
	import DuplicateCheckStrip from './DuplicateCheckStrip.svelte';
	import {
		PROPOSAL_CARD_CLOSED_CODES,
		chooseProposalCard,
		combineBlockedReason,
		combineChoiceFor,
		combineMembersKey,
		namesLine,
		parseCombineUndoView,
		parseProposalCardView,
		previewProposalCard,
		proposalCardProjectIds,
		proposalCardTitle,
		undoAvailable,
		undoPreviewProposalCard,
		undoProposalCard,
		type ProposalCardChoice,
		type ProposalCardRequestFailure,
		type ProposalCardResolvedEvent,
		type ProposalFreshView
	} from './proposal-cards';
	import {
		proposalCardFreshViews,
		proposalCardResolutions,
		proposalCardUndos
	} from './proposal-card-state.svelte';

	let {
		card,
		turnActive = false,
		onResolved
	}: {
		card: ProposalCardEnvelopeV1;
		/** The reply that showed this card is still streaming; choices wait for it. */
		turnActive?: boolean;
		onResolved?: (event: ProposalCardResolvedEvent) => void;
	} = $props();

	const uid = $props.id();
	const spec = $derived(proposalCardSpec(card.kind));
	const resolution = $derived<ProposalCardResolutionV1 | null>(
		proposalCardResolutions.get(card.card_id) ?? card.card_resolution ?? null
	);
	const undo = $derived<ProposalCardUndoV1 | null>(
		proposalCardUndos.get(card.card_id) ?? card.card_undo ?? null
	);
	const fresh = $derived(proposalCardFreshViews.get(card.card_id) ?? null);
	/** What the card shows: the proposal, or the latest Check again. */
	const payload = $derived(fresh?.payload ?? card.client_action.payload);
	const seenDigest = $derived(
		fresh?.digest ?? proposalCardVisibleDigest(card.kind, card.client_action.payload)
	);
	const nest = $derived(
		card.kind === 'project_parent' ? (payload as ProjectParentProposalPayloadV1) : null
	);
	const combine = $derived(
		card.kind === 'project_combine' ? (payload as ProjectCombineProposalPayloadV1) : null
	);
	const fileCard = $derived(
		card.kind === 'workspace_file' ? (payload as WorkspaceFileProposalPayloadV1) : null
	);
	const startCard = $derived(
		card.kind === 'workspace_project' ? (payload as WorkspaceProjectProposalPayloadV1) : null
	);

	type Busy = 'apply' | 'cancel' | 'check' | 'undo_preview' | 'undo';
	let busy = $state<Busy | null>(null);
	let error = $state<string | null>(null);
	/** Information, not a failure (the view changed, Check again found nothing new). */
	let notice = $state<string | null>(null);
	/** The server said this card can no longer be used (expired or gone). */
	let closedMessage = $state<string | null>(null);
	let undoClosed = $state(false);
	let announcement = $state('');
	let memberChoice = $state<'remove' | 'add' | null>(null);
	let undoConfirm = $state<{
		view: ProjectCombineUndoViewV1 | null;
		digest: string | null;
	} | null>(null);

	const expired = $derived(!resolution && isProposalCardExpired(card.client_action));
	type DisplayState =
		| 'pending'
		| 'applied'
		| 'cancelled'
		| 'stale'
		| 'unknown'
		| 'undone'
		| 'expired';
	const displayState = $derived<DisplayState>(
		undo?.outcome === 'undone'
			? 'undone'
			: resolution
				? resolution.outcome
				: expired || closedMessage
					? 'expired'
					: 'pending'
	);
	const resolvedLine = $derived(
		undo
			? describeProposalCardUndo(card, undo)
			: resolution
				? describeProposalCardResolution(card, resolution)
				: null
	);
	/** How the last outcome reads: an undo's outcome outranks the decision it undid. */
	const tone = $derived(
		undo
			? undo.outcome === 'undone'
				? 'undone'
				: 'warning'
			: resolution?.outcome === 'applied'
				? 'success'
				: resolution?.outcome === 'cancelled'
					? 'muted'
					: 'warning'
	);
	const canUndo = $derived(!undoClosed && undoAvailable(card, resolution, undo));
	const duplicateCheck = $derived(
		(payload as { duplicate_check?: ProjectParentProposalPayloadV1['duplicate_check'] })
			?.duplicate_check ?? null
	);
	const showStrip = $derived(
		Boolean(duplicateCheck) && (displayState === 'pending' || displayState === 'applied')
	);
	const title = $derived(proposalCardTitle(card, payload));

	const EYEBROW: Record<DisplayState, string> = {
		pending: 'Needs your choice',
		applied: 'Done',
		cancelled: 'Cancelled',
		stale: 'Not applied',
		unknown: 'Check needed',
		undone: 'Undone',
		expired: 'Expired'
	};

	// The main button: what it sends and what it says.
	const combineBlocked = $derived(combine ? combineBlockedReason(combine, memberChoice) : null);
	const mainChoice = $derived<ProposalCardChoice | null>(
		nest || fileCard || startCard
			? 'apply'
			: combine
				? combineChoiceFor(combine, memberChoice)
				: null
	);
	const mainLabel = $derived.by(() => {
		if (nest)
			return nest.action === 'attach'
				? `Move under ${nest.to_parent?.name ?? 'parent'}`
				: 'Take it out';
		if (fileCard) return fileCard.items.length === 1 ? 'File it' : 'File them';
		if (startCard) return 'Start the project';
		if (!combine) return 'Apply';
		const count = combine.members_missing_total;
		if (count > 0 && memberChoice === 'remove') return `Remove ${count} and combine`;
		if (count > 0 && memberChoice === 'add') return `Add ${count} and combine`;
		return 'Combine projects';
	});
	const mainBusyLabel = $derived(
		nest
			? nest.action === 'attach'
				? 'Moving…'
				: 'Taking it out…'
			: fileCard
				? 'Filing…'
				: startCard
					? 'Starting…'
					: 'Combining…'
	);
	const locked = $derived(busy !== null || turnActive);
	const hint = $derived.by(() => {
		if (turnActive) return 'You can choose when Jev finishes replying.';
		if (combineBlocked === 'blocked')
			return 'Clear what’s listed above, then Check again. Nothing changes until you choose.';
		if (combineBlocked === 'member_choice') {
			const count = combine?.members_missing_total ?? 0;
			return `Choose what happens to ${count === 1 ? 'that person’s' : `those ${count} people’s`} access first. Nothing changes until you choose.`;
		}
		return 'Nothing changes until you choose. You can undo for 7 days.';
	});

	function emitResolved(
		phase: ProposalCardResolvedEvent['phase'],
		outcome: ProposalCardResolvedEvent['outcome']
	) {
		onResolved?.({ card, phase, outcome, projectIds: proposalCardProjectIds(card) });
	}

	function settleDecision(next: ProposalCardResolutionV1) {
		proposalCardResolutions.set(card.card_id, next);
		undoConfirm = null;
		notice = null;
		announcement = describeProposalCardResolution(card, next).text;
		emitResolved('decide', next.outcome);
	}

	function settleUndo(next: ProposalCardUndoV1) {
		proposalCardUndos.set(card.card_id, next);
		undoConfirm = null;
		notice = null;
		announcement = describeProposalCardUndo(card, next).text;
		emitResolved('undo', next.outcome);
	}

	/** Show the server's latest view; returns false when it doesn't parse. */
	function applyFresh(view: ProposalFreshView): boolean {
		const parsed = parseProposalCardView(card, view.view);
		if (!parsed) return false;
		if (
			combine &&
			combineMembersKey(combine) !==
				combineMembersKey(parsed as ProjectCombineProposalPayloadV1)
		)
			memberChoice = null;
		proposalCardFreshViews.set(card.card_id, { payload: parsed, digest: view.digest });
		return true;
	}

	function handleDecideFailure(result: ProposalCardRequestFailure) {
		if (result.resolution) return settleDecision(result.resolution);
		if (result.code && PROPOSAL_CARD_CLOSED_CODES.has(result.code)) {
			closedMessage = result.message;
			announcement = result.message;
			return;
		}
		if (result.fresh && applyFresh(result.fresh) && result.code === 'PREVIEW_CHANGED') {
			notice = result.message;
			announcement = result.message;
			return;
		}
		error = result.message;
	}

	async function choose(choice: ProposalCardChoice, key: 'apply' | 'cancel') {
		if (busy || resolution || turnActive || expired || closedMessage) return;
		if (key === 'apply' && combineBlocked) return;
		busy = key;
		error = null;
		notice = null;
		const result = await chooseProposalCard(
			card,
			choice,
			choice === 'cancel' ? null : seenDigest
		);
		busy = null;
		if (result.status === 'resolved') return settleDecision(result.resolution);
		handleDecideFailure(result);
	}

	async function checkAgain() {
		if (busy || resolution || expired || closedMessage || !spec.hasPreview) return;
		busy = 'check';
		error = null;
		notice = null;
		const before = seenDigest;
		const result = await previewProposalCard(card);
		busy = null;
		if (result.status === 'ok') {
			if (!applyFresh({ view: result.view, digest: result.digest })) {
				error = 'Couldn’t read the latest check. Try again.';
				return;
			}
			notice =
				result.digest === before
					? 'Checked again: nothing changed.'
					: 'Something changed. The card now shows what’s there now.';
			announcement = notice;
			return;
		}
		handleDecideFailure(result);
	}

	function handleUndoFailure(result: ProposalCardRequestFailure) {
		if (result.undo) return settleUndo(result.undo);
		if (
			result.code === 'UNDO_EXPIRED' ||
			result.code === 'NOT_UNDOABLE' ||
			(result.code && PROPOSAL_CARD_CLOSED_CODES.has(result.code))
		) {
			undoClosed = true;
			undoConfirm = null;
			error = result.message;
			announcement = result.message;
			return;
		}
		if (result.fresh) {
			const view = parseCombineUndoView(result.fresh.view);
			if (view) {
				undoConfirm = { view, digest: result.fresh.digest };
				if (result.code === 'PREVIEW_CHANGED') {
					notice = result.message;
					announcement = result.message;
					return;
				}
			}
		}
		error = result.message;
	}

	async function startUndo() {
		if (busy || !canUndo || undoConfirm) return;
		error = null;
		notice = null;
		if (!spec.hasUndoPreview) {
			undoConfirm = { view: null, digest: null };
			return;
		}
		busy = 'undo_preview';
		const result = await undoPreviewProposalCard(card);
		busy = null;
		if (result.status === 'ok') {
			const view = parseCombineUndoView(result.view);
			if (!view) {
				error = 'Couldn’t check what Undo would bring back. Try again.';
				return;
			}
			undoConfirm = { view, digest: result.digest };
			return;
		}
		handleUndoFailure(result);
	}

	async function confirmUndo() {
		if (busy || !undoConfirm || (undoConfirm.view?.blockers.length ?? 0) > 0) return;
		busy = 'undo';
		error = null;
		notice = null;
		const result = await undoProposalCard(card, undoConfirm.digest);
		busy = null;
		if (result.status === 'undone') return settleUndo(result.undo);
		handleUndoFailure(result);
	}

	function keepIt() {
		if (busy) return;
		undoConfirm = null;
		notice = null;
		error = null;
	}

	const removedBeforeCombining = $derived(
		card.kind === 'project_combine'
			? ((resolution?.receipt as ProjectCombineReceiptV1 | null | undefined)
					?.members_removed ?? [])
			: []
	);

	const buttonBase =
		'inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:min-h-9 sm:w-auto';
	const primaryButton = `${buttonBase} bg-accent text-accent-foreground shadow-ink pressable hover:opacity-90`;
	const outlineButton = `${buttonBase} border border-border-strong bg-card text-foreground shadow-ink pressable hover:border-accent hover:bg-accent/5`;
	const quietButton = `${buttonBase} text-muted-foreground hover:bg-muted/50 hover:text-foreground`;
</script>

{#snippet spinner()}
	<LoaderCircle class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
{/snippet}

<article
	class="w-full max-w-xl min-w-0 rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak"
	aria-labelledby="{uid}-title"
	data-testid="proposal-card"
	data-card-kind={card.kind}
	data-state={busy && busy !== 'check' ? 'working' : displayState}
>
	<header class="flex items-start gap-2.5 px-3 pt-3">
		{#if card.kind === 'project_combine'}
			<GitMerge class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
		{:else if card.kind === 'workspace_file'}
			<FolderInput class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
		{:else if card.kind === 'workspace_project'}
			<FolderPlus class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
		{:else}
			<FolderTree class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
		{/if}
		<div class="min-w-0 flex-1">
			<p
				class="micro-label {displayState === 'pending'
					? 'text-accent'
					: 'text-muted-foreground'}"
			>
				{EYEBROW[displayState]}
			</p>
			<h3
				id="{uid}-title"
				class="mt-0.5 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]"
			>
				{title}
			</h3>
		</div>
	</header>

	{#if nest}
		<ProjectParentProposalBody payload={nest} />
	{:else if combine}
		<ProjectCombineProposalBody
			payload={combine}
			bind:memberChoice
			disabled={displayState !== 'pending' || locked}
			{uid}
		/>
	{:else if fileCard}
		<WorkspaceProposalBody
			items={fileCard.items}
			nestedDocuments={fileCard.nested_documents}
			destination={fileCard.target.name}
			note={fileCard.reason}
			{uid}
		/>
	{:else if startCard}
		<WorkspaceProposalBody
			items={startCard.items}
			nestedDocuments={startCard.nested_documents}
			destination={startCard.name}
			note={startCard.description}
			startsProject
			{uid}
		/>
	{/if}

	{#if showStrip && duplicateCheck}
		<DuplicateCheckStrip check={duplicateCheck} />
	{/if}

	<div class="mt-3 border-t border-border px-3 py-2.5">
		{#if resolvedLine && (resolution || undo)}
			<p
				class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold {tone ===
				'success'
					? 'text-success'
					: tone === 'warning'
						? 'text-foreground'
						: 'text-muted-foreground'}"
				data-testid="proposal-card-result"
			>
				{#if tone === 'warning'}
					<TriangleAlert class="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
				{:else if tone === 'muted'}
					<Ban class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{:else if tone === 'undone'}
					<Undo2 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{:else}
					<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{/if}
				<span class="min-w-0 [overflow-wrap:anywhere]">{resolvedLine.text}</span>
				{#if resolvedLine.href}
					<a
						href={resolvedLine.href}
						class="inline-flex min-h-11 items-center gap-1 rounded-sm text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
					>
						Open
						<ExternalLink class="h-3 w-3" aria-hidden="true" />
					</a>
				{/if}
			</p>

			{#if undoConfirm}
				<div
					class="mt-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-ink-inner"
					role="group"
					aria-labelledby="{uid}-undo-title"
					data-testid="proposal-card-undo-confirm"
				>
					{#if nest}
						<p id="{uid}-undo-title" class="font-semibold [overflow-wrap:anywhere]">
							Put {nest.project.name} back {nest.from_parent
								? `inside ${nest.from_parent.name}`
								: 'at the top level'}?
						</p>
						{#if nest.undo_needs_admin_on_both && nest.from_parent}
							<p class="mt-0.5 text-muted-foreground">
								This needs admin access to both projects.
							</p>
						{/if}
					{:else if fileCard}
						<p id="{uid}-undo-title" class="font-semibold [overflow-wrap:anywhere]">
							Move {fileCard.items.length === 1 ? 'it' : 'these items'} back to your Workspace?
						</p>
						<p class="mt-0.5 text-muted-foreground">You can only undo once.</p>
					{:else if startCard}
						<p id="{uid}-undo-title" class="font-semibold [overflow-wrap:anywhere]">
							Move the items back to your Workspace?
						</p>
						<p class="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">
							{startCard.name} is removed unless something else was added to it. You can
							only undo once.
						</p>
					{:else if combine && undoConfirm.view}
						{@const view = undoConfirm.view}
						<p id="{uid}-undo-title" class="font-semibold [overflow-wrap:anywhere]">
							Undo combining {view.source.name} into {view.destination.name}?
						</p>
						<ul class="mt-1 space-y-0.5 pl-4 list-disc">
							<li>
								{view.returning_total}
								{view.returning_total === 1 ? 'item goes' : 'items go'} back to {view
									.source.name}{view.unarchive
									? ', and it becomes active again'
									: ''}.
							</li>
							{#if view.staying_total > 0}
								<li>
									{view.staying_total} edited since combining
									{view.staying_total === 1 ? 'stays' : 'stay'} in {view
										.destination.name}.
									{#if view.staying.length > 0}
										<details class="mt-0.5">
											<summary
												class="inline-flex min-h-11 cursor-pointer items-center rounded-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
											>
												Show what stays
											</summary>
											<ul class="mt-0.5 pl-4 text-muted-foreground">
												{#each view.staying as item (item.id)}
													<li class="[overflow-wrap:anywhere]">
														{item.title ?? 'Untitled'}
													</li>
												{/each}
											</ul>
										</details>
									{/if}
								</li>
							{/if}
							{#if view.folder_removed}
								<li>The “{combine.folder_title}” folder is removed.</li>
							{/if}
							{#if view.members_added_stay > 0}
								<li>
									{view.members_added_stay}
									{view.members_added_stay === 1 ? 'person' : 'people'} added by the
									combine stay in {view.destination.name}.
								</li>
							{/if}
							{#if removedBeforeCombining.length > 0}
								<li>
									{namesLine(removedBeforeCombining.map((person) => person.name))}
									{removedBeforeCombining.length === 1 ? 'was' : 'were'} removed before
									combining and {removedBeforeCombining.length === 1
										? 'isn’t'
										: 'aren’t'} re-added.
								</li>
							{/if}
							{#if view.parent_not_restored}
								<li>
									{view.source.name} can’t go back inside its previous parent.
								</li>
							{/if}
						</ul>
						{#if view.blockers.length > 0}
							<p class="mt-1 flex items-start gap-1.5 font-semibold">
								<TriangleAlert
									class="mt-px h-3.5 w-3.5 shrink-0 text-warning"
									aria-hidden="true"
								/>
								Undo is blocked right now. Nothing changed.
							</p>
						{/if}
						<p class="mt-1 text-muted-foreground">You can only undo once.</p>
					{/if}
					<div class="mt-2 flex flex-col gap-2 sm:flex-row">
						<button
							type="button"
							class={primaryButton}
							disabled={busy !== null || (undoConfirm.view?.blockers.length ?? 0) > 0}
							onclick={confirmUndo}
						>
							{#if busy === 'undo'}
								{@render spinner()}
								Undoing…
							{:else}
								<Undo2 class="h-3.5 w-3.5" aria-hidden="true" />
								{combine ? 'Undo combine' : 'Undo'}
							{/if}
						</button>
						<button
							type="button"
							class={quietButton}
							disabled={busy !== null}
							onclick={keepIt}
						>
							Keep it
						</button>
					</div>
				</div>
			{:else if canUndo}
				<button
					type="button"
					class="{outlineButton} mt-2"
					disabled={busy !== null}
					onclick={startUndo}
				>
					{#if busy === 'undo_preview'}
						{@render spinner()}
						Checking…
					{:else}
						<Undo2 class="h-3.5 w-3.5" aria-hidden="true" />
						Undo
					{/if}
				</button>
			{/if}
		{:else if displayState === 'expired'}
			<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
				<TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
				<span>{closedMessage ?? 'This card expired. Ask Jev again. Nothing changed.'}</span>
			</p>
		{:else}
			<div
				class="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
				role="group"
				aria-label="Choose what happens"
				aria-describedby="{uid}-hint"
				aria-busy={busy !== null}
			>
				<button
					type="button"
					class={primaryButton}
					disabled={locked || mainChoice === null || combineBlocked !== null}
					onclick={() => mainChoice && choose(mainChoice, 'apply')}
				>
					{#if busy === 'apply'}
						{@render spinner()}
						{mainBusyLabel}
					{:else}
						<Check class="h-3.5 w-3.5" aria-hidden="true" />
						{mainLabel}
					{/if}
				</button>
				{#if spec.hasPreview}
					<button
						type="button"
						class={outlineButton}
						disabled={busy !== null}
						onclick={checkAgain}
					>
						{#if busy === 'check'}
							{@render spinner()}
							Checking…
						{:else}
							<RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
							Check again
						{/if}
					</button>
				{/if}
				<button
					type="button"
					class={quietButton}
					disabled={locked}
					onclick={() => choose('cancel', 'cancel')}
				>
					{#if busy === 'cancel'}
						{@render spinner()}
						Cancelling…
					{:else}
						Not now
					{/if}
				</button>
			</div>
			<p id="{uid}-hint" class="mt-1.5 text-2xs leading-snug text-muted-foreground">
				{hint}
			</p>
		{/if}

		{#if notice}
			<p
				class="mt-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground"
				data-testid="proposal-card-notice"
			>
				{notice}
			</p>
		{/if}
		{#if error}
			<p
				class="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-foreground"
				role="alert"
			>
				{error}
			</p>
		{/if}
		<p class="sr-only" role="status" aria-live="polite">{announcement}</p>
	</div>
</article>
