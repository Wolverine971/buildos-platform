<!-- apps/web/src/lib/components/agent/ChatShareSheet.svelte -->
<script lang="ts">
	import { getAbortSignal } from 'svelte';
	import { AlertTriangle, Check, Copy, LoaderCircle, Lock, Share2 } from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { captureEvent } from '$lib/services/posthog';
	import type { ChatSharePreview } from '$lib/types/chat-share';
	import SharedChatMessage from './SharedChatMessage.svelte';
	import { defaultChatShareSelection, reviewedChatShareSelection } from './chat-share-selection';

	let { sessionId, onClose }: { sessionId: string; onClose: () => void } = $props();
	let preview = $state.raw<ChatSharePreview | null>(null);
	let selectedIds = $state<string[]>([]);
	let showAuthor = $state(true);
	let fingerprint = $state<string | null>(null);
	let action = $state<'loading' | 'reviewing' | 'publishing' | 'revoking' | null>('loading');
	let errorMessage = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let loadRevision = $state(0);
	let requestSignal: AbortSignal;
	const endpoint = $derived(`/api/chat/sessions/${encodeURIComponent(sessionId)}/share`);
	const busy = $derived(action !== null);
	const flags = $derived(new Map(preview?.flags?.map((flag) => [flag.messageId, flag]) ?? []));
	const flaggedCount = $derived(preview?.flags?.length ?? 0);
	const selectedCount = $derived(selectedIds.length);
	const canPublish = $derived(Boolean(preview && fingerprint && selectedCount && !busy));

	type ApiResult<T> = {
		success: boolean;
		data?: T;
		error?: string;
		code?: string;
		details?: { preview?: ChatSharePreview };
	};
	type Published = {
		url: string;
		updated: boolean;
		messagesShared: number;
		messagesFlagged: number;
	};

	$effect(() => {
		const url = endpoint;
		void loadRevision;
		requestSignal = getAbortSignal();
		const signal = requestSignal;
		preview = null;
		fingerprint = null;
		action = 'loading';
		errorMessage = null;
		notice = null;
		void (async () => {
			try {
				const response = await fetch(url, { signal, cache: 'no-store' });
				const result: ApiResult<ChatSharePreview> = await response.json();
				if (!response.ok || !result.success || !result.data)
					throw new Error('Preview unavailable');
				if (signal.aborted) return;
				preview = result.data;
				selectedIds = defaultChatShareSelection(result.data);
				showAuthor = result.data.existing?.showAuthor ?? true;
			} catch {
				if (!signal.aborted) errorMessage = "Couldn't load sharing details. Try again.";
			} finally {
				if (!signal.aborted) action = null;
			}
		})();
	});

	function applyReview(next: ChatSharePreview) {
		if (!next.fingerprint) throw new Error('Review missing');
		selectedIds = preview
			? reviewedChatShareSelection(next, preview.messages, selectedIds)
			: defaultChatShareSelection(next);
		preview = next;
		fingerprint = next.fingerprint;
	}

	function setSelected(id: string, selected: boolean) {
		if (busy || flags.get(id)?.locked) return;
		selectedIds = selected
			? [...selectedIds.filter((value) => value !== id), id]
			: selectedIds.filter((value) => value !== id);
	}

	async function review() {
		if (busy || !preview) return;
		const signal = requestSignal;
		action = 'reviewing';
		fingerprint = null;
		errorMessage = null;
		notice = null;
		try {
			const response = await fetch(`${endpoint}/prepare`, { method: 'POST', signal });
			const result: ApiResult<ChatSharePreview> = await response.json();
			if (signal.aborted) return;
			if (!response.ok || !result.success || !result.data) {
				errorMessage =
					result.code === 'REVIEW_BLOCKED' && result.error
						? result.error
						: "Safety check couldn't run. Try again.";
				return;
			}
			applyReview(result.data);
		} catch {
			if (!signal.aborted) errorMessage = "Safety check couldn't run. Try again.";
		} finally {
			if (!signal.aborted) action = null;
		}
	}

	async function copySharedUrl(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			toastService.success('Link copied. Anyone with it can read this chat.');
		} catch {
			toastService.error("Couldn't copy the link. You can copy it below.");
		}
	}

	async function publish() {
		if (!canPublish || !preview || !fingerprint) return;
		const signal = requestSignal;
		action = 'publishing';
		errorMessage = null;
		notice = null;
		const includedMessageIds = selectedIds.filter((id) => !flags.get(id)?.locked);
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				signal,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ includedMessageIds, showAuthor, fingerprint })
			});
			const result: ApiResult<Published> = await response.json();
			if (signal.aborted) return;
			if (response.status === 409 && result.details?.preview) {
				fingerprint = null;
				applyReview(result.details.preview);
				notice =
					'This conversation changed. Check the refreshed preview, then publish again.';
				return;
			}
			if (!response.ok || !result.success || !result.data) {
				if (
					result.code === 'REVIEW_REQUIRED' ||
					result.code === 'REVIEW_UNAVAILABLE' ||
					result.code === 'REVIEW_BLOCKED'
				)
					fingerprint = null;
				throw new Error(
					result.code === 'REVIEW_UNAVAILABLE'
						? "Safety check couldn't run. Try again."
						: result.error || "Couldn't publish that link. Try again."
				);
			}
			const published = result.data;
			preview = {
				...preview,
				existing: {
					url: published.url,
					showAuthor,
					includedMessageIds,
					updatedAt: new Date().toISOString()
				}
			};
			captureEvent(published.updated ? 'chat_share_updated' : 'chat_share_created', {
				messages_shared: published.messagesShared,
				messages_flagged: published.messagesFlagged
			});
			notice =
				'Your shared snapshot is ready. New messages stay private until you update the link.';
			await copySharedUrl(published.url);
		} catch (error) {
			if (!signal.aborted)
				errorMessage =
					error instanceof Error
						? error.message
						: "Couldn't publish that link. Try again.";
		} finally {
			if (!signal.aborted) action = null;
		}
	}

	async function revoke() {
		if (busy || !preview?.existing) return;
		const signal = requestSignal;
		action = 'revoking';
		errorMessage = null;
		notice = null;
		try {
			const response = await fetch(endpoint, { method: 'DELETE', signal });
			const result: ApiResult<{ messagesShared?: number; messagesFlagged?: number }> =
				await response.json();
			if (!response.ok || !result.success) throw new Error('Revoke failed');
			if (signal.aborted) return;
			captureEvent('chat_share_revoked', {
				messages_shared:
					result.data?.messagesShared ?? preview.existing.includedMessageIds.length,
				messages_flagged: result.data?.messagesFlagged ?? flaggedCount
			});
			preview = { ...preview, existing: null };
			fingerprint = null;
			notice = 'Sharing stopped. The old link no longer opens this chat.';
			toastService.success('Sharing stopped');
		} catch {
			if (!signal.aborted) errorMessage = "Couldn't stop sharing. Try again.";
		} finally {
			if (!signal.aborted) action = null;
		}
	}
