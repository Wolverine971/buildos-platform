<!-- apps/web/src/lib/components/profile/AgentKeysTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import {
		Bot,
		CircleCheck,
		Copy,
		Key,
		RefreshCw,
		Shield,
		Trash2,
		ExternalLink
	} from 'lucide-svelte';
	import type {
		BuildosAgentAvailableProject,
		BuildosAgentCallerListResponse,
		BuildosAgentCallerProvisionResponse,
		BuildosAgentCallerSummary,
		BuildosAgentIdentitySummary
	} from '@buildos/shared-types';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	type ProviderMode = 'openclaw' | 'custom';

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

	let providerMode = $state<ProviderMode>('openclaw');
	let customProvider = $state('');
	let installationName = $state('');
	let selectedProjectIds = $state<string[]>([]);

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
			return 'All visible projects';
		}

		if (caller.allowed_project_ids.length === 1) {
			const project = availableProjects.find(
				(entry) => entry.id === caller.allowed_project_ids?.[0]
			);
			return project?.name || '1 selected project';
		}

		return `${caller.allowed_project_ids.length} selected projects`;
	}

	function toggleProject(projectId: string) {
		if (selectedProjectIds.includes(projectId)) {
			selectedProjectIds = selectedProjectIds.filter((id) => id !== projectId);
			return;
		}

		selectedProjectIds = [...selectedProjectIds, projectId];
	}

	function clearForm() {
		installationName = '';
		selectedProjectIds = [];
		if (providerMode === 'custom') {
			customProvider = '';
		}
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

	function previewCallerKey(): string | null {
		if (!installationName.trim()) {
			return null;
		}

		const provider = currentProvider();
		if (!provider || !isValidProvider(provider)) {
			return null;
		}

		return buildCallerKey(provider, installationName);
	}

	async function provisionCaller(existingCaller?: BuildosAgentCallerSummary) {
		if (saving) return;

		let provider: string;
		let callerKey: string;
		let metadata: Record<string, unknown>;
		let allowedProjectIds: string[] | undefined;

		try {
			if (existingCaller) {
				provider = existingCaller.provider;
				callerKey = existingCaller.caller_key;
				metadata = existingCaller.metadata ?? {};
				allowedProjectIds = existingCaller.allowed_project_ids;
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
					allowed_project_ids: allowedProjectIds,
					metadata
				})
			});

			const payload = await parseResponse<BuildosAgentCallerProvisionResponse>(response);
			latestProvisioned = payload;
			await loadCallers();

			const message = existingCaller
				? `Rotated BuildOS key for ${installationDisplayName(existingCaller)}.`
				: 'Generated a new BuildOS agent key.';
			toastService.success(message);
			onsuccess?.({ message });

			if (!existingCaller) {
				clearForm();
			}
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

