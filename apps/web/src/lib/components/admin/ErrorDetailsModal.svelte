<!-- apps/web/src/lib/components/admin/ErrorDetailsModal.svelte -->
<script lang="ts">
	import { ArrowUpRight, Check, CircleCheck, TriangleAlert, X } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
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
					badge: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
					dot: 'bg-red-500'
				};
			case 'error':
				return {
					badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30',
					dot: 'bg-orange-500'
				};
			case 'warning':
				return {
					badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
					dot: 'bg-amber-500'
				};
			case 'info':
				return {
					badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
					dot: 'bg-blue-500'
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

{#if isOpen && error}
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
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 bg-black/60 flex items-center justify-center p-3 z-50"
		onclick={closeModal}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="bg-card border border-border rounded-lg shadow-ink-strong max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col tx tx-frame tx-weak"
			onclick={(event) => event.stopPropagation()}
		>
			<div
				class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30"
			>
				<div class="flex items-center gap-2">
					<TriangleAlert class="w-5 h-5 text-accent" />
					<h2 class="text-base font-semibold text-foreground">Error Details</h2>
				</div>
				<button
					onclick={closeModal}
					class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors pressable"
					aria-label="Close modal"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<div class="flex-1 overflow-y-auto px-4 py-3">
				<div class="space-y-3">
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-0.5">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
							>
								Error ID
							</p>
							<p class="text-xs text-foreground font-mono truncate">{error.id}</p>
						</div>
						<div class="space-y-0.5">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
							>
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
								class="bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1 rounded text-xs font-mono border border-red-500/20"
							>
								{error.error_code}
							</span>
						{/if}
					</div>

					{#if error.user || error.user_id}
						<div class="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2"
							>
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
								<div class="mt-3 pt-3 border-t border-blue-500/20">
									<a
										href={userAdminHref}
										class="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-background px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-500/10 dark:text-blue-300"
									>
										<span>Open in Users</span>
										<ArrowUpRight class="w-3.5 h-3.5" />
									</a>
								</div>
							{/if}
						</div>
					{/if}

					{#if error.endpoint || error.http_method}
						<div class="bg-muted/50 border border-border rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2"
							>
								Request Context
							</p>
							<div class="grid grid-cols-2 gap-2 text-xs">
								{#if error.endpoint}
									<div class="col-span-2">
										<span class="text-muted-foreground">Endpoint:</span>
										<p class="text-foreground font-mono text-[0.65rem]">
											{error.endpoint}
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
								{#if error.ip_address}
									<div>
										<span class="text-muted-foreground">IP:</span>
										<p class="text-foreground font-mono">
											{error.ip_address}
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
						<div
							class="bg-background border border-border rounded-lg p-3 shadow-ink-inner"
						>
							<p
								class="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed"
							>
								{error.error_message}
							</p>
						</div>
					</div>

					{#if isToolExecution}
						<div class="bg-sky-500/5 border border-sky-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2"
							>
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
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
											{formatMetadataValue(toolCallId)}
										</p>
									</div>
								{/if}
								{#if toolSessionId}
									<div>
										<span class="text-muted-foreground">Session ID:</span>
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
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
										<p
											class="text-foreground font-mono text-[0.65rem] truncate"
										>
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
							<p
								class="text-[0.65rem] uppercase tracking-wider text-muted-foreground"
							>
								Stack Trace
							</p>
							<pre
								class="bg-background border border-border rounded-lg p-3 shadow-ink-inner text-[0.65rem] overflow-x-auto text-foreground/80 max-h-40 leading-relaxed">{error.error_stack}</pre>
						</div>
					{/if}

					{#if !isToolExecution && (error.operation_type || error.table_name)}
						<div class="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2"
							>
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
							</div>
						</div>
					{/if}

					{#if error.llm_provider}
						<div class="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
							<p
								class="text-[0.65rem] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2"
							>
								LLM Details
							</p>
							<div class="grid grid-cols-3 gap-2 text-xs">
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

					{#if error.resolved}
						<div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
							<div class="flex items-center gap-2 mb-2">
								<CircleCheck class="w-4 h-4 text-emerald-500" />
								<p
									class="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
								>
									Resolved
								</p>
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

			<div
				class="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2"
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
		</div>
	</div>
{/if}