</script>

<Modal
	isOpen
	title="Share chat"
	size="lg"
	variant="bottom-sheet"
	{onClose}
	onBeforeClose={() => action !== 'publishing' && action !== 'revoking'}
>
	<div class="space-y-5 p-4 sm:p-6">
		{#if action === 'loading'}
			<div
				class="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
				role="status"
			>
				<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" /> Loading chat…
			</div>
		{:else if preview}
			<div>
				<h2 class="text-lg font-semibold leading-snug text-foreground">{preview.title}</h2>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
					Share a read-only snapshot. Anyone with the link can read the messages you
					include. Later messages stay private until you update it.
				</p>
			</div>
			{#if preview.existing}
				<div class="rounded-lg border border-border bg-muted/40 p-3">
					<label for="chat-share-url" class="mb-2 block micro-label text-muted-foreground"
						>Current shared link</label
					>
					<div class="flex gap-2">
						<input
							id="chat-share-url"
							readonly
							value={preview.existing.url}
							class="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
							onclick={(event) => event.currentTarget.select()}
						/>
						<Button
							size="sm"
							variant="outline"
							onclick={() => void copySharedUrl(preview!.existing!.url)}
							aria-label="Copy shared link"><Copy class="h-4 w-4" /></Button
						>
					</div>
				</div>
			{/if}
			<div
				class="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3"
			>
				<div>
					<p class="text-sm font-medium text-foreground" id="chat-share-author-label">
						Shared by {preview.authorName || 'you'}
					</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Show your name on the shared page.
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={showAuthor}
					aria-labelledby="chat-share-author-label"
					disabled={busy}
					onclick={() => (showAuthor = !showAuthor)}
					class={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${showAuthor ? 'border-accent bg-accent' : 'border-border bg-muted'}`}
				>
					<span
						class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none ${showAuthor ? 'translate-x-5' : 'translate-x-0'}`}
					></span>
				</button>
			</div>
			{#if preview.truncated}
				<p
					class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
				>
					This preview includes the most recent messages. {preview.truncated
						.omittedMessages} earlier {preview.truncated.omittedMessages === 1
						? 'message is'
						: 'messages are'} left out.
				</p>
			{/if}
			<div class="rounded-lg border border-border bg-muted/30 p-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="flex items-center gap-2 text-sm font-medium text-foreground">
						{#if fingerprint}<Check class="h-4 w-4 text-success" /> Preview reviewed{:else}<Lock
								class="h-4 w-4 text-muted-foreground"
							/> Review before sharing{/if}
					</p>
					<Button
						size="sm"
						variant="outline"
						loading={action === 'reviewing'}
						disabled={busy || preview.messages.length === 0}
						onclick={() => void review()}>Review for sharing</Button
					>
				</div>
				<p class="mt-2 text-xs leading-relaxed text-muted-foreground">
					The check flags messages that may be sensitive. Credentials, card numbers and
					Social Security numbers cannot be shared. Other flagged messages start unchecked
					so you can decide.
				</p>
			</div>
			<fieldset disabled={busy}>
				<legend class="mb-3 text-sm font-semibold text-foreground"
					>Messages to include <span class="font-normal text-muted-foreground"
						>· {selectedCount} of {preview.messages.length}</span
					></legend
				>
				<div class="space-y-3">
					{#each preview.messages as message, index (message.id)}
						{@const flag = flags.get(message.id)}
						<article
							class={`rounded-lg border p-3 sm:p-4 ${selectedIds.includes(message.id) ? 'border-border bg-card' : 'border-border bg-muted/30'}`}
						>
							<label
								class="mb-3 flex min-h-8 cursor-pointer items-center gap-3 text-sm font-semibold text-foreground"
							>
								<input
									type="checkbox"
									checked={selectedIds.includes(message.id)}
									disabled={flag?.locked || busy}
									onchange={(event) =>
										setSelected(message.id, event.currentTarget.checked)}
									aria-label={`Include message ${index + 1} from ${message.role === 'user' ? 'you' : 'BuildOS'}`}
									class="h-4 w-4 rounded border-border text-accent focus:ring-ring disabled:cursor-not-allowed"
								/>
								<span>{message.role === 'user' ? 'You' : 'BuildOS'}</span>
								{#if flag?.locked}<Lock
										class="h-3.5 w-3.5 text-muted-foreground"
									/><span
										class="ml-auto text-xs font-normal text-muted-foreground"
										>Cannot be shared</span
									>{/if}
							</label>
							{#if flag}
								<div
									class="mb-3 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground"
								>
									<p class="mb-1 flex items-center gap-1.5 font-semibold">
										<AlertTriangle class="h-3.5 w-3.5" />
										{flag.locked
											? 'Excluded for privacy'
											: 'Check before including'}
									</p>
									<ul class="list-disc space-y-1 pl-4">
										{#each flag.reasons as reason (reason)}<li>
												{reason}
											</li>{/each}
									</ul>
								</div>
							{/if}
							<SharedChatMessage {message} />
						</article>
					{/each}
					{#if preview.messages.length === 0}<p
							class="py-5 text-center text-sm text-muted-foreground"
						>
							There are no messages to share yet.
						</p>{/if}
				</div>
			</fieldset>
		{/if}
		{#if errorMessage}
			<div
				role="alert"
				class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
			>
				{errorMessage}
			</div>
			{#if !preview && !busy}<Button
					size="sm"
					variant="outline"
					onclick={() => (loadRevision += 1)}>Try again</Button
				>{/if}
		{/if}
		{#if notice}<p
				role="status"
				class="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground"
			>
				{notice}
			</p>{/if}
	</div>
	{#snippet footer()}
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-4 sm:px-6"
		>
			{#if preview?.existing}<Button
					size="sm"
					variant="ghost"
					class="text-destructive hover:text-destructive"
					disabled={busy}
					loading={action === 'revoking'}
					onclick={() => void revoke()}>Stop sharing</Button
				>{:else}<p class="text-xs text-muted-foreground">
					Only selected messages are shared.
				</p>{/if}
			<Button
				size="sm"
				disabled={!canPublish}
				loading={action === 'publishing'}
				onclick={() => void publish()}
				><Share2 class="mr-2 h-4 w-4" />{preview?.existing
					? 'Update link'
					: 'Create link'}</Button
			>
		</div>
	{/snippet}
</Modal>
