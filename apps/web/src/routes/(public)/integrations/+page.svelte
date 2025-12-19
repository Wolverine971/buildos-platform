<!-- apps/web/src/routes/(public)/integrations/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';

	import Badge from '$lib/components/ui/Badge.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import {
		Code2,
		Zap,
		Lock,
		Globe,
		Calendar,
		Brain,
		Target,
		BarChart3,
		Users,
		Sparkles,
		ArrowRight,
		CheckCircle2,
		MessageSquare,
		FileText,
		GitBranch,
		Clock,
		Shield,
		Rocket,
		Copy,
		Check
	} from 'lucide-svelte';

	// Svelte 5 runes for state management
	let copiedCode = $state(false);
	let selectedTier = $state<number | null>(null);
	let hoveredCategory = $state<number | null>(null);

	// Integration categories with enhanced design
	const integrationCategories = [
		{
			title: 'AI Agents & Assistants',
			icon: Brain,
			description: 'Enable AI agents to query project status and make informed decisions',
			examples: [
				'Get real-time project updates',
				'Trigger automated workflows',
				'Generate contextual reports'
			],
			gradient: 'from-purple-500 to-pink-500',
			bgGradient: 'from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20'
		},
		{
			title: 'Project Management',
			icon: Target,
			description: 'Bidirectional sync with your favorite PM tools',
			examples: ['Jira', 'Linear', 'Asana', 'Monday.com'],
			gradient: 'from-blue-500 to-cyan-500',
			bgGradient: 'from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20'
		},
		{
			title: 'Calendar Apps',
			icon: Calendar,
			description: 'Smart scheduling and time blocking across platforms',
			examples: ['Google Calendar', 'Outlook', 'Fantastical', 'Apple Calendar'],
			gradient: 'from-green-500 to-emerald-500',
			bgGradient: 'from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20'
		},
		{
			title: 'Communication',
			icon: MessageSquare,
			description: 'Keep teams updated with project progress',
			examples: ['Slack', 'Microsoft Teams', 'Discord', 'Email'],
			gradient: 'from-orange-500 to-red-500',
			bgGradient: 'from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20'
		},
		{
			title: 'Analytics & BI',
			icon: BarChart3,
			description: 'Export metrics for advanced analytics',
			examples: ['Tableau', 'Looker', 'Metabase', 'Power BI'],
			gradient: 'from-indigo-500 to-purple-500',
			bgGradient: 'from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20'
		},
		{
			title: 'Knowledge Management',
			icon: FileText,
			description: 'Sync projects with your knowledge base',
			examples: ['Notion', 'Obsidian', 'Roam Research', 'Confluence'],
			gradient: 'from-teal-500 to-cyan-500',
			bgGradient: 'from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20'
		}
	];

	// Key features for developers
	const developerFeatures = [
		{
			icon: Code2,
			title: '250+ API Endpoints',
			description: 'Comprehensive REST API covering all BuildOS features'
		},
		{
			icon: Zap,
			title: 'Real-time Updates',
			description: 'WebSocket subscriptions for live data streaming'
		},
		{
			icon: GitBranch,
			title: 'Webhooks',
			description: 'Event-driven notifications with retry logic'
		},
		{
			icon: Shield,
			title: 'OAuth 2.0',
			description: 'Secure user-authorized access with granular scopes'
		},
		{
			icon: Clock,
			title: '99.9% Uptime',
			description: 'Enterprise-grade reliability with SLA guarantees'
		},
		{
			icon: Globe,
			title: 'Global CDN',
			description: 'Low-latency access from anywhere in the world'
		}
	];

	// Pricing tiers with enhanced design
	const pricingTiers = [
		{
			name: 'Developer',
			price: 'Free',
			period: '',
			description: 'Perfect for testing and development',
			features: [
				'100 API calls/day',
				'Core endpoints access',
				'Community support',
				'Sandbox environment'
			],
			cta: 'Start Building',
			highlighted: false,
			gradient: 'from-gray-50 to-slate-50 dark:from-gray-950/20 dark:to-slate-950/20'
		},
		{
			name: 'Startup',
			price: '$99',
			period: '/month',
			description: 'For growing applications',
			features: [
				'10,000 API calls/day',
				'All endpoints',
				'Email support',
				'Webhooks & real-time',
				'Priority bug fixes'
			],
			cta: 'Get Started',
			highlighted: true,
			gradient: 'from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30'
		},
		{
			name: 'Business',
			price: '$499',
			period: '/month',
			description: 'For production workloads',
			features: [
				'100,000 API calls/day',
				'Priority support',
				'Custom webhooks',
				'Advanced analytics',
				'SLA guarantee',
				'Dedicated success manager'
			],
			cta: 'Contact Sales',
			highlighted: false,
			gradient: 'from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20'
		}
	];

	// Success metrics with animation
	const metrics = [
		{ value: '40%', label: 'Improvement in task completion', delay: '0ms' },
		{ value: '67%', label: 'Reduction in planning time', delay: '100ms' },
		{ value: '3.5x', label: 'Faster project setup', delay: '200ms' },
		{ value: '92%', label: 'User satisfaction rate', delay: '300ms' }
	];

	// Code example
	const codeExample = `// Get project status with BuildOS API
const response = await fetch(
  'https://api.buildos.dev/api/projects/{project_id}',
  {
    headers: {
      'Authorization': \`Bearer \${accessToken}\`,
      'Content-Type': 'application/json'
    }
  }
);

const project = await response.json();

// React to project state
if (project.state_key === 'blocked') {
  const blockers = await getBlockers(project.id);
  await notifyTeam(blockers);
}`;

	// Reactive functions using $derived
	let isCodeCopied = $derived(copiedCode);

	// Handle code copy
	function copyCode() {
		navigator.clipboard.writeText(codeExample);
		copiedCode = true;
		setTimeout(() => {
			copiedCode = false;
		}, 2000);
	}
