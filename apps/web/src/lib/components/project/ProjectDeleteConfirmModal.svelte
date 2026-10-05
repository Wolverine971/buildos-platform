<!-- apps/web/src/lib/components/project/ProjectDeleteConfirmModal.svelte -->
<!--
  Confirms deleting a project. Deleting moves it to Trash for 30 days (restorable from
  Projects), so the copy says that plainly. When other people are on the project it
  names who loses access and, for the owner, offers handing it off instead.
-->
<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Users } from '$lib/icons/lucide';
	import { countPeople, formatPeopleList, personLabel } from './project-sharing-copy';

	type MemberRow = {
		actor_id: string;
		role_key: string;
		actor?: { name: string | null; email: string | null } | null;
	};

	let {
		isOpen,
		projectId,
		projectName,
		loading = false,
		error = null,
		onconfirm,
		oncancel,
		onHandOff
	}: {
		isOpen: boolean;
		projectId: string;
		projectName: string;
		loading?: boolean;
		error?: string | null;
		onconfirm: () => void | Promise<void>;
		oncancel: () => void;
		/** Closes this dialog and opens collaboration settings; omitted where that can't open. */
		onHandOff?: () => void;
	} = $props();

	let membersLoading = $state(false);
	let membersUnknown = $state(false);
	let otherPeople = $state<string[]>([]);
	let viewerIsOwner = $state(false);

	// Who else is on the project, read fresh each time the dialog opens.
	$effect(() => {
		if (!isOpen || !projectId) return;
		const controller = new AbortController();
		membersLoading = true;
		membersUnknown = false;
		otherPeople = [];
		viewerIsOwner = false;
		void loadMembers(projectId, controller.signal);
		return () => controller.abort();
	});

	async function loadMembers(id: string, signal: AbortSignal) {
		try {
			const response = await fetch(`/api/onto/projects/${id}/members`, {
				method: 'GET',
				credentials: 'same-origin',
				signal
			});
			const payload = await response.json().catch(() => null);
			if (signal.aborted) return;
			if (!response.ok) {
				membersUnknown = true;
				return;
			}
			const rows: MemberRow[] = Array.isArray(payload?.data?.members)
				? payload.data.members
				: [];
			const actorId: string | null = payload?.data?.actorId ?? null;
			otherPeople = rows
				.filter((row) => row.actor_id !== actorId)
				.map((row) => personLabel(row.actor?.name, row.actor?.email));
			viewerIsOwner = rows.some(
				(row) => row.actor_id === actorId && row.role_key === 'owner'
			);
		} catch {
			if (!signal.aborted) membersUnknown = true;
		} finally {
			if (!signal.aborted) membersLoading = false;
		}
	}

	const canHandOff = $derived(Boolean(onHandOff) && viewerIsOwner && otherPeople.length > 0);
</script>

<ConfirmationModal
	title="Delete project"
	{isOpen}
	{loading}
	onconfirm={() => void onconfirm()}
	{oncancel}
>
	{#snippet content()}
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground">
				<span class="font-semibold text-foreground">{projectName || 'This project'}</span>
				moves to Trash. You can restore it from Projects for 30 days; after that it’s erased
				for good. Its events are removed from Google Calendar now.
			</p>
			{#if membersLoading}
				<p class="text-xs text-muted-foreground" role="status">
					Checking who else is on it…
				</p>
			{:else if otherPeople.length > 0}
				<div
					class="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-left tx tx-static tx-weak"
				>
					<Users class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
					<p class="text-sm text-foreground">
						{countPeople(otherPeople.length)} will lose access: {formatPeopleList(
							otherPeople
						)}. We’ll email them.
					</p>
				</div>
			{:else if membersUnknown}
				<p class="text-xs text-muted-foreground">
					Couldn’t check who else is on it. Anyone who is will get an email.
				</p>
			{/if}
		</div>
	{/snippet}

	{#snippet details()}
		{#if error}
			<p class="mt-2 text-sm text-destructive" role="alert">{error}</p>
		{/if}
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-col gap-3 border-t border-border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-4 sm:py-4 lg:px-6"
		>
			{#if canHandOff}
				<Button
					variant="outline"
					size="md"
					icon={Users}
					disabled={loading}
					onclick={() => onHandOff?.()}
					class="order-2 w-full sm:order-1 sm:mr-auto sm:w-auto"
				>
					Hand it off instead
				</Button>
			{/if}
			<Button
				variant="secondary"
				size="md"
				disabled={loading}
				onclick={oncancel}
				class="order-3 w-full sm:order-2 sm:w-auto"
			>
				Cancel
			</Button>
			<Button
				variant="danger"
				size="md"
				{loading}
				disabled={loading || membersLoading}
				onclick={() => void onconfirm()}
				class="order-1 w-full sm:order-3 sm:w-auto"
			>
				{loading ? 'Moving to Trash…' : 'Move to Trash'}
			</Button>
		</div>
	{/snippet}
</ConfirmationModal>
