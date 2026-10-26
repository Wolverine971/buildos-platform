<!-- apps/web/src/lib/components/email-campaigns/CampaignPage.svelte -->
<!--
	One campaign, one page: Audience → Write → Tailor (optional) → Review → Send,
	then Results once queued. Edits autosave; anything that sends waits for the
	pending save first, so what goes out is always what's on screen.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Check, CircleAlert, Loader2, RefreshCw, Trash2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import CampaignSection from './CampaignSection.svelte';
	import CampaignStatusPill from './CampaignStatusPill.svelte';
	import AudiencePanel from './AudiencePanel.svelte';
	import ComposePanel from './ComposePanel.svelte';
	import TailorPanel from './TailorPanel.svelte';
	import ReviewList from './ReviewList.svelte';
	import RecipientDrawer from './RecipientDrawer.svelte';
	import SendPanel from './SendPanel.svelte';
	import ResultsPanel from './ResultsPanel.svelte';
	import {
		campaignApi,
		errorMessage,
		isAbortError,
		type CampaignPatch
	} from '$lib/email-campaigns/client';
	import { htmlToPlainText } from '$lib/email-campaigns/render';
	import type {
		CampaignAudience,
		CampaignDetail,
		CampaignRecipientView,
		SegmentCount
	} from '$lib/email-campaigns/types';
	import { WAVE_INTERVAL_RANGE, WAVE_SIZE_RANGE } from '$lib/email-campaigns/types';
	import { checkSendReadiness, everyoneHasOwnVersion } from '$lib/email-campaigns/ui-helpers';
	import { toastService } from '$lib/stores/toast.store';

	let { campaignId, adminEmail = '' }: { campaignId: string; adminEmail?: string } = $props();

	interface Draft {
		name: string;
		subject_template: string;
		body_template: string;
		from_name: string;
		tailoring_instructions: string;
		wave_size: number;
		wave_interval_minutes: number;
		starts_at: string | null;
	}

	const SAVE_DEBOUNCE_MS = 700;
	const POLL_MS = 15_000;

	let detail = $state<CampaignDetail | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let segments = $state<SegmentCount[]>([]);
	let segmentsLoading = $state(true);
	let draft = $state<Draft>({
		name: '',
		subject_template: '',
		body_template: '',
		from_name: 'DJ',
		tailoring_instructions: '',
		wave_size: WAVE_SIZE_RANGE.default,
		wave_interval_minutes: WAVE_INTERVAL_RANGE.default,
		starts_at: null
	});
	let saveState = $state<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
	let saveError = $state<string | null>(null);
	let audienceBusy = $state(false);
	let drawerOpen = $state(false);
	let drawerRecipientId = $state<string | null>(null);
	let queueing = $state(false);
	let testing = $state(false);
	let busyAction = $state<string | null>(null);
	let retryingIds = $state(new Set<string>());
	let pendingIds = $state(new Set<string>());
	let showDelete = $state(false);
	let deleting = $state(false);

	// Not reactive: bookkeeping for the autosave queue.
	let pendingPatch: CampaignPatch = {};
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let inflight: Promise<boolean> | null = null;
	let audienceRequest = 0;

	const status = $derived(detail?.campaign.status ?? 'draft');
	const editable = $derived(status === 'draft');
	const recipients = $derived(detail?.recipients ?? []);
	const ownVersionsOnly = $derived(everyoneHasOwnVersion(detail?.campaign.source, recipients));
	const templateReady = $derived(
		Boolean(draft.subject_template.trim()) &&
			Boolean(htmlToPlainText(draft.body_template).trim())
	);
	const includedCount = $derived(recipients.filter((recipient) => recipient.included).length);
	const tailoredCount = $derived(
		recipients.filter((recipient) => recipient.override_source === 'tailored').length
	);
	const readiness = $derived(
		checkSendReadiness(
			{ subject_template: draft.subject_template, body_template: draft.body_template },
			recipients
		)
	);
	const pillCampaign = $derived({
		status,
		next_send_at:
			recipients
				.filter((recipient) => recipient.status === 'queued' && recipient.scheduled_for)
				.map((recipient) => recipient.scheduled_for as string)
				.sort()[0] ?? null,
		starts_at: detail?.campaign.starts_at ?? null,
		counts: detail?.counts ?? {
			total: 0,
			included: 0,
			draft: 0,
			queued: 0,
			sending: 0,
			sent: 0,
			failed: 0,
			skipped: 0,
			canceled: 0,
			opened: 0,
			clicked: 0,
			replied: 0,
			unsubscribed: 0,
			bounced: 0,
			tailored: 0,
			edited: 0
		}
	});

	const steps = $derived([
		{
			id: 'audience',
			label: 'Audience',
			note: `${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`
		},
		{
			id: 'write',
			label: 'Write',
			note: ownVersionsOnly ? 'own drafts' : templateReady ? 'ready' : 'needs work'
		},
		{
			id: 'tailor',
			label: 'Tailor',
			note: tailoredCount ? `${tailoredCount} tailored` : 'optional'
		},
		{ id: 'review', label: 'Review', note: `${includedCount} sending` },
		{ id: 'send', label: 'Send', note: readiness.ready ? 'ready' : 'not yet' }
	]);

	function applyCampaignToDraft(next: CampaignDetail) {
		const campaign = next.campaign;
		draft = {
			name: campaign.name,
			subject_template: campaign.subject_template ?? '',
			body_template: campaign.body_template ?? '',
			from_name: campaign.from_name || 'DJ',
			tailoring_instructions: campaign.tailoring_instructions ?? '',
			wave_size: campaign.wave_size || WAVE_SIZE_RANGE.default,
			wave_interval_minutes: campaign.wave_interval_minutes || WAVE_INTERVAL_RANGE.default,
			starts_at: campaign.starts_at
		};
	}

	async function load() {
		loading = true;
		loadError = null;
		try {
			const next = await campaignApi.get(campaignId);
			detail = next;
			applyCampaignToDraft(next);
		} catch (error) {
			loadError = errorMessage(error, 'Could not load the campaign');
		} finally {
			loading = false;
		}
	}

	async function refresh() {
		try {
			const next = await campaignApi.get(campaignId);
			detail = next;
			// Drafts keep the local (possibly unsaved) fields; locked campaigns mirror the server.
			if (next.campaign.status !== 'draft') applyCampaignToDraft(next);
		} catch (error) {
			if (!isAbortError(error)) console.warn('Campaign refresh failed', error);
		}
	}

	onMount(() => {
		void load();
		const controller = new AbortController();
		campaignApi
			.segments(controller.signal)
			.then((result) => (segments = result))
			.catch((error) => {
				if (!isAbortError(error)) console.warn('Segment counts failed', error);
			})
			.finally(() => (segmentsLoading = false));

		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (saveState === 'pending' || saveState === 'saving' || saveState === 'error') {
				event.preventDefault();
			}
		};
		window.addEventListener('beforeunload', beforeUnload);
		return () => {
			controller.abort();
			window.removeEventListener('beforeunload', beforeUnload);
			if (saveTimer) clearTimeout(saveTimer);
		};
	});

	// Live results while sending.
	$effect(() => {
		if (status !== 'sending') return;
		const timer = window.setInterval(() => void refresh(), POLL_MS);
		return () => window.clearInterval(timer);
	});

	function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
		if (!editable) return;
		draft[key] = value;
		pendingPatch = { ...pendingPatch, [key]: value };
		saveState = 'pending';
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
	}

	/** Saves anything pending; resolves false if the save failed. */
	async function flushSave(): Promise<boolean> {
		if (saveTimer) {
			clearTimeout(saveTimer);
			saveTimer = null;
		}
		if (inflight) {
			const ok = await inflight;
			if (!ok) return false;
		}
		if (Object.keys(pendingPatch).length === 0) {
			return saveState !== 'error';
		}

		const patch = pendingPatch;
		pendingPatch = {};
		saveState = 'saving';
		saveError = null;
		inflight = (async () => {
			try {
				const row = await campaignApi.update(campaignId, patch);
				if (detail) detail.campaign = row;
				return true;
			} catch (error) {
				pendingPatch = { ...patch, ...pendingPatch };
				saveError = errorMessage(error, 'Could not save');
				return false;
			}
		})();

		const ok = await inflight;
		inflight = null;
		if (!ok) {
			saveState = 'error';
			return false;
		}
		if (Object.keys(pendingPatch).length > 0) return flushSave();
		saveState = 'saved';
		return true;
	}

	async function changeAudience(audience: CampaignAudience) {
		if (!detail || !editable) return;
		const requestId = ++audienceRequest;
		const previous = detail.campaign.audience;
		detail.campaign.audience = audience;
		audienceBusy = true;
		try {
			const next = await campaignApi.setAudience(campaignId, audience);
			if (requestId !== audienceRequest) return;
			detail = { ...next, campaign: { ...next.campaign, audience } };
		} catch (error) {
			if (requestId !== audienceRequest) return;
			if (detail) detail.campaign.audience = previous;
			toastService.error(errorMessage(error, 'Could not update the list'));
		} finally {
			if (requestId === audienceRequest) audienceBusy = false;
		}
	}

	function mergeRecipients(updated: CampaignRecipientView[]) {
		if (!detail || updated.length === 0) return;
		const byId = new Map(updated.map((recipient) => [recipient.id, recipient] as const));
		detail.recipients = detail.recipients.map(
			(recipient) => byId.get(recipient.id) ?? recipient
		);
	}

	async function toggleIncluded(recipient: CampaignRecipientView, included: boolean) {
		pendingIds = new Set([...pendingIds, recipient.id]);
		mergeRecipients([{ ...recipient, included }]);
		try {
			mergeRecipients([
				await campaignApi.updateRecipient(campaignId, recipient.id, { included })
			]);
		} catch (error) {
			mergeRecipients([recipient]);
			toastService.error(errorMessage(error, 'Could not update'));
		} finally {
			const next = new Set(pendingIds);
			next.delete(recipient.id);
			pendingIds = next;
		}
	}

	function removeFromCampaign(recipient: CampaignRecipientView) {
		if (!detail) return;
		const audience = detail.campaign.audience;
		const index = recipients.findIndex((item) => item.id === recipient.id);
		const neighbor = recipients[index + 1] ?? recipients[index - 1] ?? null;
		drawerRecipientId = neighbor?.id ?? null;
		if (!neighbor) drawerOpen = false;
		void changeAudience({
			segments: audience.segments ?? [],
			people: (audience.people ?? []).filter(
				(person) => person.email.toLowerCase() !== recipient.email
			),
			removed_emails: [...new Set([...(audience.removed_emails ?? []), recipient.email])]
		});
	}

	function openRecipient(recipientId: string) {
		drawerRecipientId = recipientId;
		drawerOpen = true;
	}

	async function queueCampaign() {
		if (queueing) return;
		// Busy before awaiting the save, so a double click can't queue twice.
		queueing = true;
		const saved = await flushSave();
		if (!saved) {
			queueing = false;
			toastService.error('Your latest edits did not save, so nothing was queued.');
			return;
		}
		try {
			const next = await campaignApi.queue(campaignId, {
				starts_at: draft.starts_at,
				wave_size: draft.wave_size,
				wave_interval_minutes: draft.wave_interval_minutes
			});
			detail = next;
			applyCampaignToDraft(next);
			toastService.success(
				draft.starts_at
					? 'Queued. The first wave goes out at the time you picked.'
					: 'Queued. The first wave goes out within a minute.'
			);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (error) {
			toastService.error(errorMessage(error, 'Could not queue the campaign'));
		} finally {
			queueing = false;
		}
	}

	async function sendTemplateTest() {
		const saved = await flushSave();
		if (!saved) {
			toastService.error('Save failed — the test would not match what you see.');
			return;
		}
		testing = true;
		try {
			const firstOwn = ownVersionsOnly
				? recipients.find((recipient) => recipient.included)
				: undefined;
			const result = await campaignApi.sendTest(
				campaignId,
				firstOwn ? { recipient_id: firstOwn.id } : {}
			);
			toastService.success(
				result.logged_only
					? 'Local dev logs test emails instead of sending them'
					: `Test sent to ${result.sent_to}`
			);
		} catch (error) {
			toastService.error(errorMessage(error, 'Could not send the test'));
		} finally {
			testing = false;
		}
	}

	async function runAction(action: 'pause' | 'resume' | 'cancel') {
		busyAction = action;
		try {
			detail = await campaignApi[action](campaignId);
			const messages = {
				pause: 'Paused. Nothing more goes out until you resume.',
				resume: 'Resumed. Remaining waves are re-spaced from now.',
				cancel: 'Canceled the emails still waiting.'
			};
			toastService.success(messages[action]);
		} catch (error) {
			toastService.error(errorMessage(error, `Could not ${action}`));
		} finally {
			busyAction = null;
		}
	}

	async function retry(recipient: CampaignRecipientView) {
		retryingIds = new Set([...retryingIds, recipient.id]);
		try {
			mergeRecipients([await campaignApi.retryRecipient(campaignId, recipient.id)]);
			await refresh();
			toastService.success(`${recipient.name || recipient.email} is queued again.`);
		} catch (error) {
			toastService.error(errorMessage(error, 'Could not retry'));
		} finally {
			const next = new Set(retryingIds);
			next.delete(recipient.id);
			retryingIds = next;
		}
	}

	async function followUp() {
		busyAction = 'follow-up';
		try {
			const row = await campaignApi.followUp(campaignId);
			await goto(`/admin/emails/campaigns/${row.id}`);
		} catch (error) {
			toastService.error(errorMessage(error, 'Could not create the follow-up'));
		} finally {
			busyAction = null;
		}
	}

	async function deleteDraft() {
		deleting = true;
		try {
			if (saveTimer) clearTimeout(saveTimer);
			pendingPatch = {};
			saveState = 'idle';
			await campaignApi.remove(campaignId);
			await goto('/admin/emails');
		} catch (error) {
			toastService.error(errorMessage(error, 'Could not delete'));
		} finally {
			deleting = false;
			showDelete = false;
		}
	}
</script>

<div class="min-w-0 space-y-5 pb-16">
	<div class="space-y-3">
		<a
			href="/admin/emails"
			class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent hover:text-foreground shadow-ink pressable"
		>
			<ArrowLeft class="h-3 w-3" />
			All campaigns
		</a>

		{#if detail}
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0 flex-1 space-y-2">
					{#if editable}
						<label for="campaign-name" class="sr-only">Campaign name</label>
						<input
							id="campaign-name"
							value={draft.name}
							oninput={(event) =>
								setField('name', (event.currentTarget as HTMLInputElement).value)}
							class="-mx-2 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-bold text-foreground outline-none transition-colors hover:border-border focus:border-accent sm:text-2xl lg:text-3xl"
						/>
					{:else}
						<h1
							class="break-words text-xl font-bold text-foreground sm:text-2xl lg:text-3xl"
						>
							{draft.name}
						</h1>
					{/if}
					<div class="flex flex-wrap items-center gap-2">
						<CampaignStatusPill campaign={pillCampaign} />
						<span class="text-xs text-muted-foreground" aria-live="polite">
							{#if saveState === 'saving' || saveState === 'pending'}
								<Loader2 class="mr-1 inline h-3 w-3 animate-spin" />Saving…
							{:else if saveState === 'saved'}
								<Check class="mr-1 inline h-3 w-3 text-success" />Saved
							{:else if saveState === 'error'}
								<span class="text-destructive">
									<CircleAlert class="mr-1 inline h-3 w-3" />{saveError ||
										"Couldn't save"}
								</span>
								<button
									type="button"
									class="ml-1 font-medium text-accent underline"
									onclick={() => void flushSave()}
								>
									Retry
								</button>
							{/if}
						</span>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if status !== 'draft'}
						<Button
							variant="ghost"
							size="sm"
							icon={RefreshCw}
							onclick={() => void refresh()}
						>
							Refresh
						</Button>
					{/if}
					{#if editable}
						<Button
							variant="ghost"
							size="sm"
							icon={Trash2}
							class="text-muted-foreground"
							onclick={() => (showDelete = true)}
						>
							Delete draft
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#if loading}
		<div class="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" /> Loading campaign…
		</div>
	{:else if loadError || !detail}
		<div
			class="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center tx tx-static tx-weak"
		>
			<p class="text-sm text-destructive">{loadError || 'Campaign not found.'}</p>
			<Button variant="outline" size="sm" class="mt-3" onclick={() => void load()}
				>Try again</Button
			>
		</div>
	{:else}
		<div class="min-w-0 space-y-5">
			{#if editable}
				<!-- A strip, not a sticky rail: position:sticky is inert app-wide (body overflow-x). -->
				<nav aria-label="Campaign steps" class="-mx-1 overflow-x-auto px-1 pb-1">
					<ol class="flex min-w-max gap-1.5 sm:min-w-0">
						{#each steps as step, index (step.id)}
							<li class="sm:flex-1">
								<a
									href="#{step.id}"
									class="flex h-full items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
								>
									<span
										class="stamp mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-2xs text-muted-foreground"
									>
										{index + 1}
									</span>
									<span class="min-w-0">
										<span class="block font-medium text-foreground"
											>{step.label}</span
										>
										<span class="block truncate text-2xs text-muted-foreground"
											>{step.note}</span
										>
									</span>
								</a>
							</li>
						{/each}
					</ol>
				</nav>
			{/if}

			<div class="min-w-0 space-y-5">
				{#if !editable}
					<CampaignSection
						id="results"
						step={1}
						title="Results"
						description={status === 'completed'
							? 'Every wave has gone out.'
							: status === 'canceled'
								? 'Canceled. Emails already sent stay sent.'
								: status === 'paused'
									? 'Paused — nothing goes out until you resume.'
									: 'Going out in waves. This page refreshes every 15 seconds.'}
					>
						<ResultsPanel
							{detail}
							{busyAction}
							{retryingIds}
							onpause={() => runAction('pause')}
							onresume={() => runAction('resume')}
							oncancel={() => runAction('cancel')}
							onretry={retry}
							onfollowup={followUp}
							onopen={openRecipient}
						/>
					</CampaignSection>
				{:else}
					<CampaignSection
						id="audience"
						step={1}
						title="Audience"
						description="Pick groups, add people. Unsubscribed and admin addresses are left out automatically."
					>
						<AudiencePanel
							audience={detail.campaign.audience ?? {
								segments: [],
								people: [],
								removed_emails: []
							}}
							{segments}
							{segmentsLoading}
							{recipients}
							exclusions={detail.exclusions}
							{editable}
							busy={audienceBusy}
							onchange={changeAudience}
						/>
					</CampaignSection>
				{/if}

				<CampaignSection
					id="write"
					step={2}
					title={editable ? 'Write' : 'Template'}
					description={editable
						? 'One email for everyone. Fill-ins like first name are swapped in per person.'
						: 'What people without their own version received.'}
				>
					<ComposePanel
						fromName={draft.from_name}
						subject={draft.subject_template}
						body={draft.body_template}
						{editable}
						{ownVersionsOnly}
						{recipients}
						onfield={(field, value) => setField(field, value)}
					/>
				</CampaignSection>

				{#if editable}
					<CampaignSection
						id="tailor"
						step={3}
						title="Tailor each person"
						optional
						description="Let AI adjust the email to what each person told you. You still review every one."
					>
						<TailorPanel
							{campaignId}
							instructions={draft.tailoring_instructions}
							{editable}
							{recipients}
							{templateReady}
							prepare={flushSave}
							oninstructions={(value) => setField('tailoring_instructions', value)}
							onrecipients={mergeRecipients}
						/>
					</CampaignSection>

					<CampaignSection
						id="review"
						step={4}
						title="Review"
						description="Everyone's version, before anything goes out. Open a person to see the full email or change just theirs."
					>
						<ReviewList
							subjectTemplate={draft.subject_template}
							bodyTemplate={draft.body_template}
							{recipients}
							{editable}
							{pendingIds}
							onopen={openRecipient}
							ontoggle={toggleIncluded}
						/>
					</CampaignSection>

					<CampaignSection
						id="send"
						step={5}
						title="Send"
						description="Waves keep it personal and gentle on Gmail. Pause any time."
					>
						<SendPanel
							subjectTemplate={draft.subject_template}
							bodyTemplate={draft.body_template}
							fromName={draft.from_name}
							{recipients}
							waveSize={draft.wave_size}
							waveIntervalMinutes={draft.wave_interval_minutes}
							startsAt={draft.starts_at}
							{editable}
							{queueing}
							{testing}
							{adminEmail}
							onplan={(patch) => {
								for (const [key, value] of Object.entries(patch)) {
									setField(key as keyof Draft, value as never);
								}
							}}
							onqueue={queueCampaign}
							ontest={sendTemplateTest}
						/>
					</CampaignSection>
				{/if}
			</div>
		</div>

		<RecipientDrawer
			bind:isOpen={drawerOpen}
			{campaignId}
			recipientId={drawerRecipientId}
			recipients={editable
				? recipients
				: recipients.filter((recipient) => recipient.status !== 'draft')}
			subjectTemplate={draft.subject_template}
			bodyTemplate={draft.body_template}
			fromName={draft.from_name}
			{editable}
			{adminEmail}
			prepare={flushSave}
			onnavigate={(id) => (drawerRecipientId = id)}
			onupdated={(recipient) => mergeRecipients([recipient])}
			onremove={editable ? removeFromCampaign : undefined}
			onretry={editable ? undefined : retry}
		/>
	{/if}
</div>

<ConfirmationModal
	bind:isOpen={showDelete}
	title="Delete this draft?"
	confirmText="Delete draft"
	confirmVariant="danger"
	icon="danger"
	loading={deleting}
	loadingText="Deleting…"
	onconfirm={deleteDraft}
	oncancel={() => (showDelete = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			The campaign, its audience and every per-person draft go away. Nothing has been sent.
		</p>
	{/snippet}
</ConfirmationModal>
