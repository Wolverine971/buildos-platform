<!-- apps/web/src/lib/components/organize/OrganizeEntryButton.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/Button.svelte';
	import { FolderInput } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	let {
		projectId,
		itemId,
		kind,
		disabled = false,
		label = 'Move to…',
		onNavigate
	}: {
		projectId: string;
		itemId: string;
		kind: 'document' | 'task';
		disabled?: boolean;
		label?: string;
		onNavigate?: () => void;
	} = $props();
	async function openOrganize() {
		if (disabled) return;
		const target = `${resolve('/projects/[id]/organize', { id: projectId })}?${kind}=${encodeURIComponent(itemId)}`;
		onNavigate?.();
		try {
			await goto(target);
		} catch {
			toastService.error('Could not open Organize. Please try again.');
		}
	}
</script>

<Button
	variant="ghost"
	size="sm"
	{disabled}
	onclick={openOrganize}
	title={disabled
		? 'Save pending edits before moving this item.'
		: 'Choose a project and review this move in Organize'}
>
	<FolderInput class="h-4 w-4" />
	{label}
</Button>
