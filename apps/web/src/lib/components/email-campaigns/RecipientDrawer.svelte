<!-- apps/web/src/lib/components/email-campaigns/RecipientDrawer.svelte -->
<!--
	One person's email: exactly what they get, the facts it was built from,
	and (in draft) a per-person edit, reset, skip, remove, and a test send.
	Full-screen sheet on phones, large panel on desktop.
-->
<script lang="ts">
	import {
		ChevronLeft,
		ChevronRight,
		Eye,
		PencilLine,
		RotateCcw,
		Send,
		UserMinus
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmailRenderFrame from './EmailRenderFrame.svelte';
	import RichEmailEditor from './RichEmailEditor.svelte';
	import { renderCampaignEmail } from '$lib/email-campaigns/render';
	import { campaignApi, errorMessage } from '$lib/email-campaigns/client';
	import type { CampaignRecipientView } from '$lib/email-campaigns/types';
	import {
		displayName,
		formatDateTime,
		formatShortDate,
		segmentChipLabel
	} from '$lib/email-campaigns/ui-helpers';
	import { toastService } from '$lib/stores/toast.store';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	let {
		isOpen = $bindable(false),
		campaignId,
		recipientId,
		recipients,
		subjectTemplate,
		bodyTemplate,
		fromName,
		editable,
		adminEmail = '',
		prepare,
		onnavigate,
		onupdated,
		onremove,
		onretry
	}: {
		isOpen?: boolean;
		campaignId: string;
		recipientId: string | null;
		recipients: CampaignRecipientView[];
		subjectTemplate: string;
		bodyTemplate: string;
		fromName: string;
		editable: boolean;
		adminEmail?: string;
		prepare: () => Promise<boolean>;
		onnavigate: (recipientId: string) => void;
		onupdated: (recipient: CampaignRecipientView) => void;
		onremove?: (recipient: CampaignRecipientView) => void;
		onretry?: (recipient: CampaignRecipientView) => void;
	} = $props();

	let mode = $state<'preview' | 'edit'>('preview');
	let draftSubject = $state('');
	let draftBody = $state('');
	let dirty = $state(false);
	let saving = $state(false);
	let testing = $state(false);
	let actionError = $state<string | null>(null);
	let editingId = $state<string | null>(null);

	const index = $derived(recipients.findIndex((recipient) => recipient.id === recipientId));
	const recipient = $derived(index >= 0 ? recipients[index] : null);
	const rendered = $derived(
		recipient
			? renderCampaignEmail(
					{ subject_template: subjectTemplate, body_template: bodyTemplate },
					recipient
				)
			: null
	);
	const context = $derived(recipient?.context ?? {});
	const hasOwnVersion = $derived(
		Boolean(recipient?.subject_override?.trim() || recipient?.body_override?.trim())
	);
	const canEdit = $derived(editable && recipient?.status === 'draft');

	// Leaving edit mode when the person changes (or the drawer closes).
	$effect(() => {
		const id = recipientId;
		if (id !== editingId) {
			mode = 'preview';
			dirty = false;
			editingId = null;
			actionError = null;
		}
	});

	function startEdit() {
		if (!recipient || !rendered) return;
		draftSubject = rendered.subject;
		draftBody = rendered.bodyHtml;
		dirty = false;
		editingId = recipient.id;
		mode = 'edit';
	}

	function go(offset: number) {
		const next = recipients[index + offset];
		if (next && !dirty) onnavigate(next.id);
	}

	async function saveEdit() {
		if (!recipient) return;
		saving = true;
		actionError = null;
		try {
			const updated = await campaignApi.updateRecipient(campaignId, recipient.id, {
				subject_override: draftSubject.trim(),
				body_override: draftBody
			});
			onupdated(updated);
			dirty = false;
			mode = 'preview';
			editingId = null;
		} catch (error) {
			actionError = errorMessage(error, 'Could not save this person');
		} finally {
			saving = false;
		}
	}

	async function resetToTemplate() {
		if (!recipient) return;
		saving = true;
		actionError = null;
		try {
			const updated = await campaignApi.updateRecipient(campaignId, recipient.id, {
				reset: true
			});
			onupdated(updated);
			dirty = false;
			mode = 'preview';
			editingId = null;
		} catch (error) {
			actionError = errorMessage(error, 'Could not reset');
		} finally {
			saving = false;
		}
	}

	async function setIncluded(included: boolean) {
		if (!recipient) return;
		actionError = null;
		try {
			onupdated(await campaignApi.updateRecipient(campaignId, recipient.id, { included }));
		} catch (error) {
			actionError = errorMessage(error, 'Could not update');
		}
	}

	async function sendTest() {
		if (!recipient) return;
		testing = true;
		actionError = null;
		try {
			if (dirty) await saveEdit();
			if (dirty) return;
			const saved = await prepare();
			if (!saved) {
				actionError = 'Save failed — the test would not match what you see.';
				return;
			}
			const result = await campaignApi.sendTest(campaignId, { recipient_id: recipient.id });
			toastService.success(
				result.logged_only
					? 'Local dev logs test emails instead of sending them'
					: `Test of ${displayName(recipient)}'s email sent to ${result.sent_to}`
			);
		} catch (error) {
			actionError = errorMessage(error, 'Could not send the test');
		} finally {
			testing = false;
		}
	}

	let showDiscard = $state(false);

	// Closing with unsaved edits asks first (in-app dialog, not a browser popup).
	function confirmClose(): boolean {
		if (!dirty) return true;
		showDiscard = true;
		return false;
	}

	function discardAndClose() {
		dirty = false;
		mode = 'preview';
		showDiscard = false;
		isOpen = false;
	}

	const facts = $derived(
		[
			['Signed up', context.signup_month ?? formatShortDate(context.signed_up_at)],
			[
				'Account',
				context.has_account === false ? 'No account yet' : context.has_account ? 'Yes' : ''
			],
			['Last visit', context.last_visit_at ? formatShortDate(context.last_visit_at) : ''],
			[
				'Projects',
				context.project_count != null
					? `${context.project_count}${context.last_project ? ` · latest “${context.last_project}”` : ''}`
					: ''
			],
			['Role', [context.job_title, context.company_name].filter(Boolean).join(' at ')],
			['Why they signed up', context.why_interested ?? ''],
			['Biggest challenge', context.biggest_challenge ?? ''],
			['Tools', (context.productivity_tools ?? []).join(', ')],
			['Onboarding intent', context.onboarding_intent ?? '']
		].filter(([, value]) => Boolean(value)) as [string, string][]
	);

	const timeline = $derived(
		recipient
			? ([
					[
						'Scheduled',
						recipient.status === 'queued' ? formatDateTime(recipient.scheduled_for) : ''
					],
					['Sent', formatDateTime(recipient.sent_at)],
					[
						'Opened',
						recipient.opened_at
							? `${formatDateTime(recipient.opened_at)}${recipient.open_count > 1 ? ` · ${recipient.open_count}×` : ''}`
							: ''
					],
					[
						'Clicked',
						recipient.first_clicked_at
							? `${formatDateTime(recipient.first_clicked_at)}${recipient.click_count > 1 ? ` · ${recipient.click_count}×` : ''}`
							: ''
					],
					['Replied', formatDateTime(recipient.replied_at)],
					['Unsubscribed', formatDateTime(recipient.unsubscribed_at)],
					['Bounced', formatDateTime(recipient.bounced_at)]
				].filter(([, value]) => Boolean(value)) as [string, string][])
			: []
	);
</script>

<Modal
	bind:isOpen
	title={recipient ? displayName(recipient) : 'Email'}
	size="xl"
	variant="bottom-sheet"
	presentation="immersive"
	onBeforeClose={confirmClose}
>
	{#if recipient && rendered}
		<div class="flex flex-col gap-4 p-4 sm:p-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="truncate text-sm text-muted-foreground">{recipient.email}</p>
					<div class="mt-1 flex flex-wrap gap-1">
						{#if recipient.segment !== 'imported' || !recipient.override_source}
							<span
								class="rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-muted-foreground"
							>
								{segmentChipLabel(recipient.segment)}
							</span>
						{/if}
						{#if recipient.override_source}
							<span
								class="rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-medium capitalize text-foreground"
							>
								{recipient.override_source}
							</span>
						{/if}
						{#if !recipient.included}
							<span
								class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-foreground"
							>
								Skipped
							</span>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-1">
					<button
						type="button"
						onclick={() => go(-1)}
						disabled={index <= 0 || dirty}
						class="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
						aria-label="Previous person"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>
					<span class="stamp min-w-[4.5rem] text-center text-xs text-muted-foreground">
						{index + 1} of {recipients.length}
					</span>
					<button
						type="button"
						onclick={() => go(1)}
						disabled={index >= recipients.length - 1 || dirty}
						class="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
						aria-label="Next person"
					>
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
			</div>

			<div class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
				<div class="min-w-0 space-y-3">
					{#if canEdit}
						<div class="inline-flex rounded-lg bg-muted p-0.5" role="tablist">
							<button
								type="button"
								role="tab"
								aria-selected={mode === 'preview'}
								onclick={() => {
									if (!dirty) mode = 'preview';
								}}
								class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {mode ===
								'preview'
									? 'bg-card text-foreground shadow-ink'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								<Eye class="h-3.5 w-3.5" /> What they get
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={mode === 'edit'}
								onclick={() => (mode === 'edit' ? null : startEdit())}
								class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {mode ===
								'edit'
									? 'bg-card text-foreground shadow-ink'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								<PencilLine class="h-3.5 w-3.5" /> Edit for {recipient.first_name ||
									'this person'}
							</button>
						</div>
					{/if}

					{#if mode === 'edit' && canEdit}
						<div class="space-y-3">
							<div>
								<label for="recipient-subject" class="micro-label mb-1 block"
									>Subject</label
								>
								<input
									id="recipient-subject"
									bind:value={draftSubject}
									oninput={() => (dirty = true)}
									class="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none focus:border-accent sm:text-sm"
								/>
							</div>
							<RichEmailEditor
								value={draftBody}
								minHeight={260}
								ariaLabel="Email body for {displayName(recipient)}"
								onchange={(html) => {
									draftBody = html;
									dirty = true;
								}}
							/>
							<p class="text-xs text-muted-foreground">
								Only {displayName(recipient)} gets this version. Template changes won't
								reach them until you reset.
							</p>
							<div class="flex flex-wrap justify-end gap-2">
								<Button
									variant="ghost"
									size="sm"
									onclick={() => {
										dirty = false;
										mode = 'preview';
										editingId = null;
									}}
									disabled={saving}
								>
									Cancel
								</Button>
								<Button
									variant="primary"
									size="sm"
									loading={saving}
									disabled={saving || !draftSubject.trim()}
									onclick={saveEdit}
								>
									Save for {recipient.first_name || 'this person'}
								</Button>
							</div>
						</div>
					{:else}
						<EmailRenderFrame
							subject={rendered.subject}
							bodyHtml={rendered.bodyHtml}
							{fromName}
							toLabel="{displayName(recipient)} <{recipient.email}>"
							minHeight={460}
						/>
					{/if}
				</div>

				<aside class="min-w-0 space-y-4">
					{#if timeline.length > 0 || recipient.status !== 'draft'}
						<div class="rounded-lg border border-border bg-background p-3">
							<p class="micro-label mb-2">Status · {recipient.status}</p>
							{#if timeline.length > 0}
								<dl class="space-y-1.5 text-xs">
									{#each timeline as [label, value] (label)}
										<div class="flex justify-between gap-3">
											<dt class="text-muted-foreground">{label}</dt>
											<dd class="stamp text-right text-foreground">
												{value}
											</dd>
										</div>
									{/each}
								</dl>
							{/if}
							{#if recipient.skip_reason}
								<p class="mt-2 text-xs text-muted-foreground">
									Skipped: {recipient.skip_reason}
								</p>
							{/if}
							{#if recipient.error_message}
								<p class="mt-2 text-xs text-destructive">
									{recipient.error_message}
								</p>
							{/if}
							{#if recipient.status === 'failed' && onretry}
								<Button
									variant="outline"
									size="sm"
									icon={RotateCcw}
									class="mt-3"
									onclick={() => onretry?.(recipient)}
								>
									Retry
								</Button>
							{/if}
						</div>
					{/if}

					<div class="rounded-lg border border-border bg-background p-3">
						<p class="micro-label mb-2">What we know</p>
						{#if facts.length === 0}
							<p class="text-xs text-muted-foreground">
								Nothing beyond their address.
							</p>
						{:else}
							<dl class="space-y-2 text-xs">
								{#each facts as [label, value] (label)}
									<div>
										<dt class="text-muted-foreground">{label}</dt>
										<dd class="break-words text-foreground">{value}</dd>
									</div>
								{/each}
							</dl>
						{/if}
						{#if recipient.tailor_status === 'failed' && recipient.tailor_error}
							<p class="mt-2 text-xs text-destructive">
								Tailoring failed: {recipient.tailor_error}
							</p>
						{/if}
					</div>

					{#if actionError}
						<p class="text-sm text-destructive" role="alert">{actionError}</p>
					{/if}

					<div class="flex flex-col gap-2">
						{#if canEdit && hasOwnVersion}
							<Button
								variant="outline"
								size="sm"
								icon={RotateCcw}
								disabled={saving}
								onclick={resetToTemplate}
							>
								Reset to template
							</Button>
						{/if}
						{#if editable && recipient.status === 'draft'}
							<label
								class="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground"
							>
								<input
									type="checkbox"
									checked={recipient.included}
									onchange={(event) =>
										setIncluded(
											(event.currentTarget as HTMLInputElement).checked
										)}
									class="h-4 w-4 rounded border-border-strong bg-background text-accent focus:ring-ring"
								/>
								Send to {recipient.first_name || 'this person'}
							</label>
						{/if}
						<Button
							variant="outline"
							size="sm"
							icon={Send}
							loading={testing}
							disabled={testing || saving}
							onclick={sendTest}
						>
							Send me a test of this one
						</Button>
						{#if adminEmail}
							<p class="-mt-1 text-center text-2xs text-muted-foreground">
								Goes to {adminEmail}
							</p>
						{/if}
						{#if editable && recipient.status === 'draft' && onremove}
							<Button
								variant="ghost"
								size="sm"
								icon={UserMinus}
								class="text-muted-foreground"
								onclick={() => onremove?.(recipient)}
							>
								Remove from this campaign
							</Button>
						{/if}
					</div>
				</aside>
			</div>
		</div>
	{/if}
</Modal>

<ConfirmationModal
	bind:isOpen={showDiscard}
	title="Discard your changes?"
	confirmText="Discard"
	cancelText="Keep editing"
	confirmVariant="danger"
	icon="warning"
	onconfirm={discardAndClose}
	oncancel={() => (showDiscard = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			Your edits to this person's email haven't been saved.
		</p>
	{/snippet}
</ConfirmationModal>
