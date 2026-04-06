<!-- apps/web/src/lib/components/ontology/TaskAssigneeSelector.svelte -->
<script lang="ts">
	import { Search, X } from 'lucide-svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	const DEFAULT_MAX_ASSIGNEES = 10;

	type MemberRow = {
		actor_id: string;
		role_key: string | null;
		actor: {
			id: string;
			user_id: string | null;
			name: string | null;
			email: string | null;
		} | null;
	};

	type MemberOption = {
		actorId: string;
		userId: string | null;
		name: string | null;
		email: string | null;
		roleKey: string | null;
	};

	type FallbackAssignee = {
		actor_id: string;
		name?: string | null;
		email?: string | null;
	};

	type SelectedSummary = {
		actorId: string;
		label: string;
		email: string | null;
	};

	interface Props {
		projectId: string;
		selectedActorIds?: string[];
		disabled?: boolean;
		maxAssignees?: number;
		fallbackAssignees?: FallbackAssignee[];
	}

	let {
		projectId,
		selectedActorIds = $bindable([]),
		disabled = false,
		maxAssignees = DEFAULT_MAX_ASSIGNEES,
		fallbackAssignees = []
	}: Props = $props();

	let members = $state<MemberOption[]>([]);
	let currentActorId = $state<string | null>(null);
	let searchQuery = $state('');
	let isLoading = $state(false);
	let loadError = $state('');
	let selectionError = $state('');
	let loadedProjectId = $state<string | null>(null);

	function getDisplayLabel(
		value: { name?: string | null; email?: string | null },
		fallback: string
	) {
		const name = value.name?.trim();
		if (name) return name;

		const email = value.email?.trim().toLowerCase();
		if (email) {
			return email.split('@')[0] ?? fallback;
		}

		return fallback;
	}

	function dedupeOptionsByActorId(options: MemberOption[]): MemberOption[] {
		const seen = new Set<string>();
		const deduped: MemberOption[] = [];
		for (const option of options) {
			if (seen.has(option.actorId)) continue;
			seen.add(option.actorId);
			deduped.push(option);
		}
		return deduped;
	}

	function sortOptionsByLabel(options: MemberOption[]): MemberOption[] {
		return [...options].sort((a, b) => {
			const aLabel = getDisplayLabel(a, a.actorId).toLowerCase();
			const bLabel = getDisplayLabel(b, b.actorId).toLowerCase();
			return aLabel.localeCompare(bLabel);
		});
	}

	const optionsByActorId = $derived.by(() => {
		const map = new Map<string, MemberOption>();
		for (const option of members) {
			map.set(option.actorId, option);
		}
		return map;
	});

	const fallbackByActorId = $derived.by(() => {
		const map = new Map<string, FallbackAssignee>();
		for (const assignee of fallbackAssignees) {
			map.set(assignee.actor_id, assignee);
		}
		return map;
	});

	const filteredMembers = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return members;
		return members.filter((member) => {
			const label = getDisplayLabel(member, member.actorId).toLowerCase();
			const email = member.email?.toLowerCase() ?? '';
			return label.includes(query) || email.includes(query);
		});
	});

	const selectedSummaries = $derived.by((): SelectedSummary[] => {
		return selectedActorIds.map((actorId) => {
			const option = optionsByActorId.get(actorId);
			if (option) {
				return {
					actorId,
					label: getDisplayLabel(option, actorId),
					email: option.email
				};
			}

			const fallback = fallbackByActorId.get(actorId);
			if (fallback) {
				return {
					actorId,
					label: getDisplayLabel(fallback, actorId.slice(0, 8)),
					email: fallback.email ?? null
				};
			}

			return {
				actorId,
				label: actorId.slice(0, 8),
				email: null
			};
		});
	});

	const canAssignToMe = $derived(
		Boolean(currentActorId) && !selectedActorIds.includes(currentActorId ?? '')
	);

	$effect(() => {
		if (!projectId || loadedProjectId === projectId) return;
		void loadMembers(projectId);
	});

	async function loadMembers(targetProjectId: string) {
		isLoading = true;
		loadError = '';
		selectionError = '';

		try {
			const response = await fetch(`/api/onto/projects/${targetProjectId}/members`, {
				method: 'GET',
				credentials: 'same-origin'
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to load project members');
			}

			const rawMembers = (payload?.data?.members ?? []) as MemberRow[];
			const normalized = rawMembers
				.map((row) => ({
					actorId: row.actor_id,
					userId: row.actor?.user_id ?? null,
					name: row.actor?.name ?? null,
					email: row.actor?.email ?? null,
					roleKey: row.role_key ?? null
				}))
				.filter((row) => typeof row.actorId === 'string' && row.actorId.length > 0);

			members = sortOptionsByLabel(dedupeOptionsByActorId(normalized));
			currentActorId =
				typeof payload?.data?.actorId === 'string' ? payload.data.actorId : null;
			loadedProjectId = targetProjectId;
		} catch (error) {
			console.error('[TaskAssigneeSelector] Failed to load members:', error);
			loadError = error instanceof Error ? error.message : 'Failed to load project members';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/projects/${targetProjectId}/members`,
				method: 'GET',
				projectId: targetProjectId,
				entityType: 'project_member',
				operation: 'task_assignment_members_load'
			});
		} finally {
			isLoading = false;
		}
	}

	function isSelected(actorId: string): boolean {
		return selectedActorIds.includes(actorId);
	}

	function toggleAssignee(actorId: string) {
		if (disabled) return;
		selectionError = '';

		if (isSelected(actorId)) {
			selectedActorIds = selectedActorIds.filter((id) => id !== actorId);
			return;
		}

		if (selectedActorIds.length >= maxAssignees) {
			selectionError = `You can assign up to ${maxAssignees} people.`;
			return;
		}

		selectedActorIds = [...selectedActorIds, actorId];
	}

	function assignToMe() {
		if (!currentActorId || disabled) return;
		toggleAssignee(currentActorId);
	}

	function clearSelection() {
		if (disabled) return;
		selectedActorIds = [];
		selectionError = '';
	}

	function removeSelected(actorId: string) {
		if (disabled) return;
		selectedActorIds = selectedActorIds.filter((id) => id !== actorId);
	}
</script>

<div class="space-y-1.5">
	{#if selectedSummaries.length > 0}
		<div class="flex flex-wrap items-center gap-1">
			{#each selectedSummaries as selected}
				<button
					type="button"
					onclick={() => removeSelected(selected.actorId)}
					{disabled}
					class="inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-0.5 text-xs text-foreground hover:border-accent/40 pressable disabled:opacity-60"
					title="Remove {selected.label}"
				>
					@{selected.label}
					<X class="w-2.5 h-2.5" />
				</button>
			{/each}
			<button
				type="button"
				class="text-[11px] text-muted-foreground hover:text-foreground px-1 disabled:opacity-50"
				{disabled}
				onclick={clearSelection}
			>
				Clear
			</button>
		</div>
	{/if}

	<div
		class="rounded-lg border border-border bg-card shadow-ink-inner overflow-hidden tx tx-frame tx-weak"
	>
		<div class="flex items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
			{#if members.length >= 5}
				<Search class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
				<input
					type="search"
					class="flex-1 min-w-0 text-xs bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
					placeholder="Search members..."
					bind:value={searchQuery}
					disabled={disabled || isLoading}
				/>
			{:else}
				<span class="flex-1 text-xs text-muted-foreground">
					{selectedActorIds.length} of {members.length} selected
				</span>
			{/if}
			{#if canAssignToMe}
				<button
					type="button"
					class="text-[11px] font-medium text-accent hover:underline shrink-0 disabled:opacity-50"
					{disabled}
					onclick={assignToMe}
				>
					+ Me
				</button>
			{/if}
		</div>

		{#if isLoading}
			<p class="px-2 py-2 text-xs text-muted-foreground">Loading...</p>
		{:else if loadError}
			<p class="px-2 py-2 text-xs text-destructive">{loadError}</p>
		{:else if filteredMembers.length === 0}
			<p class="px-2 py-2 text-xs text-muted-foreground">
				{members.length === 0 ? 'No project members.' : 'No match.'}
			</p>
		{:else}
			<div class="max-h-32 overflow-y-auto divide-y divide-border/40">
				{#each filteredMembers as member}
					{@const checked = isSelected(member.actorId)}
					<button
						type="button"
						class="w-full px-2 py-1.5 text-left flex items-center gap-2 hover:bg-muted/40 transition-colors disabled:opacity-60"
						{disabled}
						onclick={() => toggleAssignee(member.actorId)}
					>
						<span
							class="h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center text-[9px] font-bold {checked
								? 'bg-accent border-accent text-accent-foreground'
								: 'border-border text-transparent'}"
						>
							✓
						</span>
						<span class="text-sm text-foreground truncate"
							>{getDisplayLabel(member, member.actorId)}</span
						>
						{#if member.email}
							<span class="text-[11px] text-muted-foreground truncate ml-auto"
								>{member.email}</span
							>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if selectionError}
		<p class="text-xs text-destructive">{selectionError}</p>
	{/if}
</div>
