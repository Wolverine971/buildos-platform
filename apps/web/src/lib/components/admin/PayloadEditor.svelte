<!-- apps/web/src/lib/components/admin/PayloadEditor.svelte -->
<script lang="ts">
	import { Code, FileText, AlertCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		payload?: Record<string, any>;
		mode?: 'form' | 'json';
		onPayloadChange?: (payload: Record<string, any>) => void;
	}

	let {
		payload = $bindable({}),
		mode = $bindable('form' as 'form' | 'json'),
		onPayloadChange
	}: Props = $props();

	let jsonString = $state(JSON.stringify(payload, null, 2));
	let jsonError = $state<string | null>(null);

	// Sync JSON string when payload changes externally (like from event type change)
	$effect(() => {
		if (mode === 'form') {
			jsonString = JSON.stringify(payload, null, 2);
		}
	});

	function toggleMode() {
		if (mode === 'form') {
			// Switching to JSON mode - update JSON string from payload
			jsonString = JSON.stringify(payload, null, 2);
			jsonError = null;
			mode = 'json';
		} else {
			// Switching to form mode - parse JSON and update payload
			try {
				const parsed = JSON.parse(jsonString);
				payload = parsed;
				jsonError = null;
				mode = 'form';
				if (onPayloadChange) {
					onPayloadChange(parsed);
				}
			} catch (err) {
				jsonError = err instanceof Error ? err.message : 'Invalid JSON';
			}
		}
	}

	function handleJsonChange(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		jsonString = target.value;

		// Try to parse and validate
		try {
			const parsed = JSON.parse(jsonString);
			jsonError = null;
			// Update payload in real-time if valid
			payload = parsed;
			if (onPayloadChange) {
				onPayloadChange(parsed);
			}
		} catch (err) {
			jsonError = err instanceof Error ? err.message : 'Invalid JSON';
		}
	}

	function formatJson() {
		try {
			const parsed = JSON.parse(jsonString);
			jsonString = JSON.stringify(parsed, null, 2);
			jsonError = null;
		} catch (err) {
			jsonError = err instanceof Error ? err.message : 'Invalid JSON - cannot format';
		}
	}

	function handleFormFieldChange(key: string, value: any) {
		payload = { ...payload, [key]: value };
		if (onPayloadChange) {
			onPayloadChange(payload);
		}
	}

	function getFieldType(value: any): 'text' | 'number' | 'date' | 'textarea' {
		if (typeof value === 'number') return 'number';
		if (typeof value === 'string') {
			// Check if it looks like a date
			if (value.match(/^\d{4}-\d{2}-\d{2}/)) return 'date';
			// Check if it's long text
			if (value.length > 100) return 'textarea';
		}
		return 'text';
	}

	function formatFieldLabel(key: string): string {
		return key
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function getFieldValue(value: any): string {
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function parseFieldValue(value: string, originalType: any): any {
		// Try to preserve the original type
		if (typeof originalType === 'number') {
			const num = parseFloat(value);
			return isNaN(num) ? value : num;
		}
		if (typeof originalType === 'boolean') {
			return value === 'true' || value === '1';
		}
		return value;
	}
</script>

<div class="space-y-4">
	<!-- Mode Toggle -->
	<div class="flex items-center justify-between">
		<div class="flex items-center space-x-2">
			{#if mode === 'form'}
				<FileText class="w-5 h-5 text-blue-600 dark:text-blue-400" />
				<span class="text-sm font-medium text-foreground">Form Mode</span>
			{:else}
				<Code class="w-5 h-5 text-purple-600 dark:text-purple-400" />
				<span class="text-sm font-medium text-foreground">JSON Mode</span>
			{/if}
		</div>
		<Button variant="outline" size="sm" onclick={toggleMode}>
			{#if mode === 'form'}
				<Code class="w-4 h-4 mr-2" />
				Switch to JSON
			{:else}
				<FileText class="w-4 h-4 mr-2" />
				Switch to Form
			{/if}
		</Button>
	</div>

	<!-- Form Mode -->
	{#if mode === 'form'}
		<div class="space-y-4">
			{#if Object.keys(payload).length === 0}
				<p class="text-sm text-muted-foreground text-center py-4">
					No payload fields. Select an event type to load sample data.
				</p>
			{:else}
				{#each Object.keys(payload) as key}
					{@const fieldType = getFieldType(payload[key])}
					<div>
						<label for={key} class="block text-sm font-medium text-foreground mb-1">
							{formatFieldLabel(key)}
						</label>
						{#if fieldType === 'textarea'}
							<textarea
								id={key}
								value={getFieldValue(payload[key])}
								oninput={(e) => handleFormFieldChange(key, e.currentTarget.value)}
								rows="3"
								class="w-full px-3 py-2 border border-border rounded-lg
									   bg-card text-foreground
									   focus:ring-2 focus:ring-blue-500 focus:border-transparent
									   resize-y"
							/>
						{:else}
							<input
								id={key}
								type={fieldType}
								value={getFieldValue(payload[key])}
								oninput={(e) =>
									handleFormFieldChange(
										key,
										parseFieldValue(e.currentTarget.value, payload[key])
									)}
								class="w-full px-3 py-2 border border-border rounded-lg
									   bg-card text-foreground
									   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	{/if}

	<!-- JSON Mode -->
	{#if mode === 'json'}
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted-foreground"> Edit raw JSON payload </span>
				<Button variant="ghost" size="sm" onclick={formatJson} class="text-xs">
					Format JSON
				</Button>
			</div>
			<textarea
				bind:value={jsonString}
				oninput={handleJsonChange}
				rows="12"
				class="w-full px-3 py-2 border border-border rounded-lg
					   bg-card text-foreground
					   font-mono text-xs
					   focus:ring-2 focus:ring-blue-500 focus:border-transparent
					   resize-y"
				placeholder=""
			/>
			{#if jsonError}
				<div
					class="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
				>
					<AlertCircle
						class="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
					/>
					<div class="flex-1">
						<p class="text-sm font-medium text-red-800 dark:text-red-200">
							Invalid JSON
						</p>
						<p class="text-xs text-red-600 dark:text-red-400 mt-1">{jsonError}</p>
					</div>
				</div>
			{/if}
			<div class="text-xs text-muted-foreground">
				{jsonString.length} characters
			</div>
		</div>
	{/if}
</div>
