<!-- apps/web/src/routes/admin/emails/+page.svelte -->
<script lang="ts">
	import EmailManager from '$lib/components/email/EmailManager.svelte';
</script>

<svelte:head>
	<title>Email Drafts | BuildOS Admin</title>
	<meta
		name="description"
		content="Compose, review, store, and send individual BuildOS emails."
	/>
</svelte:head>

<EmailManager />
