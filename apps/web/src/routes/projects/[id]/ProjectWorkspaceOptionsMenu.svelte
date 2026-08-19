<!-- apps/web/src/routes/projects/[id]/ProjectWorkspaceOptionsMenu.svelte -->
<!-- Project-level controls restored from the original project workspace. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import {
		deleteProject,
		fetchProjectNotificationSettings,
		updateProjectNotificationSettings,
		type ProjectNotificationSettings
	} from '$lib/components/project/project-page-data-controller';
	import { toastService } from '$lib/stores/toast.store';
	import type { Document, Project } from '$lib/types/onto';
	import {
		Bell,
		BellOff,
		Calendar,
		MoreHorizontal,
		Pencil,
		Trash2,
		Users
	} from '$lib/icons/lucide';

	let {
		project,
		contextDocument,
		canEdit,
		canAdmin,
		canOpenCollaboration,
		canDeleteProject,
		onProjectSaved
	}: {
		project: Project;
		contextDocument: Document | null;
		canEdit: boolean;
		canAdmin: boolean;
		canOpenCollaboration: boolean;
		canDeleteProject: boolean;
		onProjectSaved: () => void | Promise<void>;
	} = $props();

	let showMenu = $state(false);
	let menuPosition = $state({ top: 0, right: 8 });
	let menuRef = $state<HTMLDivElement | null>(null);
	let menuTrigger = $state<HTMLButtonElement | null>(null);
	let showProjectEditModal = $state(false);
	let showProjectCalendarModal = $state(false);
	let showCollaborationModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let notificationSettings = $state<ProjectNotificationSettings | null>(null);
	let isNotificationSettingsLoading = $state(false);
	let isNotificationSettingsSaving = $state(false);
	let notificationSettingsLoadPromise = $state<Promise<void> | null>(null);

	function menuItems(): HTMLButtonElement[] {
		if (!menuRef) return [];
		return Array.from(menuRef.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
			(item) => !item.disabled
		);
	}

	function openMenu(event: MouseEvent) {
		const trigger = event.currentTarget as HTMLButtonElement;
		const rect = trigger.getBoundingClientRect();
		const estimatedMenuHeight = 284;
		menuTrigger = trigger;
		menuPosition = {
			top: Math.max(
				8,
				Math.min(rect.bottom + 4, window.innerHeight - estimatedMenuHeight - 8)
			),
			right: Math.max(8, window.innerWidth - rect.right)
		};
		showMenu = true;
		if (canOpenCollaboration) void ensureNotificationSettingsLoaded();
	}

	function closeMenu(restoreFocus = true) {
		if (!showMenu) return;
		showMenu = false;
		if (restoreFocus) menuTrigger?.focus();
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		const items = menuItems();
		if (items.length === 0) return;
		const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				items[(currentIndex + 1 + items.length) % items.length]?.focus();
				break;
			case 'ArrowUp':
				event.preventDefault();
				items[(currentIndex - 1 + items.length) % items.length]?.focus();
				break;
			case 'Home':
				event.preventDefault();
				items[0]?.focus();
				break;
			case 'End':
				event.preventDefault();
				items[items.length - 1]?.focus();
				break;
			case 'Escape':
				event.preventDefault();
				closeMenu();
				break;
		}
	}

	async function loadNotificationSettings() {
		if (!project.id || !canOpenCollaboration) return;
		isNotificationSettingsLoading = true;
		try {
			notificationSettings = await fetchProjectNotificationSettings(project.id);
		} catch (error) {
			console.error('[Project workspace] Failed to load notification settings', error);
		} finally {
			isNotificationSettingsLoading = false;
		}
	}

	async function ensureNotificationSettingsLoaded(force = false) {
		if (!project.id || !canOpenCollaboration) return;
		if (!force && notificationSettings) return;
		if (notificationSettingsLoadPromise) {
			await notificationSettingsLoadPromise;
			return;
		}
		notificationSettingsLoadPromise = (async () => {
			try {
				await loadNotificationSettings();
			} finally {
				notificationSettingsLoadPromise = null;
			}
		})();
		await notificationSettingsLoadPromise;
	}

	async function toggleProjectNotifications() {
		if (!notificationSettings || isNotificationSettingsSaving) return;
		const previous = notificationSettings;
		const nextEnabled = !previous.member_enabled;
		notificationSettings = {
			...previous,
			member_enabled: nextEnabled,
			effective_enabled: nextEnabled,
			member_overridden: nextEnabled !== previous.project_default_enabled
		};
		isNotificationSettingsSaving = true;
		try {
			notificationSettings = await updateProjectNotificationSettings({
				projectId: project.id,
				memberEnabled: nextEnabled
			});
			toastService.success(
				nextEnabled
					? 'Project activity notifications enabled'
					: 'Project activity notifications muted'
			);
		} catch (error) {
			notificationSettings = previous;
			toastService.error(
				error instanceof Error ? error.message : 'Failed to update notification settings'
			);
		} finally {
			isNotificationSettingsSaving = false;
		}
	}

	async function confirmProjectDelete() {
		isDeletingProject = true;
		deleteProjectError = null;
		try {
			await deleteProject(project.id);
			toastService.success('Project deleted');
			showDeleteProjectModal = false;
			await goto('/projects');
		} catch (error) {
			deleteProjectError =
				error instanceof Error ? error.message : 'Failed to delete project';
			toastService.error(deleteProjectError);
		} finally {
			isDeletingProject = false;
		}
	}

	$effect(() => {
		if (showMenu && menuRef) menuItems()[0]?.focus();
	});
