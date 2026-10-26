<!-- apps/web/src/lib/components/email-campaigns/TailorPanel.svelte -->
<!--
	Optional AI pass: rewrites the template for each person from what they told
	us at signup. Runs only on click, in small chunks, with progress, skip of
	hand-edited/imported drafts, and per-person retry.
-->
<script lang="ts">
	import { RotateCcw, Sparkles, Square, TriangleAlert } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { campaignApi, errorMessage } from '$lib/email-campaigns/client';
	import { TAILOR_BATCH_SIZE, type CampaignRecipientView } from '$lib/email-campaigns/types';
	import { displayName } from '$lib/email-campaigns/ui-helpers';

	let {
		campaignId,
		instructions,
		editable,
		recipients,
		templateReady,
		prepare,
		oninstructions,
		onrecipients
	}: {
		campaignId: string;
		instructions: string;
		editable: boolean;
		recipients: CampaignRecipientView[];
		/** The template has a subject and body to tailor from. */
		templateReady: boolean;
		/** Flushes pending saves; resolves false when saving failed. */
		prepare: () => Promise<boolean>;
		oninstructions: (value: string) => void;
		onrecipients: (updated: CampaignRecipientView[]) => void;
	} = $props();

	let redoTailored = $state(false);
	let running = $state(false);
	let stopRequested = $state(false);
	let progressDone = $state(0);
	let progressTotal = $state(0);
	let runError = $state<string | null>(null);
	let chunkErrors = $state<Record<string, string>>({});

	const included = $derived(recipients.filter((recipient) => recipient.included));
	const protectedPeople = $derived(
		included.filter(
			(recipient) =>
				recipient.override_source === 'edited' || recipient.override_source === 'imported'
		)
	);
	const alreadyTailored = $derived(
		included.filter(
			(recipient) =>
				recipient.tailor_status === 'done' && recipient.override_source === 'tailored'
		)
	);
	const targets = $derived(
		included.filter(
			(recipient) =>
				recipient.override_source !== 'edited' &&
				recipient.override_source !== 'imported' &&
				(redoTailored || recipient.tailor_status !== 'done')
		)
	);
	const failed = $derived(
		recipients.filter(
			(recipient) => recipient.tailor_status === 'failed' || chunkErrors[recipient.id]
		)
	);

	async function run(ids: string[]) {
		if (running || ids.length === 0) return;
		// Mark busy before awaiting the save so a second click can't start a parallel (paid) run.
		running = true;
		runError = null;
		const saved = await prepare();
		if (!saved) {
			runError = 'Save failed — fix that first so tailoring uses your latest template.';
			running = false;
			return;
		}

		stopRequested = false;
		progressDone = 0;
		progressTotal = ids.length;
		const nextErrors = { ...chunkErrors };
		for (const id of ids) delete nextErrors[id];
		chunkErrors = nextErrors;

		try {
			for (let index = 0; index < ids.length; index += TAILOR_BATCH_SIZE) {
				if (stopRequested) break;
				const chunk = ids.slice(index, index + TAILOR_BATCH_SIZE);
				try {
					const updated = await campaignApi.tailor(campaignId, chunk, instructions);
					onrecipients(updated);
				} catch (error) {
					const message = errorMessage(error, 'Tailoring failed');
					chunkErrors = {
						...chunkErrors,
						...Object.fromEntries(chunk.map((id) => [id, message]))
					};
				}
				progressDone = Math.min(ids.length, index + chunk.length);
			}
		} finally {
			running = false;
		}
	}
</script>

<div class="space-y-4">
	<div>
		<label for="campaign-tailor-instructions" class="micro-label mb-1.5 block">
			How should each email change per person?
		</label>
		<textarea
			id="campaign-tailor-instructions"
			value={instructions}
			disabled={!editable || running}
			rows="3"
			placeholder="e.g. Open with what they said they struggled with when they signed up. Keep it under 120 words. Don't change the link."
			class="w-full resize-y rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-70 sm:text-sm"
			oninput={(event) => oninstructions((event.currentTarget as HTMLTextAreaElement).value)}
		></textarea>
		<p class="mt-1.5 text-xs text-muted-foreground">
			AI rewrites your template for each person using only what they told you (signup answers,
			project titles). Your links stay exactly as written. You review every version in step 4.
		</p>
	</div>

	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1 text-sm">
			<p class="text-foreground">
				<span class="font-semibold">{targets.length}</span>
				{targets.length === 1 ? 'person' : 'people'} to tailor
			</p>
			{#if protectedPeople.length > 0}
				<p class="text-xs text-muted-foreground">
					Skips {protectedPeople.length} with a draft you wrote or imported.
				</p>
			{/if}
			{#if alreadyTailored.length > 0}
				<label
					class="flex min-h-9 items-center gap-2 text-xs text-muted-foreground sm:min-h-0"
				>
					<input
						type="checkbox"
						bind:checked={redoTailored}
						disabled={running}
						class="h-4 w-4 rounded border-border-strong bg-background text-accent focus:ring-ring"
					/>
					Redo the {alreadyTailored.length} already tailored
				</label>
			{/if}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if running}
				<Button
					variant="outline"
					size="sm"
					icon={Square}
					onclick={() => (stopRequested = true)}
					disabled={stopRequested}
				>
					{stopRequested ? 'Stopping…' : 'Stop'}
				</Button>
			{/if}
			<Button
				variant="primary"
				size="md"
				icon={Sparkles}
				loading={running}
				disabled={!editable || running || targets.length === 0 || !templateReady}
				onclick={() => run(targets.map((recipient) => recipient.id))}
			>
				Tailor {targets.length || ''} with AI
			</Button>
		</div>
	</div>

	{#if !templateReady && editable}
		<p class="text-xs text-muted-foreground">
			Write a subject and body in step 2 first — tailoring starts from your template.
		</p>
	{/if}

	{#if running || progressTotal > 0}
		<div aria-live="polite" class="space-y-1.5">
			<div
				class="h-2 w-full overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={progressTotal}
				aria-valuenow={progressDone}
				aria-label="Tailoring progress"
			>
				<div
					class="h-full rounded-full bg-accent transition-[width] duration-300"
					style="width: {progressTotal ? (progressDone / progressTotal) * 100 : 0}%"
				></div>
			</div>
			<p class="stamp text-xs text-muted-foreground">
				{progressDone} of {progressTotal}
				{running ? '· working…' : stopRequested ? '· stopped' : '· done'}
			</p>
		</div>
	{/if}

	{#if runError}
		<p class="text-sm text-destructive">{runError}</p>
	{/if}

	{#if failed.length > 0 && !running}
		<div
			class="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 tx tx-static tx-weak"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="flex items-center gap-1.5 text-sm font-medium text-destructive">
					<TriangleAlert class="h-4 w-4" />
					{failed.length} couldn't be tailored — they'll get the template unless you retry.
				</p>
				<Button
					variant="outline"
					size="sm"
					icon={RotateCcw}
					disabled={!editable}
					onclick={() => run(failed.map((recipient) => recipient.id))}
				>
					Retry {failed.length}
				</Button>
			</div>
			<ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
				{#each failed as recipient (recipient.id)}
					<li class="truncate">
						<span class="text-foreground">{displayName(recipient)}</span> — {chunkErrors[
							recipient.id
						] ||
							recipient.tailor_error ||
							'unknown error'}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
