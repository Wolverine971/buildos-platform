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

<!-- ✅ Ultra-tight 4px grid: space-y-1.5 (6px), px-2 py-2 (8px) -->
<div
	bind:this={container}
	onscroll={onScroll}
	class="agent-chat-scroll flex-1 min-h-0 space-y-1.5 overflow-y-auto bg-slate-50/70 px-2 py-2 dark:bg-slate-900/40 sm:px-3 sm:py-3"
>
	{#if messages.length === 0}
		<!-- ✅ Compact empty state: px-3 py-2.5, space-y-1.5, rounded-xl -->
		<div
			class="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 dark:border-slate-800 sm:px-4 sm:py-3"
		>
			<div class="space-y-1.5">
				<!-- ✅ Compact heading: text-sm -->
				<p class="font-semibold text-slate-900 dark:text-white text-sm leading-tight">
					You're set to chat.
				</p>
				<!-- ✅ Compact description: text-xs, leading-snug -->
				<p class="text-xs leading-snug text-slate-600 dark:text-slate-300">
					Ask BuildOS to plan, explain, or take the next step for
					{displayContextLabel.toLowerCase()}.
				</p>
				<!-- ✅ Compact list: space-y-1, text-xs -->
				<ul class="space-y-1 text-xs text-slate-500 dark:text-slate-400">
					<li class="flex items-start gap-1.5">
						<span class="mt-0.5 text-slate-400 dark:text-slate-500">•</span>
						<span>Summarize where this stands</span>
					</li>
					<li class="flex items-start gap-1.5">
						<span class="mt-0.5 text-slate-400 dark:text-slate-500">•</span>
						<span>Draft the next update</span>
					</li>
					<li class="flex items-start gap-1.5">
						<span class="mt-0.5 text-slate-400 dark:text-slate-500">•</span>
						<span>What should we do next?</span>
					</li>
				</ul>
			</div>
		</div>
	{:else}
		{#each messages as message (message.id)}
			{#if message.type === 'user'}
				<!-- ✅ User message: max-w-[88%], rounded-xl, px-2.5 py-2, text-xs -->
				<div class="flex justify-end">
					<div
						class="max-w-[88%] rounded-xl border border-blue-200/50 bg-white px-2.5 py-2 text-xs text-blue-700 shadow-sm dark:border-blue-500/40 dark:bg-slate-800/70 dark:text-blue-300 sm:max-w-[85%] sm:px-3 sm:py-2.5"
					>
						<div class="whitespace-pre-wrap break-words leading-snug">
							{message.content}
						</div>
						<!-- ✅ Compact timestamp: mt-1, text-[11px] -->
						<div class="mt-1 text-[11px] text-blue-600/60 dark:text-blue-400/60">
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'assistant'}
				<!-- ✅ Assistant message: gap-1.5, h-7 w-7 avatar, px-2.5 py-2, text-xs -->
				<div class="flex gap-1.5 sm:gap-2">
					<!-- ✅ Compact avatar: h-7 w-7 (28px) → h-8 w-8 (32px) on desktop -->
					<div
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:h-8 sm:w-8 sm:text-xs"
					>
						OS
					</div>
					<div
						class="agent-resp-div max-w-[88%] rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs leading-snug text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 sm:max-w-[85%] sm:px-3 sm:py-2.5"
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
						<!-- ✅ Compact timestamp: mt-1, text-[11px] -->
						<div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
							{formatTime(message.timestamp)}
						</div>
					</div>
				</div>
			{:else if message.type === 'agent_peer'}
				<!-- ✅ Agent peer message: gap-1.5, h-7 w-7 avatar, px-2.5 py-2, text-xs -->
				<div class="flex gap-1.5 sm:gap-2">
					<div
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white text-[10px] font-semibold uppercase text-indigo-600 dark:border-indigo-500/50 dark:bg-slate-800 dark:text-indigo-300 sm:h-8 sm:w-8"
					>
						AI↔
					</div>
					<div
						class="max-w-[88%] rounded-xl border border-indigo-200 bg-indigo-50/70 px-2.5 py-2 text-xs leading-snug text-slate-900 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/5 dark:text-slate-100 sm:max-w-[85%] sm:px-3 sm:py-2.5"
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
						<!-- ✅ Compact timestamp: mt-1, text-[11px] -->
						<div class="mt-1 text-[11px] text-indigo-700/70 dark:text-indigo-200/80">
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
				<!-- ✅ Clarification message: gap-1.5, h-7 w-7 avatar, px-2.5 py-2.5, text-xs -->
				<div class="flex gap-1.5 sm:gap-2">
					<div
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-[10px] font-semibold uppercase text-blue-600 dark:border-blue-500/40 dark:bg-slate-800 dark:text-blue-300 sm:h-8 sm:w-8 sm:text-xs"
					>
						AI
					</div>
					<div
						class="max-w-[90%] rounded-xl border border-blue-200 bg-blue-50/80 px-2.5 py-2.5 text-xs leading-snug text-slate-900 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/5 dark:text-slate-100 sm:max-w-[88%] sm:px-3 sm:py-3"
					>
						<!-- ✅ Compact heading: text-xs font-semibold -->
						<p
							class="text-xs font-semibold text-slate-900 dark:text-white leading-tight"
						>
							{message.content}
						</p>

						{#if message.data?.questions?.length}
							<!-- ✅ Compact questions: mt-2, space-y-1.5, text-xs -->
							<ol class="mt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
								{#each message.data.questions as question, i}
									<li class="flex gap-1.5 font-medium leading-snug sm:gap-2">
										<!-- ✅ Compact number badge: h-5 w-5, text-[10px] -->
										<span
											class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-blue-600 shadow dark:bg-slate-900 dark:text-blue-300"
										>
											{i + 1}
										</span>
										<span class="min-w-0 flex-1">{question}</span>
									</li>
								{/each}
							</ol>
						{/if}

						<!-- ✅ Compact hint: mt-2, text-[11px] -->
						<p
							class="mt-2 text-[11px] text-slate-600 dark:text-slate-400 leading-tight"
						>
							Share the answers in your next message so I can keep going.
						</p>
						<div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
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
