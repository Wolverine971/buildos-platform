<!-- apps/web/src/routes/admin/+layout.svelte -->
<script lang="ts">
	import AdminShell from '$lib/components/admin/AdminShell.svelte';

	export let data: {
		user?: {
			name?: string | null;
			email?: string | null;
		};
	};
</script>

<AdminShell user={data?.user}>
	<slot />
</AdminShell>
