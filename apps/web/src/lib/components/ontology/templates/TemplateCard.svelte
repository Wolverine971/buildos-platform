<!-- apps/web/src/lib/components/ontology/templates/TemplateCard.svelte -->
<script lang="ts">
	/**
	 * TemplateCard component
	 * Displays an ontology template with scope badge, metadata, and actions
	 * Uses BuildOS Card component system for consistency
	 */

	import type { Template } from '$lib/types/onto';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';

	interface Props {
		template: Template;
		onViewDetails?: () => void;
		onCreateProject?: () => void;
		showRealmBadge?: boolean; // Show realm instead of scope badge
	}

	let { template, onViewDetails, onCreateProject, showRealmBadge = false }: Props = $props();

	// Scope color mapping
	const scopeColors = {
		project: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
		plan: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
		task: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
		output: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
		document: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
		goal: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
		requirement: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
		risk: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
		milestone: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
		metric: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
	};

	// Realm color mapping
	const realmColors = {
		creative: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
		technical: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
		business: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
		service: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
		education: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
		personal: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
		other: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
	};

	const badgeColorClass = $derived(
		showRealmBadge
			? realmColors[template.metadata?.realm as keyof typeof realmColors] || realmColors.other
			: scopeColors[template.scope as keyof typeof scopeColors] || scopeColors.project
	);

	const badgeText = $derived(
		showRealmBadge ? template.metadata?.realm || 'other' : template.scope
	);

	const canCreateProject = $derived(template.scope === 'project' && !template.is_abstract);

	function handleViewDetails() {
		onViewDetails?.();
	}

	function handleCreateProject() {
		onCreateProject?.();
	}
</script>

<!-- Using Card component system for consistency -->
<Card
	variant="elevated"
	padding="none"
	class="group transition-all duration-300 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg dark:hover:shadow-blue-900/20 hover:-translate-y-1"
>
	<CardBody padding="md">
		<!-- Card Header -->
		<div class="flex items-start justify-between gap-4 mb-4">
			<div class="flex-1 min-w-0">
				<h3
					class="text-lg font-semibold text-gray-900 dark:text-white mb-1 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors"
				>
					{template.name}
				</h3>
				<p class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
					{template.type_key}
				</p>
			</div>

			<!-- Scope/Realm Badge -->
			<span
				class="px-2.5 py-1 rounded-md text-xs font-medium capitalize whitespace-nowrap flex-shrink-0 {badgeColorClass}"
			>
				{badgeText}
			</span>
		</div>

		<!-- Description -->
		{#if template.metadata?.description}
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 leading-relaxed">
				{template.metadata.description}
			</p>
		{/if}

		<!-- Metadata Badges -->
		<div class="flex flex-wrap gap-2 mb-4">
			{#if !showRealmBadge && template.metadata?.realm}
				<span
					class="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize"
				>
					{template.metadata.realm}
				</span>
			{/if}
			{#if template.metadata?.output_type}
				<span
					class="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize"
				>
					{template.metadata.output_type}
				</span>
			{/if}
			{#if template.metadata?.typical_scale}
				<span
					class="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize"
				>
					{template.metadata.typical_scale}
				</span>
			{/if}
		</div>

		<!-- FSM Info (if available) -->
		{#if template.fsm}
			<div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
				<span class="flex items-center gap-1">
					<svg
						class="w-3.5 h-3.5"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
					</svg>
					{template.fsm.states?.length || 0} states
				</span>
				<span class="flex items-center gap-1">
					<svg
						class="w-3.5 h-3.5"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 5l7 7-7 7M5 5l7 7-7 7"
						/>
					</svg>
					{template.fsm.transitions?.length || 0} transitions
				</span>
			</div>
		{/if}

		<!-- Abstract Template Warning -->
		{#if template.is_abstract}
			<div
				class="mb-4 px-3 py-2 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-lg dither-subtle"
			>
				<p class="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
					<svg
						class="w-4 h-4 flex-shrink-0"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
					<span>Abstract template - used as a base for variants</span>
				</p>
			</div>
		{/if}
	</CardBody>

	<!-- Actions in CardFooter -->
	<CardFooter class="border-t border-gray-100 dark:border-gray-700">
		<div class="flex gap-2 w-full">
			<Button
				variant="outline"
				size="sm"
				onclick={handleViewDetails}
				class="flex-1"
				aria-label="View template details"
			>
				View Details
			</Button>

			{#if canCreateProject}
				<Button
					variant="primary"
					size="sm"
					onclick={handleCreateProject}
					class="flex-1"
					aria-label="Create project from template"
				>
					Create →
				</Button>
			{/if}
		</div>
	</CardFooter>
</Card>
