<!-- apps/web/src/lib/components/project/ProjectCollaborationModal.svelte -->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import type { Tab } from '$lib/components/ui/TabNav.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { copyTextToClipboard } from '$lib/utils/public-page-url';
	import ProjectInviteLinkPanel from './ProjectInviteLinkPanel.svelte';
	import {
		AtSign,
		Bell,
		Check,
		Copy,
		Link2,
		Mail,
		UserCog,
		UserPlus,
		Users
	} from '$lib/icons/lucide';
	import {
		agentAccessAllowed,
		agentAccessDescription,
		agentAccessLabel,
		DEFAULT_AGENT_ACCESS,
		fitAgentAccessToRole,
		isAgentAccess,
		shortDate,
		type AgentAccess
	} from '$lib/components/people/people-copy';

	type MemberRole = 'owner' | 'editor' | 'viewer';
	type InviteRole = 'editor' | 'viewer';

	interface MemberRow {
		id: string;
		actor_id: string;
		role_key: MemberRole;
		access: string;
		/** What this person's own agents may do here. */
		agent_access?: AgentAccess | null;
		/** Set when they joined with the project's invite link. */
		joined_via_invite_link_id?: string | null;
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
		/** Null for invites sent to an @handle: the email behind a handle stays private. */
		invitee_email: string | null;
		invitee_handle?: string | null;
		role_key: MemberRole;
		access: string;
		agent_access?: AgentAccess | null;
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

	interface RoleProfileAlternative {
		role_name: string;
		role_description: string;
	}

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
		onLeftProject?: () => void;
		onMembersChanged?: () => void | Promise<void>;
		/** After a handoff: the viewer's own access changed, so page permissions need a reload. */
		onOwnershipChanged?: () => void | Promise<void>;
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
		onMembersChanged,
		onOwnershipChanged,
		projectId,
		projectName,
		canManageMembers = false
	}: Props = $props();

	/** "@handle" or an email address. */
	let invitee = $state('');
	let role = $state<InviteRole>('editor');
	let inviteAgentAccess = $state<AgentAccess>(DEFAULT_AGENT_ACCESS);
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
	let memberActionType = $state<'role' | 'remove' | 'agents' | null>(null);
	let roleContextInput = $state('');
	let roleNameInput = $state('');
	let roleDescriptionInput = $state('');
	let isEditingRoleProfile = $state(false);
	let roleProfileActionType = $state<'generate' | 'save' | 'alternatives' | null>(null);
	let roleProfileError = $state<string | null>(null);
	let roleProfileAlternatives = $state<RoleProfileAlternative[]>([]);
	let editingMemberRoleProfileId = $state<string | null>(null);
	let editingMemberRoleNameInput = $state('');
	let editingMemberRoleDescriptionInput = $state('');
	let memberRoleProfileError = $state<string | null>(null);
	let memberRoleProfileSaving = $state(false);
	let notificationSettings = $state<NotificationSettingsRow | null>(null);
	let settingsError = $state<string | null>(null);
	let settingsActionType = $state<'member' | 'project' | null>(null);
	let isLeavingProject = $state(false);
	/**
	 * The owner's standing approval (tasker 140): while on, every editor's agents can
	 * make changes unless their own agents are Off. Null until loaded (owners only).
	 */
	let editorAgentsWrite = $state<boolean | null>(null);
	let agentSettingsLoadFailed = $state(false);
	let agentSettingsSaving = $state(false);
	// Ownership handoff: the member being offered the project (a snapshot, so the
	// confirm panel and its error survive a members reload), and whether the owner leaves.
	let handoffTarget = $state<MemberRow | null>(null);
	let handoffLeave = $state(false);
	let handoffSaving = $state(false);
	let handoffError = $state<string | null>(null);
	let handoffPanel = $state<HTMLFormElement | null>(null);
	let handoffTrigger: HTMLElement | null = null;
	type TabId = 'invite' | 'people' | 'my-role';
	let activeTab = $state<TabId>('people');
	/** The invite just sent from this window: who, its one-time link, whether the email went out. */
	let lastSentInvite = $state<{
		label: string;
		url: string | null;
		emailSent: boolean;
	} | null>(null);
	/** Invite links seen in this window (create and resend return them once; never stored). */
	let inviteUrls = $state<Record<string, string>>({});
	let copiedUrl = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;
	// Inline confirmations (no browser dialogs).
	let confirmRemoveMemberId = $state<string | null>(null);
	let confirmRevokeInviteId = $state<string | null>(null);
	let confirmLeave = $state(false);
	let shareDataRequestId = 0;
	let shareDataAbortController: AbortController | null = null;
	let projectSessionEpoch = 0;

	type ProjectSession = {
		projectId: string;
		epoch: number;
	};

	// Owners get an Invite tab; everyone sees People and their own role.
	const tabs = $derived<Tab[]>([
		...(canManageMembers ? [{ id: 'invite', label: 'Invite', icon: UserPlus }] : []),
		{
			id: 'people',
			label: 'People',
			icon: Users,
			count: members.length + invites.length || undefined
		},
		{ id: 'my-role', label: 'My role', icon: UserCog }
	]);
	const currentTab = $derived<TabId>(
		tabs.some((tab) => tab.id === activeTab) ? activeTab : 'people'
	);

	function handleTabChange(tabId: string) {
		activeTab = tabId as TabId;
	}

	async function copyInviteUrl(url: string) {
		const ok = await copyTextToClipboard(url);
		if (!ok) {
			toastService.error('Couldn’t copy. Try again.');
			return;
		}
		copiedUrl = url;
		if (copiedTimer) clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copiedUrl = null), 2000);
	}

	function cancelShareDataLoad() {
		shareDataRequestId += 1;
		shareDataAbortController?.abort();
		shareDataAbortController = null;
	}

	function captureProjectSession(): ProjectSession {
		return { projectId, epoch: projectSessionEpoch };
	}

	function isCurrentProjectSession(session: ProjectSession): boolean {
		return isOpen && session.epoch === projectSessionEpoch && session.projectId === projectId;
	}

	function resetModalState() {
		invitee = '';
		role = 'editor';
		inviteAgentAccess = DEFAULT_AGENT_ACCESS;
		isSending = false;
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
		roleProfileAlternatives = [];
		editingMemberRoleProfileId = null;
		editingMemberRoleNameInput = '';
		editingMemberRoleDescriptionInput = '';
		memberRoleProfileError = null;
		memberRoleProfileSaving = false;
		notificationSettings = null;
		settingsError = null;
		settingsActionType = null;
		editorAgentsWrite = null;
		agentSettingsLoadFailed = false;
		agentSettingsSaving = false;
		isLeavingProject = false;
		handoffTarget = null;
		handoffLeave = false;
		handoffSaving = false;
		handoffError = null;
		handoffTrigger = null;
		activeTab = untrack(() => canManageMembers) ? 'invite' : 'people';
		lastSentInvite = null;
		inviteUrls = {};
		copiedUrl = null;
		confirmRemoveMemberId = null;
		confirmRevokeInviteId = null;
		confirmLeave = false;
	}

	function handleClose() {
		projectSessionEpoch += 1;
		cancelShareDataLoad();
		if (copiedTimer) clearTimeout(copiedTimer);
		isOpen = false;
		resetModalState();
		onClose?.();
	}

	$effect(() => {
		const requestedProjectId = projectId;
		projectSessionEpoch += 1;
		resetModalState();

		if (!isOpen) {
			return;
		}

		void loadShareData(requestedProjectId);

		return cancelShareDataLoad;
	});

	async function loadShareData(requestedProjectId = projectId) {
		if (!requestedProjectId || !isOpen || requestedProjectId !== projectId) return;

		shareDataAbortController?.abort();
		const abortController = new AbortController();
		const requestId = ++shareDataRequestId;
		shareDataAbortController = abortController;

		const isCurrentRequest = () =>
			requestId === shareDataRequestId &&
			shareDataAbortController === abortController &&
			!abortController.signal.aborted &&
			isOpen &&
			projectId === requestedProjectId;

		members = [];
		invites = [];
		currentActorId = null;
		roleProfileError = null;
		roleProfileAlternatives = [];
		editingMemberRoleProfileId = null;
		editingMemberRoleNameInput = '';
		editingMemberRoleDescriptionInput = '';
		memberRoleProfileError = null;
		memberRoleProfileSaving = false;
		notificationSettings = null;
		settingsError = null;
		canManageInvites = true;
		isLoading = true;
		error = null;
		let membersStatus: number | null = null;
		let invitesStatus: number | null = null;
		let settingsStatus: number | null = null;
		// Only the owner sees (and can change) the editors' agents setting.
		const loadAgentSettings = untrack(() => canManageMembers);

		try {
			const [membersRes, invitesRes, settingsRes, agentSettingsRes] = await Promise.all([
				fetch(`/api/onto/projects/${requestedProjectId}/members`, {
					method: 'GET',
					credentials: 'same-origin',
					signal: abortController.signal
				}),
				fetch(`/api/onto/projects/${requestedProjectId}/invites`, {
					method: 'GET',
					credentials: 'same-origin',
					signal: abortController.signal
				}),
				fetch(`/api/onto/projects/${requestedProjectId}/notification-settings`, {
					method: 'GET',
					credentials: 'same-origin',
					signal: abortController.signal
				}),
				// Best effort: a failure here never blocks the rest of the window.
				loadAgentSettings
					? fetch(`/api/onto/projects/${requestedProjectId}/agent-settings`, {
							method: 'GET',
							credentials: 'same-origin',
							signal: abortController.signal
						}).catch(() => null)
					: Promise.resolve(null)
			]);

			membersStatus = membersRes.status;
			invitesStatus = invitesRes.status;
			settingsStatus = settingsRes.status;

			const [membersPayload, invitesPayload, settingsPayload] = await Promise.all([
				membersRes.ok ? membersRes.json() : membersRes.json().catch(() => null),
				invitesRes.ok
					? invitesRes.json()
					: invitesRes.status === 403
						? Promise.resolve(null)
						: invitesRes.json().catch(() => null),
				settingsRes.json().catch(() => null)
			]);
			const agentSettingsPayload = agentSettingsRes?.ok
				? await agentSettingsRes.json().catch(() => null)
				: null;

			if (!isCurrentRequest()) return;

			if (loadAgentSettings) {
				const loaded = agentSettingsPayload?.data?.editor_agents_write;
				if (typeof loaded === 'boolean') {
					editorAgentsWrite = loaded;
					agentSettingsLoadFailed = false;
				} else if (editorAgentsWrite === null) {
					agentSettingsLoadFailed = true;
				}
			}

			if (membersRes.ok) {
				members = membersPayload?.data?.members ?? [];
				currentActorId = membersPayload?.data?.actorId ?? null;
			} else {
				void logOntologyClientError(
					new Error(membersPayload?.error || 'Failed to load project members'),
					{
						endpoint: `/api/onto/projects/${requestedProjectId}/members`,
						method: 'GET',
						projectId: requestedProjectId,
						entityType: 'project_member',
						operation: 'project_members_fetch',
						metadata: {
							source: 'project_collaboration_modal',
							status: membersStatus
						}
					}
				);
			}

			if (invitesRes.status === 403) {
				canManageInvites = false;
			} else if (invitesRes.ok) {
				invites = invitesPayload?.data?.invites ?? [];
			} else {
				void logOntologyClientError(
					new Error(invitesPayload?.error || 'Failed to load project invites'),
					{
						endpoint: `/api/onto/projects/${requestedProjectId}/invites`,
						method: 'GET',
						projectId: requestedProjectId,
						entityType: 'project_invite',
						operation: 'project_invites_fetch',
						metadata: {
							source: 'project_collaboration_modal',
							status: invitesStatus
						}
					}
				);
			}

			if (settingsRes.ok) {
				notificationSettings = settingsPayload?.data?.settings ?? null;
			} else {
				const message = settingsPayload?.error || 'Failed to load notification settings';
				settingsError = message;
				void logOntologyClientError(new Error(message), {
					endpoint: `/api/onto/projects/${requestedProjectId}/notification-settings`,
					method: 'GET',
					projectId: requestedProjectId,
					entityType: 'project',
					operation: 'project_notification_settings_get',
					metadata: {
						source: 'project_collaboration_modal',
						status: settingsStatus
					}
				});
			}
		} catch (err) {
			if (!isCurrentRequest()) return;

			console.error('[ProjectCollaborationModal] Failed to load share data:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${requestedProjectId}/invites`,
				method: 'GET',
				projectId: requestedProjectId,
				entityType: 'project_invite',
				operation: 'project_share_load',
				metadata: {
					source: 'project_collaboration_modal',
					membersStatus,
					invitesStatus,
					settingsStatus
				}
			});
			error = err instanceof Error ? err.message : 'Failed to load sharing data';
		} finally {
			if (isCurrentRequest()) {
				isLoading = false;
				shareDataAbortController = null;
			}
		}
	}

	const currentMember = $derived(
		currentActorId
			? (members.find((member) => member.actor_id === currentActorId) ?? null)
			: null
	);
	const editingMemberRoleProfile = $derived(
		editingMemberRoleProfileId
			? (members.find((member) => member.id === editingMemberRoleProfileId) ?? null)
			: null
	);
	const canLeaveProject = $derived(Boolean(currentMember && currentMember.role_key !== 'owner'));
	const isProjectOwner = $derived(currentMember?.role_key === 'owner');
	const handoffTargetIsMember = $derived(
		handoffTarget ? members.some((member) => member.id === handoffTarget?.id) : false
	);
	const memberActionsBusy = $derived(
		memberActionId !== null || memberRoleProfileSaving || handoffSaving
	);
	// Sharing is owner-only: editors can work in the project but not re-share it.
	const canInvite = $derived(canManageInvites && canManageMembers);

	function getMemberLabel(member: MemberRow): string {
		return member.actor?.name || member.actor?.email || member.actor_id;
	}

	/** Handle invites show the handle; the email behind it is never sent to the browser. */
	function getInviteLabel(invite: InviteRow): string {
		return invite.invitee_handle
			? `@${invite.invitee_handle}`
			: invite.invitee_email || 'Pending invite';
	}

	function memberAgentAccess(member: MemberRow): AgentAccess {
		return isAgentAccess(member.agent_access) ? member.agent_access : DEFAULT_AGENT_ACCESS;
	}

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

	function handleUseRoleProfileAlternative(alternative: RoleProfileAlternative) {
		roleProfileError = null;
		roleNameInput = alternative.role_name;
		roleDescriptionInput = alternative.role_description;
		isEditingRoleProfile = true;
	}

	async function handleSaveRoleProfile(event: Event) {
		event.preventDefault();
		if (!currentMember) return;
		const session = captureProjectSession();

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
				`/api/onto/projects/${session.projectId}/members/me/role-profile`,
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
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update role profile');
			}

			toastService.success('Role profile updated');
			isEditingRoleProfile = false;
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to update role profile:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/members/me/role-profile`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_update',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			roleProfileError = err instanceof Error ? err.message : 'Failed to update role profile';
			toastService.error(roleProfileError);
		} finally {
			if (isCurrentProjectSession(session)) {
				roleProfileActionType = null;
			}
		}
	}

	async function handleGenerateRoleProfile(event: Event) {
		event.preventDefault();
		if (isEditingRoleProfile) return;
		const session = captureProjectSession();

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
				`/api/onto/projects/${session.projectId}/members/me/role-profile`,
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
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to generate role profile');
			}

			toastService.success('Role profile generated');
			roleContextInput = '';
			roleProfileAlternatives = [];
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to generate role profile:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/members/me/role-profile`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_generate',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			roleProfileError =
				err instanceof Error ? err.message : 'Failed to generate role profile';
			toastService.error(roleProfileError);
		} finally {
			if (isCurrentProjectSession(session)) {
				roleProfileActionType = null;
			}
		}
	}

	async function handleGenerateRoleProfileAlternatives() {
		if (isEditingRoleProfile) return;
		const session = captureProjectSession();

		roleProfileError = null;

		const roleContext = roleContextInput.trim();
		if (!roleContext) {
			roleProfileError = 'Describe your role first';
			return;
		}

		roleProfileActionType = 'alternatives';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/members/me/role-profile/alternatives`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({
						role_context: roleContext,
						count: 3
					})
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to generate role profile alternatives');
			}

			const alternatives = payload?.data?.alternatives;
			if (!Array.isArray(alternatives) || alternatives.length === 0) {
				throw new Error('No alternatives were returned');
			}

			roleProfileAlternatives = alternatives;
			toastService.success('Role profile alternatives generated');
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error(
				'[ProjectCollaborationModal] Failed to generate role profile alternatives:',
				err
			);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/members/me/role-profile/alternatives`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_member',
				operation: 'project_member_role_profile_alternatives_generate',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			roleProfileError =
				err instanceof Error ? err.message : 'Failed to generate role profile alternatives';
			toastService.error(roleProfileError);
		} finally {
			if (isCurrentProjectSession(session)) {
				roleProfileActionType = null;
			}
		}
	}

	async function updateNotificationSettings(
		updates: { member_enabled?: boolean; project_default_enabled?: boolean },
		actionType: 'member' | 'project'
	) {
		if (settingsActionType) {
			return;
		}
		const session = captureProjectSession();

		settingsActionType = actionType;
		settingsError = null;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/notification-settings`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify(updates)
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

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
			if (!isCurrentProjectSession(session)) return;

			console.error(
				'[ProjectCollaborationModal] Failed to update notification settings:',
				err
			);
			settingsError =
				err instanceof Error ? err.message : 'Failed to update notification settings';
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/notification-settings`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'project',
				operation: 'project_notification_settings_update',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus,
					actionType
				}
			});
			toastService.error(settingsError);
		} finally {
			if (isCurrentProjectSession(session)) {
				settingsActionType = null;
			}
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
		const session = captureProjectSession();

		if (!canInvite) {
			return;
		}

		const requested = invitee.trim();
		if (!requested) {
			error = 'Enter an @handle or an email address';
			return;
		}
		// An email has an @ inside it; a handle may start with one ("@sam") or not.
		const isEmail = requested.includes('@') && !requested.startsWith('@');
		const requestedLabel = isEmail ? requested : `@${requested.replace(/^@+/, '')}`;
		const requestedRole = role;
		const requestedAgentAccess = fitAgentAccessToRole(requestedRole, inviteAgentAccess);

		isSending = true;
		error = null;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${session.projectId}/invites`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					...(isEmail ? { email: requested } : { invitee_handle: requested }),
					role_key: requestedRole,
					agent_access: requestedAgentAccess
				})
			});

			responseStatus = response.status;
			const payload = await response.json();
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to send invite');
			}

			const inviteUrl =
				typeof payload?.data?.invite_url === 'string' ? payload.data.invite_url : null;
			const inviteId =
				typeof payload?.data?.inviteId === 'string' ? payload.data.inviteId : null;
			const emailSent = payload?.data?.email_sent !== false;
			if (inviteUrl && inviteId) inviteUrls = { ...inviteUrls, [inviteId]: inviteUrl };
			lastSentInvite = { label: requestedLabel, url: inviteUrl, emailSent };
			if (emailSent) {
				toastService.success(`Invite sent to ${requestedLabel}`);
			} else {
				toastService.error(
					'The invite is ready, but the email didn’t go out. Copy its link.'
				);
			}
			invitee = '';
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to invite:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/invites`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_invite',
				operation: 'project_invite_create',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			error = err instanceof Error ? err.message : 'Failed to send invite';
			toastService.error(error);
		} finally {
			if (isCurrentProjectSession(session)) {
				isSending = false;
			}
		}
	}

	async function handleInviteResend(invite: InviteRow) {
		if (!canInvite || inviteActionId) {
			return;
		}
		const session = captureProjectSession();

		inviteActionId = invite.id;
		inviteActionType = 'resend';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/invites/${invite.id}/resend`,
				{
					method: 'POST',
					credentials: 'same-origin'
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to resend invite');
			}

			if (typeof payload?.data?.invite_url === 'string') {
				inviteUrls = { ...inviteUrls, [invite.id]: payload.data.invite_url };
			}
			toastService.success(`Invite resent to ${getInviteLabel(invite)}`);
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to resend invite:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/invites/${invite.id}/resend`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_invite',
				entityId: invite.id,
				operation: 'project_invite_resend',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			const message = err instanceof Error ? err.message : 'Failed to resend invite';
			toastService.error(message);
			await loadShareData(session.projectId);
		} finally {
			if (isCurrentProjectSession(session)) {
				inviteActionId = null;
				inviteActionType = null;
			}
		}
	}

	async function handleInviteRevoke(invite: InviteRow) {
		if (!canInvite || inviteActionId) {
			return;
		}

		confirmRevokeInviteId = null;
		const session = captureProjectSession();

		inviteActionId = invite.id;
		inviteActionType = 'revoke';
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/invites/${invite.id}/revoke`,
				{
					method: 'POST',
					credentials: 'same-origin'
				}
			);

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to revoke invite');
			}

			toastService.success(`Invite revoked for ${getInviteLabel(invite)}`);
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to revoke invite:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/invites/${invite.id}/revoke`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_invite',
				entityId: invite.id,
				operation: 'project_invite_revoke',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			const message = err instanceof Error ? err.message : 'Failed to revoke invite';
			toastService.error(message);
			await loadShareData(session.projectId);
		} finally {
			if (isCurrentProjectSession(session)) {
				inviteActionId = null;
				inviteActionType = null;
			}
		}
	}

	async function handleMemberRoleChange(member: MemberRow, nextRole: MemberRole) {
		if (!canManageMembers || memberActionId || memberRoleProfileSaving) {
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
		const session = captureProjectSession();

		memberActionId = member.id;
		memberActionType = 'role';

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/members/${member.id}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({ role_key: nextRole })
				}
			);

			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update member');
			}

			const label = getMemberLabel(member);
			toastService.success(`Updated ${label} to ${formatRole(nextRole)}`);
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to update member role:', err);
			const message = err instanceof Error ? err.message : 'Failed to update member';
			toastService.error(message);
			await loadShareData(session.projectId);
		} finally {
			if (isCurrentProjectSession(session)) {
				memberActionId = null;
				memberActionType = null;
			}
		}
	}

	async function handleMemberAgentAccessChange(member: MemberRow, nextAccess: AgentAccess) {
		if (!canManageMembers || memberActionsBusy || member.role_key === 'owner') {
			return;
		}
		if (nextAccess === memberAgentAccess(member)) return;
		if (!agentAccessAllowed(member.role_key, nextAccess)) {
			toastService.error('Agents can only write where their person can edit.');
			return;
		}
		const session = captureProjectSession();

		memberActionId = member.id;
		memberActionType = 'agents';

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/members/${member.id}/agent-access`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({ agent_access: nextAccess })
				}
			);

			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update their agents');
			}

			members = members.map((row) =>
				row.id === member.id ? { ...row, agent_access: nextAccess } : row
			);
			const label = getMemberLabel(member);
			toastService.success(
				nextAccess === 'off'
					? `${label}’s agents are paused on this project`
					: `${label}’s agents: ${agentAccessLabel(nextAccess)}`
			);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to update member agents:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/members/${member.id}/agent-access`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'project_member',
				entityId: member.id,
				operation: 'project_member_agent_access_update',
				metadata: { source: 'project_collaboration_modal' }
			});
			const message = err instanceof Error ? err.message : 'Failed to update their agents';
			toastService.error(message);
			await loadShareData(session.projectId);
		} finally {
			if (isCurrentProjectSession(session)) {
				memberActionId = null;
				memberActionType = null;
			}
		}
	}

	/**
	 * An editor whose own setting is Read gets Write while the editors' setting is on.
	 * Display only: the member's dropdown still saves their own setting.
	 */
	function liftedByEditorsSetting(member: MemberRow): boolean {
		return (
			editorAgentsWrite === true &&
			member.role_key === 'editor' &&
			memberAgentAccess(member) === 'read'
		);
	}

	async function handleEditorAgentsWriteToggle() {
		if (!canManageMembers || agentSettingsSaving || editorAgentsWrite === null) return;
		const session = captureProjectSession();
		const previous = editorAgentsWrite;
		const next = !previous;

		// Optimistic: flip now, put it back if the save fails.
		editorAgentsWrite = next;
		agentSettingsSaving = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${session.projectId}/agent-settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ editor_agents_write: next })
			});
			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			const saved = payload?.data?.editor_agents_write;
			if (!response.ok || typeof saved !== 'boolean') {
				throw new Error(payload?.error || 'Couldn’t save the editors’ agents setting.');
			}

			editorAgentsWrite = saved;
			toastService.success(
				saved
					? 'Editors’ agents can now make changes here'
					: 'Editors’ agents follow each person’s own setting again'
			);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			editorAgentsWrite = previous;
			console.error('[ProjectCollaborationModal] Failed to update editors’ agents:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/agent-settings`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'project',
				operation: 'project_agent_settings_update',
				metadata: { source: 'project_collaboration_modal', status: responseStatus }
			});
			toastService.error(
				err instanceof Error && err.message
					? err.message
					: 'Couldn’t save the editors’ agents setting.'
			);
		} finally {
			if (isCurrentProjectSession(session)) {
				agentSettingsSaving = false;
			}
		}
	}

	async function handleMemberRemove(member: MemberRow) {
		if (!canManageMembers || memberActionId || memberRoleProfileSaving) {
			return;
		}

		if (member.role_key === 'owner') {
			return;
		}

		const label = getMemberLabel(member);
		confirmRemoveMemberId = null;
		const session = captureProjectSession();

		memberActionId = member.id;
		memberActionType = 'remove';

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/members/${member.id}`,
				{
					method: 'DELETE',
					credentials: 'same-origin'
				}
			);

			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to remove member');
			}

			toastService.success(`Removed ${label}`);
			await loadShareData(session.projectId);
			if (!isCurrentProjectSession(session)) return;

			void onMembersChanged?.();
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to remove member:', err);
			const message = err instanceof Error ? err.message : 'Failed to remove member';
			toastService.error(message);
			await loadShareData(session.projectId);
		} finally {
			if (isCurrentProjectSession(session)) {
				memberActionId = null;
				memberActionType = null;
			}
		}
	}

	function handleStartMemberRoleProfileEdit(member: MemberRow) {
		if (!canManageMembers || memberRoleProfileSaving) return;
		memberRoleProfileError = null;
		editingMemberRoleProfileId = member.id;
		editingMemberRoleNameInput = member.role_name ?? '';
		editingMemberRoleDescriptionInput = member.role_description ?? '';
	}

	function handleCancelMemberRoleProfileEdit() {
		if (memberRoleProfileSaving) return;
		memberRoleProfileError = null;
		editingMemberRoleProfileId = null;
		editingMemberRoleNameInput = '';
		editingMemberRoleDescriptionInput = '';
	}

	async function handleSaveMemberRoleProfile(event: Event) {
		event.preventDefault();
		if (!editingMemberRoleProfileId) return;
		const session = captureProjectSession();

		const targetMember = members.find((member) => member.id === editingMemberRoleProfileId);
		if (!targetMember) {
			memberRoleProfileError = 'Member not found';
			return;
		}

		memberRoleProfileError = null;

		const roleName = editingMemberRoleNameInput.trim();
		const roleDescription = editingMemberRoleDescriptionInput.trim();
		const roleNameValue = roleName.length > 0 ? roleName : null;
		const roleDescriptionValue = roleDescription.length > 0 ? roleDescription : null;

		if (
			roleNameValue !== null &&
			(roleNameValue.length < ROLE_NAME_MIN || roleNameValue.length > ROLE_NAME_MAX)
		) {
			memberRoleProfileError = `Role name must be ${ROLE_NAME_MIN}-${ROLE_NAME_MAX} characters`;
			return;
		}

		if (
			roleDescriptionValue !== null &&
			(roleDescriptionValue.length < ROLE_DESCRIPTION_MIN ||
				roleDescriptionValue.length > ROLE_DESCRIPTION_MAX)
		) {
			memberRoleProfileError = `Role description must be ${ROLE_DESCRIPTION_MIN}-${ROLE_DESCRIPTION_MAX} characters`;
			return;
		}

		memberRoleProfileSaving = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/members/${targetMember.id}/role-profile`,
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
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update member role profile');
			}

			toastService.success(`Updated role profile for ${getMemberLabel(targetMember)}`);
			editingMemberRoleProfileId = null;
			editingMemberRoleNameInput = '';
			editingMemberRoleDescriptionInput = '';
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to update member role profile:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/members/${targetMember.id}/role-profile`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'project_member',
				entityId: targetMember.id,
				operation: 'project_member_role_profile_admin_update',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			memberRoleProfileError =
				err instanceof Error ? err.message : 'Failed to update member role profile';
			toastService.error(memberRoleProfileError);
		} finally {
			if (isCurrentProjectSession(session)) {
				memberRoleProfileSaving = false;
			}
		}
	}

	async function handleLeaveProject() {
		if (!canLeaveProject || isLeavingProject) {
			return;
		}
		const session = captureProjectSession();
		confirmLeave = false;

		isLeavingProject = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${session.projectId}/members/me`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to leave project');
			}

			toastService.success('You left this project');
			handleClose();
			onLeftProject?.();
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to leave project:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/members/me`,
				method: 'DELETE',
				projectId: session.projectId,
				entityType: 'project_member',
				operation: 'project_member_leave',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus
				}
			});
			const message = err instanceof Error ? err.message : 'Failed to leave project';
			toastService.error(message);
		} finally {
			if (isCurrentProjectSession(session)) {
				isLeavingProject = false;
			}
		}
	}

	async function handleStartHandoff(member: MemberRow, event: MouseEvent) {
		if (!isProjectOwner || memberActionsBusy || member.role_key === 'owner') return;
		handoffTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		handoffTarget = member;
		handoffLeave = false;
		handoffError = null;
		await tick();
		handoffPanel?.focus();
	}

	function handleCancelHandoff() {
		if (handoffSaving) return;
		handoffTarget = null;
		handoffLeave = false;
		handoffError = null;
		const trigger = handoffTrigger;
		handoffTrigger = null;
		if (trigger?.isConnected) trigger.focus();
	}

	async function handleConfirmHandoff(event: Event) {
		event.preventDefault();
		const target = handoffTarget;
		if (!target || !isProjectOwner || handoffSaving || !handoffTargetIsMember) return;
		const session = captureProjectSession();
		const leave = handoffLeave;
		const label = getMemberLabel(target);
		const requestedProjectName = projectName || 'this project';

		handoffSaving = true;
		handoffError = null;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(`/api/onto/projects/${session.projectId}/ownership`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ member_id: target.id, leave })
			});

			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;

			if (!response.ok || payload?.success === false) {
				if (payload?.code === 'handoff_member_not_found') {
					handoffError = `${label} isn’t on this project anymore. Pick someone else.`;
					await loadShareData(session.projectId);
					return;
				}
				throw new Error(
					response.status === 403
						? 'Only the owner can hand off this project.'
						: payload?.error || 'Could not hand off this project'
				);
			}

			const left = payload?.data?.previous_owner_left === true || leave;
			toastService.success(
				left
					? `${label} now owns ${requestedProjectName}. You’ve left the project.`
					: `${label} now owns ${requestedProjectName}`
			);
			handoffTarget = null;
			handoffLeave = false;
			handoffTrigger = null;

			if (left) {
				handleClose();
				onLeftProject?.();
				return;
			}

			// Now an editor: the page's permissions (delete, member admin) need a reload.
			void onOwnershipChanged?.();
			await loadShareData(session.projectId);
			if (!isCurrentProjectSession(session)) return;
			void onMembersChanged?.();
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;

			console.error('[ProjectCollaborationModal] Failed to hand off ownership:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/ownership`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_member',
				entityId: target.id,
				operation: 'project_ownership_handoff',
				metadata: {
					source: 'project_collaboration_modal',
					status: responseStatus,
					leave
				}
			});
			handoffError = err instanceof Error ? err.message : 'Could not hand off this project';
		} finally {
			if (isCurrentProjectSession(session)) {
				handoffSaving = false;
			}
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

<Modal
	{isOpen}
	onClose={handleClose}
	title={canManageMembers ? `Share ${projectName || 'project'}` : 'People on this project'}
	size="md"
>
	<!-- Tab Navigation -->
	<div class="px-3 sm:px-4 pt-2 border-b border-border">
		<TabNav
			{tabs}
			activeTab={currentTab}
			onchange={handleTabChange}
			ariaLabel="Sharing sections"
		/>
	</div>

	<!-- Tab Content -->
	<div class="p-3 sm:p-4 space-y-4">
		{#if currentTab === 'invite' && canManageMembers}
			<!-- Invite by email or @handle -->
			<section aria-labelledby="invite-person-heading" class="space-y-2.5">
				<div>
					<h3 id="invite-person-heading" class="text-sm font-semibold text-foreground">
						Invite someone
					</h3>
					<p class="mt-0.5 text-xs text-muted-foreground">
						We email them an invite to
						<span class="font-medium">{projectName || 'this project'}</span>. Only they
						can accept it.
					</p>
				</div>

				<form class="space-y-2.5" onsubmit={handleInvite}>
					<div class="space-y-1">
						<label for="invite-email" class="text-xs font-medium text-muted-foreground"
							>Email or @handle</label
						>
						<TextInput
							id="invite-email"
							bind:value={invitee}
							type="text"
							inputmode="email"
							autocomplete="off"
							placeholder="name@example.com or @sam"
							icon={AtSign}
							disabled={!canInvite}
						/>
					</div>

					<div class="grid gap-2.5 sm:grid-cols-2">
						<div class="space-y-1">
							<label
								for="invite-role"
								class="text-xs font-medium text-muted-foreground"
								>They join as</label
							>
							<Select
								id="invite-role"
								bind:value={role}
								size="md"
								placeholder=""
								disabled={!canInvite}
								onchange={(value) =>
									(inviteAgentAccess = fitAgentAccessToRole(
										String(value),
										inviteAgentAccess
									))}
							>
								<option value="editor">Editor (can edit)</option>
								<option value="viewer">Viewer (can see)</option>
							</Select>
						</div>

						<div class="space-y-1">
							<label
								for="invite-agent-access"
								class="text-xs font-medium text-muted-foreground"
								>Their agents</label
							>
							<Select
								id="invite-agent-access"
								bind:value={inviteAgentAccess}
								size="md"
								placeholder=""
								aria-describedby="invite-agent-access-hint"
								disabled={!canInvite}
							>
								<option value="off">Off</option>
								<option value="read">Read</option>
								<option value="write" disabled={role !== 'editor'}
									>Write{role !== 'editor' ? ' (Editors only)' : ''}</option
								>
							</Select>
						</div>
					</div>
					<p id="invite-agent-access-hint" class="text-xs text-muted-foreground">
						{agentAccessDescription(inviteAgentAccess)}
					</p>

					{#if error}
						<p class="text-xs text-destructive" role="alert">{error}</p>
					{/if}

					<Button
						type="submit"
						variant="primary"
						size="sm"
						icon={Mail}
						loading={isSending}
						disabled={isSending || !canInvite}
					>
						{isSending ? 'Sending…' : 'Send invite'}
					</Button>
				</form>

				{#if lastSentInvite}
					<div
						class="rounded-lg border border-border bg-background p-3 shadow-ink-inner space-y-2"
						role="status"
					>
						<p class="text-sm text-foreground">
							{#if lastSentInvite.emailSent}
								<span class="font-semibold"
									>Invite sent to {lastSentInvite.label}.</span
								>
								You can also send them the link yourself.
							{:else}
								<span class="font-semibold"
									>The invite is ready, but the email didn’t go out.</span
								>
								Copy the link and send it to {lastSentInvite.label} yourself.
							{/if}
						</p>
						{#if lastSentInvite.url}
							{@const sentUrl = lastSentInvite.url}
							<div class="flex flex-wrap items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									icon={copiedUrl === sentUrl ? Check : Copy}
									onclick={() => copyInviteUrl(sentUrl)}
								>
									{copiedUrl === sentUrl ? 'Copied' : 'Copy invite link'}
								</Button>
								<p class="text-xs text-muted-foreground">
									Only {lastSentInvite.label} can accept this one.
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</section>

			<div class="border-t border-border pt-4">
				<ProjectInviteLinkPanel {projectId} {projectName} />
			</div>
		{/if}

		{#if currentTab === 'people'}
			<!-- Members -->
			<section aria-labelledby="members-heading" class="space-y-2">
				<div class="flex items-center justify-between gap-2">
					<h3 id="members-heading" class="text-sm font-semibold text-foreground">
						Members
					</h3>
					{#if canManageMembers && members.length > 0}
						<Button
							variant="ghost"
							size="sm"
							icon={UserPlus}
							onclick={() => (activeTab = 'invite')}
						>
							Invite
						</Button>
					{/if}
				</div>

				{#if !canManageMembers}
					<p class="text-xs text-muted-foreground">
						Only the project owner can invite people or change who sees this project.
					</p>
				{/if}

				{#if isLoading}
					<p class="text-xs text-muted-foreground">Loading members...</p>
				{:else if members.length === 0}
					<p class="text-xs text-muted-foreground">No members yet.</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each members as member (member.id)}
							{@const memberLabel = getMemberLabel(member)}
							{@const isSelf = member.actor_id === currentActorId}
							{@const manageable = canManageMembers && member.role_key !== 'owner'}
							<li class="py-2.5">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-foreground truncate">
											{memberLabel}{#if isSelf}<span
													class="font-normal text-muted-foreground"
												>
													(you)</span
												>{/if}
										</p>
										{#if (member.actor?.email && member.actor?.name) || member.joined_via_invite_link_id}
											<p class="text-xs text-muted-foreground truncate">
												{member.actor?.email && member.actor?.name
													? member.actor.email
													: ''}{member.actor?.email &&
												member.actor?.name &&
												member.joined_via_invite_link_id
													? ' · '
													: ''}{member.joined_via_invite_link_id
													? 'Joined with the invite link'
													: ''}
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
									{#if !manageable}
										<div class="flex shrink-0 flex-wrap justify-end gap-1">
											<span
												class="text-xs font-medium text-muted-foreground px-2 py-0.5 bg-muted rounded"
											>
												{formatRole(member.role_key)}
											</span>
											{#if member.role_key !== 'owner'}
												<span
													class="text-xs font-medium text-muted-foreground px-2 py-0.5 bg-muted rounded"
													title={agentAccessDescription(
														memberAgentAccess(member)
													)}
												>
													Agents: {liftedByEditorsSetting(member)
														? 'Write (editors’ setting)'
														: agentAccessLabel(
																memberAgentAccess(member)
															)}
												</span>
											{/if}
										</div>
									{/if}
								</div>

								{#if manageable}
									<div
										class="mt-2 grid grid-cols-2 gap-2 sm:flex sm:items-center"
									>
										<Select
											value={member.role_key}
											size="sm"
											class="sm:min-w-[110px]"
											placeholder=""
											aria-label="Role for {memberLabel}"
											disabled={memberActionsBusy}
											onchange={(value) =>
												handleMemberRoleChange(member, value as MemberRole)}
										>
											<option value="editor">Editor</option>
											<option value="viewer">Viewer</option>
										</Select>
										<Select
											value={memberAgentAccess(member)}
											size="sm"
											class="sm:min-w-[124px]"
											placeholder=""
											aria-label="What {memberLabel}’s agents can do"
											aria-describedby={liftedByEditorsSetting(member)
												? `agents-lifted-${member.id}`
												: undefined}
											title={agentAccessDescription(
												memberAgentAccess(member)
											)}
											disabled={memberActionsBusy}
											onchange={(value) =>
												handleMemberAgentAccessChange(
													member,
													value as AgentAccess
												)}
										>
											<option value="off">Agents: Off</option>
											<option value="read">Agents: Read</option>
											<option
												value="write"
												disabled={member.role_key !== 'editor'}
												>Agents: Write</option
											>
										</Select>
										<div
											class="col-span-2 flex flex-wrap items-center gap-1 sm:ml-auto"
										>
											{#if !isSelf}
												<Button
													variant="ghost"
													size="sm"
													disabled={memberActionsBusy}
													onclick={() =>
														handleStartMemberRoleProfileEdit(member)}
												>
													{editingMemberRoleProfileId === member.id
														? 'Editing...'
														: 'Edit profile'}
												</Button>
											{/if}
											{#if isProjectOwner && !isSelf}
												<Button
													variant="ghost"
													size="sm"
													aria-expanded={handoffTarget?.id === member.id}
													disabled={memberActionsBusy}
													onclick={(event) =>
														handleStartHandoff(member, event)}
												>
													Make owner
												</Button>
											{/if}
											<Button
												variant="ghost"
												size="sm"
												class="text-destructive hover:bg-destructive/10"
												loading={memberActionId === member.id &&
													memberActionType === 'remove'}
												disabled={memberActionsBusy}
												aria-expanded={confirmRemoveMemberId === member.id}
												onclick={() => (confirmRemoveMemberId = member.id)}
											>
												Remove
											</Button>
										</div>
									</div>

									{#if liftedByEditorsSetting(member)}
										<p
											id="agents-lifted-{member.id}"
											class="mt-1.5 text-xs text-muted-foreground"
										>
											Their agents can make changes through the editors’
											setting below.
										</p>
									{/if}

									{#if confirmRemoveMemberId === member.id}
										<div
											class="mt-2 rounded-md border border-border bg-background p-3 space-y-2"
											role="group"
											aria-label="Remove {memberLabel}"
										>
											<p class="text-sm text-foreground">
												Remove {memberLabel} from {projectName ||
													'this project'}?
											</p>
											<p class="text-xs text-muted-foreground">
												They lose access right away. If they open the invite
												link again, you get a request and decide whether
												they come back. You can also invite them again
												yourself.
											</p>
											<div class="flex flex-wrap gap-2">
												<Button
													variant="ghost"
													size="sm"
													onclick={() => (confirmRemoveMemberId = null)}
												>
													Cancel
												</Button>
												<Button
													variant="danger"
													size="sm"
													disabled={memberActionsBusy}
													onclick={() => handleMemberRemove(member)}
												>
													Remove
												</Button>
											</div>
										</div>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>

					{#if members.some((member) => member.role_key !== 'owner')}
						<p class="text-xs text-muted-foreground">
							Agents: what each person’s own AI agents can do here. Off pauses them.
							Read lets them read the project. Write also lets them add tasks and docs
							and change only what that person created or is assigned to.
						</p>
					{/if}

					{#if canManageMembers && (editorAgentsWrite !== null || agentSettingsLoadFailed)}
						<div
							class="flex items-start justify-between gap-4 rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner"
						>
							<div class="min-w-0 space-y-0.5">
								<p
									id="editor-agents-write-label"
									class="text-sm font-medium text-foreground"
								>
									Editors’ agents can make changes
								</p>
								<p
									id="editor-agents-write-hint"
									class="text-xs text-muted-foreground"
								>
									{editorAgentsWrite === null
										? 'This setting didn’t load. Close and reopen this window to try again.'
										: 'Every editor’s agents can add tasks and documents and change their own work here. People whose agents you turned off stay off.'}
								</p>
							</div>
							{#if editorAgentsWrite !== null}
								<button
									type="button"
									role="switch"
									aria-checked={editorAgentsWrite}
									aria-labelledby="editor-agents-write-label"
									aria-describedby="editor-agents-write-hint"
									disabled={agentSettingsSaving}
									onclick={handleEditorAgentsWriteToggle}
									class="relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors motion-reduce:transition-none before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 {editorAgentsWrite
										? 'border-accent bg-accent'
										: 'border-border-strong bg-muted'}"
								>
									<span
										class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-ink transition-transform motion-reduce:transition-none {editorAgentsWrite
											? 'translate-x-5'
											: 'translate-x-0'}"
									></span>
								</button>
							{/if}
						</div>
					{/if}

					{#if handoffTarget}
						{@const handoffLabel = getMemberLabel(handoffTarget)}
						<form
							bind:this={handoffPanel}
							tabindex="-1"
							aria-labelledby="handoff-heading"
							class="mt-3 rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner space-y-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onsubmit={handleConfirmHandoff}
						>
							<div class="space-y-1">
								<p id="handoff-heading" class="text-sm font-medium text-foreground">
									Make {handoffLabel} the owner of {projectName ||
										'this project'}?
								</p>
								<p class="text-xs text-muted-foreground">
									They get full control, including deleting it.
									{handoffLeave
										? 'You’ll leave the project and lose access.'
										: 'You’ll stay on as an editor.'}
								</p>
							</div>

							<label class="flex items-start gap-2.5 cursor-pointer">
								<input
									type="checkbox"
									class="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
									bind:checked={handoffLeave}
									disabled={handoffSaving}
								/>
								<span class="text-sm text-foreground">
									Leave the project after handing it off
								</span>
							</label>

							{#if handoffError}
								<p class="text-xs text-destructive" role="alert">{handoffError}</p>
							{/if}

							<div class="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={handoffSaving}
									onclick={handleCancelHandoff}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									variant="primary"
									size="sm"
									loading={handoffSaving}
									disabled={handoffSaving || !handoffTargetIsMember}
								>
									{handoffLeave ? 'Hand off and leave' : 'Make owner'}
								</Button>
							</div>
						</form>
					{/if}

					{#if editingMemberRoleProfile}
						<div
							class="mt-3 rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner space-y-2"
						>
							<p class="micro-label text-muted-foreground">
								Edit role profile: {getMemberLabel(editingMemberRoleProfile)}
							</p>

							<form class="space-y-2" onsubmit={handleSaveMemberRoleProfile}>
								<div class="space-y-1">
									<label
										for="member-role-title-input"
										class="text-xs font-medium text-muted-foreground"
										>Role title</label
									>
									<TextInput
										id="member-role-title-input"
										bind:value={editingMemberRoleNameInput}
										placeholder="Execution Lead"
										maxlength={ROLE_NAME_MAX}
										disabled={memberRoleProfileSaving}
									/>
								</div>

								<div class="space-y-1">
									<label
										for="member-role-description-input"
										class="text-xs font-medium text-muted-foreground"
									>
										Role description
									</label>
									<Textarea
										id="member-role-description-input"
										bind:value={editingMemberRoleDescriptionInput}
										rows={3}
										autoResize
										maxRows={8}
										placeholder="What outcomes and responsibilities do they own?"
										maxlength={ROLE_DESCRIPTION_MAX}
										disabled={memberRoleProfileSaving}
									/>
								</div>

								{#if memberRoleProfileError}
									<p class="text-xs text-destructive">{memberRoleProfileError}</p>
								{/if}

								<div class="flex items-center gap-2">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={memberRoleProfileSaving}
										onclick={handleCancelMemberRoleProfileEdit}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										variant="secondary"
										size="sm"
										disabled={memberRoleProfileSaving}
									>
										{memberRoleProfileSaving ? 'Saving...' : 'Save Profile'}
									</Button>
								</div>
							</form>
						</div>
					{/if}
				{/if}
			</section>

			<!-- Waiting to join -->
			{#if invites.length > 0}
				<section
					aria-labelledby="pending-invites-heading"
					class="border-t border-border pt-4 space-y-2"
				>
					<h3 id="pending-invites-heading" class="text-sm font-semibold text-foreground">
						Waiting to join
					</h3>
					<ul class="divide-y divide-border">
						{#each invites as invite (invite.id)}
							{@const inviteLabel = getInviteLabel(invite)}
							{@const knownUrl = inviteUrls[invite.id] ?? null}
							<li class="py-2.5">
								<div class="min-w-0">
									<p class="text-sm text-foreground truncate">{inviteLabel}</p>
									<p class="text-xs text-muted-foreground">
										{formatRole(invite.role_key)} · Agents: {agentAccessLabel(
											invite.agent_access
										)}{invite.expires_at
											? ` · until ${shortDate(invite.expires_at)}`
											: ''}
									</p>
								</div>
								{#if canInvite}
									<div class="mt-1.5 flex flex-wrap items-center gap-1">
										{#if knownUrl}
											<Button
												variant="ghost"
												size="sm"
												icon={copiedUrl === knownUrl ? Check : Link2}
												onclick={() => copyInviteUrl(knownUrl)}
											>
												{copiedUrl === knownUrl
													? 'Copied'
													: 'Copy their link'}
											</Button>
										{/if}
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
											aria-expanded={confirmRevokeInviteId === invite.id}
											onclick={() => (confirmRevokeInviteId = invite.id)}
										>
											Cancel invite
										</Button>
									</div>
									{#if confirmRevokeInviteId === invite.id}
										<div
											class="mt-2 rounded-md border border-border bg-background p-3 space-y-2"
											role="group"
											aria-label="Cancel the invite for {inviteLabel}"
										>
											<p class="text-sm text-foreground">
												Cancel the invite for {inviteLabel}? Its link stops
												working.
											</p>
											<div class="flex flex-wrap gap-2">
												<Button
													variant="ghost"
													size="sm"
													onclick={() => (confirmRevokeInviteId = null)}
												>
													Keep it
												</Button>
												<Button
													variant="danger"
													size="sm"
													disabled={inviteActionId !== null}
													onclick={() => handleInviteRevoke(invite)}
												>
													Cancel invite
												</Button>
											</div>
										</div>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if canLeaveProject}
				<div class="border-t border-border pt-4 space-y-2">
					{#if confirmLeave}
						<div
							class="rounded-md border border-border bg-background p-3 space-y-2"
							role="group"
							aria-label="Leave {projectName || 'this project'}"
						>
							<p class="text-sm text-foreground">
								Leave {projectName || 'this project'}? You lose access until someone
								invites you again.
							</p>
							<div class="flex flex-wrap gap-2">
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (confirmLeave = false)}
								>
									Stay
								</Button>
								<Button
									variant="danger"
									size="sm"
									loading={isLeavingProject}
									disabled={isLeavingProject || memberActionsBusy}
									onclick={handleLeaveProject}
								>
									Leave project
								</Button>
							</div>
						</div>
					{:else}
						<Button
							variant="ghost"
							size="sm"
							class="text-destructive hover:bg-destructive/10"
							disabled={isLeavingProject || memberActionsBusy}
							onclick={() => (confirmLeave = true)}
						>
							Leave project
						</Button>
						<p class="text-xs text-muted-foreground">
							To come back later, you’ll need the owner to say yes.
						</p>
					{/if}
				</div>
			{:else if isProjectOwner && members.length > 1}
				<p class="border-t border-border pt-4 text-xs text-muted-foreground">
					Want to leave? Make someone else the owner, then choose to leave.
				</p>
			{/if}
		{/if}
		{#if currentTab === 'my-role'}
			<!-- Role Profile Section -->
			<div class="space-y-2">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Describe your role</h3>
					<p class="text-xs text-muted-foreground mt-0.5">
						Share what you do in this project and AI will generate a role title and
						description for team context.
					</p>
				</div>

				{#if currentMember}
					<div
						class="rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner space-y-1"
					>
						<div class="flex items-center justify-between gap-2">
							<p class="micro-label text-muted-foreground">Current role profile</p>
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

					<div class="flex items-center gap-2">
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
								: 'Generate & Save'}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={roleProfileActionType !== null ||
								isEditingRoleProfile ||
								roleContextInput.trim().length === 0}
							onclick={handleGenerateRoleProfileAlternatives}
						>
							{roleProfileActionType === 'alternatives'
								? 'Generating...'
								: 'Generate Alternatives'}
						</Button>
					</div>
				</form>

				{#if roleProfileAlternatives.length > 0}
					<div
						class="rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner space-y-2"
					>
						<p class="micro-label text-muted-foreground">Alternative role profiles</p>
						<div class="space-y-2">
							{#each roleProfileAlternatives as alternative, index (`${alternative.role_name}-${index}`)}
								<div
									class="rounded border border-border bg-background p-2 shadow-ink space-y-1"
								>
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="text-sm text-foreground truncate">
												{alternative.role_name}
											</p>
											<p class="text-xs text-muted-foreground">
												{alternative.role_description}
											</p>
										</div>
										<Button
											variant="ghost"
											size="sm"
											disabled={roleProfileActionType !== null}
											onclick={() =>
												handleUseRoleProfileAlternative(alternative)}
										>
											Use This
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Notification Settings Section -->
			<div class="border-t border-border pt-3 space-y-2">
				<div class="flex items-center gap-2 text-foreground">
					<Bell class="h-4 w-4 text-muted-foreground" />
					<h3 class="text-sm font-semibold">Notification preferences</h3>
				</div>

				{#if isLoading && !notificationSettings}
					<p class="text-xs text-muted-foreground">Loading notification settings...</p>
				{:else if notificationSettings}
					<div
						class="rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner space-y-3"
					>
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
									In-app shared project updates are on by default. Push still uses
									your global push preference.
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
											New and existing members inherit this unless they set
											their own preference.
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
								This project is currently solo. Default notifications automatically
								turn on when a second member joins.
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
		{/if}
	</div>
</Modal>
