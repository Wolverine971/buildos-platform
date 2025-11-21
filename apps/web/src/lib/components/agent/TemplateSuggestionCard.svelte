<!-- apps/web/src/lib/components/agent/TemplateSuggestionCard.svelte -->
<script lang="ts">
	import { Sparkles, Package, GitBranch, Zap, CheckCircle } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	interface TemplateSuggestion {
		type_key: string;
		name: string;
		description: string;
		match_score: number;
		rationale: string;
		properties: string[];
		workflow_states: string[];
		benefits?: string[];
		isNew?: boolean;
	}

	interface Props {
		suggestion: TemplateSuggestion;
		onConfirm?: () => void;
		onReject?: () => void;
		showActions?: boolean;
	}

	let { suggestion, onConfirm, onReject, showActions = false }: Props = $props();

	const matchColor = $derived(
		suggestion.match_score >= 90
			? 'text-green-600 dark:text-green-400'
			: suggestion.match_score >= 70
				? 'text-amber-600 dark:text-amber-400'
				: 'text-purple-600 dark:text-purple-400'
	);

	const matchLabel = $derived(
		suggestion.match_score >= 90
			? 'Excellent Match'
			: suggestion.match_score >= 70
				? 'Good Match'
				: 'Custom Template Suggested'
	);
</script>

<Card variant="elevated" class="template-suggestion-card">
	<CardHeader variant="gradient" class="py-2">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				{#if suggestion.isNew}
					<Sparkles class="h-4 w-4 text-purple-600 dark:text-purple-400" />
					<span class="text-sm font-semibold text-purple-700 dark:text-purple-300">
						New Template Suggestion
					</span>
				{:else}
					<Package class="h-4 w-4 text-blue-600 dark:text-blue-400" />
					<span class="text-sm font-semibold text-blue-700 dark:text-blue-300">
						Template Match Found
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-1.5">
				<span class="text-xs font-medium {matchColor}">
					{suggestion.match_score}% {matchLabel}
				</span>
			</div>
		</div>
	</CardHeader>

	<CardBody padding="sm">
		<!-- Template Info -->
		<div class="space-y-3">
			<!-- Name and Type Key -->
			<div>
				<h3 class="text-sm font-semibold text-slate-900 dark:text-white">
					{suggestion.name}
				</h3>
				<code class="text-xs text-slate-600 dark:text-slate-400 font-mono">
					{suggestion.type_key}
				</code>
			</div>

			<!-- Description -->
			<p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
				{suggestion.description}
			</p>

			<!-- Rationale (if new template) -->
			{#if suggestion.isNew && suggestion.rationale}
				<div
					class="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-2 border border-purple-200 dark:border-purple-800"
				>
					<div class="flex items-start gap-1.5">
						<Sparkles
							class="h-3 w-3 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0"
						/>
						<p class="text-xs text-purple-700 dark:text-purple-300">
							<span class="font-medium">Why this template: </span>
							{suggestion.rationale}
						</p>
					</div>
				</div>
			{/if}

			<!-- Properties -->
			{#if suggestion.properties.length > 0}
				<div>
					<div class="flex items-center gap-1.5 mb-1.5">
						<GitBranch class="h-3 w-3 text-slate-500 dark:text-slate-400" />
						<span class="text-xs font-medium text-slate-700 dark:text-slate-300">
							Template Properties
						</span>
					</div>
					<div class="flex flex-wrap gap-1">
						{#each suggestion.properties as prop}
							<span
								class="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-700 dark:text-slate-300"
							>
								{prop}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Workflow States -->
			{#if suggestion.workflow_states.length > 0}
				<div>
					<div class="flex items-center gap-1.5 mb-1.5">
						<Zap class="h-3 w-3 text-slate-500 dark:text-slate-400" />
						<span class="text-xs font-medium text-slate-700 dark:text-slate-300">
							Workflow
						</span>
					</div>
					<div class="flex items-center gap-1 text-xs">
						{#each suggestion.workflow_states as state, i}
							<span class="text-slate-600 dark:text-slate-400">
								{state}
							</span>
							{#if i < suggestion.workflow_states.length - 1}
								<span class="text-slate-400 dark:text-slate-600">→</span>
							{/if}
						{/each}
					</div>
				</div>
			{/if}

			<!-- Benefits -->
			{#if suggestion.benefits && suggestion.benefits.length > 0}
				<div>
					<div class="flex items-center gap-1.5 mb-1.5">
						<CheckCircle class="h-3 w-3 text-green-600 dark:text-green-400" />
						<span class="text-xs font-medium text-slate-700 dark:text-slate-300">
							Benefits
						</span>
					</div>
					<ul class="space-y-0.5">
						{#each suggestion.benefits as benefit}
							<li class="flex items-start gap-1.5">
								<span class="text-green-600 dark:text-green-400 mt-0.5">•</span>
								<span class="text-xs text-slate-600 dark:text-slate-400">
									{benefit}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Actions -->
			{#if showActions}
				<div class="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
					<button
						onclick={onConfirm}
						class="flex-1 rounded-lg bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors"
					>
						Use This Template
					</button>
					<button
						onclick={onReject}
						class="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
					>
						Choose Different
					</button>
				</div>
			{/if}
		</div>
	</CardBody>
</Card>

<style>
	.template-suggestion-card {
		animation: slideInFromBottom 0.3s ease-out;
	}

	@keyframes slideInFromBottom {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
