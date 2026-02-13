<!-- apps/web/src/lib/components/project/ProjectShareModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { Bell, Mail, Users } from 'lucide-svelte';

	type MemberRole = 'owner' | 'editor' | 'viewer';
	type InviteRole = 'editor' | 'viewer';

	interface MemberRow {
		id: string;
		actor_id: string;
		role_key: MemberRole;
		access: string;
		role_name?: string | null;
		role_description?: string | null;
		actor?: {
			id: string;
			name: string | null;
			email: string | null;
		};
	}

	interface InviteRow {
		id: string;
		invitee_email: string;
		role_key: MemberRole;
		access: string;
		status: string;
		created_at: string;
		expires_at: string | null;
	}

	interface NotificationSettingsRow {
		project_id: string;
		member_count: number;
		is_shared_project: boolean;
		project_default_enabled: boolean;
		member_enabled: boolean;
		effective_enabled: boolean;
		member_overridden: boolean;
		can_manage_default: boolean;
	}

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
		onLeftProject?: () => void;
		projectId: string;
		projectName: string;
		canManageMembers?: boolean;
	}

	const ROLE_NAME_MIN = 2;
	const ROLE_NAME_MAX = 80;
	const ROLE_DESCRIPTION_MIN = 8;
	const ROLE_DESCRIPTION_MAX = 600;

	let {
		isOpen = $bindable(false),
		onClose,
		onLeftProject,
		projectId,
		projectName,
		canManageMembers = false
	}: Props = $props();

	let email = $state('');
	let role = $state<InviteRole>('editor');
	let isSending = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let canManageInvites = $state(true);
	let members = $state<MemberRow[]>([]);
	let invites = $state<InviteRow[]>([]);
	let currentActorId = $state<string | null>(null);
	let inviteActionId = $state<string | null>(null);
	let inviteActionType = $state<'resend' | 'revoke' | null>(null);
	let memberActionId = $state<string | null>(null);
	let memberActionType = $state<'role' | 'remove' | null>(null);
	let roleContextInput = $state('');
	let roleNameInput = $state('');
	let roleDescriptionInput = $state('');
	let isEditingRoleProfile = $state(false);
	let roleProfileActionType = $state<'generate' | 'save' | null>(null);
	let roleProfileError = $state<string | null>(null);
	let notificationSettings = $state<NotificationSettingsRow | null>(null);
	let settingsError = $state<string | null>(null);
	let settingsActionType = $state<'member' | 'project' | null>(null);
	let isLeavingProject = $state(false);

	$effect(() => {
		if (!isOpen) {
			email = '';
			role = 'editor';
			error = null;
			isLoading = false;
			canManageInvites = true;
			members = [];
			invites = [];
			currentActorId = null;
			inviteActionId = null;
			inviteActionType = null;
			memberActionId = null;
			memberActionType = null;
			roleContextInput = '';
			roleNameInput = '';
			roleDescriptionInput = '';
			isEditingRoleProfile = false;
			roleProfileActionType = null;
			roleProfileError = null;
			notificationSettings = null;
			settingsError = null;
			settingsActionType = null;
			isLeavingProject = false;
			return;
		}
		void loadShareData();
	});

	async function loadShareData() {
		if (!projectId) return;
		members = [];
		invites = [];
		currentActorId = null;
		roleProfileError = null;
		notificationSettings = null;
		settingsError = null;
		canManageInvites = true;
		isLoading = true;
		error = null;
		let membersStatus: number | null = null;
		let invitesStatus: number | null = null;
		let settingsStatus: number | null = null;

		try {
			const [membersRes, invitesRes, settingsRes] = await Promise.all([
				fetch(`/api/onto/projects/${projectId}/members`, {
					method: 'GET',
					credentials: 'same-origin'
				}),
				fetch(`/api/onto/projects/${projectId}/invites`, {
					method: 'GET',
					credentials: 'same-origin'
				}),
				fetch(`/api/onto/projects/${projectId}/notification-settings`, {
					method: 'GET',
					credentials: 'same-origin'
				})
			]);

			membersStatus = membersRes.status;
			invitesStatus = invitesRes.status;
			settingsStatus = settingsRes.status;

			if (membersRes.ok) {
				const payload = await membersRes.json();
				members = payload?.data?.members ?? [];
				currentActorId = payload?.data?.actorId ?? null;
			} else {
				const payload = await membersRes.json().catch(() => null);
				void logOntologyClientError(
					new Error(payload?.error || 'Failed to load project members'),
					{
						endpoint: `/api/onto/projects/${projectId}/members`,
						method: 'GET',
						projectId,
						entityType: 'project_member',
						operation: 'project_members_fetch',
						metadata: {
							source: 'project_share_modal',
							status: membersStatus
						}
					}
				);
			}

			if (invitesRes.status === 403) {
				canManageInvites = false;
			} else if (invitesRes.ok) {
				const payload = await invitesRes.json();
				invites = payload?.data?.invites ?? [];
			} else {
				const payload = await invitesRes.json().catch(() => null);
				void logOntologyClientError(
					new Error(payload?.error || 'Failed to load project invites'),
					{
						endpoint: `/api/onto/projects/${projectId}/invites`,
						method: 'GET',
						projectId,
						entityType: 'project_invite',
						operation: 'project_invites_fetch',
						metadata: {
							source: 'project_share_modal',
							status: invitesStatus
						}
					}
				);
			}

			if (settingsRes.ok) {
				const payload = await settingsRes.json().catch(() => null);
				notificationSettings = payload?.data?.settings ?? null;
			} else {
				const payload = await settingsRes.json().catch(() => null);
				const message = payload?.error || 'Failed to load notification settings';
				settingsError = message;
				void logOntologyClientError(new Error(message), {
					endpoint: `/api/onto/projects/${projectId}/notification-settings`,
					method: 'GET',
					projectId,
					entityType: 'project',
					operation: 'project_notification_settings_get',
					metadata: {
						source: 'project_share_modal',
						status: settingsStatus
					}
				});
			}
		} catch (err) {
			console.error('[ProjectShareModal] Failed to load share data:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'GET',
				projectId,
				entityType: 'project_invite',
				operation: 'project_share_load',
				metadata: {
					source: 'project_share_modal',
					membersStatus,
					invitesStatus,
					settingsStatus
				}
			});
			error = err instanceof Error ? err.message : 'Failed to load sharing data';
		} finally {
			isLoading = false;
		}
	}

	const currentMember = $derived(
		currentActorId
			? (members.find((member) => member.actor_id === currentActorId) ?? null)
			: null
	);
	const canLeaveProject = $derived(Boolean(currentMember && currentMember.role_key !== 'owner'));

	$effect(() => {
		if (!isOpen || !currentMember) return;
		if (isEditingRoleProfile || roleProfileActionType === 'save') return;
		roleNameInput = currentMember.role_name ?? '';
		roleDescriptionInput = currentMember.role_description ?? '';
	});

	function handleStartRoleProfileEdit() {
		if (!currentMember || roleProfileActionType !== null) return;
		roleProfileError = null;
		roleNameInput = currentMember.role_name ?? '';
		roleDescriptionInput = currentMember.role_description ?? '';
		isEditingRoleProfile = true;
	}

	function handleCancelRoleProfileEdit() {
		if (!currentMember || roleProfileActionType !== null) return;
		roleProfileError = null;
		roleNameInput = currentMember.role_name ?? '';
		roleDescriptionInput = currentMember.role_description ?? '';
		isEditingRoleProfile = false;
	}

	async function handleSaveRoleProfile(event: Event) {
		event.preventDefault();
		if (!currentMember) return;

		roleProfileError = null;

		const roleName = roleNameInput.trim();
		const roleDescription = roleDescriptionInput.trim();
		const roleNameValue = roleName.length > 0 ? roleName : null;
		const roleDescriptionValue = roleDescription.length > 0 ? roleDescription : null;

		if (
			roleNameValue !== null &&
			(roleNameValue.length < ROLE_NAME_MIN || roleNameValue.length > ROLE_NAME_MAX)
		) {
			roleProfileError = `Role name must be ${ROLE_NAME_MIN}-${ROLE_NAME_MAX} characters`;
			return;
		}

		if (
			roleDescriptionValue !== null &&
			(roleDescriptionValue.length < ROLE_DESCRIPTION_MIN ||
				roleDescriptionValue.length > ROLE_DESCRIPTION_MAX)
		) {
			roleProfileError = `Role description must be ${ROLE_DESCRIPTION_MIN}-${ROLE_DESCRIPTION_MAX} characters`;
			return;
		}

		roleProfileActionType = 'save';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/members/me/role-profile`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({
						role_name: roleNameValue,
						role_description: roleDescriptionValue
					})
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update role profile');
			}

			toastService.success('Role profile updated');
			isEditingRoleProfile = false;
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to update role profile:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/members/me/role-profile`,
				method: 'PATCH',
				projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_update',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus
				}
			});
			roleProfileError = err instanceof Error ? err.message : 'Failed to update role profile';
			toastService.error(roleProfileError);
		} finally {
			roleProfileActionType = null;
		}
	}

	async function handleGenerateRoleProfile(event: Event) {
		event.preventDefault();
		if (isEditingRoleProfile) return;
		roleProfileError = null;

		const roleContext = roleContextInput.trim();
		if (!roleContext) {
			roleProfileError = 'Describe your role first';
			return;
		}

		roleProfileActionType = 'generate';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/members/me/role-profile`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({
						role_context: roleContext,
						save: true
					})
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to generate role profile');
			}

			toastService.success('Role profile generated');
			roleContextInput = '';
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to generate role profile:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/members/me/role-profile`,
				method: 'POST',
				projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_generate',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus
				}
			});
			roleProfileError =
				err instanceof Error ? err.message : 'Failed to generate role profile';
			toastService.error(roleProfileError);
		} finally {
			roleProfileActionType = null;
		}
	}

	async function updateNotificationSettings(
		updates: { member_enabled?: boolean; project_default_enabled?: boolean },
		actionType: 'member' | 'project'
	) {
		if (settingsActionType) {
			return;
		}

		settingsActionType = actionType;
		settingsError = null;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/notification-settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify(updates)
			});

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update notification settings');
			}

			const nextSettings = payload?.data?.settings as NotificationSettingsRow | null;
			if (!nextSettings) {
				throw new Error('Notification settings response was invalid');
			}

			notificationSettings = nextSettings;

			if (actionType === 'project') {
				toastService.success(
					nextSettings.project_default_enabled
						? 'Project default notifications are enabled'
						: 'Project default notifications are disabled'
				);
			} else {
				toastService.success(
					nextSettings.member_enabled
						? 'Project activity notifications enabled for you'
						: 'Project activity notifications muted for you'
				);
			}
		} catch (err) {
			console.error('[ProjectShareModal] Failed to update notification settings:', err);
			settingsError =
				err instanceof Error ? err.message : 'Failed to update notification settings';
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/notification-settings`,
				method: 'PATCH',
				projectId,
				entityType: 'project',
				operation: 'project_notification_settings_update',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus,
					actionType
				}
			});
			toastService.error(settingsError);
		} finally {
			settingsActionType = null;
		}
	}

	async function handleMemberNotificationsToggle(enabled: boolean) {
		await updateNotificationSettings({ member_enabled: enabled }, 'member');
	}

	async function handleProjectDefaultNotificationsToggle(enabled: boolean) {
		await updateNotificationSettings({ project_default_enabled: enabled }, 'project');
	}

	async function handleInvite(event: Event) {
		event.preventDefault();

		if (!canManageInvites) {
			return;
		}

		if (!email.trim()) {
			error = 'Email is required';
			return;
		}

		isSending = true;
		error = null;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/invites`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					email,
					role_key: role
				})
			});

			responseStatus = response.status;
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to send invite');
			}

			toastService.success(`Invite sent to ${email}`);
			email = '';
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to invite:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'POST',
				projectId,
				entityType: 'project_invite',
				operation: 'project_invite_create',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus
				}
			});
			error = err instanceof Error ? err.message : 'Failed to send invite';
			toastService.error(error);
		} finally {
			isSending = false;
		}
	}

	async function handleInviteResend(invite: InviteRow) {
		if (!canManageInvites || inviteActionId) {
			return;
		}

		inviteActionId = invite.id;
		inviteActionType = 'resend';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/invites/${invite.id}/resend`,
				{
					method: 'POST',
					credentials: 'same-origin'
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to resend invite');
			}

			toastService.success(`Invite resent to ${invite.invitee_email}`);
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to resend invite:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/invites/${invite.id}/resend`,
				method: 'POST',
				projectId,
				entityType: 'project_invite',
				entityId: invite.id,
				operation: 'project_invite_resend',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus
				}
			});
			const message = err instanceof Error ? err.message : 'Failed to resend invite';
			toastService.error(message);
			await loadShareData();
		} finally {
			inviteActionId = null;
			inviteActionType = null;
		}
	}

	async function handleInviteRevoke(invite: InviteRow) {
		if (!canManageInvites || inviteActionId) {
			return;
		}

		const confirmRevoke = confirm(`Revoke invite for ${invite.invitee_email}?`);
		if (!confirmRevoke) {
			return;
		}

		inviteActionId = invite.id;
		inviteActionType = 'revoke';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/invites/${invite.id}/revoke`,
				{
					method: 'POST',
					credentials: 'same-origin'
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to revoke invite');
			}

			toastService.success(`Invite revoked for ${invite.invitee_email}`);
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to revoke invite:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/invites/${invite.id}/revoke`,
				method: 'POST',
				projectId,
				entityType: 'project_invite',
				entityId: invite.id,
				operation: 'project_invite_revoke',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus
				}
			});
			const message = err instanceof Error ? err.message : 'Failed to revoke invite';
			toastService.error(message);
			await loadShareData();
		} finally {
			inviteActionId = null;
			inviteActionType = null;
		}
	}

	async function handleMemberRoleChange(member: MemberRow, nextRole: MemberRole) {
		if (!canManageMembers || memberActionId) {
			return;
		}

		if (member.role_key === 'owner') {
			return;
		}

		if (nextRole !== 'editor' && nextRole !== 'viewer') {
			return;
		}

		if (nextRole === member.role_key) {
			return;
		}

		memberActionId = member.id;
		memberActionType = 'role';

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/members/${member.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ role_key: nextRole })
			});

			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update member');
			}

			const label = member.actor?.name || member.actor?.email || 'Member';
			toastService.success(`Updated ${label} to ${formatRole(nextRole)}`);
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to update member role:', err);
			const message = err instanceof Error ? err.message : 'Failed to update member';
			toastService.error(message);
			await loadShareData();
		} finally {
			memberActionId = null;
			memberActionType = null;
		}
	}

	async function handleMemberRemove(member: MemberRow) {
		if (!canManageMembers || memberActionId) {
			return;
		}

		if (member.role_key === 'owner') {
			return;
		}

		const label = member.actor?.name || member.actor?.email || 'this member';
		const confirmRemove = confirm(`Remove ${label} from this project?`);
		if (!confirmRemove) {
			return;
		}

		memberActionId = member.id;
		memberActionType = 'remove';

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/members/${member.id}`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});

			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to remove member');
			}

			toastService.success(`Removed ${label}`);
			await loadShareData();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to remove member:', err);
			const message = err instanceof Error ? err.message : 'Failed to remove member';
			toastService.error(message);
			await loadShareData();
		} finally {
			memberActionId = null;
			memberActionType = null;
		}
	}

	async function handleLeaveProject() {
		if (!canLeaveProject || isLeavingProject) {
			return;
		}

		const confirmLeave = confirm(
			`Leave ${projectName || 'this project'}? You will lose access until invited again.`
		);
		if (!confirmLeave) {
			return;
		}

		isLeavingProject = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/members/me`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to leave project');
			}

			toastService.success('You left this project');
			isOpen = false;
			onClose?.();
			onLeftProject?.();
		} catch (err) {
			console.error('[ProjectShareModal] Failed to leave project:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/members/me`,
				method: 'DELETE',
				projectId,
				entityType: 'project_member',
				operation: 'project_member_leave',
				metadata: {
					source: 'project_share_modal',
					status: responseStatus
				}
			});
			const message = err instanceof Error ? err.message : 'Failed to leave project';
			toastService.error(message);
		} finally {
			isLeavingProject = false;
		}
	}

	function formatRole(roleKey: string) {
		switch (roleKey) {
			case 'viewer':
				return 'Viewer';
			case 'editor':
				return 'Editor';
			case 'owner':
				return 'Owner';
			default:
				return roleKey;
		}
	}