</script>

<svelte:window onresize={() => closeMenu(false)} onscroll={() => closeMenu(false)} />

<Button
	variant="ghost"
	size="sm"
	icon={MoreHorizontal}
	class="rounded-md px-2"
	aria-label="Project options"
	aria-haspopup="menu"
	aria-expanded={showMenu}
	title="Project options"
	onclick={openMenu}
>
	<span class="sr-only">Project options</span>
</Button>

{#if showMenu}
	<button
		type="button"
		tabindex="-1"
		aria-hidden="true"
		class="fixed inset-0 z-[9998] bg-transparent"
		onclick={() => closeMenu()}
	></button>
	<div
		bind:this={menuRef}
		role="menu"
		aria-label="Project options"
		tabindex="-1"
		onkeydown={handleMenuKeydown}
		class="fixed z-[9999] w-60 rounded-lg border border-border bg-card py-1 shadow-ink-strong"
		style="top: {menuPosition.top}px; right: {menuPosition.right}px;"
	>
		{#if canOpenCollaboration}
			<button
				type="button"
				role="menuitem"
				tabindex="-1"
				disabled={isNotificationSettingsSaving ||
					isNotificationSettingsLoading ||
					!notificationSettings}
				onclick={() => {
					closeMenu(false);
					void toggleProjectNotifications();
				}}
				class="menu-item"
			>
				{#if notificationSettings?.member_enabled}
					<Bell class="h-4 w-4 text-muted-foreground" />
				{:else}
					<BellOff class="h-4 w-4 text-muted-foreground" />
				{/if}
				{isNotificationSettingsSaving
					? 'Saving notifications…'
					: notificationSettings?.member_enabled
						? 'Turn notifications off'
						: 'Turn notifications on'}
			</button>
			<button
				type="button"
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					closeMenu(false);
					showCollaborationModal = true;
				}}
				class="menu-item"
			>
				<Users class="h-4 w-4 text-muted-foreground" />
				Collaboration settings
			</button>
		{/if}
		{#if canEdit}
			<button
				type="button"
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					closeMenu(false);
					showProjectEditModal = true;
				}}
				class="menu-item"
			>
				<Pencil class="h-4 w-4 text-muted-foreground" />
				Edit project
			</button>
			<button
				type="button"
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					closeMenu(false);
					showProjectCalendarModal = true;
				}}
				class="menu-item"
			>
				<Calendar class="h-4 w-4 text-muted-foreground" />
				Calendar settings
			</button>
		{/if}
		{#if canDeleteProject}
			<hr class="my-1 border-border" />
			<button
				type="button"
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					closeMenu(false);
					showDeleteProjectModal = true;
				}}
				class="menu-item menu-item-danger"
			>
				<Trash2 class="h-4 w-4" />
				Delete project
			</button>
		{/if}
	</div>
{/if}

{#if showProjectCalendarModal}
	{#await import('$lib/components/project/ProjectCalendarSettingsModal.svelte') then { default: ProjectCalendarSettingsModal }}
		<ProjectCalendarSettingsModal
			isOpen={showProjectCalendarModal}
			{project}
			onClose={() => (showProjectCalendarModal = false)}
		/>
	{/await}
{/if}

{#if showProjectEditModal}
	{#await import('$lib/components/ontology/OntologyProjectEditModal.svelte') then { default: OntologyProjectEditModal }}
		<OntologyProjectEditModal
			isOpen={showProjectEditModal}
			{project}
			{contextDocument}
			{canDeleteProject}
			canManageExternalAgentAccess={canAdmin}
			onClose={() => (showProjectEditModal = false)}
			onSaved={async () => {
				await onProjectSaved();
				showProjectEditModal = false;
			}}
		/>
	{/await}
{/if}

{#if showCollaborationModal && canOpenCollaboration}
	{#await import('$lib/components/project/ProjectCollaborationModal.svelte') then { default: ProjectCollaborationModal }}
		<ProjectCollaborationModal
			isOpen={showCollaborationModal}
			projectId={project.id}
			projectName={project.name || 'Project'}
			canManageMembers={canAdmin}
			onLeftProject={() => void goto('/projects')}
			onMembersChanged={() => void ensureNotificationSettingsLoaded(true)}
			onClose={() => (showCollaborationModal = false)}
		/>
	{/await}
{/if}

{#if showDeleteProjectModal}
	<ConfirmationModal
		title="Delete project"
		confirmText="Delete"
		confirmVariant="danger"
		isOpen={showDeleteProjectModal}
		loading={isDeletingProject}
		onconfirm={confirmProjectDelete}
		oncancel={() => (showDeleteProjectModal = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This will permanently delete <span class="font-semibold text-foreground"
					>{project.name}</span
				>
				and all related data. This action cannot be undone.
			</p>
		{/snippet}
		{#snippet details()}
			{#if deleteProjectError}
				<p class="mt-2 text-sm text-destructive">{deleteProjectError}</p>
			{/if}
		{/snippet}
	</ConfirmationModal>
{/if}

<style>
	.menu-item {
		display: flex;
		min-height: 44px;
		width: 100%;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		text-align: left;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		transition: background-color 120ms ease;
	}

	.menu-item:hover {
		background: hsl(var(--muted));
	}

	.menu-item:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.menu-item:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.menu-item-danger {
		color: hsl(var(--destructive));
	}

	.menu-item-danger:hover {
		background: hsl(var(--destructive) / 0.1);
	}

	@media (prefers-reduced-motion: reduce) {
		.menu-item {
			transition: none;
		}
	}
</style>