</script>

<SEOHead
	title="BuildOS Integrations & API - Connect AI Agents to Your Project Data"
	description="Integrate with BuildOS to access AI-powered project insights, automate workflows, and sync with your favorite tools. REST API, webhooks, and real-time updates for developers."
	canonical="https://build-os.com/integrations"
	keywords="BuildOS API, project management integration, AI agent API, productivity API, task automation, webhook integration, developer API, project insights API"
	ogType="website"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: 'BuildOS Integrations & API',
		description:
			'Connect AI agents and tools to BuildOS for real-time project insights and automated workflows.',
		url: 'https://build-os.com/integrations',
		mainEntity: {
			'@type': 'SoftwareApplication',
			name: 'BuildOS API',
			applicationCategory: 'DeveloperApplication',
			operatingSystem: 'Web',
			offers: [
				{
					'@type': 'Offer',
					name: 'Developer',
					price: '0',
					priceCurrency: 'USD',
					description: '100 API calls/day, Core endpoints, Community support'
				},
				{
					'@type': 'Offer',
					name: 'Startup',
					price: '99',
					priceCurrency: 'USD',
					description: '10,000 API calls/day, All endpoints, Email support'
				},
				{
					'@type': 'Offer',
					name: 'Business',
					price: '499',
					priceCurrency: 'USD',
					description: '100,000 API calls/day, Priority support, SLA guarantee'
				}
			]
		}
	}}
/>

