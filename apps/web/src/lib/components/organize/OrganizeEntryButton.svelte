<!-- apps/web/src/lib/components/organize/OrganizeEntryButton.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
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
		variant = 'button',
		onNavigate
	}: {
		projectId: string;
		itemId: string;
		kind: 'document' | 'task';
		disabled?: boolean;
		label?: string;
		/** `menuitem` renders a row for an open menu, which stays open until Organize loads. */
		variant?: 'button' | 'menuitem';
		/** Closes an editor that is still open after Organize loaded (one hosted outside the page). */
		onNavigate?: () => void;
	} = $props();
	let navigating = $state(false);
	const title = $derived(
		disabled
			? 'Save pending edits before moving this item.'
			: 'Choose a project and review this move in Organize'
	);
	let mounted = true;
	onDestroy(() => {
		mounted = false;
	});
	async function openOrganize() {
		if (disabled || navigating) return;
		const path = resolve('/projects/[id]/organize', { id: projectId });
		navigating = true;
		try {
			// Navigate first; the route change unmounts the editor. Closing it before
			// `goto` aborts the navigation: an editor opened with pushState closes
			// with history.back(), and SvelteKit's popstate handler cancels any
			// in-flight goto, leaving the user on the project page.
			await goto(`${path}?${kind}=${encodeURIComponent(itemId)}`);
		} catch {
			toastService.error('Could not open Organize. Please try again.');
			return;
		} finally {
			navigating = false;
		}
		if (mounted && window.location.pathname === path) onNavigate?.();
	}
</script>

{#if variant === 'menuitem'}
	<button
		type="button"
		role="menuitem"
		disabled={disabled || navigating}
		aria-busy={navigating}
		onclick={openOrganize}
		{title}
		class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
	>
		<FolderInput class="w-3.5 h-3.5 shrink-0" />
		{label}
	</button>
{:else}
	<Button variant="ghost" size="sm" {disabled} onclick={openOrganize} {title}>
		<FolderInput class="h-4 w-4" />
		{label}
	</Button>
{/if}
