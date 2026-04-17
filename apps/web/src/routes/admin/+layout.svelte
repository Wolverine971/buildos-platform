<!-- apps/web/src/routes/admin/+layout.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';

	let {
		data,
		children
	}: {
		data: {
			user?: {
				name?: string | null;
				email?: string | null;
			};
		};
		children?: Snippet;
	} = $props();
</script>

<AdminShell user={data?.user}>
	{@render children?.()}
</AdminShell>
