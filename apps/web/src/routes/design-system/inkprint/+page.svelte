<!-- apps/web/src/routes/design-system/inkprint/+page.svelte -->
<!-- Visual Reference for Inkprint Design System: Texture × Weight Matrix -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	// Texture definitions with semantic meanings
	const textures = [
		{ id: 'bloom', label: 'Bloom', meaning: 'Ideation, newness, creative expansion' },
		{ id: 'grain', label: 'Grain', meaning: 'Execution, steady progress, craftsmanship' },
		{ id: 'pulse', label: 'Pulse', meaning: 'Urgency, sprints, deadlines, momentum' },
		{ id: 'static', label: 'Static', meaning: 'Blockers, noise, overwhelm, risk' },
		{ id: 'thread', label: 'Thread', meaning: 'Relationships, collaboration, dependencies' },
		{ id: 'frame', label: 'Frame', meaning: 'Canon, structure, decisions, officialness' }
	] as const;

	// Weight definitions with semantic meanings
	const weights = [
		{ id: 'ghost', label: 'Ghost', meaning: 'Ephemeral, uncommitted, suggestion', duration: '100ms' },
		{ id: 'paper', label: 'Paper', meaning: 'Standard UI, working state (default)', duration: '150ms' },
		{ id: 'card', label: 'Card', meaning: 'Important, elevated, committed', duration: '200ms' },
		{ id: 'plate', label: 'Plate', meaning: 'System-critical, immutable', duration: '280ms' }
	] as const;

	// Recommended combinations from the semantic matrix
	const recommendedCombinations = [
		{ texture: 'bloom', weight: 'ghost', use: 'AI suggestion' },
		{ texture: 'bloom', weight: 'paper', use: 'New idea card' },
		{ texture: 'grain', weight: 'ghost', use: 'Draft task' },
		{ texture: 'grain', weight: 'paper', use: 'Active task' },
		{ texture: 'pulse', weight: 'paper', use: 'Upcoming deadline' },
		{ texture: 'pulse', weight: 'card', use: 'Urgent deadline' },
		{ texture: 'static', weight: 'ghost', use: 'Dismissible warning' },
		{ texture: 'static', weight: 'paper', use: 'Error notice' },
		{ texture: 'static', weight: 'card', use: 'Critical error' },
		{ texture: 'static', weight: 'plate', use: 'System failure' },
		{ texture: 'thread', weight: 'ghost', use: 'Weak link hint' },
		{ texture: 'thread', weight: 'paper', use: 'Dependency card' },
		{ texture: 'thread', weight: 'card', use: 'Key relationship' },
		{ texture: 'frame', weight: 'paper', use: 'Standard panel' },
		{ texture: 'frame', weight: 'card', use: 'Milestone/decision' },
		{ texture: 'frame', weight: 'plate', use: 'Modal, system view' }
	];

	type TextureId = (typeof textures)[number]['id'];
	type WeightId = (typeof weights)[number]['id'];

	// Check if combination is recommended
	function isRecommended(texture: TextureId, weight: WeightId): string | null {
		const combo = recommendedCombinations.find((c) => c.texture === texture && c.weight === weight);
		return combo ? combo.use : null;
	}
</script>