<div class="space-y-6">
	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div class="p-4 sm:p-6 space-y-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<div class="p-2 rounded-lg bg-accent/10 text-accent">
							<Key class="w-5 h-5" />
						</div>
						<div>
							<h2 class="text-lg font-semibold text-foreground">
								External Agent Keys
							</h2>
							<p class="text-sm text-muted-foreground">
								Create a BuildOS key for OpenClaw or another registered agent
								installation.
							</p>
						</div>
					</div>
					<p class="text-sm text-muted-foreground max-w-3xl">
						Each key identifies one external caller. The secret is shown once, stored
						hashed in BuildOS, and can be scoped to specific projects.
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					icon={RefreshCw}
					onclick={loadCallers}
					disabled={loading}
				>
					Refresh
				</Button>
			</div>

			<div class="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
				<div class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
					<div class="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Shield class="w-4 h-4 text-accent" />
						User BuildOS Agent
					</div>
					{#if buildosAgent}
						<div class="rounded-lg border border-border bg-card p-3 shadow-ink-inner">
							<div
								class="text-xs uppercase tracking-wider text-muted-foreground mb-2"
							>
								Callee Handle
							</div>
							<div
								class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<code class="text-sm text-foreground break-all"
									>{buildosAgent.handle}</code
								>
								<Button
									variant="outline"
									size="sm"
									icon={copiedId === 'callee-handle' ? CircleCheck : Copy}
									onclick={() =>
										copyToClipboard(
											'callee-handle',
											buildosAgent.handle,
											'BuildOS callee handle copied'
										)}
								>
									{copiedId === 'callee-handle' ? 'Copied' : 'Copy'}
								</Button>
							</div>
						</div>
					{:else if loading}
						<p class="text-sm text-muted-foreground">
							Loading BuildOS agent identity...
						</p>
					{:else}
						<p class="text-sm text-muted-foreground">
							BuildOS agent handle unavailable.
						</p>
					{/if}
				</div>

				<div class="rounded-lg border border-border bg-accent/5 p-4 space-y-3">
					<div class="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Bot class="w-4 h-4 text-accent" />
						OpenClaw Setup
					</div>
					<p class="text-sm text-muted-foreground">
						Generate a key, paste it into your OpenClaw plugin or env config, then let
						the plugin call BuildOS with bearer auth.
					</p>
					<a
						href="/integrations"
						class="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
					>
						View integration docs
						<ExternalLink class="w-4 h-4" />
					</a>
				</div>
			</div>
		</div>
	</div>

	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div class="p-4 sm:p-6 space-y-5">
			<div>
				<h3 class="text-lg font-semibold text-foreground">Generate a Key</h3>
				<p class="text-sm text-muted-foreground mt-1">
					Use a human-readable installation name. Reusing the same installation name
					rotates the existing key for that caller identity.
				</p>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<FormField
					label="Agent Type"
					labelFor="agent-provider-mode"
					hint="OpenClaw is the default integration path."
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
					hint="Example: Research Workspace or OpenClaw Main."
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
					hint="Lowercase provider identifier used for BuildOS routing."
				>
					<TextInput
						id="agent-custom-provider"
						bind:value={customProvider}
						placeholder="custom-agent"
					/>
				</FormField>
			{/if}

			<div class="space-y-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							Allowed Projects
						</h4>
						<p class="text-sm text-muted-foreground">
							Leave everything unchecked to allow all projects visible to you.
						</p>
					</div>
					{#if selectedProjectIds.length > 0}
						<Button variant="ghost" size="sm" onclick={() => (selectedProjectIds = [])}>
							Clear Scope
						</Button>
					{/if}
				</div>

				{#if availableProjects.length === 0}
					<div
						class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
					>
						No projects found yet. This key will cover your future visible projects
						unless you scope it later.
					</div>
				{:else}
					<div class="grid gap-3 md:grid-cols-2">
						{#each availableProjects as project (project.id)}
							<label
								class="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 cursor-pointer hover:border-accent/40 transition-colors"
							>
								<input
									type="checkbox"
									class="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
									checked={selectedProjectIds.includes(project.id)}
									onchange={() => toggleProject(project.id)}
								/>
								<div class="min-w-0">
									<div class="text-sm font-medium text-foreground">
										{project.name}
									</div>
									{#if project.description}
										<p class="text-xs text-muted-foreground mt-1">
											{project.description}
										</p>
									{/if}
								</div>
							</label>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
				<div class="text-xs text-muted-foreground">
					Caller key preview:
					<code class="text-foreground">
						{#if previewCallerKey()}
							{previewCallerKey()}
						{:else}
							generated after you choose a provider and installation name
						{/if}
					</code>
				</div>
				<Button
					variant="primary"
					size="md"
					icon={Key}
					loading={saving}
					disabled={saving}
					onclick={() => provisionCaller()}
				>
					Generate BuildOS Key
				</Button>
			</div>
		</div>
	</div>

	{#if latestProvisioned}
		<div class="bg-card rounded-lg shadow-ink border border-accent/30 tx tx-grain tx-weak">
			<div class="p-4 sm:p-6 space-y-4">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h3 class="text-lg font-semibold text-foreground">Key Created</h3>
						<p class="text-sm text-muted-foreground">
							This secret is shown once. Copy it into OpenClaw now.
						</p>
					</div>
					<Badge variant="accent">One-Time Secret</Badge>
				</div>

				<div class="rounded-lg border border-border bg-background/70 p-4 space-y-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<div class="text-xs uppercase tracking-wider text-muted-foreground">
								BuildOS Agent Key
							</div>
							<code class="text-sm text-foreground break-all">
								{latestProvisioned.credentials.bearer_token}
							</code>
						</div>
						<Button
							variant="outline"
							size="sm"
							icon={copiedId === 'latest-token' ? CircleCheck : Copy}
							onclick={() =>
								copyToClipboard(
									'latest-token',
									latestProvisioned.credentials.bearer_token,
									'BuildOS agent key copied'
								)}
						>
							{copiedId === 'latest-token' ? 'Copied' : 'Copy Key'}
						</Button>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<div class="text-xs uppercase tracking-wider text-muted-foreground">
								OpenClaw Env Snippet
							</div>
							<p class="text-sm text-muted-foreground">
								Paste this into your OpenClaw plugin or secret configuration.
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							icon={copiedId === 'env-snippet' ? CircleCheck : Copy}
							onclick={() =>
								copyToClipboard(
									'env-snippet',
									openClawEnvSnippet(latestProvisioned),
									'OpenClaw configuration copied'
								)}
						>
							{copiedId === 'env-snippet' ? 'Copied' : 'Copy Config'}
						</Button>
					</div>
					<pre
						class="overflow-x-auto rounded-lg border border-border bg-card p-3 text-xs text-foreground shadow-ink-inner"><code
							>{openClawEnvSnippet(latestProvisioned)}</code
						></pre>
				</div>
			</div>
		</div>
	{/if}

	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div class="p-4 sm:p-6 space-y-4">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 class="text-lg font-semibold text-foreground">Registered Callers</h3>
					<p class="text-sm text-muted-foreground">
						Rotate keys without changing caller identity, or revoke callers you no
						longer trust.
					</p>
				</div>
				<Badge variant="info"
					>{callers.length} caller{callers.length === 1 ? '' : 's'}</Badge
				>
			</div>

			{#if loading}
				<div
					class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
				>
					Loading external callers...
				</div>
			{:else if callers.length === 0}
				<div
					class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
				>
					No external callers registered yet. Generate your first BuildOS key above.
				</div>
			{:else}
				<div class="space-y-3">
					{#each callers as caller (caller.id)}
						<div class="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
							<div
								class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
							>
								<div class="space-y-2 min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<h4 class="text-base font-semibold text-foreground">
											{installationDisplayName(caller)}
										</h4>
										<Badge variant={statusVariant(caller.status)}>
											{caller.status}
										</Badge>
										<Badge variant="default"
											>{displayProvider(caller.provider)}</Badge
										>
									</div>
									<div class="text-sm text-muted-foreground space-y-1">
										<p>
											<span class="font-medium text-foreground"
												>Caller key:</span
											> <code>{caller.caller_key}</code>
										</p>
										<p>
											<span class="font-medium text-foreground"
												>Token prefix:</span
											> <code>{caller.token_prefix}</code>
										</p>
										<p>
											<span class="font-medium text-foreground">Scope:</span>
											{scopeLabel(caller)}
										</p>
										<p>
											<span class="font-medium text-foreground"
												>Last used:</span
											>
											{formatTimestamp(caller.last_used_at)}
										</p>
									</div>
								</div>

								<div class="flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										icon={RefreshCw}
										loading={saving}
										disabled={saving}
										onclick={() => provisionCaller(caller)}
									>
										{caller.status === 'revoked'
											? 'Generate New Key'
											: 'Rotate Key'}
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
								<div class="rounded-lg border border-border bg-card p-3">
									<div
										class="text-xs uppercase tracking-wider text-muted-foreground mb-2"
									>
										Scoped Projects
									</div>
									<div class="flex flex-wrap gap-2">
										{#each caller.allowed_project_ids as projectId (projectId)}
											<Badge variant="accent">{projectName(projectId)}</Badge>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<ConfirmationModal
	isOpen={pendingRevokeCaller !== null}
	title="Revoke BuildOS Agent Key?"
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
				Revoke the BuildOS key for
				<span class="font-semibold text-foreground">
					{installationDisplayName(pendingRevokeCaller)}
				</span>
				? The caller will no longer be able to dial your BuildOS agent until you generate a new
				key.
			{/if}
		</p>
	{/snippet}
</ConfirmationModal>
