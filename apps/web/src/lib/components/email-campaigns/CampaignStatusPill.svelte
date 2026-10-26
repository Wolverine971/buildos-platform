<!-- apps/web/src/lib/components/email-campaigns/CampaignStatusPill.svelte -->
<script lang="ts">
	import type { CampaignSummary } from '$lib/email-campaigns/types';
	import { campaignStatusPill, PILL_TONE_CLASSES } from '$lib/email-campaigns/ui-helpers';

	let {
		campaign,
		class: className = ''
	}: {
		campaign: Pick<CampaignSummary, 'status' | 'next_send_at' | 'starts_at' | 'counts'>;
		class?: string;
	} = $props();

	const pill = $derived(campaignStatusPill(campaign));
</script>

<span
	class="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-0.5 text-xs font-medium {PILL_TONE_CLASSES[
		pill.tone
	]} {className}"
>
	{#if campaign.status === 'sending'}
		<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current motion-safe:animate-pulse"></span>
	{/if}
	<span class="truncate">{pill.label}</span>
</span>
