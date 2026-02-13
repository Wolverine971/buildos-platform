<!-- apps/web/src/lib/components/project/CoreDimensionsField.svelte -->
<script lang="ts">
	import { ChevronDown, ChevronRight, Sparkles } from 'lucide-svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';

	// Props using Svelte 5 $props() rune
	let {
		core_integrity_ideals = null,
		core_people_bonds = null,
		core_goals_momentum = null,
		core_meaning_identity = null,
		core_reality_understanding = null,
		core_trust_safeguards = null,
		core_opportunity_freedom = null,
		core_power_resources = null,
		core_harmony_integration = null,
		onUpdate
	}: {
		core_integrity_ideals?: string | null;
		core_people_bonds?: string | null;
		core_goals_momentum?: string | null;
		core_meaning_identity?: string | null;
		core_reality_understanding?: string | null;
		core_trust_safeguards?: string | null;
		core_opportunity_freedom?: string | null;
		core_power_resources?: string | null;
		core_harmony_integration?: string | null;
		onUpdate: (dimensionKey: string, value: string | null) => void;
	} = $props();

	// Expansion state using $state rune (Svelte 5)
	let expandedSection = $state<string | null>(null);

	// Toggle expansion
	function toggleSection(key: string) {
		expandedSection = expandedSection === key ? null : key;
	}

	// Core dimensions configuration (static metadata only)
	const dimensions = [
		{
			key: 'core_integrity_ideals',
			label: 'Integrity & Ideals',
			icon: '🎯',
			description: 'Goals, standards, quality bars, definitions of "done/right"',
			placeholder:
				'What are the success criteria? Quality standards? Non-negotiables for this project?'
		},
		{
			key: 'core_people_bonds',
			label: 'People & Bonds',
			icon: '👥',
			description: 'People, teams, roles, relationships, communication flows',
			placeholder: 'Who is involved? What are the key relationships and dynamics?'
		},
		{
			key: 'core_goals_momentum',
			label: 'Goals & Momentum',
			icon: '🚀',
			description: 'Milestones, deliverables, metrics, progress indicators',
			placeholder: 'What are the key milestones and delivery targets?'
		},
		{
			key: 'core_meaning_identity',
			label: 'Meaning & Identity',
			icon: '✨',
			description: 'Purpose, deeper meaning, value proposition, story',
			placeholder: 'Why does this project matter? What makes it unique?'
		},
		{
			key: 'core_reality_understanding',
			label: 'Reality & Understanding',
			icon: '📊',
			description: 'Current state, observations, environment, data',
			placeholder: 'What is the current situation? What data informs this project?'
		},
		{
			key: 'core_trust_safeguards',
			label: 'Trust & Safeguards',
			icon: '🛡️',
			description: 'Risks, uncertainties, contingencies, protection measures',
			placeholder: 'What are the risks? Mitigation strategies? Contingency plans?'
		},
		{
			key: 'core_opportunity_freedom',
			label: 'Opportunity & Freedom',
			icon: '💡',
			description: 'Options, experiments, creative paths, new possibilities',
			placeholder: 'What opportunities exist? Alternative approaches being considered?'
		},
		{
			key: 'core_power_resources',
			label: 'Power & Resources',
			icon: '⚡',
			description: 'Budget, tools, assets, authority, constraints',
			placeholder: 'What resources are available? Budget constraints? Tools being used?'
		},
		{
			key: 'core_harmony_integration',
			label: 'Harmony & Integration',
			icon: '🔄',
			description: 'Feedback loops, learning systems, integration points',
			placeholder: 'How does this integrate with other systems? Feedback mechanisms?'
		}
	];

	// Map dimension keys to their current values using $derived
	const dimensionValues = $derived({
		core_integrity_ideals,
		core_people_bonds,
		core_goals_momentum,
		core_meaning_identity,
		core_reality_understanding,
		core_trust_safeguards,
		core_opportunity_freedom,
		core_power_resources,
		core_harmony_integration
	});

	// Helper to get value for a dimension
	function getDimensionValue(key: string): string | null {
		return dimensionValues[key as keyof typeof dimensionValues] ?? null;
	}

	// Count populated dimensions
	const populatedCount = $derived(
		dimensions.filter((d) => {
			const value = getDimensionValue(d.key);
			return value && value.trim().length > 0;
		}).length
	);
</script>

<div class="space-y-3">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Sparkles class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
			<h3 class="text-sm font-semibold text-foreground">Core Project Dimensions</h3>
		</div>
		{#if populatedCount > 0}
			<span
				class="px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full"
			>
				{populatedCount}/9 populated
			</span>
		{/if}
	</div>

	<p class="text-xs text-muted-foreground">
		Strategic dimensions automatically extracted from brain dumps. Expand to view or edit each
		dimension.
	</p>

	<!-- Dimensions List -->
	<div class="space-y-2">
		{#each dimensions as dimension (dimension.key)}
			<div
				class="border border-border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-ink"
			>
				<!-- Dimension Header -->
				<button
					type="button"
					onclick={() => toggleSection(dimension.key)}
					class="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 hover:from-gray-100 hover:to-gray-200 dark:hover:from-gray-750 dark:hover:to-gray-850 transition-colors"
				>
					<div class="flex items-center gap-3 flex-1">
						<span class="text-lg">{dimension.icon}</span>
						<div class="text-left">
							<div
								class="font-medium text-sm text-foreground flex items-center gap-2"
							>
								{dimension.label}
								{#if getDimensionValue(dimension.key) && getDimensionValue(dimension.key).trim().length > 0}
									<span class="w-2 h-2 bg-green-500 rounded-full"></span>
								{/if}
							</div>
							<div class="text-xs text-muted-foreground">
								{dimension.description}
							</div>
						</div>
					</div>
					<div class="ml-2">
						{#if expandedSection === dimension.key}
							<ChevronDown class="w-5 h-5 text-muted-foreground" />
						{:else}
							<ChevronRight class="w-5 h-5 text-muted-foreground" />
						{/if}
					</div>
				</button>

				<!-- Expanded Content -->
				{#if expandedSection === dimension.key}
					<div class="px-4 py-3 bg-card/50 border-t border-border">
						<Textarea
							value={getDimensionValue(dimension.key) || ''}
							oninput={(e) => onUpdate(dimension.key, e.currentTarget.value || null)}
							placeholder={dimension.placeholder}
							rows={4}
							class="w-full text-sm bg-muted/50 border-border focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
						/>
						{#if getDimensionValue(dimension.key) && getDimensionValue(dimension.key).trim().length > 0}
							<div class="mt-2 text-xs text-muted-foreground">
								{getDimensionValue(dimension.key).length} characters
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Info Footer -->
	{#if populatedCount === 0}
		<div
			class="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
		>
			<p class="text-xs text-blue-800 dark:text-blue-200">
				💡 <strong>Tip:</strong> Core dimensions are automatically extracted when you process
				brain dumps. They provide structured insights into different aspects of your project.
			</p>
		</div>
	{/if}
</div>
