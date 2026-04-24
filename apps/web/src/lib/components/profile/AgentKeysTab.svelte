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
		BuildosAgentCallerProvisionRequest,
		BuildosAgentCallerProvisionResponse,
		BuildosAgentCallerSummary,
		BuildosAgentIdentitySummary,
		BuildosAgentScopeMode
	} from '@buildos/shared-types';
	import {
		BUILDOS_AGENT_READ_OPS,
		BUILDOS_AGENT_WRITE_OPS,
		OPENCLAW_DEFAULT_WRITE_OPS
	} from '@buildos/shared-types';
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
		},
		{
			op: 'onto.document.create',
			label: 'Create documents',
			description: 'Allow the agent to save markdown documents into projects.'
		},
		{
			op: 'onto.document.update',
			label: 'Update documents',
			description: 'Allow the agent to edit existing document metadata and content.'
		},
		{
			op: 'onto.project.create',
			label: 'Create projects',
			description: 'Allow the agent to spin up new projects. Use carefully.'
		},
		{
			op: 'onto.project.update',
			label: 'Update projects',
			description: 'Allow the agent to change project fields like name, state, and type.'
		},
		{
			op: 'onto.goal.create',
			label: 'Create goals',
			description: 'Allow the agent to add new goals within permitted projects.'
		},
		{
			op: 'onto.goal.update',
			label: 'Update goals',
			description: 'Allow the agent to edit goal fields within permitted projects.'
		},
		{
			op: 'onto.plan.create',
			label: 'Create plans',
			description: 'Allow the agent to add new plans within permitted projects.'
		},
		{
			op: 'onto.plan.update',
			label: 'Update plans',
			description: 'Allow the agent to edit plan fields within permitted projects.'
		},
		{
			op: 'onto.milestone.create',
			label: 'Create milestones',
			description: 'Allow the agent to add new milestones within permitted projects.'
		},
		{
			op: 'onto.milestone.update',
			label: 'Update milestones',
			description: 'Allow the agent to edit milestone fields.'
		},
		{
			op: 'onto.risk.create',
			label: 'Create risks',
			description: 'Allow the agent to add new risks within permitted projects.'
		},
		{
			op: 'onto.risk.update',
			label: 'Update risks',
			description: 'Allow the agent to edit risk fields.'
		}
	];

	type PermissionBundleId = 'read_only' | 'author_docs_tasks' | 'full_write' | 'custom';

	type PermissionBundle = {
		id: PermissionBundleId;
		label: string;
		description: string;
		scopeMode: BuildosAgentScopeMode;
		writeOps: BuildosAgentAllowedOp[];
	};

	const PERMISSION_BUNDLES: PermissionBundle[] = [
		{
			id: 'read_only',
			label: 'Read only',
			description: 'Agent can read projects, tasks, and documents. No writes.',
			scopeMode: 'read_only',
			writeOps: []
		},
		{
			id: 'author_docs_tasks',
			label: 'Author docs + tasks (OpenClaw default)',
			description:
				'Recommended for Claude Code / OpenClaw. Create/update documents and tasks.',
			scopeMode: 'read_write',
			writeOps: [...OPENCLAW_DEFAULT_WRITE_OPS] as BuildosAgentAllowedOp[]
		},
		{
			id: 'full_write',
			label: 'Full read/write',
			description: 'Every exposed write op. Use for trusted automations you control.',
			scopeMode: 'read_write',
			writeOps: [...BUILDOS_AGENT_WRITE_OPS] as BuildosAgentAllowedOp[]
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
	let rotatingCallerId = $state<string | null>(null);
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
	let showAdvancedPermissions = $state(false);

	let activeBundleId = $derived(detectBundleId(scopeMode, selectedWriteOps));

	function detectBundleId(
		mode: BuildosAgentScopeMode,
		writeOps: BuildosAgentAllowedOp[]
	): PermissionBundleId {
		for (const bundle of PERMISSION_BUNDLES) {
			if (bundle.scopeMode !== mode) continue;
			if (bundle.writeOps.length !== writeOps.length) continue;
			const bundleSet = new Set(bundle.writeOps);
			if (writeOps.every((op) => bundleSet.has(op))) {
				return bundle.id;
			}
		}
		return 'custom';
	}

	function applyBundle(bundle: PermissionBundle) {
		scopeMode = bundle.scopeMode;
		selectedWriteOps = [...bundle.writeOps];
		if (bundle.id === 'read_only') {
			showAdvancedPermissions = false;
		}
	}

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

	function unavailableProjectCount(caller: BuildosAgentCallerSummary): number {
		return Math.max(0, caller.unavailable_project_count ?? 0);
	}

	function projectCountLabel(count: number): string {
		return `${count} project${count === 1 ? '' : 's'}`;
	}

	function unavailableProjectSuffix(caller: BuildosAgentCallerSummary): string {
		const count = unavailableProjectCount(caller);
		return count > 0 ? ` + ${projectCountLabel(count)} unavailable` : '';
	}

	function filterAvailableProjectIds(projectIds: string[]): string[] {
		const availableProjectIds = new Set(availableProjects.map((project) => project.id));
		return projectIds.filter((projectId) => availableProjectIds.has(projectId));
	}

	function scopeLabel(caller: BuildosAgentCallerSummary): string {
		const unavailableSuffix = unavailableProjectSuffix(caller);

		if (!caller.allowed_project_ids || caller.allowed_project_ids.length === 0) {
			return unavailableProjectCount(caller) > 0
				? `${projectCountLabel(unavailableProjectCount(caller))} unavailable`
				: 'All projects';
		}

		if (caller.allowed_project_ids.length === 1) {
			const project = availableProjects.find(
				(entry) => entry.id === caller.allowed_project_ids?.[0]
			);
			return `${project?.name || '1 project'}${unavailableSuffix}`;
		}

		return `${projectCountLabel(caller.allowed_project_ids.length)}${unavailableSuffix}`;
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
		const defaultBundle = PERMISSION_BUNDLES.find(
			(bundle) => bundle.id === 'author_docs_tasks'
		);
		if (defaultBundle) {
			scopeMode = defaultBundle.scopeMode;
			selectedWriteOps = [...defaultBundle.writeOps];
		} else {
			scopeMode = 'read_only';
			selectedWriteOps = [];
		}
		showAdvancedPermissions = false;
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
		selectedProjectIds = filterAvailableProjectIds(caller.allowed_project_ids ?? []);
		scopeMode = caller.scope_mode;
		selectedWriteOps = enabledWriteOps(caller);
		showGenerateModal = true;
	}

	function provisionRequestForCaller(
		caller: BuildosAgentCallerSummary
	): BuildosAgentCallerProvisionRequest {
		return {
			provider: caller.provider,
			caller_key: caller.caller_key,
			scope_mode: caller.scope_mode,
			allowed_ops: caller.scope_mode === 'read_write' ? caller.allowed_ops : undefined,
			allowed_project_ids:
				caller.allowed_project_ids && caller.allowed_project_ids.length > 0
					? filterAvailableProjectIds(caller.allowed_project_ids)
					: undefined,
			metadata: caller.metadata ?? {}
		};
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

	function markCopied(id: string) {
		copiedId = id;
		setTimeout(() => {
			if (copiedId === id) {
				copiedId = null;
			}
		}, 2000);
	}

	async function writeToClipboard(id: string, text: string): Promise<boolean> {
		if (!browser) return false;

		try {
			await navigator.clipboard.writeText(text);
			markCopied(id);
			return true;
		} catch {
			return false;
		}
	}

	async function copyToClipboard(id: string, text: string, successMessage: string) {
		const didCopy = await writeToClipboard(id, text);

		if (didCopy) {
			toastService.success(successMessage);
		} else {
			toastService.error('Failed to copy to clipboard');
		}
	}

	function openClawEnvSnippet(provisioned: BuildosAgentCallerProvisionResponse): string {
		const origin = buildosBaseUrl();

		return [
			`BUILDOS_BASE_URL=${origin}`,
			`BUILDOS_AGENT_TOKEN=${provisioned.credentials.bearer_token}`,
			`BUILDOS_CALLEE_HANDLE=${provisioned.buildos_agent.handle}`,
			`BUILDOS_CALLER_KEY=${provisioned.caller.caller_key}`
		].join('\n');
	}

	function buildosBaseUrl(): string {
		return browser ? window.location.origin : $page.url.origin;
	}

	function requestedScopeForCaller(caller: BuildosAgentCallerSummary): Record<string, unknown> {
		const scope: Record<string, unknown> = {
			mode: caller.scope_mode
		};

		if (caller.allowed_project_ids && caller.allowed_project_ids.length > 0) {
			scope.project_ids = caller.allowed_project_ids;
		}

		if (caller.allowed_ops && caller.allowed_ops.length > 0) {
			scope.allowed_ops = caller.allowed_ops;
		}

		return scope;
	}

	function projectScopeDescription(caller: BuildosAgentCallerSummary): string {
		if (!caller.allowed_project_ids || caller.allowed_project_ids.length === 0) {
			return unavailableProjectCount(caller) > 0
				? `${projectCountLabel(unavailableProjectCount(caller))} no longer available in your workspace`
				: 'All visible BuildOS projects';
		}

		const visibleProjects = caller.allowed_project_ids.map(projectName).join(', ');
		const unavailableCount = unavailableProjectCount(caller);
		if (unavailableCount === 0) {
			return visibleProjects;
		}

		return `${visibleProjects}; ${projectCountLabel(unavailableCount)} no longer available in your workspace`;
	}

	function allowedOpsDescription(caller: BuildosAgentCallerSummary): string {
		if (!caller.allowed_ops || caller.allowed_ops.length === 0) {
			return 'Default read operations';
		}

		return caller.allowed_ops.join(', ');
	}

	function buildAgentConnectionPrompt(params: {
		caller: BuildosAgentCallerSummary;
		calleeHandle: string;
		bearerToken: string;
		includeKey: boolean;
	}): string {
		const baseUrl = buildosBaseUrl();
		const gatewayUrl = `${baseUrl}/api/agent-call/buildos`;
		const authHeaderToken = params.includeKey ? params.bearerToken : '<BUILDOS_AGENT_TOKEN>';
		const dialRequest = {
			method: 'call.dial',
			params: {
				callee_handle: params.calleeHandle,
				client: {
					provider: params.caller.provider,
					caller_key: params.caller.caller_key
				},
				requested_scope: requestedScopeForCaller(params.caller)
			}
		};
		const listRequest = {
			method: 'tools/list',
			params: {
				call_id: '<CALL_ID_FROM_CALL_DIAL>'
			}
		};

		return [
			'Connect to my BuildOS agent.',
			'',
			'BuildOS config:',
			`BUILDOS_BASE_URL=${baseUrl}`,
			`BUILDOS_AGENT_TOKEN=${params.bearerToken}`,
			`BUILDOS_CALLEE_HANDLE=${params.calleeHandle}`,
			`BUILDOS_CALLER_KEY=${params.caller.caller_key}`,
			`BUILDOS_CALLER_PROVIDER=${params.caller.provider}`,
			'',
			params.includeKey
				? 'The BuildOS token is included above. Treat it as a secret: do not print it, summarize it, or store it in normal chat memory.'
				: 'Replace <BUILDOS_AGENT_TOKEN> with the BuildOS Agent Key before making requests. Treat it as a secret: do not print it, summarize it, or store it in normal chat memory.',
			'',
			'Connection target:',
			`POST ${gatewayUrl}`,
			`Header: Authorization: Bearer ${authHeaderToken}`,
			'Header: Content-Type: application/json',
			'',
			'First request:',
			JSON.stringify(dialRequest, null, 2),
			'',
			'If the call is accepted, save response.call.id as CALL_ID, then list tools:',
			JSON.stringify(listRequest, null, 2),
			'',
			'Operating rules:',
			`- Requested scope: ${params.caller.scope_mode}.`,
			`- Project scope: ${projectScopeDescription(params.caller)}.`,
			`- Allowed ops: ${allowedOpsDescription(params.caller)}.`,
			'- Use the direct tool names returned by tools/list for BuildOS reads and writes.',
			'- Use tool_search only when the exact BuildOS tool is unknown.',
			'- Use tool_schema when write arguments are uncertain, then call the returned direct tool_name.',
			'- Do not perform writes unless I explicitly ask you to.',
			'- For a connection ping, stop after call.dial and tools/list, then tell me BuildOS is connected and list up to 5 available tool names.',
			'- When finished with the session, call call.hangup with the CALL_ID.'
		].join('\n');
	}

	function agentConnectionPromptForProvisioned(
		provisioned: BuildosAgentCallerProvisionResponse,
		includeKey: boolean
	): string {
		return buildAgentConnectionPrompt({
			caller: provisioned.caller,
			calleeHandle: provisioned.buildos_agent.handle,
			bearerToken: includeKey
				? provisioned.credentials.bearer_token
				: '<BUILDOS_AGENT_TOKEN>',
			includeKey
		});
	}

	function agentConnectionPromptForCaller(caller: BuildosAgentCallerSummary): string {
		return buildAgentConnectionPrompt({
			caller,
			calleeHandle: buildosAgent?.handle ?? '<BUILDOS_CALLEE_HANDLE>',
			bearerToken: '<BUILDOS_AGENT_TOKEN>',
			includeKey: false
		});
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
			}

			const availableSelectedProjectIds = filterAvailableProjectIds(selectedProjectIds);
			allowedProjectIds =
				availableSelectedProjectIds.length > 0 ? availableSelectedProjectIds : undefined;

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

	async function rotateAndShowKey(caller: BuildosAgentCallerSummary) {
		if (saving || rotatingCallerId) return;

		if (unavailableProjectCount(caller) > 0) {
			openEditModal(caller);
			toastService.warning('Review the available project scope before rotating this key.');
			return;
		}

		rotatingCallerId = caller.id;
		editingCaller = caller;

		try {
			const response = await fetch('/api/agent-call/callers', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(provisionRequestForCaller(caller))
			});

			const payload = await parseResponse<BuildosAgentCallerProvisionResponse>(response);
			latestProvisioned = payload;
			await loadCallers();

			const didCopy = await writeToClipboard(
				'latest-token',
				payload.credentials.bearer_token
			);
			const action = caller.status === 'revoked' ? 'Reissued' : 'Rotated';
			const message = didCopy
				? `${action} and copied the BuildOS key for ${installationDisplayName(caller)}.`
				: `${action} the BuildOS key for ${installationDisplayName(caller)}. Copy it from the modal.`;
			toastService.success(message);
			onsuccess?.({ message });
			showKeyCreatedModal = true;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to rotate agent key';
			toastService.error(message);
			onerror?.({ message });
			editingCaller = null;
		} finally {
			rotatingCallerId = null;
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

<div class="space-y-4 sm:space-y-5">
	<!-- Tab Header -->
	<div class="flex items-start gap-3">
		<div
			class="flex items-center justify-center w-10 h-10 rounded-lg bg-accent shadow-ink flex-shrink-0"
		>
			<Key class="w-5 h-5 text-accent-foreground" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-xl font-bold text-foreground">Agent Keys</h2>
			<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
				Manage API keys for external agents (like OpenClaw) to access your BuildOS data.
			</p>
		</div>
		<div class="flex items-center gap-2 flex-shrink-0">
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
				Generate
			</Button>
		</div>
	</div>

	<!-- Agent Handle -->
	{#if buildosAgent}
		<div
			class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-muted/40 px-3 py-2"
		>
			<div class="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
				<span class="font-medium text-foreground flex-shrink-0">Your agent handle:</span>
				<code class="text-xs truncate">{buildosAgent.handle}</code>
			</div>
			<Button
				variant="ghost"
				size="sm"
				icon={copiedId === 'callee-handle' ? CircleCheck : Copy}
				onclick={() =>
					copyToClipboard('callee-handle', buildosAgent!.handle, 'Agent handle copied')}
			>
				{copiedId === 'callee-handle' ? 'Copied' : 'Copy'}
			</Button>
		</div>
	{/if}

	<!-- Registered Callers -->
	<div class="bg-card rounded-lg shadow-ink border border-border tx tx-frame tx-weak">
		<div
			class="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border"
		>
			<h3 class="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
				<Key class="w-4 h-4 text-accent" />
				Registered Keys
			</h3>
			<Badge variant="info">
				{callers.length} key{callers.length === 1 ? '' : 's'}
			</Badge>
		</div>

		<div class="p-4 sm:p-5 space-y-3">
			<div
				class="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
			>
				<span class="font-medium text-foreground">Need the full key?</span>
				For security, BuildOS stores only a hash. Use Rotate + Copy to reissue the key, then
				copy the full BuildOS Agent Key from the confirmation modal.
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
				<div class="space-y-2">
					{#each callers as caller (caller.id)}
						<div class="rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
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
											<span class="font-medium text-foreground"
												>Caller key:</span
											>
											<code>{caller.caller_key}</code>
										</p>
										<p>
											<span class="font-medium text-foreground">Prefix:</span>
											<code>{caller.token_prefix}</code>
											<span class="ml-1 text-muted-foreground">
												secret shown only on generate or rotate
											</span>
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
									{#if caller.status === 'trusted'}
										<Button
											variant="outline"
											size="sm"
											icon={copiedId === `agent-prompt-${caller.id}`
												? CircleCheck
												: Copy}
											onclick={() =>
												copyToClipboard(
													`agent-prompt-${caller.id}`,
													agentConnectionPromptForCaller(caller),
													'Agent prompt copied'
												)}
										>
											{copiedId === `agent-prompt-${caller.id}`
												? 'Copied'
												: 'Copy Prompt'}
										</Button>
									{/if}
									<Button
										variant="outline"
										size="sm"
										icon={Copy}
										loading={rotatingCallerId === caller.id}
										disabled={saving ||
											(rotatingCallerId !== null &&
												rotatingCallerId !== caller.id)}
										onclick={() => rotateAndShowKey(caller)}
									>
										{caller.status === 'revoked'
											? 'Reissue + Copy'
											: 'Rotate + Copy'}
									</Button>
									<Button
										variant="outline"
										size="sm"
										icon={RefreshCw}
										loading={saving && editingCaller?.id === caller.id}
										disabled={saving || rotatingCallerId !== null}
										onclick={() => openEditModal(caller)}
									>
										{caller.status === 'revoked' ? 'Reissue Key' : 'Edit'}
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

							{#if (caller.allowed_project_ids && caller.allowed_project_ids.length > 0) || unavailableProjectCount(caller) > 0}
								<div class="mt-3 pt-3 border-t border-border">
									<div
										class="text-xs uppercase tracking-wider text-muted-foreground mb-1.5"
									>
										Scoped Projects
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#if caller.allowed_project_ids && caller.allowed_project_ids.length > 0}
											{#each caller.allowed_project_ids as projectId (projectId)}
												<Badge variant="accent"
													>{projectName(projectId)}</Badge
												>
											{/each}
										{/if}
										{#if unavailableProjectCount(caller) > 0}
											<Badge variant="warning">
												{projectCountLabel(unavailableProjectCount(caller))}
												unavailable
											</Badge>
										{/if}
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
					class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors"
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
	title={editingCaller ? 'Edit & Rotate Agent Key' : 'Generate BuildOS Key'}
	size="md"
>
	{#snippet children()}
		<div class="p-4 sm:p-6 space-y-5">
			{#if editingCaller}
				<div
					class="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
				>
					<span class="font-medium text-foreground">Editing rotates the key.</span>
					BuildOS cannot reveal the existing secret because only the hash is stored. Save changes
					to generate a fresh key, then copy it from the next screen.
				</div>
			{/if}

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

			<div class="space-y-2">
				<div class="flex items-center justify-between gap-3">
					<h4 class="text-sm font-semibold text-foreground">Permission Bundle</h4>
					<span class="text-xs text-muted-foreground">
						Project, task, document, and search reads are always included.
					</span>
				</div>
				<div class="grid gap-2">
					{#each PERMISSION_BUNDLES as bundle (bundle.id)}
						{@const isActive = activeBundleId === bundle.id}
						<label
							class="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors {isActive
								? 'border-accent bg-accent/5'
								: 'border-border hover:bg-muted/40'}"
						>
							<input
								type="radio"
								name="agent-permission-bundle"
								class="mt-1 h-3.5 w-3.5 border-border text-accent focus:ring-accent"
								value={bundle.id}
								checked={isActive}
								onchange={() => applyBundle(bundle)}
							/>
							<div>
								<div class="text-sm font-medium text-foreground">
									{bundle.label}
								</div>
								<div class="text-xs text-muted-foreground">
									{bundle.description}
								</div>
							</div>
						</label>
					{/each}
					{#if activeBundleId === 'custom'}
						<div
							class="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
						>
							Custom bundle — configured via Advanced permissions below.
						</div>
					{/if}
				</div>
			</div>

			<div class="space-y-2">
				<button
					type="button"
					class="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
					onclick={() => (showAdvancedPermissions = !showAdvancedPermissions)}
				>
					<span>{showAdvancedPermissions ? '▾' : '▸'}</span>
					Advanced permissions ({selectedWriteOps.length} write op{selectedWriteOps.length ===
					1
						? ''
						: 's'} selected)
				</button>
				{#if showAdvancedPermissions}
					<div class="space-y-2 rounded-lg border border-border p-2">
						<p class="text-xs text-muted-foreground px-2">
							Fine-tune which write ops the key can perform. Picking any combination
							here switches the bundle to Custom.
						</p>
						<label
							class="flex items-start gap-2.5 rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors"
						>
							<input
								type="checkbox"
								class="mt-0.5 h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
								checked={scopeMode === 'read_write'}
								onchange={() =>
									(scopeMode =
										scopeMode === 'read_write' ? 'read_only' : 'read_write')}
							/>
							<div>
								<div class="text-sm font-medium text-foreground">
									Enable write scope
								</div>
								<div class="text-xs text-muted-foreground">
									Required before selecting any individual write op.
								</div>
							</div>
						</label>
						{#if scopeMode === 'read_write'}
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
						{/if}
					</div>
				{/if}
			</div>

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

				{#if editingCaller && unavailableProjectCount(editingCaller) > 0}
					<div
						class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
					>
						{projectCountLabel(unavailableProjectCount(editingCaller))} previously scoped
						to this key are no longer available in your workspace. Rotating the key will
						keep only currently selected projects.
					</div>
				{/if}

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
				{editingCaller ? 'Save + Show New Key' : 'Generate Key'}
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
	title={editingCaller ? 'Key Rotated' : 'Key Generated'}
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
						Full BuildOS Agent Key
					</div>
					<p class="text-xs text-muted-foreground">
						Copy this now. After you close this modal, BuildOS will only show the token
						prefix.
					</p>
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
									latestProvisioned!.credentials.bearer_token,
									'Key copied'
								)}
						>
							{copiedId === 'latest-token' ? 'Key Copied' : 'Copy Key'}
						</Button>
					</div>
				</div>

				<div class="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<div class="text-xs uppercase tracking-wider text-muted-foreground">
								Paste Into Any Agent
							</div>
							<p class="mt-1 text-xs text-muted-foreground">
								Use the placeholder prompt when you want to store the key
								separately. Use the key prompt only for a trusted agent chat.
							</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<Button
								variant="ghost"
								size="sm"
								icon={copiedId === 'agent-prompt-placeholder' ? CircleCheck : Copy}
								onclick={() =>
									copyToClipboard(
										'agent-prompt-placeholder',
										agentConnectionPromptForProvisioned(
											latestProvisioned!,
											false
										),
										'Agent prompt copied'
									)}
							>
								{copiedId === 'agent-prompt-placeholder'
									? 'Copied'
									: 'Copy Placeholder'}
							</Button>
							<Button
								variant="outline"
								size="sm"
								icon={copiedId === 'agent-prompt-with-key' ? CircleCheck : Copy}
								onclick={() =>
									copyToClipboard(
										'agent-prompt-with-key',
										agentConnectionPromptForProvisioned(
											latestProvisioned!,
											true
										),
										'Agent prompt with key copied'
									)}
							>
								{copiedId === 'agent-prompt-with-key' ? 'Copied' : 'Copy With Key'}
							</Button>
						</div>
					</div>
					<pre
						class="overflow-x-auto rounded border border-border bg-card p-2.5 text-xs text-foreground whitespace-pre-wrap"><code
							>{agentConnectionPromptForProvisioned(latestProvisioned, false)}</code
						></pre>
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
									openClawEnvSnippet(latestProvisioned!),
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
										openClawBootstrapUrl(latestProvisioned!) ?? '',
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
										openClawBootstrapPrompt(latestProvisioned!) ?? '',
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
