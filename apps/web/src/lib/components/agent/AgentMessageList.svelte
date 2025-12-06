<!-- apps/web/src/lib/components/agent/AgentMessageList.svelte -->
<script lang="ts">
	import ThinkingBlock from './ThinkingBlock.svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import type { UIMessage, ThinkingBlockMessage } from './agent-chat.types';
	import { shouldRenderAsMarkdown, formatTime } from './agent-chat-formatters';
	import { dev } from '$app/environment';

	// ✅ Svelte 5: Use $bindable() for two-way binding
	interface Props {
		messages: UIMessage[];
		onToggleThinkingBlock: (blockId: string) => void;
		onScroll: () => void;
		displayContextLabel: string;
		container?: HTMLElement;
	}

	let {
		messages,
		onToggleThinkingBlock,
		onScroll,
		displayContextLabel,
		container = $bindable()
	}: Props = $props();

	const proseClasses = getProseClasses('sm');
</script>

<!-- ✅ Industrial message container with proper light/dark dithered background -->
<div
	bind:this={container}
	onscroll={onScroll}
	class="agent-chat-scroll flex-1 min-h-0 space-y-2 overflow-y-auto bg-gray-50 px-3 py-3 dark:bg-slate-900/50 sm:px-4 sm:py-4"
>
	{#if messages.length === 0}
		<!-- ✅ Industrial empty state card with proper light/dark mode -->
		<div
			class="card-industrial rounded-sm border-2 border-dashed border-slate-300 bg-white px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50 sm:px-5 sm:py-4"
		>
			<div class="space-y-2">
				<!-- ✅ Industrial heading -->
				<p
					class="font-bold uppercase tracking-wider text-slate-900 dark:text-white text-sm"
				>
					Ready to Operate
				</p>
				<!-- ✅ Industrial description -->
				<p class="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
					Ask BuildOS to plan, explain, or take the next step for
					{displayContextLabel.toLowerCase()}.
				</p>
				<!-- ✅ Industrial task list -->
				<ul class="space-y-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
					<li class="flex items-start gap-2">
						<span class="mt-0.5 text-accent-olive">▸</span>
						<span>Summarize where this stands</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="mt-0.5 text-accent-olive">▸</span>
						<span>Draft the next update</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="mt-0.5 text-accent-olive">▸</span>
						<span>What should we do next?</span>
					</li>
				</ul>
			</div>
		</div>
	{:else}
		{#each messages as message (message.id)}
			{#if message.type === 'user'}
				<!-- ✅ Industrial user message with proper light/dark contrast -->
				<div class="flex justify-end">
					<div
						class="max-w-[88%] rounded-sm border-2 border-blue-400 bg-blue-50 px-3 py-2.5 text-xs font-medium text-slate-900 shadow-sm dark:border-blue-600 dark:bg-blue-900/20 dark:text-slate-100 sm:max-w-[85%] sm:px-4 sm:py-3"
					>
						<div class="whitespace-pre-wrap break-words leading-relaxed">
							{message.content}
						</div>
						<!-- ✅ Industrial timestamp with proper contrast -->
						<div
							class="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'assistant'}
				<!-- ✅ Industrial assistant message with proper light/dark contrast -->
				<div class="flex gap-2 sm:gap-3">
					<!-- ✅ Industrial avatar with better contrast -->
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-2 border-slate-400 bg-slate-700 text-[10px] font-bold uppercase text-white dark:border-slate-500 dark:bg-slate-600 sm:h-9 sm:w-9 sm:text-xs"
					>
						OS
					</div>
					<div
						class="agent-resp-div clarity-zone max-w-[88%] rounded-sm border-2 border-slate-300 bg-white px-3 py-2.5 text-xs font-medium leading-relaxed text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[85%] sm:px-4 sm:py-3"
					>
						{#if shouldRenderAsMarkdown(message.content)}
							<div class={proseClasses}>
								{@html renderMarkdown(message.content)}
							</div>
						{:else}
							<div class="whitespace-pre-wrap break-words">
								{message.content}
							</div>
						{/if}
						<!-- ✅ Industrial timestamp -->
						<div
							class="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'agent_peer'}
				<!-- ✅ Industrial agent peer message with proper light/dark contrast -->
				<div class="flex gap-2 sm:gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-2 border-orange-400 bg-orange-100 text-[10px] font-bold uppercase text-orange-700 dark:border-orange-600 dark:bg-orange-900/30 dark:text-orange-400 sm:h-9 sm:w-9 sm:text-xs"
					>
						AI↔
					</div>
					<div
						class="max-w-[88%] rounded-sm border-2 border-orange-300 bg-orange-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-slate-900 shadow-sm dark:border-orange-700 dark:bg-orange-900/10 dark:text-slate-100 sm:max-w-[85%] sm:px-4 sm:py-3"
					>
						{#if shouldRenderAsMarkdown(message.content)}
							<div class={proseClasses}>
								{@html renderMarkdown(message.content)}
							</div>
						{:else}
							<div class="whitespace-pre-wrap break-words">
								{message.content}
							</div>
						{/if}
						<!-- ✅ Industrial timestamp with proper contrast -->
						<div
							class="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'thinking_block'}
				<ThinkingBlock
					block={message as ThinkingBlockMessage}
					onToggleCollapse={onToggleThinkingBlock}
				/>
			{:else if message.type === 'clarification'}
				<!-- ✅ Industrial clarification message with proper light/dark contrast -->
				<div class="flex gap-2 sm:gap-3">
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-2 border-green-500 bg-green-100 text-[10px] font-bold uppercase text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-400 sm:h-9 sm:w-9 sm:text-xs"
					>
						AI
					</div>
					<div
						class="max-w-[90%] rounded-sm border-2 border-green-300 bg-green-50 px-3 py-3 text-xs font-medium leading-relaxed text-slate-900 shadow-sm dark:border-green-700 dark:bg-green-900/10 dark:text-slate-100 sm:max-w-[88%] sm:px-4 sm:py-3.5"
					>
						<!-- ✅ Industrial heading -->
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white"
						>
							{message.content}
						</p>

						{#if message.data?.questions?.length}
							<!-- ✅ Industrial questions list -->
							<ol class="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
								{#each message.data.questions as question, i}
									<li class="flex gap-2 font-medium leading-relaxed sm:gap-2.5">
										<!-- ✅ Industrial number badge -->
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-slate-900 text-[10px] font-bold text-surface-scratch shadow dark:bg-slate-700"
										>
											{i + 1}
										</span>
										<span class="min-w-0 flex-1">{question}</span>
									</li>
								{/each}
							</ol>
						{/if}

						<!-- ✅ Industrial hint -->
						<p
							class="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Share the answers in your next message to continue
						</p>
						<div
							class="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400"
						>
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'plan'}
				{#if dev}
					<div
						class="rounded-md bg-amber-100 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
					>
						⚠️ Dev Warning: Legacy plan message
					</div>
				{/if}
				<!-- ✅ Legacy plan: gap-1.5, compact padding -->
				<div class="flex gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
					<div
						class="w-12 shrink-0 pt-[2px] text-[10px] font-mono text-slate-400 dark:text-slate-500"
					>
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[75%] rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-[11px] leading-snug text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
					>
						<p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
							Plan
						</p>
						<p class="mt-0.5 text-slate-800 dark:text-slate-50">
							{message.content}
						</p>
						{#if message.data?.steps}
							<ol
								class="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300"
							>
								{#each message.data.steps as step}
									<li class="flex gap-1.5 leading-tight">
										<span class="w-3 text-right font-semibold text-slate-400">
											{step.stepNumber}.
										</span>
										<span class="flex-1">
											{step.description}
										</span>
									</li>
								{/each}
							</ol>
						{/if}
					</div>
				</div>
			{:else if message.type === 'activity'}
				{#if dev}
					<div
						class="rounded-md bg-amber-100 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
					>
						⚠️ Dev Warning: Legacy activity message
					</div>
				{/if}
				<!-- ✅ Legacy activity: gap-1.5, compact padding -->
				<div class="flex gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
					<div
						class="w-12 shrink-0 pt-[2px] font-mono text-slate-400 dark:text-slate-500"
					>
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[65%] rounded-md border border-slate-200/70 bg-slate-50/70 px-2 py-1 text-[11px] font-medium italic leading-tight text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
					>
						<p class="leading-snug">{message.content}</p>
					</div>
				</div>
			{:else}
				<!-- ✅ Default message: gap-1.5, compact padding -->
				<div class="flex gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
					<div
						class="w-12 shrink-0 pt-[2px] font-mono text-slate-400 dark:text-slate-500"
					>
						{formatTime(message.timestamp)}
					</div>
					<div
						class="max-w-[65%] rounded-md border border-slate-200/70 bg-slate-50/70 px-2 py-1 text-[11px] font-medium italic leading-tight text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
					>
						<p class="leading-snug">{message.content}</p>
					</div>
				</div>
			{/if}
		{/each}
	{/if}
</div>
