<!-- src/lib/components/project/ProjectCalendarConnectModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Project } from '$lib/types/project';

	export let isOpen = false;
	export let project: Project | null = null;
	export let redirectPath: string | null = null;

	const dispatch = createEventDispatcher();

	let isConnecting = false;
	let connectError: string | null = null;

	function resolveRedirect(): string {
		if (redirectPath) {
			return redirectPath;
		}

		if (browser) {
			const path = `${window.location.pathname}${window.location.search}`;
			return path.startsWith('/') ? path : `/${path}`;
		}

		return project?.id ? `/projects/${project.id}` : '/projects';
	}

	async function startConnection() {
		if (isConnecting) return;

		isConnecting = true;
		connectError = null;

		try {
			const redirect = resolveRedirect();
			const params = new URLSearchParams();
			if (redirect) {
				params.set('redirect', redirect);
			}

			const response = await fetch(
				`/profile/calendar${params.toString() ? `?${params.toString()}` : ''}`
			);

			if (!response.ok) {
				throw new Error('Failed to prepare Google Calendar connection.');
			}

			const result = await response.json();
			const authUrl: string | undefined = result?.calendarAuthUrl;

			if (!authUrl) {
				throw new Error('Missing Google authorization URL.');
			}

			if (browser) {
				window.location.href = authUrl;
			}
		} catch (error: any) {
			console.error('Failed to start calendar connection:', error);
			connectError = error?.message || 'Failed to start calendar connection.';
			isConnecting = false;
			return;
		}
	}

	function handleClose() {
		if (isConnecting) return;
		dispatch('close');
	}
</script>

<Modal
	{isOpen}
	size="md"
	title={`Connect Google Calendar${project ? ` for ${project.name}` : ''}`}
	onClose={handleClose}
>
	<div class="space-y-6 px-1 py-4 sm:px-6">
		<section class="space-y-3">
			<p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
				Connect your Google Calendar to sync scheduled tasks, keep your plan aligned, and
				surface upcoming commitments automatically inside BuildOS.
			</p>
			<ul class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
				<li
					class="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
				>
					<span class="mt-1 inline-flex h-2 w-2 flex-none rounded-full bg-blue-500"
					></span>
					<span
						>Authorize us once to create and manage a project-specific Google Calendar
						for you.</span
					>
				</li>
				<li
					class="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
				>
					<span class="mt-1 inline-flex h-2 w-2 flex-none rounded-full bg-blue-500"
					></span>
					<span
						>Control which BuildOS tasks appear in Google Calendar and keep schedules in
						sync.</span
					>
				</li>
				<li
					class="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
				>
					<span class="mt-1 inline-flex h-2 w-2 flex-none rounded-full bg-blue-500"
					></span>
					<span
						>Unlock timeline views, reminders, and notifications across both products
						automatically.</span
					>
				</li>
			</ul>
		</section>

		{#if connectError}
			<div
				class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/30 dark:text-red-200"
			>
				{connectError}
			</div>
		{/if}

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
			<Button
				variant="ghost"
				on:click={handleClose}
				disabled={isConnecting}
				class="sm:min-w-[120px]"
			>
				Cancel
			</Button>
			<Button on:click={startConnection} loading={isConnecting} class="sm:min-w-[170px]">
				Connect Google Calendar
			</Button>
		</div>
	</div>
</Modal>
