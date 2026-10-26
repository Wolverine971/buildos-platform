<!-- apps/web/src/routes/admin/emails/campaigns/[id]/+page.svelte -->
<script lang="ts">
	import CampaignPage from '$lib/components/email-campaigns/CampaignPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Campaign | BuildOS Admin</title>
</svelte:head>

{#key data.campaignId}
	<CampaignPage campaignId={data.campaignId} adminEmail={data.user?.email ?? ''} />
{/key}
