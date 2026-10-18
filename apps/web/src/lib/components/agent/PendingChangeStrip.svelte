<!-- apps/web/src/lib/components/agent/PendingChangeStrip.svelte -->
<!--
	"Didn't finish from earlier": pinned above the composer while the chat still
	carries changes a failed write left owed (every later turn is told about
	them). Finish it sends an ordinary message that runs a normal turn; Dismiss
	clears them so the chat stops bringing them up. Both wait while a reply runs.
	INKPRINT: warning sub-surface (tx-static, goldenrod icon + foreground text).
-->
<script lang="ts">
	import { TriangleAlert } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PendingChangeViewV1 } from '$lib/services/agentic-chat-v2/pending-change';

	let {
		view,
		busy = false,
		disabled = false,
		finishDisabled = false,
		onDismiss,
		onFinish
	}: {
		view: PendingChangeViewV1;
		busy?: boolean;
		/** A reply is running: both choices wait for it. */
		disabled?: boolean;
		/** Images are attached to the draft; Finish it would send them too. */
		finishDisabled?: boolean;
		onDismiss: () => void;
		onFinish: () => void;
	} = $props();

	const VISIBLE_ITEMS = 3;
	let expanded = $state(false);
	const hiddenCount = $derived(Math.max(0, view.items.length - VISIBLE_ITEMS));
	const shownItems = $derived(expanded ? view.items : view.items.slice(0, VISIBLE_ITEMS));
</script>

<section
	class="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 tx tx-static tx-weak"
	aria-label="Changes that didn't finish"
	data-testid="pending-change-strip"
>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<!-- basis-64: on a phone the buttons wrap under the text instead of squeezing it. -->
		<div class="flex min-w-0 flex-1 basis-64 items-start gap-2">
			<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
			<div class="min-w-0 text-sm">
				<p class="font-medium text-foreground">Didn't finish from earlier</p>
				<p class="text-muted-foreground">
					{shownItems.join(' · ')}{#if hiddenCount > 0 && !expanded}
						<button
							type="button"
							class="ml-1 font-medium text-foreground underline underline-offset-2"
							onclick={() => (expanded = true)}>+{hiddenCount} more</button
						>{/if}
				</p>
			</div>
		</div>
		<div class="ml-auto flex shrink-0 items-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				disabled={disabled || busy}
				onclick={onDismiss}
				title={disabled ? 'Wait for the reply to finish' : undefined}
			>
				Dismiss
			</Button>
			<Button
				variant="primary"
				size="sm"
				disabled={disabled || busy || finishDisabled}
				onclick={onFinish}
				title={finishDisabled
					? 'Send or remove the attached images first'
					: disabled
						? 'Wait for the reply to finish'
						: undefined}
			>
				Finish it
			</Button>
		</div>
	</div>
</section>
