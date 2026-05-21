<!-- apps/web/src/lib/components/ontology/EntityCollaborationAction.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		BellRing,
		Check,
		Eye,
		LoaderCircle,
		Mail,
		Send,
		UserCheck,
		Users
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	type EntityType = 'task' | 'document' | 'goal' | 'plan';
	type ActionMode = 'ping' | 'assign';
	type DeliveryChannel = 'in_app' | 'email';

	type Actor = {
		id: string;
		user_id: string | null;
		name: string | null;
		email: string | null;
	};

	type MemberRow = {
		actor_id: string;
		role_key: string | null;
		actor: Actor | Actor[] | null;
	};

	type AssignmentRow = {
		id: string;
		actor_id: string;
		role_key: string;
		actor: Actor | Actor[] | null;
	};

	type MemberOption = {
		actorId: string;
		userId: string | null;
		name: string | null;
		email: string | null;
		roleKey: string | null;
	};

	interface Props {
		projectId: string;
		entityType: EntityType;
		entityId: string;
		entityTitle: string;
		disabled?: boolean;
	}

	let { projectId, entityType, entityId, entityTitle, disabled = false }: Props = $props();

	let isOpen = $state(false);
	let showPreviewModal = $state(false);
	let actionMode = $state<ActionMode>('ping');
	let channel = $state<DeliveryChannel>('email');
	let selectedActorId = $state('');
	let message = $state('');
	let members = $state<MemberOption[]>([]);
	let currentActorId = $state<string | null>(null);
	let ownerAssignments = $state<AssignmentRow[]>([]);
	let projectName = $state('this project');
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let loadError = $state('');
	let formError = $state('');
	let loadedKey = $state('');

	const requestKey = $derived(`${projectId}:${entityType}:${entityId}`);
	const otherCollaborators = $derived.by(() =>
		members.filter((member) => member.actorId !== currentActorId)
	);
	const selectableMembers = $derived.by(() =>
		actionMode === 'assign' ? members : otherCollaborators
	);
	const currentOwner = $derived.by(() => {
		const assignment = ownerAssignments[0];
		if (!assignment) return null;
		const actor = unwrapActor(assignment.actor);
		return actor
			? getDisplayLabel(actor, assignment.actor_id)
			: assignment.actor_id.slice(0, 8);
	});
	const shouldRender = $derived(
		isLoading || Boolean(loadError) || otherCollaborators.length > 0 || Boolean(currentOwner)
	);
	const selectedMember = $derived.by(() =>
		members.find((member) => member.actorId === selectedActorId)
	);
	const currentMember = $derived.by(() =>
		members.find((member) => member.actorId === currentActorId)
	);
	const selectedMemberHasEmail = $derived(Boolean(selectedMember?.email));
	const selectedMemberLabel = $derived(
		selectedMember
			? getDisplayLabel(
					{ ...selectedMember, id: selectedMember.actorId },
					selectedMember.actorId
				)
			: 'a collaborator'
	);
	const actorLabel = $derived(
		currentMember
			? getDisplayLabel(
					{ ...currentMember, id: currentMember.actorId },
					currentMember.actorId
				)
			: 'A teammate'
	);
	const entityLabel = $derived(getEntityLabel(entityType));
	const emailPreviewSubject = $derived(
		actionMode === 'assign'
			? `${actorLabel} assigned you a ${entityLabel} in BuildOS`
			: `${actorLabel} pinged you about ${entityTitle}`
	);
	const emailPreviewIntro = $derived(
		actionMode === 'assign'
			? `${actorLabel} assigned you as owner of ${getIndefiniteArticle(entityLabel)} ${entityLabel} in ${projectName}.`
			: `${actorLabel} asked you to look at ${getIndefiniteArticle(entityLabel)} ${entityLabel} in ${projectName}.`
	);
	const emailPreviewMessage = $derived(message.trim() || 'No extra message included.');
	const submitDisabled = $derived(
		disabled ||
			isLoading ||
			isSubmitting ||
			!selectedActorId ||
			(actionMode === 'ping' && message.trim().length === 0) ||
			(channel === 'email' && !selectedMemberHasEmail)
	);

	$effect(() => {
		if (!browser || !projectId || !entityId || loadedKey === requestKey) return;
		void loadCollaboration();
	});

	$effect(() => {
		if (
			selectedActorId &&
			selectableMembers.some((member) => member.actorId === selectedActorId)
		) {
			return;
		}
		selectedActorId = selectableMembers[0]?.actorId ?? '';
	});

	function unwrapActor(actor: Actor | Actor[] | null | undefined): Actor | null {
		if (Array.isArray(actor)) return actor[0] ?? null;
		return actor ?? null;
	}

	function getDisplayLabel(value: Pick<Actor, 'name' | 'email' | 'id'>, fallback = 'Teammate') {
		const name = value.name?.trim();
		if (name) return name;
		const email = value.email?.trim();
		if (email) return email.split('@')[0] ?? email;
		return fallback;
	}

	function getEntityLabel(value: EntityType): string {
		if (value === 'task') return 'task';
		if (value === 'document') return 'document';
		if (value === 'goal') return 'goal';
		return 'plan';
	}

	function getIndefiniteArticle(label: string): string {
		return /^[aeiou]/i.test(label) ? 'an' : 'a';
	}

	function normalizeMembers(rawMembers: MemberRow[]): MemberOption[] {
		const seen = new Set<string>();
		const normalized: MemberOption[] = [];
		for (const row of rawMembers) {
			const actor = unwrapActor(row.actor);
			const actorId = row.actor_id || actor?.id;
			if (!actorId || seen.has(actorId)) continue;
			seen.add(actorId);
			normalized.push({
				actorId,
				userId: actor?.user_id ?? null,
				name: actor?.name ?? null,
				email: actor?.email ?? null,
				roleKey: row.role_key ?? null
			});
		}
		return normalized.sort((a, b) =>
			getDisplayLabel({ ...a, id: a.actorId }, a.actorId).localeCompare(
				getDisplayLabel({ ...b, id: b.actorId }, b.actorId)
			)
		);
	}

	async function loadCollaboration() {
		isLoading = true;
		loadError = '';
		formError = '';

		try {
			const params = new URLSearchParams({
				entity_type: entityType,
				entity_id: entityId
			});
			const response = await fetch(
				`/api/onto/projects/${projectId}/entity-collaboration?${params.toString()}`,
				{ credentials: 'same-origin' }
			);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load collaborators');
			}

			members = normalizeMembers((payload?.data?.members ?? []) as MemberRow[]);
			ownerAssignments = (payload?.data?.assignments ?? []) as AssignmentRow[];
			projectName =
				typeof payload?.data?.projectName === 'string' && payload.data.projectName.trim()
					? payload.data.projectName
					: 'this project';
			currentActorId =
				typeof payload?.data?.actorId === 'string' ? payload.data.actorId : null;
			loadedKey = requestKey;
		} catch (error) {
			console.error('[EntityCollaborationAction] Failed to load collaboration data:', error);
			loadError = error instanceof Error ? error.message : 'Failed to load collaborators';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${projectId}/entity-collaboration`,
				method: 'GET',
				projectId,
				entityType,
				entityId,
				operation: 'entity_collaboration_load'
			});
		} finally {
			isLoading = false;
		}
	}

	function openPanel(mode: ActionMode = 'ping') {
		actionMode = mode;
		isOpen = true;
		formError = '';
		if (mode === 'assign' && !message.trim()) {
			message = `Please take ownership of "${entityTitle}".`;
		}
	}

	async function submitAction() {
		if (submitDisabled) return;
		isSubmitting = true;
		formError = '';

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/entity-collaboration`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					entity_type: entityType,
					entity_id: entityId,
					actor_id: selectedActorId,
					action: actionMode,
					channel,
					message: message.trim()
				})
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Collaboration action failed');
			}

			toastService.success(
				actionMode === 'assign'
					? channel === 'email'
						? 'Owner assigned and emailed'
						: 'Owner assigned'
					: channel === 'email'
						? 'Email sent'
						: 'Ping sent'
			);
			message = '';
			isOpen = false;
			showPreviewModal = false;
			loadedKey = '';
			await loadCollaboration();
		} catch (error) {
			console.error('[EntityCollaborationAction] Failed to submit action:', error);
			formError = error instanceof Error ? error.message : 'Collaboration action failed';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${projectId}/entity-collaboration`,
				method: 'POST',
				projectId,
				entityType,
				entityId,
				operation: 'entity_collaboration_submit'
			});
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if shouldRender}
	<section class="px-3 py-3 sm:px-4" aria-label="Collaboration actions">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<Users class="h-4 w-4 text-muted-foreground" />
				<p
					class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
				>
					Collaborate
				</p>
			</div>
			{#if currentOwner}
				<span
					class="max-w-28 truncate text-[11px] font-medium text-foreground"
					title={currentOwner}
				>
					Owner: {currentOwner}
				</span>
			{/if}
		</div>

		{#if isLoading}
			<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
				<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
				<span>Loading collaborators...</span>
			</div>
		{:else if loadError}
			<p class="mt-2 text-xs text-destructive">{loadError}</p>
		{:else}
			<div class="mt-2 grid grid-cols-2 gap-1.5">
				<Button
					type="button"
					variant={isOpen && actionMode === 'ping' ? 'primary' : 'outline'}
					size="sm"
					class="h-8 min-h-8 justify-center px-2 text-xs"
					disabled={disabled || otherCollaborators.length === 0}
					onclick={() => openPanel('ping')}
					title="Ping a collaborator about this {entityType}"
				>
					<BellRing class="h-3.5 w-3.5" />
					<span class="ml-1">Ping</span>
				</Button>
				<Button
					type="button"
					variant={isOpen && actionMode === 'assign' ? 'primary' : 'outline'}
					size="sm"
					class="h-8 min-h-8 justify-center px-2 text-xs"
					disabled={disabled || members.length === 0}
					onclick={() => openPanel('assign')}
					title="Assign an owner for this {entityType}"
				>
					<UserCheck class="h-3.5 w-3.5" />
					<span class="ml-1">Assign</span>
				</Button>
			</div>

			{#if otherCollaborators.length === 0}
				<p class="mt-2 text-xs text-muted-foreground">
					Add collaborators to ping teammates from here.
				</p>
			{/if}

			{#if isOpen}
				<div
					class="mt-3 space-y-2 rounded-md border border-border bg-card p-2 shadow-ink-inner tx tx-frame tx-weak"
				>
					<Select
						bind:value={selectedActorId}
						size="sm"
						disabled={disabled || isSubmitting}
					>
						{#each selectableMembers as member}
							<option value={member.actorId}>
								{getDisplayLabel({ ...member, id: member.actorId }, member.actorId)}
								{member.actorId === currentActorId ? ' (me)' : ''}
							</option>
						{/each}
					</Select>

					<Select bind:value={channel} size="sm" disabled={disabled || isSubmitting}>
						<option value="email">Email</option>
						<option value="in_app">Notification (inside BuildOS)</option>
					</Select>

					{#if channel === 'email' && selectedMember && !selectedMember.email}
						<p class="text-xs text-destructive">
							This collaborator does not have an email address.
						</p>
					{/if}

					<Textarea
						bind:value={message}
						rows={3}
						size="sm"
						disabled={disabled || isSubmitting}
						placeholder={actionMode === 'assign'
							? 'Optional handoff note...'
							: 'Write the message you want to send...'}
					/>

					{#if formError}
						<p class="text-xs text-destructive">{formError}</p>
					{/if}

					<div class="flex flex-wrap items-center justify-between gap-1.5">
						{#if channel === 'email'}
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="h-8 min-h-8 px-2 text-xs"
								disabled={!selectedActorId ||
									!selectedMemberHasEmail ||
									isSubmitting}
								onclick={() => (showPreviewModal = true)}
							>
								<Eye class="h-3.5 w-3.5" />
								<span class="ml-1">Preview</span>
							</Button>
						{:else}
							<span></span>
						{/if}

						<div class="flex items-center justify-end gap-1.5">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="h-8 min-h-8 px-2 text-xs"
								disabled={isSubmitting}
								onclick={() => (isOpen = false)}
							>
								Cancel
							</Button>
							<Button
								type="button"
								variant="primary"
								size="sm"
								class="h-8 min-h-8 px-2 text-xs"
								disabled={submitDisabled}
								onclick={submitAction}
							>
								{#if isSubmitting}
									<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
									<span class="ml-1">Sending...</span>
								{:else if actionMode === 'assign'}
									<Check class="h-3.5 w-3.5" />
									<span class="ml-1"
										>{channel === 'email' ? 'Assign + email' : 'Assign'}</span
									>
								{:else if channel === 'email'}
									<Mail class="h-3.5 w-3.5" />
									<span class="ml-1">Send email</span>
								{:else}
									<Send class="h-3.5 w-3.5" />
									<span class="ml-1">Send ping</span>
								{/if}
							</Button>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</section>
{/if}

<Modal
	bind:isOpen={showPreviewModal}
	onClose={() => (showPreviewModal = false)}
	title="Email preview"
	size="sm"
>
	{#snippet children()}
		<div class="space-y-4 p-4 text-sm">
			<div class="grid gap-3 rounded-md border border-border bg-card p-3 tx tx-frame tx-weak">
				<div>
					<p
						class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
					>
						To
					</p>
					<p class="mt-1 truncate text-foreground" title={selectedMember?.email ?? ''}>
						{selectedMemberLabel}
						{#if selectedMember?.email}
							<span class="text-muted-foreground">&lt;{selectedMember.email}&gt;</span
							>
						{/if}
					</p>
				</div>
				<div>
					<p
						class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
					>
						Subject
					</p>
					<p class="mt-1 text-foreground">{emailPreviewSubject}</p>
				</div>
			</div>

			<div
				class="rounded-md border border-border bg-background p-4 leading-relaxed tx tx-frame"
			>
				<p>{emailPreviewIntro}</p>
				<p class="mt-3 font-semibold text-foreground">{entityTitle}</p>
				<blockquote
					class="mt-3 border-l-2 border-border pl-3 text-muted-foreground whitespace-pre-wrap"
				>
					{emailPreviewMessage}
				</blockquote>
				<p class="mt-4 text-sm font-semibold text-accent">Open in BuildOS</p>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={isSubmitting}
				onclick={() => (showPreviewModal = false)}
			>
				Close
			</Button>
			<Button
				type="button"
				variant="primary"
				size="sm"
				disabled={submitDisabled}
				onclick={submitAction}
			>
				{#if isSubmitting}
					<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
					<span class="ml-1">Sending...</span>
				{:else if actionMode === 'assign'}
					<Check class="h-3.5 w-3.5" />
					<span class="ml-1">Assign + email</span>
				{:else}
					<Mail class="h-3.5 w-3.5" />
					<span class="ml-1">Send email</span>
				{/if}
			</Button>
		</div>
	{/snippet}
</Modal>
