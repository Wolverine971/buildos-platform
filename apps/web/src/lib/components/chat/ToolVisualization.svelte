<!-- apps/web/src/lib/components/chat/ToolVisualization.svelte -->
<!--
  ToolVisualization Component

  Displays tool calls and their results with visual indicators.
-->

<script lang="ts">
	import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
	import { Check, X, Wrench } from 'lucide-svelte';

	interface Props {
		toolCalls: ChatToolCall[];
		toolResults?: ChatToolResult[];
		isExecuting?: boolean;
	}

	let { toolCalls, toolResults = [], isExecuting = false }: Props = $props();

	// Map tool names to friendly labels
	function getToolLabel(name: string): string {
		const labels: Record<string, string> = {
			list_tasks: '📋 List Tasks',
			search_projects: '📁 Search Projects',
			search_notes: '📝 Search Notes',
			search_brain_dumps: '🧠 Search Brain Dumps',
			get_task_details: '✅ Task Details',
			get_project_details: '📁 Project Details',
			get_note_details: '📝 Note Details',
			get_brain_dump_details: '🧠 Brain Dump Details',
			create_task: '➕ Create Task',
			update_task: '✏️ Update Task',
			update_project_context: '📁 Update Project',
			create_note: '📝 Create Note',
			create_brain_dump: '🧠 Create Brain Dump',
			get_calendar_events: '📅 Calendar Events',
			find_available_slots: '🕐 Find Time Slots',
			schedule_task: '📅 Schedule Task',
			update_calendar_event: '📅 Update Event',
			delete_calendar_event: '🗑️ Delete Event'
		};

		return labels[name] || name;
	}

	// Get tool category for styling
	function getToolCategory(name: string): string {
		if (name.startsWith('list_') || name.startsWith('search_')) return 'list';
		if (name.startsWith('get_')) return 'detail';
		if (name.includes('calendar') || name.includes('schedule') || name.includes('slot'))
			return 'calendar';
		return 'action';
	}

	// Format tool arguments for display
	function formatArguments(args: string): string {
		try {
			const parsed = JSON.parse(args);
			// Show only key properties
			const keys = Object.keys(parsed).slice(0, 3);
			return keys.map((k) => `${k}: ${JSON.stringify(parsed[k])}`).join(', ');
		} catch {
			return args.substring(0, 100);
		}
	}
</script>

<div class="space-y-2">
	{#each toolCalls as toolCall, index}
		{@const result = toolResults.find((r) => r?.tool_call_id === toolCall.id)}
		{@const category = getToolCategory(toolCall.function.name)}

		<div
			class="rounded-lg border p-3 {category === 'list'
				? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
				: category === 'detail'
					? 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20'
					: category === 'calendar'
						? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
						: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'}"
		>
			<div class="flex items-start gap-3">
				<!-- Status indicator -->
				<div class="mt-0.5">
					{#if isExecuting && !result}
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent
              {category === 'list'
								? 'text-blue-500'
								: category === 'detail'
									? 'text-purple-500'
									: category === 'calendar'
										? 'text-green-500'
										: 'text-orange-500'}"
						></div>
					{:else if result?.success}
						<div
							class="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white"
						>
							<Check class="w-3 h-3" />
						</div>
					{:else if result && !result.success}
						<div
							class="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
						>
							<X class="w-3 h-3" />
						</div>
					{:else}
						<div
							class="flex h-5 w-5 items-center justify-center rounded-full
              {category === 'list'
								? 'bg-blue-200 text-blue-600 dark:bg-blue-800 dark:text-blue-400'
								: category === 'detail'
									? 'bg-purple-200 text-purple-600 dark:bg-purple-800 dark:text-purple-400'
									: category === 'calendar'
										? 'bg-green-200 text-green-600 dark:bg-green-800 dark:text-green-400'
										: 'bg-orange-200 text-orange-600 dark:bg-orange-800 dark:text-orange-400'}"
						>
							<Wrench class="w-3 h-3" />
						</div>
					{/if}
				</div>

				<!-- Tool information -->
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<span class="font-medium text-sm">
							{getToolLabel(toolCall.function.name)}
						</span>
						{#if result?.duration_ms}
							<span class="text-xs text-gray-500">
								{result.duration_ms}ms
							</span>
						{/if}
					</div>

					<!-- Arguments preview -->
					<div class="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
						{formatArguments(toolCall.function.arguments)}
					</div>

					<!-- Result preview -->
					{#if result}
						<div class="mt-2">
							{#if result.success}
								<div class="text-xs text-gray-700 dark:text-gray-300">
									{#if result.result?.message}
										<span class="text-green-600 dark:text-green-400">✓</span>
										{result.result.message}
									{:else}
										<span class="text-green-600 dark:text-green-400">✓</span>
										Tool executed successfully
									{/if}
								</div>
							{:else}
								<div class="text-xs text-red-600 dark:text-red-400">
									✗ {result.error || 'Tool execution failed'}
								</div>
								{#if result.requires_user_action}
									<div class="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
										⚠️ User action required
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/each}

	{#if isExecuting && toolCalls.length === 0}
		<div class="flex items-center gap-2 text-sm text-gray-500">
			<div
				class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
			></div>
			<span>Analyzing request...</span>
		</div>
	{/if}
</div>
