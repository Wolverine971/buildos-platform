<!-- apps/web/src/lib/components/project/ProjectCollaborationModal.svelte -->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { copyTextToClipboard } from '$lib/utils/public-page-url';
	import ProjectInviteLinkPanel from './ProjectInviteLinkPanel.svelte';
	import { AtSign, Bot, Check, ChevronDown, Copy, Link2, Mail, Users } from '$lib/icons/lucide';
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
		/** Their @handle, when they have one. */
		handle?: string | null;
		actor?: {
			id: string;
			user_id?: string | null;
			name: string | null;
			/** Only the owner gets other people's emails; everyone gets their own. */
			email: string | null;
		};
		created_at?: string | null;
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
		/** 'expired' once a pending invite is past its date (the row still says pending). */
		effective_status?: string;
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
	/** Your own row: your role here, notifications, leave. Open by default for members. */
	let selfExpanded = $state(false);
	/** Bumped to snap a member's role menu back after "Make owner…" or "Remove…". */
	let roleMenuResetKey = $state(0);
	/** The project's Restricted setting ('restricted': only connections you pick reach it). */
	let externalAgentAccess = $state<'standard' | 'restricted' | null>(null);
	let restrictedSaving = $state(false);
	let clearingExpired = $state(false);
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
		selfExpanded = !untrack(() => canManageMembers);
		roleMenuResetKey = 0;
		externalAgentAccess = null;
		restrictedSaving = false;
		clearingExpired = false;
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
		// Only the owner manages invites. Everyone reads the agent settings: members see
		// what their own agents can do here, which the editors' setting can lift.
		const loadInvites = untrack(() => canManageMembers);

		try {
			const [membersRes, invitesRes, settingsRes, agentSettingsRes] = await Promise.all([
				fetch(`/api/onto/projects/${requestedProjectId}/members`, {
					method: 'GET',
					credentials: 'same-origin',
					signal: abortController.signal
				}),
				loadInvites
					? fetch(`/api/onto/projects/${requestedProjectId}/invites`, {
							method: 'GET',
							credentials: 'same-origin',
							signal: abortController.signal
						})
					: Promise.resolve(null),
				fetch(`/api/onto/projects/${requestedProjectId}/notification-settings`, {
					method: 'GET',
					credentials: 'same-origin',
					signal: abortController.signal
				}),
				// Best effort: a failure here never blocks the rest of the window.
				fetch(`/api/onto/projects/${requestedProjectId}/agent-settings`, {
					method: 'GET',
					credentials: 'same-origin',
					signal: abortController.signal
				}).catch(() => null)
			]);

			membersStatus = membersRes.status;
			invitesStatus = invitesRes?.status ?? null;
			settingsStatus = settingsRes.status;

			const [membersPayload, invitesPayload, settingsPayload] = await Promise.all([
				membersRes.ok ? membersRes.json() : membersRes.json().catch(() => null),
				!invitesRes
					? Promise.resolve(null)
					: invitesRes.ok
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

			const loaded = agentSettingsPayload?.data?.editor_agents_write;
			if (typeof loaded === 'boolean') {
				editorAgentsWrite = loaded;
				agentSettingsLoadFailed = false;
			} else if (editorAgentsWrite === null) {
				agentSettingsLoadFailed = true;
			}
			const loadedAccess = agentSettingsPayload?.data?.external_agent_access;
			if (loadedAccess === 'standard' || loadedAccess === 'restricted') {
				externalAgentAccess = loadedAccess;
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

			if (!invitesRes || invitesRes.status === 403) {
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
	const ownerMember = $derived(members.find((member) => member.role_key === 'owner') ?? null);
	const ownerName = $derived(ownerMember ? getMemberLabel(ownerMember) : 'The owner');
	/** You first, then everyone else in role order. */
	const otherMembers = $derived(members.filter((member) => member.actor_id !== currentActorId));
	const expiredInvites = $derived(invites.filter((invite) => isInviteExpired(invite)));
	/** What your own agents can do here, counting the owner's editors' setting. */
	const ownAgentAccess = $derived<AgentAccess | null>(
		currentMember && currentMember.role_key !== 'owner'
			? liftedByEditorsSetting(currentMember)
				? 'write'
				: memberAgentAccess(currentMember)
			: null
	);

	function getMemberLabel(member: MemberRow): string {
		return (
			member.actor?.name ||
			(member.handle ? `@${member.handle}` : null) ||
			member.actor?.email ||
			'Someone'
		);
	}

	function getMemberInitials(member: MemberRow): string {
		const source = member.actor?.name || member.handle || member.actor?.email || '?';
		const words = source.replace(/@.*$/, '').trim().split(/\s+/).filter(Boolean);
		const first = words[0] ?? '?';
		const last = words.length > 1 ? (words[words.length - 1] ?? '') : '';
		const letters = last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2);
		return letters.toUpperCase();
	}

	/** The small line under a name: handle, email (owner only), how they joined, role title. */
	function getMemberDetail(member: MemberRow, isSelf: boolean): string {
		const parts: string[] = [];
		if (member.handle) parts.push(`@${member.handle}`);
		if (member.actor?.email && (canManageMembers || isSelf) && member.actor?.name) {
			parts.push(member.actor.email);
		}
		if (member.joined_via_invite_link_id) parts.push('Joined with the invite link');
		if (member.role_name) parts.push(member.role_name);
		return parts.join(' · ');
	}

	function isInviteExpired(invite: InviteRow): boolean {
		if (invite.effective_status) return invite.effective_status === 'expired';
		return Boolean(invite.expires_at && Date.parse(invite.expires_at) < Date.now());
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

	async function handleStartHandoff(member: MemberRow, trigger: HTMLElement | null) {
		if (!isProjectOwner || memberActionsBusy || member.role_key === 'owner') return;
		handoffTrigger = trigger;
		handoffTarget = member;
		handoffLeave = false;
		handoffError = null;
		await tick();
		handoffPanel?.focus();
	}

	function handleCancelHandoff() {
		if (handoffSaving) return;
		const targetId = handoffTarget?.id ?? null;
		handoffTarget = null;
		handoffLeave = false;
		handoffError = null;
		const trigger = handoffTrigger;
		handoffTrigger = null;
		if (trigger?.isConnected) {
			trigger.focus();
		} else if (targetId) {
			document.getElementById(`role-menu-${targetId}`)?.focus();
		}
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

	/** The role menu also holds "Make owner…" and "Remove…", which open a confirm. */
	function handleRoleMenu(member: MemberRow, value: string) {
		if (value === 'make-owner' || value === 'remove') {
			// Snap the menu back to their real role; the confirm below does the work.
			roleMenuResetKey += 1;
			if (value === 'make-owner') {
				confirmRemoveMemberId = null;
				// The menu re-renders, so Cancel finds it again by id to return focus.
				void handleStartHandoff(member, null);
			} else {
				handoffTarget = null;
				confirmRemoveMemberId = member.id;
			}
			return;
		}
		void handleMemberRoleChange(member, value as MemberRole);
	}

	function toggleMemberRoleEditor(member: MemberRow) {
		if (editingMemberRoleProfileId === member.id) {
			handleCancelMemberRoleProfileEdit();
		} else {
			handleStartMemberRoleProfileEdit(member);
		}
	}

	async function handleClearExpiredInvites() {
		if (!canInvite || clearingExpired || inviteActionId) return;
		const session = captureProjectSession();
		clearingExpired = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/invites/clear-expired`,
				{ method: 'POST', credentials: 'same-origin' }
			);
			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Couldn’t clear expired invites');
			}
			const cleared = Number(payload?.data?.cleared ?? 0);
			toastService.success(
				cleared === 1 ? 'Cleared 1 expired invite' : `Cleared ${cleared} expired invites`
			);
			await loadShareData(session.projectId);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;
			console.error('[ProjectCollaborationModal] Failed to clear expired invites:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/invites/clear-expired`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'project_invite',
				operation: 'project_invites_clear_expired',
				metadata: { source: 'project_collaboration_modal', status: responseStatus }
			});
			toastService.error(
				err instanceof Error ? err.message : 'Couldn’t clear expired invites'
			);
		} finally {
			if (isCurrentProjectSession(session)) clearingExpired = false;
		}
	}

	async function handleRestrictedToggle() {
		if (!canManageMembers || restrictedSaving || externalAgentAccess === null) return;
		const session = captureProjectSession();
		const previous = externalAgentAccess;
		const next = previous === 'restricted' ? 'standard' : 'restricted';

		// Optimistic: flip now, put it back if the save fails.
		externalAgentAccess = next;
		restrictedSaving = true;
		let responseStatus: number | null = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${session.projectId}/external-agent-access`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({ external_agent_access: next })
				}
			);
			responseStatus = response.status;
			const payload = await response.json().catch(() => null);
			if (!isCurrentProjectSession(session)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Couldn’t save this setting.');
			}
			toastService.success(
				next === 'restricted'
					? 'Only agent connections you pick can reach this project now'
					: 'Your agent connections set to all projects reach this one again'
			);
		} catch (err) {
			if (!isCurrentProjectSession(session)) return;
			externalAgentAccess = previous;
			console.error('[ProjectCollaborationModal] Failed to update restricted access:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${session.projectId}/external-agent-access`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'project',
				operation: 'project_external_agent_access_update',
				metadata: { source: 'project_collaboration_modal', status: responseStatus }
			});
			toastService.error(err instanceof Error ? err.message : 'Couldn’t save this setting.');
		} finally {
			if (isCurrentProjectSession(session)) restrictedSaving = false;
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

{#snippet toggleSwitch(
	checked: boolean,
	labelledBy: string,
	describedBy: string,
	disabled: boolean,
	onToggle: () => void
)}
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-labelledby={labelledBy}
		aria-describedby={describedBy}
		{disabled}
		onclick={onToggle}
		class="relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors motion-reduce:transition-none before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 {checked
			? 'border-accent bg-accent'
			: 'border-border-strong bg-muted'}"
	>
		<span
			class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-ink transition-transform motion-reduce:transition-none {checked
				? 'translate-x-5'
				: 'translate-x-0'}"
		></span>
	</button>
{/snippet}

