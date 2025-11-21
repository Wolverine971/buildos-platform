<!-- apps/web/src/routes/(public)/integrations/+page.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Card, CardBody, CardHeader, CardFooter } from '$lib/components/ui';
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

<svelte:head>
	<title>BuildOS Integrations - Connect Your Tools</title>
	<meta
		name="description"
		content="Integrate with BuildOS to access AI-powered project insights, automate workflows, and sync with your favorite tools."
	/>
</svelte:head>

<div
	class="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950"
>
	<!-- Hero Section with enhanced gradients and spacing -->
	<section class="relative overflow-hidden border-b border-gray-200 dark:border-gray-800">
		<!-- Background gradient overlay -->
		<div
			class="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20"
		></div>

		<div class="container relative mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
			<div class="mx-auto max-w-4xl text-center">
				<!-- Badge with proper dark mode -->
				<div
					class="mb-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
				>
					<Sparkles class="h-4 w-4 animate-pulse" />
					<span>BuildOS Integration Platform</span>
				</div>

				<!-- Main heading with responsive text -->
				<h1
					class="mb-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl md:text-5xl lg:text-6xl"
				>
					Transform Chaos into
					<span
						class="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent"
					>
						Actionable Intelligence
					</span>
				</h1>

				<!-- Description with better contrast -->
				<p
					class="mb-8 text-base text-gray-600 dark:text-gray-300 sm:text-lg lg:text-xl max-w-3xl mx-auto"
				>
					Integrate with BuildOS to access real-time project insights, AI-enriched
					context, and intelligent task management. Let your AI agents and tools
					understand what users are actually working on.
				</p>

				<!-- CTA Buttons with proper spacing -->
				<div class="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
					<Button size="lg" variant="primary" class="gap-2 min-w-[200px]">
						View Documentation
						<ArrowRight class="h-4 w-4" />
					</Button>
					<Button size="lg" variant="outline" class="gap-2 min-w-[200px]">
						<MessageSquare class="h-4 w-4" />
						Schedule a Demo
					</Button>
				</div>

				<!-- Trust badges with enhanced styling -->
				<div
					class="mt-12 flex flex-wrap items-center justify-center gap-4 sm:gap-6 lg:gap-8 text-sm text-gray-600 dark:text-gray-400"
				>
					<div
						class="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/20 rounded-full border border-green-200 dark:border-green-800"
					>
						<CheckCircle2 class="h-4 w-4 text-green-600 dark:text-green-400" />
						<span class="font-medium text-green-700 dark:text-green-300"
							>SOC 2 Compliant</span
						>
					</div>
					<div
						class="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/20 rounded-full border border-green-200 dark:border-green-800"
					>
						<CheckCircle2 class="h-4 w-4 text-green-600 dark:text-green-400" />
						<span class="font-medium text-green-700 dark:text-green-300"
							>GDPR Ready</span
						>
					</div>
					<div
						class="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/20 rounded-full border border-green-200 dark:border-green-800"
					>
						<CheckCircle2 class="h-4 w-4 text-green-600 dark:text-green-400" />
						<span class="font-medium text-green-700 dark:text-green-300"
							>99.9% Uptime SLA</span
						>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- What is BuildOS Section with Card components -->
	<section class="py-12 sm:py-16 lg:py-20 border-b border-gray-200 dark:border-gray-800">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-12">
				<h2
					class="mb-4 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl lg:text-4xl"
				>
					What is BuildOS?
				</h2>
				<p class="text-base text-gray-600 dark:text-gray-300 sm:text-lg">
					BuildOS is an AI-powered productivity platform that transforms unstructured
					thoughts into actionable plans. Our <strong
						class="text-gray-900 dark:text-white">Brain Dump System</strong
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
						class="text-center transform transition-all duration-500 hover:scale-105"
						style="animation: fadeInUp 0.5s ease-out {metric.delay} forwards; opacity: 0"
					>
						<CardBody padding="md">
							<div
								class="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent"
							>
								{metric.value}
							</div>
							<div class="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
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
				<h2
					class="mb-4 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl lg:text-4xl"
				>
					Integration Possibilities
				</h2>
				<p class="text-base text-gray-600 dark:text-gray-300 sm:text-lg">
					Connect BuildOS to your existing tools and unlock powerful workflows
				</p>
			</div>

			<div
				class="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto"
			>
				{#each integrationCategories as category, i}
					<Card
						variant="interactive"
						class="group relative overflow-hidden transition-all duration-300 hover:shadow-2xl"
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
							<h3
								class="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl"
							>
								{category.title}
							</h3>
							<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
								{category.description}
							</p>
						</CardHeader>

						<CardBody class="relative">
							<div class="flex flex-wrap gap-2">
								{#each category.examples as example}
									<Badge
										variant="info"
										size="sm"
										class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm"
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
	<section
		class="border-y border-gray-200 dark:border-gray-800 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 py-12 sm:py-16 lg:py-20"
	>
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-6xl">
				<div class="grid gap-8 lg:gap-12 lg:grid-cols-2 lg:items-center">
					<div>
						<Badge variant="info" size="md" class="mb-4 inline-flex items-center gap-2">
							<Brain class="h-4 w-4" />
							Primary Use Case
						</Badge>

						<h2
							class="mb-6 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl lg:text-4xl"
						>
							Perfect for AI Agents
						</h2>
						<p class="mb-8 text-base text-gray-600 dark:text-gray-300 sm:text-lg">
							AI agents can query BuildOS for real-time project status updates and use
							this rich context to make informed decisions, trigger workflows, and
							provide intelligent assistance.
						</p>

						<div class="space-y-4">
							{#each [{ title: 'Real-time Project Intelligence', desc: 'Get instant updates on project state, completion, blockers, and next milestones' }, { title: 'Contextual Understanding', desc: 'Access AI-enriched context for every project, task, and goal' }, { title: 'Automated Workflows', desc: 'Trigger actions based on project state changes and dependencies' }] as feature}
								<div class="flex gap-3">
									<CheckCircle2
										class="mt-1 h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
									/>
									<div>
										<div class="font-medium text-gray-900 dark:text-white">
											{feature.title}
										</div>
										<div class="text-sm text-gray-600 dark:text-gray-400">
											{feature.desc}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<Card variant="elevated" class="overflow-hidden">
						<CardHeader variant="gradient">
							<div class="text-sm font-medium text-gray-700 dark:text-gray-300">
								Example Scenario
							</div>
						</CardHeader>
						<CardBody padding="lg">
							<div class="space-y-3 font-mono text-xs sm:text-sm">
								<div
									class="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700"
								>
									<span class="text-blue-600 dark:text-blue-400 font-semibold"
										>AI Agent</span
									>
									<span class="text-gray-500 dark:text-gray-400 mx-2">→</span>
									<span class="text-gray-700 dark:text-gray-300">BuildOS:</span>
									<span class="text-gray-600 dark:text-gray-400 ml-2"
										>"Q4 marketing status?"</span
									>
								</div>

								<div
									class="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700"
								>
									<span class="text-green-600 dark:text-green-400 font-semibold"
										>BuildOS</span
									>
									<span class="text-gray-500 dark:text-gray-400 mx-2">→</span>
									<span class="text-gray-700 dark:text-gray-300">AI Agent:</span>
									<pre
										class="mt-2 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">{`{
  project: "Q4 Marketing",
  state: "execution",
  completion: 67,
  blockers: ["Design approval"],
  next_milestone: "Launch ads (3d)"
}`}</pre>
								</div>

								<div
									class="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700"
								>
									<span class="text-blue-600 dark:text-blue-400 font-semibold"
										>AI Agent</span
									>:
									<span class="text-gray-600 dark:text-gray-400 ml-2"
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
				<h2
					class="mb-4 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl lg:text-4xl"
				>
					Built for Developers
				</h2>
				<p class="text-base text-gray-600 dark:text-gray-300 sm:text-lg">
					Powerful APIs and tools to build robust integrations
				</p>
			</div>

			<div
				class="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto"
			>
				{#each developerFeatures as feature}
					<Card
						variant="default"
						class="group hover:shadow-lg transition-all duration-300"
					>
						<CardBody padding="md">
							<div class="flex gap-4">
								<div
									class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800 group-hover:scale-110 transition-transform duration-300"
								>
									<svelte:component
										this={feature.icon}
										class="h-6 w-6 text-blue-600 dark:text-blue-400"
									/>
								</div>
								<div>
									<h3 class="mb-1 font-semibold text-gray-900 dark:text-white">
										{feature.title}
									</h3>
									<p class="text-sm text-gray-600 dark:text-gray-400">
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
					<Card variant="elevated" class="overflow-hidden">
						<CardHeader variant="gradient" class="flex items-center justify-between">
							<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
								Quick Start Example
							</span>
							<Button variant="ghost" size="sm" onclick={copyCode} class="gap-2">
								{#if isCodeCopied}
									<Check class="h-4 w-4 text-green-600 dark:text-green-400" />
									Copied!
								{:else}
									<Copy class="h-4 w-4" />
									Copy
								{/if}
							</Button>
						</CardHeader>
						<CardBody padding="lg">
							<pre class="overflow-x-auto text-xs sm:text-sm"><code
									class="language-javascript text-gray-700 dark:text-gray-300"
									>{codeExample}</code
								></pre>
						</CardBody>
					</Card>
				</div>
			</div>
		</div>
	</section>

	<!-- Pricing Section with enhanced Cards -->
	<section
		class="border-t border-gray-200 dark:border-gray-800 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950 py-12 sm:py-16 lg:py-20"
	>
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-12">
				<h2
					class="mb-4 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl lg:text-4xl"
				>
					Simple, Transparent Pricing
				</h2>
				<p class="text-base text-gray-600 dark:text-gray-300 sm:text-lg">
					Start free, scale as you grow
				</p>
			</div>

			<div class="mx-auto grid max-w-6xl gap-6 lg:gap-8 grid-cols-1 md:grid-cols-3">
				{#each pricingTiers as tier, i}
					<Card
						variant={tier.highlighted ? 'elevated' : 'default'}
						class="relative transform transition-all duration-300 hover:scale-105 {tier.highlighted
							? 'border-2 border-blue-500 dark:border-blue-400 shadow-2xl'
							: ''}"
						onmouseenter={() => (selectedTier = i)}
						onmouseleave={() => (selectedTier = null)}
					>
						{#if tier.highlighted}
							<div
								class="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg"
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
							<h3 class="text-xl font-semibold text-gray-900 dark:text-white">
								{tier.name}
							</h3>
							<div class="mt-4 flex items-baseline">
								<span
									class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white"
								>
									{tier.price}
								</span>
								{#if tier.period}
									<span class="ml-1 text-gray-600 dark:text-gray-400">
										{tier.period}
									</span>
								{/if}
							</div>
							<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
								{tier.description}
							</p>
						</CardHeader>

						<CardBody class="relative">
							<ul class="space-y-3">
								{#each tier.features as feature}
									<li class="flex items-start gap-2">
										<CheckCircle2
											class="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
										/>
										<span class="text-sm text-gray-700 dark:text-gray-300">
											{feature}
										</span>
									</li>
								{/each}
							</ul>
						</CardBody>

						<CardFooter class="relative">
							<Button
								class="w-full"
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
				<p class="text-gray-600 dark:text-gray-400">
					Need more?
					<a
						href="/contact"
						class="ml-1 font-medium text-blue-600 dark:text-blue-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
					>
						Contact us for Enterprise pricing
					</a>
				</p>
			</div>
		</div>
	</section>

	<!-- CTA Section with final polish -->
	<section class="border-t border-gray-200 dark:border-gray-800 py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<Card variant="elevated" class="max-w-4xl mx-auto overflow-hidden">
				<div
					class="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20"
				></div>

				<CardBody padding="lg" class="relative text-center">
					<h2
						class="mb-4 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl lg:text-4xl"
					>
						Ready to Build Something Amazing?
					</h2>
					<p class="mb-8 text-base text-gray-600 dark:text-gray-300 sm:text-lg">
						Join developers building the future of productivity
					</p>

					<div
						class="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 mb-12"
					>
						<Button size="lg" variant="primary" class="gap-2 min-w-[200px]">
							<Rocket class="h-4 w-4" />
							Get API Access
						</Button>
						<Button size="lg" variant="secondary" class="gap-2 min-w-[200px]">
							<FileText class="h-4 w-4" />
							Read the Docs
						</Button>
					</div>

					<Alert variant="info" class="max-w-2xl mx-auto">
						<p class="mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">
							Questions? We're here to help
						</p>
						<div
							class="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6 text-sm"
						>
							<a
								href="mailto:integrations@buildos.dev"
								class="flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
							>
								integrations@buildos.dev
							</a>
							<a
								href="/discord"
								class="flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
							>
								Join our Discord
							</a>
							<a
								href="/docs"
								class="flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-200"
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

	/* Ensure proper contrast in dark mode */
	:global(.dark) {
		color-scheme: dark;
	}

	/* High information density with proper spacing */
	section {
		/* Using 8px grid system multipliers */
		--spacing-unit: 0.5rem; /* 8px */
	}
</style>