</script>

<Modal {isOpen} {onClose} title="Share Project" size="md">
	<div class="p-3 sm:p-4 space-y-4">
		<!-- Invite Form Section -->
		<div class="space-y-3">
			<div>
				<h3 class="text-sm font-semibold text-foreground">Invite collaborators</h3>
				<p class="text-xs text-muted-foreground mt-0.5">
					Invite someone to work on
					<span class="font-medium">{projectName || 'this project'}</span>.
				</p>
			</div>

			<form class="space-y-2.5" onsubmit={handleInvite}>
				<div class="space-y-1">
					<label for="invite-email" class="text-xs font-medium text-muted-foreground"
						>Email</label
					>
					<TextInput
						id="invite-email"
						bind:value={email}
						type="email"
						placeholder="name@example.com"
						icon={Mail}
						disabled={!canManageInvites}
					/>
				</div>

				<div class="space-y-1">
					<label for="invite-role" class="text-xs font-medium text-muted-foreground"
						>Role</label
					>
					<Select
						id="invite-role"
						bind:value={role}
						size="md"
						disabled={!canManageInvites}
					>
						<option value="editor">Editor (can edit)</option>
						<option value="viewer">Viewer (read-only)</option>
					</Select>
				</div>

				{#if !canManageInvites}
					<p class="text-xs text-muted-foreground">
						You need editor access to invite collaborators.
					</p>
				{:else if error}
					<p class="text-xs text-destructive">{error}</p>
				{/if}

				<Button
					type="submit"
					variant="primary"
					size="sm"
					disabled={isSending || !canManageInvites}
				>
					{isSending ? 'Sending...' : 'Send Invite'}
				</Button>
			</form>
		</div>

		<!-- Role Profile Section -->
		<div class="border-t border-border pt-3 space-y-2">
			<div>
				<h3 class="text-sm font-semibold text-foreground">Describe your role</h3>
				<p class="text-xs text-muted-foreground mt-0.5">
					Share what you do in this project and AI will generate a role title and
					description for team context.
				</p>
			</div>

			{#if currentMember}
				<div class="rounded-md border border-border bg-muted/20 p-3 space-y-1">
					<div class="flex items-center justify-between gap-2">
						<p class="text-xs uppercase tracking-wide text-muted-foreground">
							Current role profile
						</p>
						<Button
							variant="ghost"
							size="sm"
							disabled={roleProfileActionType !== null}
							onclick={isEditingRoleProfile
								? handleCancelRoleProfileEdit
								: handleStartRoleProfileEdit}
						>
							{isEditingRoleProfile ? 'Cancel' : 'Edit manually'}
						</Button>
					</div>
					<p class="text-sm text-foreground">
						{currentMember.role_name || formatRole(currentMember.role_key)}
					</p>
					{#if currentMember.role_description}
						<p class="text-xs text-muted-foreground">
							{currentMember.role_description}
						</p>
					{/if}
				</div>
			{/if}

			{#if isEditingRoleProfile}
				<form class="space-y-2" onsubmit={handleSaveRoleProfile}>
					<div class="space-y-1">
						<label
							for="role-title-input"
							class="text-xs font-medium text-muted-foreground">Role title</label
						>
						<TextInput
							id="role-title-input"
							bind:value={roleNameInput}
							placeholder="Content Lead"
							maxlength={ROLE_NAME_MAX}
							disabled={roleProfileActionType !== null}
						/>
					</div>

					<div class="space-y-1">
						<label
							for="role-description-input"
							class="text-xs font-medium text-muted-foreground"
						>
							Role description
						</label>
						<Textarea
							id="role-description-input"
							bind:value={roleDescriptionInput}
							rows={3}
							autoResize
							maxRows={8}
							placeholder="What outcomes and responsibilities do you own?"
							maxlength={ROLE_DESCRIPTION_MAX}
							disabled={roleProfileActionType !== null}
						/>
					</div>

					{#if roleProfileError}
						<p class="text-xs text-destructive">{roleProfileError}</p>
					{/if}

					<Button
						type="submit"
						variant="secondary"
						size="sm"
						disabled={roleProfileActionType !== null}
					>
						{roleProfileActionType === 'save' ? 'Saving...' : 'Save Role Profile'}
					</Button>
				</form>
			{/if}

			<form class="space-y-2" onsubmit={handleGenerateRoleProfile}>
				<Textarea
					bind:value={roleContextInput}
					rows={3}
					autoResize
					maxRows={8}
					placeholder="Example: I run content strategy, define weekly priorities, and coordinate publishing across channels."
				/>

				{#if roleProfileError}
					<p class="text-xs text-destructive">{roleProfileError}</p>
				{/if}

				<Button
					type="submit"
					variant="secondary"
					size="sm"
					disabled={roleProfileActionType !== null ||
						isEditingRoleProfile ||
						roleContextInput.trim().length === 0}
				>
					{roleProfileActionType === 'generate'
						? 'Generating...'
						: 'Generate Role Profile'}
				</Button>
			</form>
		</div>

		<!-- Notification Settings Section -->
		<div class="border-t border-border pt-3 space-y-2">
			<div class="flex items-center gap-2 text-foreground">
				<Bell class="h-4 w-4 text-muted-foreground" />
				<h3 class="text-sm font-semibold">Notification settings</h3>
			</div>

			{#if isLoading && !notificationSettings}
				<p class="text-xs text-muted-foreground">Loading notification settings...</p>
			{:else if notificationSettings}
				<div class="rounded-md border border-border bg-muted/20 p-3 space-y-3">
					<label class="flex items-start gap-2.5 cursor-pointer">
						<input
							type="checkbox"
							class="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
							checked={notificationSettings.member_enabled}
							disabled={settingsActionType !== null}
							onchange={(event) =>
								handleMemberNotificationsToggle(
									(event.currentTarget as HTMLInputElement).checked
								)}
						/>
						<span class="space-y-0.5">
							<span class="block text-sm font-medium text-foreground">
								Notify me about project activity
							</span>
							<span class="block text-xs text-muted-foreground">
								Uses your existing push and in-app channel preferences.
							</span>
						</span>
					</label>

					{#if notificationSettings.can_manage_default}
						<div class="border-t border-border pt-3">
							<label class="flex items-start gap-2.5 cursor-pointer">
								<input
									type="checkbox"
									class="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
									checked={notificationSettings.project_default_enabled}
									disabled={settingsActionType !== null}
									onchange={(event) =>
										handleProjectDefaultNotificationsToggle(
											(event.currentTarget as HTMLInputElement).checked
										)}
								/>
								<span class="space-y-0.5">
									<span class="block text-sm font-medium text-foreground">
										Default notifications for collaborators
									</span>
									<span class="block text-xs text-muted-foreground">
										New and existing members inherit this unless they set their
										own preference.
									</span>
								</span>
							</label>
						</div>
					{:else}
						<p class="text-xs text-muted-foreground">
							Project defaults can only be changed by project admins.
						</p>
					{/if}

					{#if !notificationSettings.is_shared_project}
						<p class="text-xs text-muted-foreground">
							This project is currently solo. Default notifications automatically turn
							on when a second member joins.
						</p>
					{/if}
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">
					Notification settings are unavailable right now.
				</p>
			{/if}

			{#if settingsError}
				<p class="text-xs text-destructive">{settingsError}</p>
			{/if}
		</div>

		<!-- Members Section -->
		<div class="border-t border-border pt-3 space-y-2">
			<div class="flex items-center gap-2 text-foreground">
				<Users class="h-4 w-4 text-muted-foreground" />
				<h3 class="text-sm font-semibold">Members</h3>
			</div>

			{#if !canManageMembers}
				<p class="text-xs text-muted-foreground">
					Admin access is required to manage members.
				</p>
			{/if}

			{#if isLoading}
				<p class="text-xs text-muted-foreground">Loading members...</p>
			{:else if members.length === 0}
				<p class="text-xs text-muted-foreground">No members yet.</p>
			{:else}
				<div class="space-y-1">
					{#each members as member (member.id)}
						<div
							class="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md
								hover:bg-muted transition-colors"
						>
							<div class="min-w-0 flex-1">
								<p class="text-sm text-foreground truncate">
									{member.actor?.name || member.actor?.email || member.actor_id}
								</p>
								{#if member.actor?.email && member.actor?.name}
									<p class="text-xs text-muted-foreground truncate">
										{member.actor.email}
									</p>
								{/if}
								{#if member.role_name || member.role_description}
									<p class="text-xs text-muted-foreground truncate">
										{member.role_name || formatRole(member.role_key)}
										{member.role_description
											? ` - ${member.role_description}`
											: ''}
									</p>
								{/if}
							</div>
							<div class="flex items-center gap-1.5 shrink-0">
								{#if member.role_key === 'owner' || !canManageMembers}
									<span
										class="text-xs font-medium text-muted-foreground px-2 py-0.5 bg-muted rounded"
									>
										{formatRole(member.role_key)}
									</span>
								{:else}
									<Select
										value={member.role_key}
										size="sm"
										class="min-w-[110px]"
										placeholder=""
										disabled={memberActionId !== null}
										onchange={(value) =>
											handleMemberRoleChange(member, value as MemberRole)}
									>
										<option value="editor">Editor</option>
										<option value="viewer">Viewer</option>
									</Select>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive hover:bg-destructive/10"
										loading={memberActionId === member.id &&
											memberActionType === 'remove'}
										disabled={memberActionId !== null}
										onclick={() => handleMemberRemove(member)}
									>
										Remove
									</Button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if canLeaveProject}
				<div class="mt-3 border-t border-border pt-3">
					<Button
						variant="ghost"
						size="sm"
						class="text-destructive hover:bg-destructive/10"
						loading={isLeavingProject}
						disabled={isLeavingProject || memberActionId !== null}
						onclick={handleLeaveProject}
					>
						Leave project
					</Button>
					<p class="mt-1 text-xs text-muted-foreground">
						You can rejoin only if someone invites you again.
					</p>
				</div>
			{/if}
		</div>

		<!-- Pending Invites Section -->
		{#if invites.length > 0}
			<div class="border-t border-border pt-3 space-y-2">
				<h3 class="text-sm font-semibold text-foreground">Pending invites</h3>
				<div class="space-y-1">
					{#each invites as invite (invite.id)}
						<div
							class="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md
								hover:bg-muted transition-colors"
						>
							<div class="min-w-0 flex-1">
								<p class="text-sm text-foreground truncate">
									{invite.invitee_email}
								</p>
								<p class="text-xs text-muted-foreground">
									Expires {invite.expires_at
										? new Date(invite.expires_at).toLocaleDateString()
										: 'soon'}
								</p>
							</div>
							<div class="flex items-center gap-1.5 shrink-0">
								<span
									class="text-xs font-medium text-muted-foreground px-2 py-0.5 bg-muted rounded"
								>
									{formatRole(invite.role_key)}
								</span>
								{#if canManageInvites}
									<Button
										variant="ghost"
										size="sm"
										loading={inviteActionId === invite.id &&
											inviteActionType === 'resend'}
										disabled={inviteActionId !== null}
										onclick={() => handleInviteResend(invite)}
									>
										Resend
									</Button>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive hover:bg-destructive/10"
										loading={inviteActionId === invite.id &&
											inviteActionType === 'revoke'}
										disabled={inviteActionId !== null}
										onclick={() => handleInviteRevoke(invite)}
									>
										Revoke
									</Button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</Modal>