{#snippet avatar(member: MemberRow)}
	<span
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-foreground"
		aria-hidden="true">{getMemberInitials(member)}</span
	>
{/snippet}

<Modal
	{isOpen}
	onClose={handleClose}
	title={canManageMembers
		? `Share ${projectName || 'project'}`
		: `People on ${projectName || 'this project'}`}
	size="md"
>
	<div class="divide-y divide-border">
		{#if canManageMembers}
			<!-- Add people: email or @handle -->
			<section aria-labelledby="invite-person-heading" class="space-y-2 p-3 sm:p-4">
				<h3 id="invite-person-heading" class="text-sm font-semibold text-foreground">
					Add people
				</h3>
				<form class="space-y-2" onsubmit={handleInvite}>
					<div class="flex flex-col gap-2 sm:flex-row sm:items-start">
						<div class="min-w-0 flex-1">
							<label for="invite-email" class="sr-only">Email or @handle</label>
							<TextInput
								id="invite-email"
								bind:value={invitee}
								type="text"
								inputmode="email"
								autocomplete="off"
								placeholder="Email or @handle"
								icon={AtSign}
								disabled={!canInvite}
							/>
						</div>
						<div class="grid grid-cols-2 gap-2 sm:flex">
							<Select
								id="invite-role"
								bind:value={role}
								size="md"
								placeholder=""
								aria-label="They join as"
								disabled={!canInvite}
								onchange={(value) =>
									(inviteAgentAccess = fitAgentAccessToRole(
										String(value),
										inviteAgentAccess
									))}
							>
								<option value="editor">Editor</option>
								<option value="viewer">Viewer</option>
							</Select>
							<Select
								id="invite-agent-access"
								bind:value={inviteAgentAccess}
								size="md"
								placeholder=""
								aria-label="Their agents"
								aria-describedby="invite-agent-access-hint"
								disabled={!canInvite}
							>
								<option value="read">Agents: Read</option>
								<option value="write" disabled={role !== 'editor'}
									>Agents: Write{role !== 'editor'
										? ' (Editors only)'
										: ''}</option
								>
								<option value="off">Agents: Off</option>
							</Select>
						</div>
						<Button
							type="submit"
							variant="primary"
							size="md"
							icon={Mail}
							loading={isSending}
							disabled={isSending || !canInvite}
						>
							{isSending ? 'Sending…' : 'Invite'}
						</Button>
					</div>
					<p id="invite-agent-access-hint" class="text-xs text-muted-foreground">
						{agentAccessDescription(inviteAgentAccess)}
					</p>
					{#if error}
						<p class="text-xs text-destructive" role="alert">{error}</p>
					{/if}
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
		{:else if ownerMember}
			<p class="px-3 py-2.5 text-sm text-muted-foreground sm:px-4">
				Only {ownerName} can add people to this project.
			</p>
		{/if}

		<!-- People with access: you first, then everyone else -->
		<section aria-labelledby="members-heading" class="p-3 sm:p-4">
			<p id="members-heading" class="micro-label text-muted-foreground">
				{canManageMembers ? 'People with access' : 'People'}{members.length
					? ` · ${members.length}`
					: ''}
			</p>

			{#if isLoading && members.length === 0}
				<p class="mt-2 text-xs text-muted-foreground">Loading people…</p>
			{:else if members.length === 0}
				<p class="mt-2 text-xs text-muted-foreground">No one here yet.</p>
			{:else}
				<ul class="mt-1 divide-y divide-border">
					{#if currentMember}
						{@const selfDetail = getMemberDetail(currentMember, true)}
						<li class="py-2.5">
							<button
								type="button"
								class="flex w-full items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-expanded={selfExpanded}
								aria-controls="self-panel"
								onclick={() => (selfExpanded = !selfExpanded)}
							>
								{@render avatar(currentMember)}
								<span class="min-w-0 flex-1">
									<span
										class="block truncate text-sm font-medium text-foreground"
									>
										{getMemberLabel(currentMember)}
										<span class="font-normal text-muted-foreground">(you)</span>
									</span>
									<span class="block truncate text-xs text-muted-foreground">
										{selfDetail || 'Your role here and notifications'}
									</span>
								</span>
								<span class="shrink-0 text-xs font-medium text-muted-foreground">
									{formatRole(currentMember.role_key)}
								</span>
								<ChevronDown
									class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {selfExpanded
										? 'rotate-180'
										: ''}"
								/>
							</button>

							{#if selfExpanded}
								<div
									id="self-panel"
									class="mt-2.5 space-y-3 rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner sm:ml-10"
								>
									{#if ownAgentAccess}
										<div class="flex items-start gap-2.5">
											<Bot
												class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
											/>
											<div class="min-w-0 space-y-0.5">
												<p class="text-sm font-medium text-foreground">
													Your agents here: {agentAccessLabel(
														ownAgentAccess
													)}
												</p>
												<p class="text-xs text-muted-foreground">
													{ownerName} set this{currentMember &&
													liftedByEditorsSetting(currentMember)
														? ' with the editors’ setting'
														: ''}. {agentAccessDescription(
														ownAgentAccess
													)}
												</p>
												<p class="text-xs text-muted-foreground">
													To let one of your agent connections in, turn on
													“Projects shared with me” for it in
													<a
														href="/profile?tab=people#agents"
														class="font-medium text-accent underline-offset-2 hover:underline"
														>People &amp; agents</a
													>.
												</p>
											</div>
										</div>
									{/if}

									<!-- Your role here -->
									<div class="space-y-2">
										<div class="flex items-center justify-between gap-2">
											<p class="text-sm font-medium text-foreground">
												Your role here
											</p>
											<Button
												variant="ghost"
												size="sm"
												disabled={roleProfileActionType !== null}
												onclick={isEditingRoleProfile
													? handleCancelRoleProfileEdit
													: handleStartRoleProfileEdit}
											>
												{isEditingRoleProfile ? 'Cancel' : 'Edit'}
											</Button>
										</div>

										{#if isEditingRoleProfile}
											<form
												class="space-y-2"
												onsubmit={handleSaveRoleProfile}
											>
												<div class="space-y-1">
													<label
														for="role-title-input"
														class="text-xs font-medium text-muted-foreground"
														>Role title</label
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
														>What you do here</label
													>
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
													<p class="text-xs text-destructive">
														{roleProfileError}
													</p>
												{/if}
												<Button
													type="submit"
													variant="secondary"
													size="sm"
													disabled={roleProfileActionType !== null}
												>
													{roleProfileActionType === 'save'
														? 'Saving…'
														: 'Save'}
												</Button>
											</form>
										{:else}
											{#if currentMember.role_name || currentMember.role_description}
												<div class="space-y-0.5">
													<p class="text-sm text-foreground">
														{currentMember.role_name ||
															formatRole(currentMember.role_key)}
													</p>
													{#if currentMember.role_description}
														<p class="text-xs text-muted-foreground">
															{currentMember.role_description}
														</p>
													{/if}
												</div>
											{/if}
											<form
												class="space-y-2"
												onsubmit={handleGenerateRoleProfile}
											>
												<label for="role-context-input" class="sr-only"
													>Describe your role in a sentence or two</label
												>
												<Textarea
													id="role-context-input"
													bind:value={roleContextInput}
													rows={2}
													autoResize
													maxRows={6}
													placeholder="In a sentence or two: what you do on this project. BuildOS writes the title and summary."
												/>
												{#if roleProfileError}
													<p class="text-xs text-destructive">
														{roleProfileError}
													</p>
												{/if}
												<div class="flex flex-wrap items-center gap-2">
													<Button
														type="submit"
														variant="secondary"
														size="sm"
														disabled={roleProfileActionType !== null ||
															roleContextInput.trim().length === 0}
													>
														{roleProfileActionType === 'generate'
															? 'Writing…'
															: 'Write it for me'}
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={roleProfileActionType !== null ||
															roleContextInput.trim().length === 0}
														onclick={handleGenerateRoleProfileAlternatives}
													>
														{roleProfileActionType === 'alternatives'
															? 'Writing…'
															: 'Show options'}
													</Button>
												</div>
											</form>
											{#if roleProfileAlternatives.length > 0}
												<ul class="space-y-2">
													{#each roleProfileAlternatives as alternative, index (`${alternative.role_name}-${index}`)}
														<li
															class="flex items-start justify-between gap-2 rounded border border-border bg-background p-2 shadow-ink"
														>
															<div class="min-w-0">
																<p
																	class="truncate text-sm text-foreground"
																>
																	{alternative.role_name}
																</p>
																<p
																	class="text-xs text-muted-foreground"
																>
																	{alternative.role_description}
																</p>
															</div>
															<Button
																variant="ghost"
																size="sm"
																disabled={roleProfileActionType !==
																	null}
																onclick={() =>
																	handleUseRoleProfileAlternative(
																		alternative
																	)}
															>
																Use this
															</Button>
														</li>
													{/each}
												</ul>
											{/if}
										{/if}
									</div>

									<!-- Notifications -->
									{#if notificationSettings}
										<div class="flex items-start justify-between gap-4">
											<div class="min-w-0 space-y-0.5">
												<p
													id="member-notify-label"
													class="text-sm font-medium text-foreground"
												>
													Notify me when people change things here
												</p>
												<p
													id="member-notify-hint"
													class="text-xs text-muted-foreground"
												>
													In-app updates. Push follows your global push
													setting.
												</p>
											</div>
											{@render toggleSwitch(
												notificationSettings.member_enabled,
												'member-notify-label',
												'member-notify-hint',
												settingsActionType !== null,
												() =>
													handleMemberNotificationsToggle(
														!notificationSettings?.member_enabled
													)
											)}
										</div>
										{#if notificationSettings.can_manage_default}
											<div class="flex items-start justify-between gap-4">
												<div class="min-w-0 space-y-0.5">
													<p
														id="default-notify-label"
														class="text-sm font-medium text-foreground"
													>
														New people get notifications by default
													</p>
													<p
														id="default-notify-hint"
														class="text-xs text-muted-foreground"
													>
														{notificationSettings.is_shared_project
															? 'Each person can still turn their own off.'
															: 'Turns on by itself when a second person joins.'}
													</p>
												</div>
												{@render toggleSwitch(
													notificationSettings.project_default_enabled,
													'default-notify-label',
													'default-notify-hint',
													settingsActionType !== null,
													() =>
														handleProjectDefaultNotificationsToggle(
															!notificationSettings?.project_default_enabled
														)
												)}
											</div>
										{/if}
									{:else if isLoading}
										<p class="text-xs text-muted-foreground">
											Loading notification settings…
										</p>
									{:else}
										<p class="text-xs text-muted-foreground">
											Notification settings are unavailable right now.
										</p>
									{/if}
									{#if settingsError}
										<p class="text-xs text-destructive">{settingsError}</p>
									{/if}

									<!-- Leave -->
									{#if canLeaveProject}
										{#if confirmLeave}
											<div
												class="rounded-md border border-border bg-background p-3 space-y-2"
												role="group"
												aria-label="Leave {projectName || 'this project'}"
											>
												<p class="text-sm text-foreground">
													Leave {projectName || 'this project'}? To come
													back,
													{ownerName} has to say yes.
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
														disabled={isLeavingProject ||
															memberActionsBusy}
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
										{/if}
									{:else if isProjectOwner && members.length > 1}
										<p class="text-xs text-muted-foreground">
											Want to leave? Make someone else the owner from their
											row, then choose to leave.
										</p>
									{/if}
								</div>
							{/if}
						</li>
					{/if}

					{#each otherMembers as member (member.id)}
						{@const memberLabel = getMemberLabel(member)}
						{@const memberDetail = getMemberDetail(member, false)}
						{@const manageable = canManageMembers && member.role_key !== 'owner'}
						<li class="py-2.5">
							<div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
								<div class="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
									{@render avatar(member)}
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-foreground">
											{memberLabel}
										</p>
										{#if memberDetail}
											<p class="truncate text-xs text-muted-foreground">
												{memberDetail}
											</p>
										{/if}
									</div>
								</div>

								{#if manageable}
									<div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
										{#key `${member.id}:${member.role_key}:${roleMenuResetKey}`}
											<Select
												value={member.role_key}
												size="sm"
												class="sm:min-w-[118px]"
												placeholder=""
												aria-label="Role for {memberLabel}"
												disabled={memberActionsBusy}
												onchange={(value) =>
													handleRoleMenu(member, String(value))}
												id="role-menu-{member.id}"
											>
												<option value="editor">Editor</option>
												<option value="viewer">Viewer</option>
												{#if isProjectOwner}
													<option value="make-owner">Make owner…</option>
												{/if}
												<option value="remove">Remove…</option>
											</Select>
										{/key}
										<Select
											value={memberAgentAccess(member)}
											size="sm"
											class="sm:min-w-[132px]"
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
									</div>
								{:else}
									<span
										class="shrink-0 text-xs font-medium text-muted-foreground"
									>
										{formatRole(member.role_key)}
									</span>
								{/if}
							</div>

							{#if manageable}
								<div
									class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 sm:pl-10"
								>
									{#if liftedByEditorsSetting(member)}
										<p
											id="agents-lifted-{member.id}"
											class="text-xs text-muted-foreground"
										>
											Their agents can make changes through the editors’
											setting.
										</p>
									{/if}
									<button
										type="button"
										class="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
										aria-expanded={editingMemberRoleProfileId === member.id}
										disabled={memberActionsBusy}
										onclick={() => toggleMemberRoleEditor(member)}
									>
										{member.role_description
											? 'Edit their role here'
											: 'Describe their role here'}
									</button>
								</div>

								{#if editingMemberRoleProfileId === member.id}
									<form
										class="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner sm:ml-10"
										onsubmit={handleSaveMemberRoleProfile}
									>
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
												>What they do here</label
											>
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
											<p class="text-xs text-destructive">
												{memberRoleProfileError}
											</p>
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
												{memberRoleProfileSaving ? 'Saving…' : 'Save'}
											</Button>
										</div>
									</form>
								{/if}

								{#if confirmRemoveMemberId === member.id}
									<div
										class="mt-2 rounded-md border border-border bg-background p-3 space-y-2 sm:ml-10"
										role="group"
										aria-label="Remove {memberLabel}"
									>
										<p class="text-sm text-foreground">
											Remove {memberLabel} from {projectName ||
												'this project'}?
										</p>
										<p class="text-xs text-muted-foreground">
											They lose access right away. If they open the invite
											link again, you get a request and decide whether they
											come back.
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
												loading={memberActionId === member.id &&
													memberActionType === 'remove'}
												disabled={memberActionsBusy}
												onclick={() => handleMemberRemove(member)}
											>
												Remove
											</Button>
										</div>
									</div>
								{/if}

								{#if handoffTarget?.id === member.id}
									<form
										bind:this={handoffPanel}
										tabindex="-1"
										aria-labelledby="handoff-heading"
										class="mt-2 space-y-2.5 rounded-md border border-border bg-muted/20 p-3 shadow-ink-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-10"
										onsubmit={handleConfirmHandoff}
									>
										<div class="space-y-1">
											<p
												id="handoff-heading"
												class="text-sm font-medium text-foreground"
											>
												Make {memberLabel} the owner of {projectName ||
													'this project'}?
											</p>
											<p class="text-xs text-muted-foreground">
												They get full control, including deleting it.
												{handoffLeave
													? 'You’ll leave the project and lose access.'
													: 'You’ll stay on as an editor.'}
											</p>
										</div>
										<label class="flex cursor-pointer items-start gap-2.5">
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
											<p class="text-xs text-destructive" role="alert">
												{handoffError}
											</p>
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
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if canInvite && invites.length > 0}
			<!-- Invited, no answer -->
			<section aria-labelledby="pending-invites-heading" class="p-3 sm:p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<p id="pending-invites-heading" class="micro-label text-muted-foreground">
						Invited, no answer · {invites.length}
					</p>
					{#if expiredInvites.length > 0}
						<Button
							variant="ghost"
							size="sm"
							loading={clearingExpired}
							disabled={clearingExpired || inviteActionId !== null}
							onclick={handleClearExpiredInvites}
						>
							Clear expired ({expiredInvites.length})
						</Button>
					{/if}
				</div>
				<ul class="mt-1 divide-y divide-border">
					{#each invites as invite (invite.id)}
						{@const inviteLabel = getInviteLabel(invite)}
						{@const knownUrl = inviteUrls[invite.id] ?? null}
						{@const expired = isInviteExpired(invite)}
						<li class="py-2">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<div class="min-w-0 flex-1 basis-48">
									<p class="truncate text-sm text-foreground">{inviteLabel}</p>
									<p class="text-xs text-muted-foreground">
										{formatRole(invite.role_key)} · Agents: {agentAccessLabel(
											invite.agent_access
										)}{#if invite.expires_at}
											·
											<span
												class={expired ? 'font-medium text-foreground' : ''}
												>{expired ? 'Expired' : 'Until'}
												{shortDate(invite.expires_at)}</span
											>{/if}
									</p>
								</div>
								<div class="flex flex-wrap items-center gap-1">
									{#if knownUrl && !expired}
										<Button
											variant="ghost"
											size="sm"
											icon={copiedUrl === knownUrl ? Check : Link2}
											onclick={() => copyInviteUrl(knownUrl)}
										>
											{copiedUrl === knownUrl ? 'Copied' : 'Copy link'}
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										loading={inviteActionId === invite.id &&
											inviteActionType === 'resend'}
										disabled={inviteActionId !== null || clearingExpired}
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
										disabled={inviteActionId !== null || clearingExpired}
										aria-expanded={confirmRevokeInviteId === invite.id}
										onclick={() => (confirmRevokeInviteId = invite.id)}
									>
										Remove
									</Button>
								</div>
							</div>
							{#if confirmRevokeInviteId === invite.id}
								<div
									class="mt-2 rounded-md border border-border bg-background p-3 space-y-2"
									role="group"
									aria-label="Remove the invite for {inviteLabel}"
								>
									<p class="text-sm text-foreground">
										Remove the invite for {inviteLabel}? Its link stops working.
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
											Remove invite
										</Button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if canManageMembers}
			<!-- Agents in this project -->
			<section aria-labelledby="project-agents-heading" class="space-y-3 p-3 sm:p-4">
				<p id="project-agents-heading" class="micro-label text-muted-foreground">
					Agents in this project
				</p>

				{#if members.some((member) => member.role_key !== 'owner')}
					<p class="text-xs text-muted-foreground">
						Each person’s agents dial: Off pauses them. Read lets them read the project.
						Write also lets them add tasks and docs and change only what that person
						created or is assigned to.
					</p>
				{/if}

				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0 space-y-0.5">
						<p
							id="editor-agents-write-label"
							class="text-sm font-medium text-foreground"
						>
							Editors’ agents can make changes
						</p>
						<p id="editor-agents-write-hint" class="text-xs text-muted-foreground">
							{editorAgentsWrite === null
								? agentSettingsLoadFailed
									? 'This setting didn’t load. Close and reopen this window to try again.'
									: 'Loading…'
								: 'Every editor’s agents can write here unless you turned that person’s agents off.'}
						</p>
					</div>
					{#if editorAgentsWrite !== null}
						{@render toggleSwitch(
							editorAgentsWrite,
							'editor-agents-write-label',
							'editor-agents-write-hint',
							agentSettingsSaving,
							handleEditorAgentsWriteToggle
						)}
					{/if}
				</div>

				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0 space-y-0.5">
						<p id="restricted-label" class="text-sm font-medium text-foreground">
							Only agents you pick can reach this project
						</p>
						<p id="restricted-hint" class="text-xs text-muted-foreground">
							{externalAgentAccess === null
								? agentSettingsLoadFailed
									? 'This setting didn’t load. Close and reopen this window to try again.'
									: 'Loading…'
								: 'Off: any of your agent connections set to all projects reaches it. On: only connections you pick.'}
						</p>
					</div>
					{#if externalAgentAccess !== null}
						{@render toggleSwitch(
							externalAgentAccess === 'restricted',
							'restricted-label',
							'restricted-hint',
							restrictedSaving,
							handleRestrictedToggle
						)}
					{/if}
				</div>
			</section>

			<!-- Invite link -->
			<section class="p-3 sm:p-4">
				<ProjectInviteLinkPanel {projectId} {projectName} />
			</section>
		{/if}
	</div>

	{#snippet footer()}
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-3 sm:px-4"
		>
			<a
				href="/profile?tab=people"
				class="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-2 hover:underline"
			>
				<Users class="h-4 w-4" />
				{canManageMembers ? 'Everyone across your projects' : 'Your sharing settings'}
			</a>
			<Button variant="primary" size="sm" onclick={handleClose}>Done</Button>
		</div>
	{/snippet}
</Modal>
