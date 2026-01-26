<!-- apps/web/src/lib/components/project/ProjectShareModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { Mail, Users } from 'lucide-svelte';

	type MemberRole = 'owner' | 'editor' | 'viewer';
	type InviteRole = 'editor' | 'viewer';

	interface MemberRow {
		id: string;
		actor_id: string;
		role_key: MemberRole;
		access: string;
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

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
		projectId: string;
		projectName: string;
	}

	let { isOpen = $bindable(false), onClose, projectId, projectName }: Props = $props();

	let email = $state('');
	let role = $state<InviteRole>('editor');
	let isSending = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let canInvite = $state(true);
	let members = $state<MemberRow[]>([]);
	let invites = $state<InviteRow[]>([]);
	let inviteActionId = $state<string | null>(null);
	let inviteActionType = $state<'resend' | 'revoke' | null>(null);
	let memberActionId = $state<string | null>(null);
	let memberActionType = $state<'role' | 'remove' | null>(null);

	$effect(() => {
		if (!isOpen) {
			email = '';
			role = 'editor';
			error = null;
			isLoading = false;
			canInvite = true;
			members = [];
			invites = [];
			inviteActionId = null;
			inviteActionType = null;
			memberActionId = null;
			memberActionType = null;
			return;
		}
		void loadShareData();
	});

	async function loadShareData() {
		if (!projectId) return;
		members = [];
		invites = [];
		canInvite = true;
		isLoading = true;
		error = null;
		let membersStatus: number | null = null;
		let invitesStatus: number | null = null;

		try {
			const [membersRes, invitesRes] = await Promise.all([
				fetch(`/api/onto/projects/${projectId}/members`, {
					method: 'GET',
					credentials: 'same-origin'
				}),
				fetch(`/api/onto/projects/${projectId}/invites`, {
					method: 'GET',
					credentials: 'same-origin'
				})
			]);

			membersStatus = membersRes.status;
			invitesStatus = invitesRes.status;

			if (membersRes.ok) {
				const payload = await membersRes.json();
				members = payload?.data?.members ?? [];
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
				canInvite = false;
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
					invitesStatus
				}
			});
			error = err instanceof Error ? err.message : 'Failed to load sharing data';
		} finally {
			isLoading = false;
		}
	}

	async function handleInvite(event: Event) {
		event.preventDefault();

		if (!canInvite) {
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
		if (!canInvite || inviteActionId) {
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
		if (!canInvite || inviteActionId) {
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
		if (!canInvite || memberActionId) {
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
		if (!canInvite || memberActionId) {
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
						disabled={!canInvite}
					/>
				</div>

				<div class="space-y-1">
					<label for="invite-role" class="text-xs font-medium text-muted-foreground"
						>Role</label
					>
					<Select id="invite-role" bind:value={role} size="md" disabled={!canInvite}>
						<option value="editor">Editor (can edit)</option>
						<option value="viewer">Viewer (read-only)</option>
					</Select>
				</div>

				{#if !canInvite}
					<p class="text-xs text-muted-foreground">
						You need admin access to invite collaborators.
					</p>
				{:else if error}
					<p class="text-xs text-destructive">{error}</p>
				{/if}

				<Button
					type="submit"
					variant="primary"
					size="sm"
					disabled={isSending || !canInvite}
				>
					{isSending ? 'Sending...' : 'Send Invite'}
				</Button>
			</form>
		</div>

		<!-- Members Section -->
		<div class="border-t border-border pt-3 space-y-2">
			<div class="flex items-center gap-2 text-foreground">
				<Users class="h-4 w-4 text-muted-foreground" />
				<h3 class="text-sm font-semibold">Members</h3>
			</div>

			{#if !canInvite}
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
							</div>
							<div class="flex items-center gap-1.5 shrink-0">
								{#if member.role_key === 'owner' || !canInvite}
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
								{#if canInvite}
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
