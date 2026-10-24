<!-- apps/web/src/lib/components/people/ProjectJoinArrival.svelte -->
<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Bell } from '$lib/icons/lucide';
	import { browserPushService } from '$lib/services/browser-push.service';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { projectArrivalMessage } from './project-arrival';

	let {
		projectId,
		projectName,
		isAuthenticated
	}: {
		projectId: string;
		projectName: string;
		isAuthenticated: boolean;
	} = $props();

	let showPushOffer = $state(false);
	let enabling = $state(false);
	let error = $state<string | null>(null);

	afterNavigate(() => {
		if (
			!isAuthenticated ||
			page.url.pathname !== `/projects/${projectId}` ||
			page.url.searchParams.get('joined') !== '1'
		)
			return;
		// Consume only this marker, preserving the current reader, filters and history state.
		const url = new URL(page.url);
		url.searchParams.delete('joined');
		replaceState(url, page.state);
		toastService.success(projectArrivalMessage(projectName));
		showPushOffer = browserPushService.isSupported();
	});

	async function enablePush() {
		if (enabling) return;
		enabling = true;
		error = null;
		try {
			if (!(await browserPushService.requestPermission())) {
				error =
					'Push permission wasn’t granted. You can change it in your browser settings.';
				return;
			}
			await browserPushService.subscribe();
			const response = await fetch('/api/notification-preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				// Opting into push never changes email, in-app or activity choices.
				body: JSON.stringify({ push_enabled: true })
			});
			if (!response.ok) throw new Error('Couldn’t save push notifications. Try again.');
			showPushOffer = false;
			toastService.success('Push notifications enabled for this device.');
		} catch (cause) {
			void logOntologyClientError(cause, {
				endpoint: '/api/notification-preferences',
				method: 'PUT',
				projectId,
				operation: 'project_arrival_push_opt_in'
			});
			error =
				cause instanceof Error
					? cause.message
					: 'Couldn’t enable push notifications. Try again.';
		} finally {
			enabling = false;
		}
	}
</script>

{#if showPushOffer}
	<aside
		aria-label="Project notification options"
		class="border-b border-border bg-card px-4 py-3"
	>
		<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
			<div class="flex min-w-0 flex-1 items-start gap-2">
				<Bell class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<p class="text-sm text-muted-foreground">
					Want updates on this device? You can enable push notifications anytime.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					onclick={enablePush}
					disabled={enabling}
					class="min-h-[44px] rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				>
					{enabling ? 'Enabling…' : 'Enable push notifications'}
				</button>
				<button
					onclick={() => {
						showPushOffer = false;
					}}
					disabled={enabling}
					class="min-h-[44px] rounded-lg px-3 py-2 text-sm text-muted-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
					>Not now</button
				>
			</div>
			{#if error}<p class="w-full text-sm text-destructive" role="alert">{error}</p>{/if}
		</div>
	</aside>
{/if}
