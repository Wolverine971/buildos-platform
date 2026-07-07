<!-- apps/web/src/lib/components/admin/ErrorDetailsModal.svelte -->
<script lang="ts">
	import { ArrowUpRight, Check, CircleCheck } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { ErrorLogEntry } from '$lib/types/error-logging';

	interface Props {
		error?: ErrorLogEntry | null;
		isOpen?: boolean;
		onClose?: () => void;
		onResolve?: (errorId: string) => void;
	}

	let { error = null, isOpen = false, onClose, onResolve }: Props = $props();

	function closeModal() {
		onClose?.();
	}

	function getSeverityStyles(severity: string | null | undefined) {
		switch (severity) {
			case 'critical':
				return {
					badge: 'bg-destructive/15 text-destructive border border-destructive/30',
					dot: 'bg-destructive'
				};
			case 'error':
				return {
					badge: 'bg-accent/15 text-accent border border-accent/30',
					dot: 'bg-accent'
				};
			case 'warning':
				return {
					badge: 'bg-warning/15 text-warning border border-warning/30',
					dot: 'bg-warning'
				};
			case 'info':
				return {
					badge: 'bg-info/15 text-info border border-info/30',
					dot: 'bg-info'
				};
			default:
				return {
					badge: 'bg-muted text-muted-foreground border border-border',
					dot: 'bg-muted-foreground'
				};
		}
	}

	function formatFullDate(date: string | undefined) {
		if (!date) return '-';
		const dateObj = new Date(date);
		return dateObj.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12: true
		});
	}

	function getErrorUserId(entry: ErrorLogEntry | null | undefined): string | undefined {
		return entry?.user?.id || entry?.user_id;
	}

	function getAdminUserHref(entry: ErrorLogEntry | null | undefined): string | undefined {
		const userId = getErrorUserId(entry);
		return userId ? `/admin/users?search=${encodeURIComponent(userId)}` : undefined;
	}

	function getAdminChatSessionHref(sessionId: unknown): string | undefined {
		if (typeof sessionId !== 'string' || !sessionId.trim()) return undefined;
		return `/admin/chat/sessions?chat_session_id=${encodeURIComponent(sessionId.trim())}`;
	}

	function getProjectHref(projectId: unknown): string | undefined {
		if (typeof projectId !== 'string' || !projectId.trim()) return undefined;
		return `/projects/${projectId.trim()}`;
	}

	function getProjectLabel(entry: ErrorLogEntry, fallbackProjectId: unknown): string {
		if (entry.project?.name) return entry.project.name;
		return formatMetadataValue(entry.project_id ?? fallbackProjectId);
	}

	function getMetadataRecord(metadata: unknown): Record<string, any> | undefined {
		if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
			return undefined;
		}
		return metadata as Record<string, any>;
	}

	function hasMetadata(metadata: Record<string, any> | undefined): boolean {
		return Boolean(metadata && Object.keys(metadata).length > 0);
	}

	function getMetadataValue(
		metadata: Record<string, any> | undefined,
		...keys: string[]
	): unknown {
		if (!metadata) return undefined;
		for (const key of keys) {
			if (metadata[key] !== undefined && metadata[key] !== null) {
				return metadata[key];
			}
		}
		return undefined;
	}

	function formatMetadataValue(value: unknown): string {
		if (value === null || value === undefined) return '-';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') return value.toLocaleString();
		return String(value);
	}

	function formatMs(value: unknown): string {
		const numeric = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(numeric)) {
			return `${numeric.toLocaleString()}ms`;
		}
		return value ? String(value) : '-';
	}

	function formatJson(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'string') return value;
		const seen = new WeakSet();
		try {
			return JSON.stringify(
				value,
				(_key, val) => {
					if (val && typeof val === 'object') {
						if (seen.has(val)) {
							return '[circular]';
						}
						seen.add(val);
					}
					return val;
				},
				2
			);
		} catch {
			try {
				return JSON.stringify(value);
			} catch {
				return String(value);
			}
		}
	}

	function isToolExecutionError(entry: ErrorLogEntry): boolean {
		if (entry.operation_type === 'tool_execution') return true;
		const metadata = getMetadataRecord(entry.metadata);
		return Boolean(metadata?.toolName || metadata?.tool_name);
	}
</script>