<div class="min-h-screen bg-background text-foreground">
	<!-- Hero Section with enhanced gradients and spacing -->
	<section class="relative overflow-hidden border-b border-border">
		<!-- Background gradient overlay -->
		<div
			class="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-purple-500/5"
		></div>

		<div class="container relative mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
			<div class="mx-auto max-w-4xl text-center">
				<!-- Badge with proper dark mode -->
				<div
					class="mb-6 inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm font-medium text-accent border border-accent/20"
				>
					<Sparkles class="h-4 w-4 animate-pulse" />
					<span>BuildOS Integration Platform</span>
				</div>

				<!-- Main heading with responsive text -->
				<h1
					class="mb-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl"
				>
					Transform Chaos into
					<span
						class="bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-transparent"
					>
						Actionable Intelligence
					</span>
				</h1>

				<!-- Description with better contrast -->
				<p
					class="mb-8 text-base text-muted-foreground sm:text-lg lg:text-xl max-w-3xl mx-auto"
				>
					Integrate with BuildOS to access real-time project insights, AI-enriched
					context, and intelligent task management. Let your AI agents and tools
					understand what users are actually working on.
				</p>

				<!-- CTA Buttons with proper spacing -->
				<div class="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
					<Button
						size="lg"
						variant="primary"
						class="gap-2 min-w-[200px] shadow-ink pressable"
					>
						View Documentation
						<ArrowRight class="h-4 w-4" />
					</Button>
					<Button
						size="lg"
						variant="outline"
						class="gap-2 min-w-[200px] shadow-ink pressable"
					>
						<MessageSquare class="h-4 w-4" />
						Schedule a Demo
					</Button>
				</div>

				<!-- Trust badges with enhanced styling -->
				<div
					class="mt-12 flex flex-wrap items-center justify-center gap-4 sm:gap-6 lg:gap-8 text-sm text-muted-foreground"
				>
					<div
						class="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20"
					>
						<CheckCircle2 class="h-4 w-4 text-emerald-500" />
						<span class="font-medium text-emerald-600 dark:text-emerald-400"
							>SOC 2 Compliant</span
						>
					</div>
					<div
						class="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20"
					>
						<CheckCircle2 class="h-4 w-4 text-emerald-500" />
						<span class="font-medium text-emerald-600 dark:text-emerald-400"
							>GDPR Ready</span
						>
					</div>
					<div
						class="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20"
					>
						<CheckCircle2 class="h-4 w-4 text-emerald-500" />
						<span class="font-medium text-emerald-600 dark:text-emerald-400"
							>99.9% Uptime SLA</span
						>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- What is BuildOS Section with Card components -->
	<section class="py-12 sm:py-16 lg:py-20 border-b border-border bg-card">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-12">
				<h2 class="mb-4 text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
					What is BuildOS?
				</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					BuildOS is an AI-powered productivity platform that transforms unstructured
					thoughts into actionable plans. Our <strong class="text-foreground"
						>Brain Dump System</strong
					> lets users write stream-of-consciousness thoughts, and AI automatically extracts
					projects, tasks, and context.
				</p>
			</div>

			<!-- Metrics Grid with Cards -->
			<div class="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
				{#each metrics as metric, i}
					<Card
						variant="elevated"
						padding="sm"
						class="text-center transform transition-all duration-500 hover:scale-105 shadow-ink tx tx-grain tx-weak"
						style="animation: fadeInUp 0.5s ease-out {metric.delay} forwards; opacity: 0"
					>
						<CardBody padding="md">
							<div
								class="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-transparent"
							>
								{metric.value}
							</div>
							<div class="mt-2 text-xs sm:text-sm text-muted-foreground">
								{metric.label}
							</div>
						</CardBody>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<!-- Integration Categories with enhanced Cards -->
	<section class="py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-12">
				<h2 class="mb-4 text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
					Integration Possibilities
				</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					Connect BuildOS to your existing tools and unlock powerful workflows
				</p>
			</div>

			<div
				class="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto"
			>
				{#each integrationCategories as category, i}
					<Card
						variant="interactive"
						class="group relative overflow-hidden transition-all duration-300 hover:shadow-ink-strong shadow-ink tx tx-frame tx-weak pressable"
						onmouseenter={() => (hoveredCategory = i)}
						onmouseleave={() => (hoveredCategory = null)}
					>
						<!-- Gradient overlay -->
						<div
							class="absolute inset-0 bg-gradient-to-br {category.bgGradient} opacity-30 group-hover:opacity-50 transition-opacity duration-300"
						></div>

						<CardHeader class="relative">
							<div
								class="mb-3 inline-flex rounded-xl bg-gradient-to-r {category.gradient} p-3 shadow-lg transform transition-transform duration-300 group-hover:scale-110"
							>
								<svelte:component this={category.icon} class="h-6 w-6 text-white" />
							</div>
							<h3 class="text-lg font-semibold text-foreground sm:text-xl">
								{category.title}
							</h3>
							<p class="mt-2 text-sm text-muted-foreground">
								{category.description}
							</p>
						</CardHeader>

						<CardBody class="relative">
							<div class="flex flex-wrap gap-2">
								{#each category.examples as example}
									<Badge
										variant="info"
										size="sm"
										class="bg-card/80 backdrop-blur-sm"
									>
										{example}
									</Badge>
								{/each}
							</div>
						</CardBody>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<!-- AI Agent Use Case with improved layout -->
	<section class="border-y border-border bg-muted py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-6xl">
				<div class="grid gap-8 lg:gap-12 lg:grid-cols-2 lg:items-center">
					<div>
						<Badge variant="info" size="md" class="mb-4 inline-flex items-center gap-2">
							<Brain class="h-4 w-4" />
							Primary Use Case
						</Badge>

						<h2 class="mb-6 text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
							Perfect for AI Agents
						</h2>
						<p class="mb-8 text-base text-muted-foreground sm:text-lg">
							AI agents can query BuildOS for real-time project status updates and use
							this rich context to make informed decisions, trigger workflows, and
							provide intelligent assistance.
						</p>

						<div class="space-y-4">
							{#each [{ title: 'Real-time Project Intelligence', desc: 'Get instant updates on project state, completion, blockers, and next milestones' }, { title: 'Contextual Understanding', desc: 'Access AI-enriched context for every project, task, and goal' }, { title: 'Automated Workflows', desc: 'Trigger actions based on project state changes and dependencies' }] as feature}
								<div class="flex gap-3">
									<CheckCircle2 class="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
									<div>
										<div class="font-medium text-foreground">
											{feature.title}
										</div>
										<div class="text-sm text-muted-foreground">
											{feature.desc}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<Card variant="elevated" class="overflow-hidden shadow-ink tx tx-frame tx-weak">
						<CardHeader variant="gradient">
							<div class="text-sm font-medium text-foreground">Example Scenario</div>
						</CardHeader>
						<CardBody padding="lg">
							<div class="space-y-3 font-mono text-xs sm:text-sm">
								<div class="rounded-lg bg-card p-3 border border-border">
									<span class="text-accent font-semibold">AI Agent</span>
									<span class="text-muted-foreground mx-2">→</span>
									<span class="text-foreground">BuildOS:</span>
									<span class="text-muted-foreground ml-2"
										>"Q4 marketing status?"</span
									>
								</div>

								<div class="rounded-lg bg-card p-3 border border-border">
									<span class="text-emerald-500 font-semibold">BuildOS</span>
									<span class="text-muted-foreground mx-2">→</span>
									<span class="text-foreground">AI Agent:</span>
									<pre
										class="mt-2 text-xs text-muted-foreground overflow-x-auto">{`{
  project: "Q4 Marketing",
  state: "execution",
  completion: 67,
  blockers: ["Design approval"],
  next_milestone: "Launch ads (3d)"
}`}</pre>
								</div>

								<div class="rounded-lg bg-card p-3 border border-border">
									<span class="text-accent font-semibold">AI Agent</span>:
									<span class="text-muted-foreground ml-2"
										>Notifies design team</span
									>
								</div>
							</div>
						</CardBody>
					</Card>
				</div>
			</div>
		</div>
	</section>

	<!-- Developer Features with Cards -->
	<section class="py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-12">
				<h2 class="mb-4 text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
					Built for Developers
				</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					Powerful APIs and tools to build robust integrations
				</p>
			</div>

			<div
				class="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto"
			>
				{#each developerFeatures as feature}
					<Card
						variant="default"
						class="group hover:shadow-ink-strong transition-all duration-300 shadow-ink tx tx-grain tx-weak pressable"
					>
						<CardBody padding="md">
							<div class="flex gap-4">
								<div
									class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 group-hover:scale-110 transition-transform duration-300"
								>
									<svelte:component
										this={feature.icon}
										class="h-6 w-6 text-accent"
									/>
								</div>
								<div>
									<h3 class="mb-1 font-semibold text-foreground">
										{feature.title}
									</h3>
									<p class="text-sm text-muted-foreground">
										{feature.description}
									</p>
								</div>
							</div>
						</CardBody>
					</Card>
				{/each}
			</div>

			<!-- Code Example Card -->
			<div class="mt-12 lg:mt-16">
				<div class="mx-auto max-w-4xl">
					<Card variant="elevated" class="overflow-hidden shadow-ink tx tx-frame tx-weak">
						<CardHeader variant="gradient" class="flex items-center justify-between">
							<span class="text-sm font-medium text-foreground">
								Quick Start Example
							</span>
							<Button
								variant="ghost"
								size="sm"
								onclick={copyCode}
								class="gap-2 pressable"
							>
								{#if isCodeCopied}
									<Check class="h-4 w-4 text-emerald-500" />
									Copied!
								{:else}
									<Copy class="h-4 w-4" />
									Copy
								{/if}
							</Button>
						</CardHeader>
						<CardBody padding="lg">
							<pre class="overflow-x-auto text-xs sm:text-sm"><code
									class="language-javascript text-foreground">{codeExample}</code
								></pre>
						</CardBody>
					</Card>
				</div>
			</div>
		</div>
	</section>

	<!-- Pricing Section with enhanced Cards -->
	<section class="border-t border-border bg-card py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-12">
				<h2 class="mb-4 text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
					Simple, Transparent Pricing
				</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					Start free, scale as you grow
				</p>
			</div>

			<div class="mx-auto grid max-w-6xl gap-6 lg:gap-8 grid-cols-1 md:grid-cols-3">
				{#each pricingTiers as tier, i}
					<Card
						variant={tier.highlighted ? 'elevated' : 'default'}
						class="relative transform transition-all duration-300 hover:scale-105 shadow-ink tx tx-frame tx-weak pressable {tier.highlighted
							? 'border-2 border-accent shadow-ink-strong'
							: ''}"
						onmouseenter={() => (selectedTier = i)}
						onmouseleave={() => (selectedTier = null)}
					>
						{#if tier.highlighted}
							<div
								class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-accent to-purple-500 px-4 py-1.5 text-xs font-medium text-accent-foreground shadow-lg"
							>
								Most Popular
							</div>
						{/if}

						<!-- Gradient background for highlighted tier -->
						{#if tier.gradient}
							<div
								class="absolute inset-0 bg-gradient-to-br {tier.gradient} opacity-20 rounded-lg"
							></div>
						{/if}

						<CardHeader class="relative">
							<h3 class="text-xl font-semibold text-foreground">
								{tier.name}
							</h3>
							<div class="mt-4 flex items-baseline">
								<span class="text-3xl sm:text-4xl font-bold text-foreground">
									{tier.price}
								</span>
								{#if tier.period}
									<span class="ml-1 text-muted-foreground">
										{tier.period}
									</span>
								{/if}
							</div>
							<p class="mt-2 text-sm text-muted-foreground">
								{tier.description}
							</p>
						</CardHeader>

						<CardBody class="relative">
							<ul class="space-y-3">
								{#each tier.features as feature}
									<li class="flex items-start gap-2">
										<CheckCircle2
											class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
										/>
										<span class="text-sm text-foreground">
											{feature}
										</span>
									</li>
								{/each}
							</ul>
						</CardBody>

						<CardFooter class="relative">
							<Button
								class="w-full shadow-ink pressable"
								variant={tier.highlighted ? 'primary' : 'secondary'}
								size="md"
							>
								{tier.cta}
							</Button>
						</CardFooter>
					</Card>
				{/each}
			</div>

			<div class="mt-12 text-center">
				<p class="text-muted-foreground">
					Need more?
					<a
						href="/contact"
						class="ml-1 font-medium text-accent hover:text-accent/80 transition-colors duration-200"
					>
						Contact us for Enterprise pricing
					</a>
				</p>
			</div>
		</div>
	</section>

	<!-- CTA Section with final polish -->
	<section class="border-t border-border py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<Card
				variant="elevated"
				class="max-w-4xl mx-auto overflow-hidden shadow-ink tx tx-bloom tx-weak"
			>
				<div class="absolute inset-0 bg-gradient-to-br from-accent/5 to-purple-500/5"></div>

				<CardBody padding="lg" class="relative text-center">
					<h2 class="mb-4 text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
						Ready to Build Something Amazing?
					</h2>
					<p class="mb-8 text-base text-muted-foreground sm:text-lg">
						Join developers building the future of productivity
					</p>

					<div
						class="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 mb-12"
					>
						<Button
							size="lg"
							variant="primary"
							class="gap-2 min-w-[200px] shadow-ink pressable"
						>
							<Rocket class="h-4 w-4" />
							Get API Access
						</Button>
						<Button
							size="lg"
							variant="secondary"
							class="gap-2 min-w-[200px] shadow-ink pressable"
						>
							<FileText class="h-4 w-4" />
							Read the Docs
						</Button>
					</div>

					<Alert variant="info" class="max-w-2xl mx-auto">
						<p class="mb-4 text-sm font-medium text-foreground">
							Questions? We're here to help
						</p>
						<div
							class="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6 text-sm"
						>
							<a
								href="mailto:dj@build-os.com"
								class="flex items-center gap-2 font-medium text-accent hover:text-accent/80 transition-colors duration-200"
							>
								dj@build-os.com
							</a>
							<!-- <a
								href="/discord"
								class="flex items-center gap-2 font-medium text-accent hover:text-accent/80 transition-colors duration-200"
							>
								Join our Discord
							</a> -->
							<a
								href="/docs"
								class="flex items-center gap-2 font-medium text-accent hover:text-accent/80 transition-colors duration-200"
							>
								Documentation
							</a>
						</div>
					</Alert>
				</CardBody>
			</Card>
		</div>
	</section>
</div>

<style>
	/* Smooth fade-in animation for metrics */
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* High information density with proper spacing */
	section {
		/* Using 8px grid system multipliers */
		--spacing-unit: 0.5rem; /* 8px */
	}
</style>
