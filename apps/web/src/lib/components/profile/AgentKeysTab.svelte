<!-- apps/web/src/lib/components/profile/AgentKeysTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { CircleCheck, Copy, Key, Plus, RefreshCw, Trash2, ExternalLink } from 'lucide-svelte';
	import type {
		BuildosAgentAllowedOp,
		BuildosAgentAvailableProject,
		BuildosAgentCallerListResponse,
		BuildosAgentCallerProvisionResponse,
		BuildosAgentCallerSummary,
		BuildosAgentIdentitySummary,
		BuildosAgentScopeMode
	} from '@buildos/shared-types';
	import { BUILDOS_AGENT_READ_OPS, BUILDOS_AGENT_WRITE_OPS } from '@buildos/shared-types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	type ProviderMode = 'openclaw' | 'custom';
	type WritePermissionOption = {
		op: BuildosAgentAllowedOp;
		label: string;
		description: string;
	};

	const WRITE_PERMISSION_OPTIONS: WritePermissionOption[] = [
		{
			op: 'onto.task.create',
			label: 'Create tasks',
			description: 'Allow the agent to add new tasks in permitted projects.'
		},
		{
			op: 'onto.task.update',
			label: 'Update tasks',
			description: 'Allow the agent to change task fields like title, status, and due date.'
		}
	];

	let { onsuccess, onerror }: Props = $props();

	let loading = $state(false);
	let saving = $state(false);
	let copiedId = $state<string | null>(null);
	let buildosAgent = $state<BuildosAgentIdentitySummary | null>(null);
	let callers = $state<BuildosAgentCallerSummary[]>([]);
	let availableProjects = $state<BuildosAgentAvailableProject[]>([]);
	let latestProvisioned = $state<BuildosAgentCallerProvisionResponse | null>(null);
	let pendingRevokeCaller = $state<BuildosAgentCallerSummary | null>(null);
	let revokingCallerId = $state<string | null>(null);
	let editingCaller = $state<BuildosAgentCallerSummary | null>(null);

	// Modal state
	let showGenerateModal = $state(false);
	let showKeyCreatedModal = $state(false);

	// Form state
	let providerMode = $state<ProviderMode>('openclaw');
	let customProvider = $state('');
	let installationName = $state('');
	let selectedProjectIds = $state<string[]>([]);
	let scopeMode = $state<BuildosAgentScopeMode>('read_only');
	let selectedWriteOps = $state<BuildosAgentAllowedOp[]>([]);

	let allProjectsSelected = $derived(
		availableProjects.length > 0 && selectedProjectIds.length === availableProjects.length
	);

	onMount(() => {
		void loadCallers();
	});

	function getErrorMessage(payload: unknown): string {
		if (payload && typeof payload === 'object') {
			const candidate = payload as {
				error?: string | { message?: string };
				message?: string;
			};

			if (typeof candidate.error === 'string') {
				return candidate.error;
			}

			if (candidate.error && typeof candidate.error === 'object') {
				const nestedMessage = candidate.error.message;
				if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
					return nestedMessage;
				}
			}

			if (typeof candidate.message === 'string' && candidate.message.trim()) {
				return candidate.message;
			}
		}

		return 'Request failed';
	}

	async function parseResponse<T>(response: Response): Promise<T> {
		const payload = await response.json().catch(() => null);

		if (!response.ok) {
			throw new Error(getErrorMessage(payload));
		}

		return payload as T;
	}

	function normalizeProvider(value: string): string {
		return value.trim().toLowerCase();
	}

	function isValidProvider(provider: string): boolean {
		return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(provider);
	}

	function currentProvider(): string {
		return providerMode === 'custom' ? normalizeProvider(customProvider) : 'openclaw';
	}

	function requireValidProvider(provider: string): string {
		if (!isValidProvider(provider)) {
			throw new Error(
				'Provider key must use lowercase letters, numbers, hyphens, or underscores'
			);
		}

		return provider;
	}

	function slugify(value: string): string {
		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48);
	}

	function buildCallerKey(provider: string, name: string): string {
		const slug = slugify(name);
		if (!slug) {
			throw new Error('Installation name is required');
		}

		if (provider === 'openclaw') {
			return `openclaw:workspace:${slug}`;
		}

		return `${provider}:installation:${slug}`;
	}

	function displayProvider(provider: string): string {
		if (provider === 'openclaw') return 'OpenClaw';
		return provider
			.split(/[-_:]/g)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function installationDisplayName(caller: BuildosAgentCallerSummary): string {
		const metadataName = caller.metadata?.installation_name;
		if (typeof metadataName === 'string' && metadataName.trim()) {
			return metadataName.trim();
		}

		return caller.caller_key.split(':').at(-1)?.replace(/-/g, ' ') || caller.caller_key;
	}

	function scopeLabel(caller: BuildosAgentCallerSummary): string {
		if (!caller.allowed_project_ids || caller.allowed_project_ids.length === 0) {
			return 'All projects';
		}

		if (caller.allowed_project_ids.length === 1) {
			const project = availableProjects.find(
				(entry) => entry.id === caller.allowed_project_ids?.[0]
			);
			return project?.name || '1 project';
		}

		return `${caller.allowed_project_ids.length} projects`;
	}

	function accessModeLabel(caller: BuildosAgentCallerSummary): string {
		return caller.scope_mode === 'read_write' ? 'Read & write' : 'Read only';
	}

	function selectedAllowedOps(): BuildosAgentAllowedOp[] | undefined {
		if (scopeMode === 'read_only') {
			return undefined;
		}

		return [...BUILDOS_AGENT_READ_OPS, ...selectedWriteOps];
	}

	function enabledWriteOps(caller: BuildosAgentCallerSummary): BuildosAgentAllowedOp[] {
		return (caller.allowed_ops ?? []).filter((op) =>
			(BUILDOS_AGENT_WRITE_OPS as readonly string[]).includes(op)
		) as BuildosAgentAllowedOp[];
	}

	function writePermissionLabels(caller: BuildosAgentCallerSummary): string[] {
		return enabledWriteOps(caller).map(
			(op) => WRITE_PERMISSION_OPTIONS.find((option) => option.op === op)?.label ?? op
		);
	}

	function toggleWriteOp(op: BuildosAgentAllowedOp) {
		if (selectedWriteOps.includes(op)) {
			selectedWriteOps = selectedWriteOps.filter((entry) => entry !== op);
			return;
		}

		selectedWriteOps = [...selectedWriteOps, op];
	}

	function toggleProject(projectId: string) {
		if (selectedProjectIds.includes(projectId)) {
			selectedProjectIds = selectedProjectIds.filter((id) => id !== projectId);
			return;
		}

		selectedProjectIds = [...selectedProjectIds, projectId];
	}

	function toggleAllProjects() {
		if (allProjectsSelected) {
			selectedProjectIds = [];
		} else {
			selectedProjectIds = availableProjects.map((p) => p.id);
		}
	}

	function clearForm() {
		editingCaller = null;
		installationName = '';
		selectedProjectIds = [];
		providerMode = 'openclaw';
		customProvider = '';
		scopeMode = 'read_only';
		selectedWriteOps = [];
	}

	function openGenerateModal() {
		clearForm();
		showGenerateModal = true;
	}

	function openEditModal(caller: BuildosAgentCallerSummary) {
		editingCaller = caller;
		providerMode = caller.provider === 'openclaw' ? 'openclaw' : 'custom';
		customProvider = caller.provider === 'openclaw' ? '' : caller.provider;
		installationName = installationDisplayName(caller);
		selectedProjectIds = [...(caller.allowed_project_ids ?? [])];
		scopeMode = caller.scope_mode;
		selectedWriteOps = enabledWriteOps(caller);
		showGenerateModal = true;
	}

	async function loadCallers() {
		loading = true;

		try {
			const response = await fetch('/api/agent-call/callers');
			const payload = await parseResponse<BuildosAgentCallerListResponse>(response);
			buildosAgent = payload.buildos_agent;
			callers = payload.callers;
			availableProjects = payload.available_projects ?? [];
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load agent keys';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			loading = false;
		}
	}

	async function copyToClipboard(id: string, text: string, successMessage: string) {
		if (!browser) return;

		try {
			await navigator.clipboard.writeText(text);
			copiedId = id;
			toastService.success(successMessage);
			setTimeout(() => {
				if (copiedId === id) {
					copiedId = null;
				}
			}, 2000);
		} catch {
			toastService.error('Failed to copy to clipboard');
		}
	}

	function openClawEnvSnippet(provisioned: BuildosAgentCallerProvisionResponse): string {
		const origin = browser ? window.location.origin : $page.url.origin;

		return [
			`BUILDOS_BASE_URL=${origin}`,
			`BUILDOS_AGENT_TOKEN=${provisioned.credentials.bearer_token}`,
			`BUILDOS_CALLEE_HANDLE=${provisioned.buildos_agent.handle}`,
			`BUILDOS_CALLER_KEY=${provisioned.caller.caller_key}`
		].join('\n');
	}

	function openClawBootstrapPrompt(
		provisioned: BuildosAgentCallerProvisionResponse
	): string | null {
		return provisioned.bootstrap?.paste_prompt ?? null;
	}

	function openClawBootstrapUrl(provisioned: BuildosAgentCallerProvisionResponse): string | null {
		return provisioned.bootstrap?.instructions_url ?? null;
	}

	async function provisionCaller() {
		if (saving) return;

		let provider: string;
		let callerKey: string;
		let metadata: Record<string, unknown>;
		let allowedProjectIds: string[] | undefined;
		let allowedOps: BuildosAgentAllowedOp[] | undefined;
		const existingCaller = editingCaller;

		try {
			if (existingCaller) {
				provider = existingCaller.provider;
				callerKey = existingCaller.caller_key;
				metadata = {
					...(existingCaller.metadata ?? {}),
					installation_name:
						installationName.trim() || installationDisplayName(existingCaller)
				};
				allowedProjectIds = selectedProjectIds.length > 0 ? selectedProjectIds : undefined;
			} else {
				provider = requireValidProvider(currentProvider());
				if (!provider) {
					throw new Error('Provider is required');
				}
				if (!installationName.trim()) {
					throw new Error('Installation name is required');
				}
				callerKey = buildCallerKey(provider, installationName);
				metadata = {
					installation_name: installationName.trim()
				};
				allowedProjectIds = selectedProjectIds.length > 0 ? selectedProjectIds : undefined;
			}

			if (scopeMode === 'read_write' && selectedWriteOps.length === 0) {
				throw new Error(
					'Choose at least one write permission or switch the key to read only'
				);
			}

			allowedOps = selectedAllowedOps();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Invalid agent configuration';
			toastService.error(message);
			onerror?.({ message });
			return;
		}

		saving = true;

		try {
			const response = await fetch('/api/agent-call/callers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					provider,
					caller_key: callerKey,
					scope_mode: scopeMode,
					allowed_ops: allowedOps,
					allowed_project_ids: allowedProjectIds,
					metadata
				})
			});

			const payload = await parseResponse<BuildosAgentCallerProvisionResponse>(response);
			latestProvisioned = payload;
			await loadCallers();

			const message = existingCaller
				? `Updated permissions and rotated the BuildOS key for ${installationDisplayName(existingCaller)}.`
				: 'Generated a new BuildOS agent key.';
			toastService.success(message);
			onsuccess?.({ message });
			showGenerateModal = false;
			showKeyCreatedModal = true;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to provision agent key';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			saving = false;
		}
	}

	async function revokeCaller() {
		if (!pendingRevokeCaller || revokingCallerId) return;

		revokingCallerId = pendingRevokeCaller.id;

		try {
			const response = await fetch('/api/agent-call/callers', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					caller_id: pendingRevokeCaller.id
				})
			});

			await parseResponse(response);
			const message = `Revoked ${installationDisplayName(pendingRevokeCaller)}.`;
			toastService.success(message);
			onsuccess?.({ message });
			await loadCallers();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to revoke agent key';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			revokingCallerId = null;
			pendingRevokeCaller = null;
		}
	}

	function statusVariant(status: string): 'success' | 'warning' | 'error' {
		if (status === 'trusted') return 'success';
		if (status === 'pending') return 'warning';
		return 'error';
	}

	function projectName(projectId: string): string {
		return availableProjects.find((project) => project.id === projectId)?.name || projectId;
	}

	function formatTimestamp(value: string | null): string {
		if (!value) return 'Never';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return 'Unknown';
		return parsed.toLocaleString();
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div class="p-4 sm:p-6">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 class="text-lg font-semibold text-foreground">Agent Keys</h2>
					<p class="text-sm text-muted-foreground mt-1">
						Manage API keys for external agents like OpenClaw to access your BuildOS
						data.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						icon={RefreshCw}
						onclick={loadCallers}
						disabled={loading}
					>
						Refresh
					</Button>
					<Button variant="primary" size="sm" icon={Plus} onclick={openGenerateModal}>
						Generate Key
					</Button>
				</div>
			</div>

			{#if buildosAgent}
				<div
					class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
				>
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<span class="font-medium text-foreground">Your agent handle:</span>
						<code class="text-xs">{buildosAgent.handle}</code>
					</div>
					<Button
						variant="ghost"
						size="sm"
						icon={copiedId === 'callee-handle' ? CircleCheck : Copy}
						onclick={() =>
							copyToClipboard(
								'callee-handle',
								buildosAgent.handle,
								'Agent handle copied'
							)}
					>
						{copiedId === 'callee-handle' ? 'Copied' : 'Copy'}
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Registered Callers -->
	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div class="p-4 sm:p-6 space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="text-base font-semibold text-foreground">Registered Keys</h3>
				<Badge variant="info">
					{callers.length} key{callers.length === 1 ? '' : 's'}
				</Badge>
			</div>

			{#if loading}
				<div
					class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center"
				>
					Loading...
				</div>
			{:else if callers.length === 0}
				<div class="rounded-lg border border-dashed border-border p-6 text-center">
					<Key class="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
					<p class="text-sm text-muted-foreground">
						No keys yet. Generate your first key to connect an external agent.
					</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each callers as caller (caller.id)}
						<div class="rounded-lg border border-border bg-muted/20 p-4">
							<div
								class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
							>
								<div class="space-y-1.5 min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<h4 class="text-sm font-semibold text-foreground">
											{installationDisplayName(caller)}
										</h4>
										<Badge variant={statusVariant(caller.status)}>
											{caller.status}
										</Badge>
										<Badge variant="default">
											{displayProvider(caller.provider)}
										</Badge>
									</div>
									<div class="text-xs text-muted-foreground space-y-0.5">
										<p>
											<span class="font-medium text-foreground">Key:</span>
											<code>{caller.caller_key}</code>
										</p>
										<p>
											<span class="font-medium text-foreground">Prefix:</span>
											<code>{caller.token_prefix}</code>
										</p>
										<p>
											<span class="font-medium text-foreground">Scope:</span>
											{scopeLabel(caller)}
										</p>
										<p>
											<span class="font-medium text-foreground">Access:</span>
											{accessModeLabel(caller)}
										</p>
										<p>
											<span class="font-medium text-foreground"
												>Last used:</span
											>
											{formatTimestamp(caller.last_used_at)}
										</p>
									</div>
								</div>

								<div class="flex flex-wrap gap-2 flex-shrink-0">
									<Button
										variant="outline"
										size="sm"
										icon={RefreshCw}
										loading={saving && editingCaller?.id === caller.id}
										disabled={saving}
										onclick={() => openEditModal(caller)}
									>
										{caller.status === 'revoked' ? 'Reissue' : 'Edit'}
									</Button>
									{#if caller.status !== 'revoked'}
										<Button
											variant="danger"
											size="sm"
											icon={Trash2}
											disabled={revokingCallerId === caller.id}
											onclick={() => (pendingRevokeCaller = caller)}
										>
											Revoke
										</Button>
									{/if}
								</div>
							</div>

							{#if caller.allowed_project_ids && caller.allowed_project_ids.length > 0}
								<div class="mt-3 pt-3 border-t border-border">
									<div
										class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5"
									>
										Scoped Projects
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each caller.allowed_project_ids as projectId (projectId)}
											<Badge variant="accent">{projectName(projectId)}</Badge>
										{/each}
									</div>
								</div>
							{/if}

							{#if writePermissionLabels(caller).length > 0}
								<div class="mt-3 pt-3 border-t border-border">
									<div
										class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5"
									>
										Write Permissions
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each writePermissionLabels(caller) as label (label)}
											<Badge variant="accent">{label}</Badge>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div class="pt-2 border-t border-border">
				<a
					href="/integrations"
					class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors"
				>
					Integration docs
					<ExternalLink class="w-3.5 h-3.5" />
				</a>
			</div>
		</div>
	</div>
</div>

<!-- Generate Key Modal -->
<Modal
	isOpen={showGenerateModal}
	onClose={() => {
		showGenerateModal = false;
		clearForm();
	}}
	title={editingCaller ? 'Edit Agent Key' : 'Generate BuildOS Key'}
	size="md"
>
	{#snippet children()}
		<div class="p-4 sm:p-6 space-y-5">
			<div class="grid gap-4 sm:grid-cols-2">
				<FormField
					label="Agent Type"
					labelFor="agent-provider-mode"
					hint="OpenClaw is the default integration."
				>
					<Select id="agent-provider-mode" bind:value={providerMode}>
						<option value="openclaw">OpenClaw</option>
						<option value="custom">Custom Agent</option>
					</Select>
				</FormField>

				<FormField
					label="Installation Name"
					labelFor="agent-installation-name"
					required={true}
					hint="e.g. Research Workspace"
				>
					<TextInput
						id="agent-installation-name"
						bind:value={installationName}
						placeholder="OpenClaw Main"
					/>
				</FormField>
			</div>

			{#if providerMode === 'custom'}
				<FormField
					label="Provider Key"
					labelFor="agent-custom-provider"
					required={true}
					hint="Lowercase identifier for routing."
				>
					<TextInput
						id="agent-custom-provider"
						bind:value={customProvider}
						placeholder="custom-agent"
					/>
				</FormField>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<FormField
					label="Access Level"
					labelFor="agent-scope-mode"
					hint="Choose whether this key can only read or can also update tasks."
				>
					<Select id="agent-scope-mode" bind:value={scopeMode}>
						<option value="read_only">Read only</option>
						<option value="read_write">Read & write</option>
					</Select>
				</FormField>

				<div class="rounded-lg border border-border bg-muted/20 px-3 py-2">
					<div class="text-xs uppercase tracking-wider text-muted-foreground">
						Included by default
					</div>
					<p class="mt-1 text-sm text-foreground">
						Project, task, document, and search reads are always available.
					</p>
				</div>
			</div>

			{#if scopeMode === 'read_write'}
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-3">
						<h4 class="text-sm font-semibold text-foreground">Write Permissions</h4>
						<Badge variant="warning">{selectedWriteOps.length} enabled</Badge>
					</div>
					<p class="text-xs text-muted-foreground">
						Choose exactly which BuildOS write actions this key can perform.
					</p>
					<div class="space-y-2 rounded-lg border border-border p-2">
						{#each WRITE_PERMISSION_OPTIONS as option (option.op)}
							<label
								class="flex items-start gap-2.5 rounded-md px-2.5 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
							>
								<input
									type="checkbox"
									class="mt-0.5 h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
									checked={selectedWriteOps.includes(option.op)}
									onchange={() => toggleWriteOp(option.op)}
								/>
								<div>
									<div class="text-sm font-medium text-foreground">
										{option.label}
									</div>
									<div class="text-xs text-muted-foreground">
										{option.description}
									</div>
								</div>
							</label>
						{/each}
					</div>
				</div>
			{/if}

			<div class="space-y-2">
				<div class="flex items-center justify-between gap-3">
					<h4 class="text-sm font-semibold text-foreground">Allowed Projects</h4>
					<div class="flex items-center gap-2">
						{#if availableProjects.length > 0}
							<Button variant="ghost" size="sm" onclick={toggleAllProjects}>
								{allProjectsSelected ? 'Deselect All' : 'Select All'}
							</Button>
						{/if}
						{#if selectedProjectIds.length > 0}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => (selectedProjectIds = [])}
							>
								Clear
							</Button>
						{/if}
					</div>
				</div>
				<p class="text-xs text-muted-foreground">
					Leave unchecked to allow access to all your projects.
				</p>

				{#if availableProjects.length === 0}
					<div
						class="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground"
					>
						No projects found. The key will cover future projects.
					</div>
				{:else}
					<div
						class="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2"
					>
						{#each availableProjects as project (project.id)}
							<label
								class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors"
							>
								<input
									type="checkbox"
									class="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
									checked={selectedProjectIds.includes(project.id)}
									onchange={() => toggleProject(project.id)}
								/>
								<span class="text-sm text-foreground truncate">
									{project.name}
								</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex flex-col sm:flex-row gap-3 sm:justify-end px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/30"
		>
			<Button
				variant="secondary"
				size="md"
				onclick={() => {
					showGenerateModal = false;
					clearForm();
				}}
				disabled={saving}
				class="w-full sm:w-auto"
			>
				Cancel
			</Button>
			<Button
				variant="primary"
				size="md"
				icon={Key}
				loading={saving}
				disabled={saving || !installationName.trim()}
				onclick={provisionCaller}
				class="w-full sm:w-auto"
			>
				{editingCaller ? 'Save + Rotate Key' : 'Generate Key'}
			</Button>
		</div>
	{/snippet}
</Modal>

<!-- Key Created Modal -->
<Modal
	isOpen={showKeyCreatedModal}
	onClose={() => {
		showKeyCreatedModal = false;
		editingCaller = null;
	}}
	title={editingCaller ? 'Key Updated' : 'Key Generated'}
	size="md"
>
	{#snippet children()}
		{#if latestProvisioned}
			<div class="p-4 sm:p-6 space-y-4">
				<div class="flex items-start gap-3">
					<div class="p-1.5 rounded-full bg-emerald-500/10">
						<CircleCheck class="w-5 h-5 text-emerald-500" />
					</div>
					<div>
						<p class="text-sm font-medium text-foreground">
							{editingCaller
								? 'Your updated key is ready.'
								: 'Your new key is ready.'}
						</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							Copy it now — this secret is shown only once.
						</p>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
					<div class="text-xs uppercase tracking-wider text-muted-foreground">
						Granted Permissions
					</div>
					<div class="flex flex-wrap gap-1.5">
						<Badge variant="default">
							{latestProvisioned.caller.scope_mode === 'read_write'
								? 'Read & write'
								: 'Read only'}
						</Badge>
						{#each writePermissionLabels(latestProvisioned.caller) as label (label)}
							<Badge variant="accent">{label}</Badge>
						{/each}
					</div>
				</div>

				<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
					<div class="text-xs uppercase tracking-wider text-muted-foreground">
						BuildOS Agent Key
					</div>
					<div class="flex items-center gap-2">
						<code class="text-sm text-foreground break-all flex-1">
							{latestProvisioned.credentials.bearer_token}
						</code>
						<Button
							variant="outline"
							size="sm"
							icon={copiedId === 'latest-token' ? CircleCheck : Copy}
							onclick={() =>
								copyToClipboard(
									'latest-token',
									latestProvisioned.credentials.bearer_token,
									'Key copied'
								)}
						>
							{copiedId === 'latest-token' ? 'Copied' : 'Copy'}
						</Button>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
					<div class="flex items-center justify-between">
						<div class="text-xs uppercase tracking-wider text-muted-foreground">
							Env Configuration
						</div>
						<Button
							variant="ghost"
							size="sm"
							icon={copiedId === 'env-snippet' ? CircleCheck : Copy}
							onclick={() =>
								copyToClipboard(
									'env-snippet',
									openClawEnvSnippet(latestProvisioned),
									'Configuration copied'
								)}
						>
							{copiedId === 'env-snippet' ? 'Copied' : 'Copy'}
						</Button>
					</div>
					<pre
						class="overflow-x-auto rounded border border-border bg-card p-2.5 text-xs text-foreground"><code
							>{openClawEnvSnippet(latestProvisioned)}</code
						></pre>
				</div>

				{#if openClawBootstrapUrl(latestProvisioned)}
					<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
						<div class="flex items-center justify-between">
							<div class="text-xs uppercase tracking-wider text-muted-foreground">
								OpenClaw Setup URL
							</div>
							<Button
								variant="ghost"
								size="sm"
								icon={copiedId === 'bootstrap-url' ? CircleCheck : Copy}
								onclick={() =>
									copyToClipboard(
										'bootstrap-url',
										openClawBootstrapUrl(latestProvisioned) ?? '',
										'Setup URL copied'
									)}
							>
								{copiedId === 'bootstrap-url' ? 'Copied' : 'Copy'}
							</Button>
						</div>
						<p class="text-xs text-muted-foreground">
							Paste the prompt below into OpenClaw. It will fetch this URL to get the
							next-step BuildOS instructions and secure config values.
						</p>
						<pre
							class="overflow-x-auto rounded border border-border bg-card p-2.5 text-xs text-foreground"><code
								>{openClawBootstrapUrl(latestProvisioned)}</code
							></pre>
					</div>
				{/if}

				{#if openClawBootstrapPrompt(latestProvisioned)}
					<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
						<div class="flex items-center justify-between">
							<div class="text-xs uppercase tracking-wider text-muted-foreground">
								Paste Into OpenClaw
							</div>
							<Button
								variant="ghost"
								size="sm"
								icon={copiedId === 'bootstrap-prompt' ? CircleCheck : Copy}
								onclick={() =>
									copyToClipboard(
										'bootstrap-prompt',
										openClawBootstrapPrompt(latestProvisioned) ?? '',
										'OpenClaw prompt copied'
									)}
							>
								{copiedId === 'bootstrap-prompt' ? 'Copied' : 'Copy'}
							</Button>
						</div>
						<p class="text-xs text-muted-foreground">
							This is the non-technical handoff prompt for OpenClaw. It tells the
							agent to fetch the setup URL, store the config safely, and then connect
							to BuildOS.
						</p>
						<pre
							class="overflow-x-auto rounded border border-border bg-card p-2.5 text-xs text-foreground whitespace-pre-wrap"><code
								>{openClawBootstrapPrompt(latestProvisioned)}</code
							></pre>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		<div class="flex justify-end px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/30">
			<Button
				variant="primary"
				size="md"
				onclick={() => {
					showKeyCreatedModal = false;
					clearForm();
				}}
			>
				Done
			</Button>
		</div>
	{/snippet}
</Modal>

<!-- Revoke Confirmation -->
<ConfirmationModal
	isOpen={pendingRevokeCaller !== null}
	title="Revoke Agent Key?"
	confirmText="Revoke Key"
	cancelText="Keep Active"
	confirmVariant="danger"
	loading={pendingRevokeCaller !== null && revokingCallerId === pendingRevokeCaller.id}
	loadingText="Revoking..."
	icon="danger"
	onconfirm={revokeCaller}
	oncancel={() => (pendingRevokeCaller = null)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			{#if pendingRevokeCaller}
				Revoke the key for
				<span class="font-semibold text-foreground">
					{installationDisplayName(pendingRevokeCaller)}
				</span>? The caller won't be able to reach your BuildOS agent until you generate a
				new key.
			{/if}
		</p>
	{/snippet}
</ConfirmationModal>
