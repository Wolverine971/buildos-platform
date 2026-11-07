<script lang="ts">
	import Navigation from '../Navigation.svelte';
	import { setReaderChatContext, type ReaderChatContext } from '../reader-chat-context';
	import ProjectItemPage from '$lib/components/projects/desktop/ProjectItemPage.svelte';
	import type { ProjectItemPageData } from '$lib/server/projects/project-item-page';

	let { data }: { data: ProjectItemPageData } = $props();
	const readerChat: ReaderChatContext = $state({});
	setReaderChatContext(readerChat);
</script>

<Navigation user={{ name: 'Reader' }} />
<ProjectItemPage {data} />