<Modal isOpen={isOpen && !!error} title="Error Details" size="lg" onClose={closeModal}>
	{#if error}
		{@const modalStyles = getSeverityStyles(error.severity)}
		{@const metadata = getMetadataRecord(error.metadata)}
		{@const isToolExecution = isToolExecutionError(error)}
		{@const operationPayload = error.operation_payload}
		{@const toolName = getMetadataValue(metadata, 'toolName', 'tool_name')}
		{@const toolCategory = getMetadataValue(metadata, 'toolCategory', 'tool_category')}
		{@const toolCallId = getMetadataValue(metadata, 'toolCallId', 'tool_call_id')}
		{@const toolErrorType = getMetadataValue(metadata, 'errorType', 'error_type')}
		{@const toolSessionId = getMetadataValue(metadata, 'sessionId', 'session_id')}
		{@const toolContextType = getMetadataValue(metadata, 'contextType', 'context_type')}
		{@const toolEntityId = getMetadataValue(metadata, 'entityId', 'entity_id')}
		{@const toolVirtual = getMetadataValue(metadata, 'virtual')}
		{@const toolTimeoutMs = getMetadataValue(metadata, 'timeoutMs', 'timeout_ms')}
		{@const toolDurationMs = getMetadataValue(metadata, 'durationMs', 'duration_ms')}
		{@const toolArgs = getMetadataValue(metadata, 'args', 'arguments') ?? operationPayload}
		{@const userAdminHref = getAdminUserHref(error)}
		{@const routeId = getMetadataValue(metadata, 'routeId', 'route_id')}
		{@const responseStatus = getMetadataValue(metadata, 'status')}
		{@const chatSessionId = getMetadataValue(metadata, 'sessionId', 'session_id')}
		{@const streamRunId = getMetadataValue(metadata, 'streamRunId', 'stream_run_id')}
		{@const clientTurnId = getMetadataValue(metadata, 'clientTurnId', 'client_turn_id')}
		{@const turnRunId = getMetadataValue(metadata, 'turnRunId', 'turn_run_id')}
		{@const contextType = getMetadataValue(metadata, 'contextType', 'context_type')}
		{@const entityId = getMetadataValue(metadata, 'entityId', 'entity_id')}
		{@const metadataProjectId = getMetadataValue(metadata, 'projectId', 'project_id')}
		{@const displayProjectId =
			error.project_id ??
			(typeof metadataProjectId === 'string' ? metadataProjectId : undefined)}
		{@const projectHref = getProjectHref(displayProjectId)}
		{@const activeTurnConflict = getMetadataValue(metadata, 'activeTurnConflict')}
		{@const originalError = getMetadataRecord(
			getMetadataValue(metadata, 'originalError', 'original_error')
		)}
		{@const originalErrorCode = getMetadataValue(originalError, 'code')}
		{@const originalErrorDetails = getMetadataValue(originalError, 'details')}
		{@const originalErrorHint = getMetadataValue(originalError, 'hint')}
		{@const chatSessionHref = getAdminChatSessionHref(chatSessionId)}
		<div class="px-4 py-3">
			<div class="space-y-3">
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-0.5">
						<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
							Error ID
						</p>
						<p class="text-xs text-foreground font-mono truncate">{error.id}</p>
					</div>
					<div class="space-y-0.5">
						<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
							Occurred
						</p>
						<p class="text-xs text-foreground">
							{formatFullDate(error.created_at)}
						</p>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<span
						class="{modalStyles.badge} inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
					>
						<span class="w-1.5 h-1.5 rounded-full {modalStyles.dot}"></span>
						{error.severity}
					</span>
					<span
						class="bg-muted text-muted-foreground px-2 py-1 rounded text-xs font-medium border border-border"
					>
						{error.error_type?.replace(/_/g, ' ')}
					</span>
					{#if error.error_code}
						<span
							class="bg-destructive/10 text-destructive px-2 py-1 rounded text-xs font-mono border border-destructive/20"
						>
							{error.error_code}
						</span>
					{/if}
				</div>

				{#if error.user || error.user_id}
					<div class="bg-info/5 border border-info/20 rounded-lg p-3">
						<p class="text-[0.65rem] uppercase tracking-wider text-info mb-2">
							User Information
						</p>
						{#if error.user}
							<div class="grid grid-cols-2 gap-2 text-xs">
								<div>
									<span class="text-muted-foreground">Email:</span>
									<p class="text-foreground font-medium">
										{error.user.email}
									</p>
								</div>
								{#if error.user.name}
									<div>
										<span class="text-muted-foreground">Name:</span>
										<p class="text-foreground">{error.user.name}</p>
									</div>
								{/if}
							</div>
						{:else}
							<p class="text-xs text-foreground font-mono">
								{error.user_id}
							</p>
						{/if}
						{#if userAdminHref}
							<div class="mt-3 pt-3 border-t border-info/20">
								<a
									href={userAdminHref}
									class="inline-flex items-center gap-1.5 rounded-md border border-info/30 bg-background px-2.5 py-1.5 text-xs font-medium text-info transition-colors hover:bg-info/10"
								>
									<span>Open in Users</span>
									<ArrowUpRight class="w-3.5 h-3.5" />
								</a>
							</div>
						{/if}
					</div>
				{/if}

				{#if error.endpoint || error.http_method || error.request_id || error.ip_address || error.user_agent || routeId !== undefined || responseStatus !== undefined}
					<div class="bg-muted/50 border border-border rounded-lg p-3">
						<p
							class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
						>
							Request Context
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							{#if error.request_id}
								<div class="col-span-2">
									<span class="text-muted-foreground">Request ID:</span>
									<p class="text-foreground font-mono text-[0.65rem] break-all">
										{error.request_id}
									</p>
								</div>
							{/if}
							{#if error.endpoint}
								<div class="col-span-2">
									<span class="text-muted-foreground">Endpoint:</span>
									<p class="text-foreground font-mono text-[0.65rem]">
										{error.endpoint}
									</p>
								</div>
							{/if}
							{#if routeId !== undefined}
								<div class="col-span-2">
									<span class="text-muted-foreground">Route ID:</span>
									<p class="text-foreground font-mono text-[0.65rem]">
										{formatMetadataValue(routeId)}
									</p>
								</div>
							{/if}
							{#if error.http_method}
								<div>
									<span class="text-muted-foreground">Method:</span>
									<p class="text-foreground font-medium">
										{error.http_method}
									</p>
								</div>
							{/if}
							{#if responseStatus !== undefined}
								<div>
									<span class="text-muted-foreground">Status:</span>
									<p class="text-foreground font-medium">
										{formatMetadataValue(responseStatus)}
									</p>
								</div>
							{/if}
							{#if error.ip_address}
								<div>
									<span class="text-muted-foreground">IP:</span>
									<p class="text-foreground font-mono">
										{error.ip_address}
									</p>
								</div>
							{/if}
							{#if error.user_agent}
								<div class="col-span-2">
									<span class="text-muted-foreground">User Agent:</span>
									<p class="text-foreground text-[0.65rem] break-words">
										{error.user_agent}
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if chatSessionId || streamRunId || clientTurnId || turnRunId || contextType || entityId || metadataProjectId || activeTurnConflict !== undefined}
					<div class="bg-accent/5 border border-accent/20 rounded-lg p-3">
						<p class="text-[0.65rem] uppercase tracking-wider text-accent mb-2">
							Chat Correlation
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							{#if chatSessionId}
								<div class="col-span-2">
									<span class="text-muted-foreground">Session ID:</span>
									<p class="text-foreground font-mono text-[0.65rem] break-all">
										{formatMetadataValue(chatSessionId)}
									</p>
									{#if chatSessionHref}
										<a
											href={chatSessionHref}
											class="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-medium text-accent hover:underline"
										>
											<span>Open chat audit</span>
											<ArrowUpRight class="w-3 h-3" />
										</a>
									{/if}
								</div>
							{/if}
							{#if turnRunId}
								<div>
									<span class="text-muted-foreground">Turn Run:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(turnRunId)}
									</p>
								</div>
							{/if}
							{#if streamRunId}
								<div>
									<span class="text-muted-foreground">Stream Run:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(streamRunId)}
									</p>
								</div>
							{/if}
							{#if clientTurnId}
								<div>
									<span class="text-muted-foreground">Client Turn:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(clientTurnId)}
									</p>
								</div>
							{/if}
							{#if contextType}
								<div>
									<span class="text-muted-foreground">Context:</span>
									<p class="text-foreground">
										{formatMetadataValue(contextType)}
									</p>
								</div>
							{/if}
							{#if entityId}
								<div>
									<span class="text-muted-foreground">Entity:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(entityId)}
									</p>
								</div>
							{/if}
							{#if displayProjectId}
								<div>
									<span class="text-muted-foreground">Project:</span>
									{#if projectHref}
										<a
											href={projectHref}
											class="inline-flex max-w-full items-center gap-1 text-foreground hover:text-accent transition-colors"
										>
											<span class="truncate"
												>{getProjectLabel(error, displayProjectId)}</span
											>
											<ArrowUpRight class="h-3 w-3 shrink-0" />
										</a>
										<p
											class="font-mono text-[0.65rem] text-muted-foreground truncate"
										>
											{displayProjectId}
										</p>
									{:else}
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
											{formatMetadataValue(displayProjectId)}
										</p>
									{/if}
								</div>
							{/if}
							{#if activeTurnConflict !== undefined}
								<div>
									<span class="text-muted-foreground">Active Conflict:</span>
									<p class="text-foreground">
										{formatMetadataValue(activeTurnConflict)}
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<div class="space-y-1">
					<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
						Error Message
					</p>
					<div class="bg-background border border-border rounded-lg p-3 shadow-ink-inner">
						<p
							class="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed"
						>
							{error.error_message}
						</p>
					</div>
				</div>

				{#if originalErrorCode || originalErrorDetails || originalErrorHint}
					<div class="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
						<p class="text-[0.65rem] uppercase tracking-wider text-destructive mb-2">
							Original Error
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							{#if originalErrorCode}
								<div>
									<span class="text-muted-foreground">Code:</span>
									<p class="text-foreground font-mono">
										{formatMetadataValue(originalErrorCode)}
									</p>
								</div>
							{/if}
							{#if originalErrorDetails}
								<div class="col-span-2">
									<span class="text-muted-foreground">Details:</span>
									<p class="text-foreground font-mono text-[0.65rem]">
										{formatMetadataValue(originalErrorDetails)}
									</p>
								</div>
							{/if}
							{#if originalErrorHint}
								<div class="col-span-2">
									<span class="text-muted-foreground">Hint:</span>
									<p class="text-foreground font-mono text-[0.65rem]">
										{formatMetadataValue(originalErrorHint)}
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if isToolExecution}
					<div class="bg-info/5 border border-info/20 rounded-lg p-3">
						<p class="text-[0.65rem] uppercase tracking-wider text-info mb-2">
							Tool Execution
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							{#if toolName}
								<div>
									<span class="text-muted-foreground">Tool:</span>
									<p class="text-foreground font-medium">{toolName}</p>
								</div>
							{/if}
							{#if toolCategory}
								<div>
									<span class="text-muted-foreground">Category:</span>
									<p class="text-foreground">
										{formatMetadataValue(toolCategory)}
									</p>
								</div>
							{/if}
							{#if toolErrorType}
								<div>
									<span class="text-muted-foreground">Failure Type:</span>
									<p class="text-foreground font-medium">
										{formatMetadataValue(toolErrorType)}
									</p>
								</div>
							{/if}
							{#if toolCallId}
								<div>
									<span class="text-muted-foreground">Tool Call ID:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(toolCallId)}
									</p>
								</div>
							{/if}
							{#if toolSessionId}
								<div>
									<span class="text-muted-foreground">Session ID:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(toolSessionId)}
									</p>
								</div>
							{/if}
							{#if toolContextType}
								<div>
									<span class="text-muted-foreground">Context Type:</span>
									<p class="text-foreground">
										{formatMetadataValue(toolContextType)}
									</p>
								</div>
							{/if}
							{#if toolEntityId}
								<div>
									<span class="text-muted-foreground">Entity ID:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{formatMetadataValue(toolEntityId)}
									</p>
								</div>
							{/if}
							{#if toolVirtual !== undefined}
								<div>
									<span class="text-muted-foreground">Virtual:</span>
									<p class="text-foreground">
										{formatMetadataValue(toolVirtual)}
									</p>
								</div>
							{/if}
							{#if toolTimeoutMs !== undefined}
								<div>
									<span class="text-muted-foreground">Timeout:</span>
									<p class="text-foreground tabular-nums">
										{formatMs(toolTimeoutMs)}
									</p>
								</div>
							{/if}
							{#if toolDurationMs !== undefined}
								<div>
									<span class="text-muted-foreground">Duration:</span>
									<p class="text-foreground tabular-nums">
										{formatMs(toolDurationMs)}
									</p>
								</div>
							{/if}
						</div>
						{#if toolArgs !== undefined && toolArgs !== null}
							<div class="mt-2">
								<span class="text-muted-foreground text-xs">Arguments:</span>
								<pre
									class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{formatJson(
										toolArgs
									)}</pre>
							</div>
						{/if}
					</div>
				{/if}

				{#if !isToolExecution && operationPayload}
					<div class="bg-muted/50 border border-border rounded-lg p-3">
						<p
							class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
						>
							Operation Payload
						</p>
						<pre
							class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{formatJson(
								operationPayload
							)}</pre>
					</div>
				{/if}

				{#if hasMetadata(metadata)}
					<div class="bg-muted/30 border border-border rounded-lg p-3">
						<p
							class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
						>
							Metadata
						</p>
						<pre
							class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-48 leading-relaxed">{formatJson(
								metadata
							)}</pre>
					</div>
				{/if}

				{#if error.error_stack}
					<div class="space-y-1">
						<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
							Stack Trace
						</p>
						<pre
							class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{error.error_stack}</pre>
					</div>
				{/if}

				{#if !isToolExecution && (error.operation_type || error.table_name || error.record_id || error.project_id || error.brain_dump_id)}
					<div class="bg-warning/5 border border-warning/20 rounded-lg p-3">
						<p class="text-[0.65rem] uppercase tracking-wider text-warning mb-2">
							Operation Context
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							{#if error.operation_type}
								<div>
									<span class="text-muted-foreground">Operation:</span>
									<p class="text-foreground font-medium uppercase">
										{error.operation_type}
									</p>
								</div>
							{/if}
							{#if error.table_name}
								<div>
									<span class="text-muted-foreground">Table:</span>
									<p class="text-foreground font-mono">
										{error.table_name}
									</p>
								</div>
							{/if}
							{#if error.record_id}
								<div>
									<span class="text-muted-foreground">Record:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{error.record_id}
									</p>
								</div>
							{/if}
							{#if displayProjectId}
								<div>
									<span class="text-muted-foreground">Project:</span>
									{#if projectHref}
										<a
											href={projectHref}
											class="inline-flex max-w-full items-center gap-1 text-foreground hover:text-accent transition-colors"
										>
											<span class="truncate"
												>{getProjectLabel(error, displayProjectId)}</span
											>
											<ArrowUpRight class="h-3 w-3 shrink-0" />
										</a>
										<p
											class="font-mono text-[0.65rem] text-muted-foreground truncate"
										>
											{displayProjectId}
										</p>
									{:else}
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
											{formatMetadataValue(displayProjectId)}
										</p>
									{/if}
								</div>
							{/if}
							{#if error.brain_dump_id}
								<div>
									<span class="text-muted-foreground">Brain Dump:</span>
									<p class="text-foreground font-mono text-[0.65rem] truncate">
										{error.brain_dump_id}
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if error.llm_provider}
					<div class="bg-success/5 border border-success/20 rounded-lg p-3">
						<p class="text-[0.65rem] uppercase tracking-wider text-success mb-2">
							LLM Details
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
							<div>
								<span class="text-muted-foreground">Provider:</span>
								<p class="text-foreground font-medium">
									{error.llm_provider}
								</p>
							</div>
							<div>
								<span class="text-muted-foreground">Model:</span>
								<p class="text-foreground">
									{error.llm_model}
								</p>
							</div>
							{#if error.total_tokens}
								<div>
									<span class="text-muted-foreground">Tokens:</span>
									<p class="text-foreground tabular-nums">
										{(error.total_tokens ?? 0).toLocaleString()}
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if error.environment || error.app_version || error.browser_info}
					<div class="bg-muted/40 border border-border rounded-lg p-3">
						<p
							class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
						>
							Runtime
						</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							{#if error.environment}
								<div>
									<span class="text-muted-foreground">Environment:</span>
									<p class="text-foreground">{error.environment}</p>
								</div>
							{/if}
							{#if error.app_version}
								<div>
									<span class="text-muted-foreground">App Version:</span>
									<p class="text-foreground font-mono text-[0.65rem]">
										{error.app_version}
									</p>
								</div>
							{/if}
						</div>
						{#if error.browser_info}
							<div class="mt-2">
								<span class="text-muted-foreground text-xs">Browser Info:</span>
								<pre
									class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-32 leading-relaxed">{formatJson(
										error.browser_info
									)}</pre>
							</div>
						{/if}
					</div>
				{/if}

				{#if error.resolved}
					<div class="bg-success/10 border border-success/30 rounded-lg p-3">
						<div class="flex items-center gap-2 mb-2">
							<CircleCheck class="w-4 h-4 text-success" />
							<p class="text-xs font-semibold text-success">Resolved</p>
						</div>
						<div class="space-y-1 text-xs">
							<p class="text-muted-foreground">
								{formatFullDate(error.resolved_at)}
							</p>
							{#if error.resolution_notes}
								<p class="text-foreground italic">
									"{error.resolution_notes}"
								</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
	{#snippet footer()}
		{#if error}
			<div
				class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3"
			>
				{#if onResolve && !error.resolved && error.id}
					<Button
						onclick={() => onResolve(error.id!)}
						variant="primary"
						size="sm"
						icon={Check}
					>
						Resolve
					</Button>
				{/if}
				<Button onclick={closeModal} variant="outline" size="sm">Close</Button>
			</div>
		{/if}
	{/snippet}
</Modal>
