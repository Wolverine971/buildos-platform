<!-- apps/web/src/routes/voice-notes/+page.svelte -->
<script lang="ts">
	import VoiceNotesPanel from '$lib/components/voice-notes/VoiceNotesPanel.svelte';
</script>

<svelte:head>
	<title>Voice Notes | BuildOS</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-6 px-4 py-4 sm:py-8">
	<VoiceNotesPanel transcribe={true} />
</section>