<svelte:head>
	<title>Inkprint Design System Reference | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
	<div class="max-w-7xl mx-auto space-y-8">
		<!-- Header -->
		<header class="space-y-2">
			<h1 class="text-3xl sm:text-4xl font-bold text-foreground">Inkprint Design System</h1>
			<p class="text-lg text-muted-foreground">
				Visual reference for Texture × Weight semantic system
			</p>
		</header>

		<!-- Philosophy Section -->
		<section class="wt-paper p-4 sm:p-6 tx tx-frame tx-weak">
			<h2 class="text-xl font-semibold text-foreground mb-3">Two-Axis Semantic System</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<h3 class="font-medium text-foreground mb-1">Texture = What KIND of thing</h3>
					<p class="text-sm text-muted-foreground">
						Communicates the semantic nature: is it new (bloom), in-progress (grain), urgent
						(pulse), blocked (static), connected (thread), or canonical (frame)?
					</p>
				</div>
				<div>
					<h3 class="font-medium text-foreground mb-1">Weight = How IMPORTANT</h3>
					<p class="text-sm text-muted-foreground">
						Communicates hierarchy and permanence: ephemeral (ghost), standard (paper), elevated
						(card), or system-critical (plate).
					</p>
				</div>
			</div>
		</section>

		<!-- Weight Reference -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Weight Tokens</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{#each weights as weight}
					<div class="wt-{weight.id} p-4 tx tx-frame tx-weak">
						<div class="flex items-center justify-between mb-2">
							<span class="font-mono text-sm font-medium text-foreground">wt-{weight.id}</span>
							<span class="text-xs text-muted-foreground">{weight.duration}</span>
						</div>
						<p class="text-sm text-muted-foreground">{weight.meaning}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Texture Reference -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Texture Tokens</h2>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each textures as texture}
					<div class="wt-paper p-4 tx tx-{texture.id} tx-weak">
						<span class="font-mono text-sm font-medium text-foreground">tx-{texture.id}</span>
						<p class="text-sm text-muted-foreground mt-1">{texture.meaning}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- Full Matrix -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Texture × Weight Matrix</h2>
			<p class="text-sm text-muted-foreground">
				Green badges indicate recommended semantic combinations. Gray cells are valid but less
				common.
			</p>

			<div class="overflow-x-auto">
				<div class="min-w-[800px]">
					<!-- Header row -->
					<div class="grid grid-cols-5 gap-2 mb-2">
						<div class="p-2"></div>
						{#each weights as weight}
							<div class="p-2 text-center">
								<span class="font-mono text-xs font-medium text-foreground">wt-{weight.id}</span>
								<p class="text-[10px] text-muted-foreground mt-0.5">{weight.duration}</p>
							</div>
						{/each}
					</div>

					<!-- Texture rows -->
					{#each textures as texture}
						<div class="grid grid-cols-5 gap-2 mb-2">
							<!-- Texture label -->
							<div class="p-2 flex items-center">
								<span class="font-mono text-xs font-medium text-foreground">tx-{texture.id}</span>
							</div>

							<!-- Weight columns -->
							{#each weights as weight}
								{@const recommended = isRecommended(texture.id, weight.id)}
								<div
									class="wt-{weight.id} p-3 tx tx-{texture.id} tx-weak min-h-[80px] flex flex-col justify-between"
								>
									<div class="text-xs text-muted-foreground font-mono">
										{texture.id} + {weight.id}
									</div>
									{#if recommended}
										<span
											class="mt-2 inline-block px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded"
										>
											{recommended}
										</span>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- Card Component Examples -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Card Component Examples</h2>
			<p class="text-sm text-muted-foreground">
				The Card component uses smart defaults based on variant, which can be overridden with
				explicit texture/weight props.
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<!-- Default variant -->
				<Card variant="default" padding="md">
					<CardHeader>
						<h3 class="font-medium text-foreground">Default Variant</h3>
					</CardHeader>
					<CardBody>
						<p class="text-sm text-muted-foreground">
							<code class="text-xs">variant="default"</code><br />
							Defaults to: frame + paper
						</p>
					</CardBody>
				</Card>

				<!-- Elevated variant -->
				<Card variant="elevated" padding="md">
					<CardHeader>
						<h3 class="font-medium text-foreground">Elevated Variant</h3>
					</CardHeader>
					<CardBody>
						<p class="text-sm text-muted-foreground">
							<code class="text-xs">variant="elevated"</code><br />
							Defaults to: frame + card
						</p>
					</CardBody>
				</Card>

				<!-- Interactive variant -->
				<Card variant="interactive" padding="md" hoverable>
					<CardHeader>
						<h3 class="font-medium text-foreground">Interactive Variant</h3>
					</CardHeader>
					<CardBody>
						<p class="text-sm text-muted-foreground">
							<code class="text-xs">variant="interactive"</code><br />
							Defaults to: grain + paper
						</p>
					</CardBody>
				</Card>

				<!-- Ghost variant -->
				<Card variant="ghost" padding="md">
					<CardHeader variant="transparent" divider={false}>
						<h3 class="font-medium text-foreground">Ghost Variant</h3>
					</CardHeader>
					<CardBody>
						<p class="text-sm text-muted-foreground">
							<code class="text-xs">variant="ghost"</code><br />
							Defaults to: bloom + ghost
						</p>
					</CardBody>
				</Card>

				<!-- Custom override -->
				<Card variant="default" texture="static" weight="card" padding="md">
					<CardHeader variant="muted">
						<h3 class="font-medium text-foreground">Custom Override</h3>
					</CardHeader>
					<CardBody>
						<p class="text-sm text-muted-foreground">
							<code class="text-xs">texture="static" weight="card"</code><br />
							Explicit props override defaults
						</p>
					</CardBody>
				</Card>

				<!-- Plate weight example -->
				<Card variant="default" texture="frame" weight="plate" padding="md">
					<CardHeader>
						<h3 class="font-medium text-foreground">Plate Weight</h3>
					</CardHeader>
					<CardBody>
						<p class="text-sm text-muted-foreground">
							<code class="text-xs">weight="plate"</code><br />
							System-critical, modal-level
						</p>
					</CardBody>
				</Card>
			</div>
		</section>

		<!-- Usage Syntax -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Usage Syntax</h2>

			<div class="wt-paper p-4 tx tx-frame tx-weak">
				<h3 class="font-medium text-foreground mb-2">Raw CSS Classes</h3>
				<pre
					class="text-sm bg-muted/50 p-3 rounded-lg overflow-x-auto"><code class="text-foreground">&lt;div class="tx tx-grain tx-weak wt-paper"&gt;
  Active task card
&lt;/div&gt;

&lt;div class="tx tx-static tx-med wt-card"&gt;
  Critical error
&lt;/div&gt;

&lt;div class="tx tx-frame tx-weak wt-plate"&gt;
  System modal
&lt;/div&gt;</code></pre>
			</div>

			<div class="wt-paper p-4 tx tx-frame tx-weak">
				<h3 class="font-medium text-foreground mb-2">Card Component</h3>
				<pre
					class="text-sm bg-muted/50 p-3 rounded-lg overflow-x-auto"><code class="text-foreground">&lt;!-- Use variant defaults --&gt;
&lt;Card variant="default"&gt;...&lt;/Card&gt;

&lt;!-- Override with explicit props --&gt;
&lt;Card texture="grain" weight="ghost"&gt;
  Draft task
&lt;/Card&gt;

&lt;!-- Mix variant with overrides --&gt;
&lt;Card variant="elevated" texture="static"&gt;
  Important error
&lt;/Card&gt;</code></pre>
			</div>
		</section>

		<!-- Footer -->
		<footer class="pt-8 border-t border-border">
			<p class="text-sm text-muted-foreground">
				BuildOS Inkprint Design System v1.1 — Texture × Weight Semantic System
			</p>
		</footer>
	</div>
</div>
