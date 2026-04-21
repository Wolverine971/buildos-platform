<!-- apps/web/src/routes/(public)/integrations/+page.svelte -->
<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { DEFAULT_ORGANIZATION_ID, DEFAULT_WEBSITE_ID, SITE_URL } from '$lib/constants/seo';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import {
		ArrowRight,
		Brain,
		Check,
		CheckCircle2,
		Copy,
		FileText,
		GitBranch,
		Lock,
		MessageSquare,
		Rocket,
		Shield,
		Sparkles,
		Target,
		Users
	} from 'lucide-svelte';

	type CopyTarget = 'env' | 'dial' | null;

	let copiedTarget = $state<CopyTarget>(null);

	const setupSteps = [
		{
			title: 'Generate a BuildOS Agent Key',
			description:
				'Go to Profile > Agent Keys in BuildOS. Create a caller for OpenClaw and optionally scope it to specific projects.',
			detail: 'BuildOS shows the one-time bearer token, the BuildOS callee handle, and the caller key you will paste into OpenClaw.',
			icon: Lock
		},
		{
			title: 'Paste the values into OpenClaw',
			description:
				'Store the BuildOS key inside your OpenClaw plugin or secret configuration, not in normal prompt text.',
			detail: 'Use BUILDOS_BASE_URL, BUILDOS_AGENT_TOKEN, BUILDOS_CALLEE_HANDLE, and BUILDOS_CALLER_KEY.',
			icon: Brain
		},
		{
			title: 'OpenClaw dials your BuildOS agent',
			description:
				'OpenClaw calls the BuildOS gateway with bearer auth and asks to dial your user-scoped BuildOS agent.',
			detail: 'BuildOS checks who is calling, which user agent is being called, and what scope is allowed before accepting the session.',
			icon: MessageSquare
		},
		{
			title: 'Use the BuildOS gateway progressively',
			description:
				'After the call is accepted, OpenClaw lists the scoped BuildOS tools it can use and calls direct tools by name.',
			detail: 'OpenClaw receives support tools like skill_load, tool_search, and tool_schema, plus direct tools such as list_onto_projects, list_onto_tasks, create_onto_task, or update_onto_task when the key grants them.',
			icon: Target
		}
	];

	const callConcepts = [
		{
			title: 'User BuildOS Agent',
			description:
				'Each user has an internal BuildOS agent identity. This is the callee OpenClaw is trying to reach.',
			icon: Users
		},
		{
			title: 'BuildOS Agent Key',
			description:
				'Each external agent installation gets its own BuildOS-issued bearer token. BuildOS stores only the hash.',
			icon: Lock
		},
		{
			title: 'Call Session',
			description:
				'OpenClaw does not impersonate the browser session. It creates a separate authenticated call session.',
			icon: GitBranch
		},
		{
			title: 'Scoped Tool Access',
			description:
				'BuildOS can accept, reject, or constrain the call. Tools are exposed only after that decision.',
			icon: Shield
		}
	];

	const availableTools = [
		{
			name: 'skill_load',
			description:
				'Load a BuildOS skill playbook when the workflow is multi-step, stateful, or easy to get wrong.'
		},
		{
			name: 'tool_search',
			description:
				'Discover candidate BuildOS tools when the exact direct tool is not already clear.'
		},
		{
			name: 'tool_schema',
			description:
				'Inspect the exact arguments for one canonical BuildOS op before calling the returned direct tool.'
		},
		{
			name: 'direct tools',
			description:
				'Execute scoped BuildOS actions directly, such as list_onto_projects, list_onto_tasks, create_onto_task, or update_onto_task.'
		}
	];

	const guardrails = [
		'OpenClaw gets a BuildOS-issued key, not the user browser session.',
		'Calls are user-scoped. A caller cannot dial another user BuildOS agent.',
		'Project scoping is enforced before tools run.',
		'Read access is included by default; task create/update tools appear only when the key grants read-write access.',
		'Keys can be rotated or revoked from Profile > Agent Keys.'
	];

	const envSnippet = `BUILDOS_BASE_URL=https://build-os.com
BUILDOS_AGENT_TOKEN=boca_your_one_time_secret
BUILDOS_CALLEE_HANDLE=buildos:user:YOUR_USER_ID
BUILDOS_CALLER_KEY=openclaw:workspace:your-workspace`;

	const dialSnippet = `POST /api/agent-call/buildos
Authorization: Bearer <BUILDOS_AGENT_TOKEN>
Content-Type: application/json

{
  "method": "call.dial",
  "params": {
    "callee_handle": "buildos:user:YOUR_USER_ID",
    "requested_scope": {
      "mode": "read_only"
    },
    "client": {
      "provider": "openclaw",
      "caller_key": "openclaw:workspace:your-workspace"
    }
  }
}

// then:
// 1. tools/list
// 2. tools/call name=list_onto_projects arguments={}
// 3. tools/call name=tool_schema arguments={ "op": "onto.task.update", "include_schema": true }
// 4. tools/call name=update_onto_task arguments={ "task_id": "...", "state_key": "done" }
// 5. call.hangup`;

	async function copySnippet(target: Exclude<CopyTarget, null>, value: string) {
		if (typeof navigator === 'undefined') return;

		await navigator.clipboard.writeText(value);
		copiedTarget = target;

		setTimeout(() => {
			if (copiedTarget === target) {
				copiedTarget = null;
			}
		}, 2000);
	}
</script>

<SEOHead
	title="BuildOS Integrations - OpenClaw Agent Bridge"
	description="Connect OpenClaw to BuildOS with a user-scoped BuildOS Agent Key. Learn how BuildOS authenticates callers, opens call sessions, and exposes scoped agent tools."
	canonical="https://build-os.com/integrations"
	keywords="BuildOS integrations, OpenClaw, agent key, AI agent integration, BuildOS API, BuildOS call gateway, external agent auth"
	ogType="website"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		'@id': `${SITE_URL}/integrations`,
		name: 'BuildOS Integrations',
		description:
			'Set up the OpenClaw to BuildOS agent bridge with user-scoped keys, call sessions, and scoped BuildOS tools.',
		url: `${SITE_URL}/integrations`,
		isPartOf: {
			'@id': DEFAULT_WEBSITE_ID
		},
		publisher: {
			'@id': DEFAULT_ORGANIZATION_ID
		}
	}}
/>

<div class="min-h-screen bg-background text-foreground">
	<section class="relative overflow-hidden border-b border-border">
		<div
			class="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-emerald-500/5"
		></div>

		<div class="container relative mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
			<div class="mx-auto max-w-5xl text-center">
				<div
					class="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-medium text-accent"
				>
					<Sparkles class="h-4 w-4" />
					<span>Live now: OpenClaw scoped tool bridge</span>
				</div>

				<h1 class="mb-6 text-3xl font-bold tracking-tight sm:text-4xl lg:text-6xl">
					Connect <span class="text-accent">OpenClaw</span> to your BuildOS agent
				</h1>

				<p
					class="mx-auto mb-8 max-w-3xl text-base text-muted-foreground sm:text-lg lg:text-xl"
				>
					BuildOS now supports an external agent call gateway for OpenClaw. Users generate
					a BuildOS Agent Key, OpenClaw dials that user&apos;s BuildOS agent, and BuildOS
					decides whether to accept the call and which tools the agent is allowed to use.
				</p>

				<div class="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
					<a
						href="/profile?tab=agent-keys"
						class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90"
					>
						Generate Agent Key
						<ArrowRight class="h-4 w-4" />
					</a>
					<a
						href="#how-it-works"
						class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent"
					>
						How It Works
					</a>
				</div>

				<div
					class="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground"
				>
					<Badge variant="success" size="sm">User-scoped</Badge>
					<Badge variant="info" size="sm">Revocable</Badge>
					<Badge variant="default" size="sm">Scoped direct tools</Badge>
					<Badge variant="warning" size="sm">Project-scoped</Badge>
				</div>
			</div>
		</div>
	</section>

	<section class="border-b border-border bg-card py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-5xl">
				<Alert variant="info" class="mb-8">
					<p class="text-sm text-foreground">
						<strong>Current status:</strong> the OpenClaw integration is live as a
						scoped agent bridge. Read tools are included by default, and task write
						tools appear only when granted. The user-facing setup lives in
						<a
							href="/profile?tab=agent-keys"
							class="ml-1 font-medium text-accent hover:underline"
						>
							Profile &gt; Agent Keys
						</a>.
					</p>
				</Alert>

				<div class="grid gap-6 lg:grid-cols-[1.15fr,0.85fr] lg:items-start">
					<div>
						<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">
							What this integration actually does
						</h2>
						<p class="mb-6 text-base text-muted-foreground sm:text-lg">
							This is not a generic chatbot-to-chatbot connection. OpenClaw is treated
							as an external caller. It receives a BuildOS-issued key, calls a
							specific user&apos;s BuildOS agent, and then works through a scoped tool
							contract.
						</p>

						<div class="space-y-4">
							{#each ['BuildOS remains the system of record for projects, tasks, docs, and permissions.', 'OpenClaw never gets direct database access.', 'BuildOS authenticates the caller before any tool access is granted.', 'The accepted call session becomes the trust boundary for all tool execution.'] as point}
								<div class="flex gap-3">
									<CheckCircle2 class="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
									<p class="text-sm text-foreground sm:text-base">{point}</p>
								</div>
							{/each}
						</div>
					</div>

					<Card variant="elevated" class="shadow-ink tx tx-frame tx-weak">
						<CardHeader>
							<div class="mb-3 inline-flex rounded-xl bg-accent/10 p-3 text-accent">
								<Shield class="h-6 w-6" />
							</div>
							<h3 class="text-xl font-semibold">BuildOS Agent Key</h3>
							<p class="mt-2 text-sm text-muted-foreground">
								The BuildOS Agent Key is the secret users give to OpenClaw so it can
								identify itself as a trusted caller.
							</p>
						</CardHeader>
						<CardBody class="space-y-3">
							<p class="text-sm text-muted-foreground">
								Each key belongs to one external agent installation. BuildOS stores
								only the hash, exposes the raw secret once, and lets the user rotate
								or revoke the key later.
							</p>
							<div class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
								<div class="font-medium text-foreground">Manage keys here</div>
								<a
									href="/profile?tab=agent-keys"
									class="mt-1 inline-block text-accent hover:underline"
								>
									/profile?tab=agent-keys
								</a>
							</div>
						</CardBody>
					</Card>
				</div>
			</div>
		</div>
	</section>

	<section id="how-it-works" class="py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center">
				<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">How it works</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					The OpenClaw integration follows a simple call model: identify the caller,
					identify the user BuildOS agent being called, accept or reject the call, then
					expose scoped tools.
				</p>
			</div>

			<div class="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
				{#each setupSteps as step, index}
					{@const StepIcon = step.icon}
					<Card variant="interactive" class="shadow-ink tx tx-frame tx-weak">
						<CardHeader>
							<div class="mb-4 flex items-center justify-between">
								<div class="inline-flex rounded-xl bg-accent/10 p-3 text-accent">
									<StepIcon class="h-6 w-6" />
								</div>
								<Badge variant="info" size="sm">Step {index + 1}</Badge>
							</div>
							<h3 class="text-lg font-semibold">{step.title}</h3>
							<p class="mt-2 text-sm text-muted-foreground">{step.description}</p>
						</CardHeader>
						<CardBody>
							<p class="text-sm text-foreground">{step.detail}</p>
						</CardBody>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<section class="border-y border-border bg-muted py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center">
				<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">The call model</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					If you think about this like a phone call, the abstraction is:
					<em class="text-foreground"> caller identity first, tool access second.</em>
				</p>
			</div>

			<div class="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
				{#each callConcepts as concept}
					{@const ConceptIcon = concept.icon}
					<Card variant="default" class="shadow-ink tx tx-grain tx-weak">
						<CardBody padding="md">
							<div
								class="mb-4 inline-flex rounded-xl bg-card p-3 text-accent shadow-ink-inner"
							>
								<ConceptIcon class="h-6 w-6" />
							</div>
							<h3 class="mb-2 text-lg font-semibold">{concept.title}</h3>
							<p class="text-sm text-muted-foreground">{concept.description}</p>
						</CardBody>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<section class="bg-card py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-6xl">
				<div class="grid gap-8 lg:grid-cols-[0.9fr,1.1fr] lg:items-start">
					<div>
						<Badge variant="info" size="md" class="mb-4 inline-flex items-center gap-2">
							<FileText class="h-4 w-4" />
							Available in v1
						</Badge>
						<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">
							What OpenClaw can access today
						</h2>
						<p class="mb-6 text-base text-muted-foreground sm:text-lg">
							The current bridge exposes a small, explicit BuildOS tool surface. These
							tools are only available after the call is accepted.
						</p>

						<div class="space-y-4">
							{#each availableTools as tool}
								<div class="rounded-lg border border-border bg-muted/20 p-4">
									<div class="font-mono text-sm font-semibold text-foreground">
										{tool.name}
									</div>
									<p class="mt-2 text-sm text-muted-foreground">
										{tool.description}
									</p>
								</div>
							{/each}
						</div>
					</div>

					<div>
						<Badge
							variant="warning"
							size="md"
							class="mb-4 inline-flex items-center gap-2"
						>
							<Rocket class="h-4 w-4" />
							Quick start
						</Badge>
						<h2 class="mb-4 text-2xl font-bold sm:text-3xl">
							What you paste into OpenClaw
						</h2>
						<p class="mb-6 text-base text-muted-foreground">
							BuildOS generates the values. OpenClaw stores them as plugin config or
							secrets and uses them when dialing the BuildOS gateway.
						</p>

						<div class="space-y-6">
							<Card
								variant="elevated"
								class="overflow-hidden shadow-ink tx tx-frame tx-weak"
							>
								<CardHeader class="flex items-center justify-between">
									<div>
										<h3 class="text-lg font-semibold">Env snippet</h3>
										<p class="mt-1 text-sm text-muted-foreground">
											BuildOS gives you these values from the Agent Keys
											screen.
										</p>
									</div>
									<Button
										variant="ghost"
										size="sm"
										class="gap-2"
										onclick={() => copySnippet('env', envSnippet)}
									>
										{#if copiedTarget === 'env'}
											<Check class="h-4 w-4 text-emerald-500" />
											Copied
										{:else}
											<Copy class="h-4 w-4" />
											Copy
										{/if}
									</Button>
								</CardHeader>
								<CardBody padding="lg">
									<pre class="overflow-x-auto text-xs sm:text-sm"><code
											>{envSnippet}</code
										></pre>
								</CardBody>
							</Card>

							<Card
								variant="elevated"
								class="overflow-hidden shadow-ink tx tx-frame tx-weak"
							>
								<CardHeader class="flex items-center justify-between">
									<div>
										<h3 class="text-lg font-semibold">Gateway request flow</h3>
										<p class="mt-1 text-sm text-muted-foreground">
											OpenClaw first dials the BuildOS agent, then lists and
											calls tools.
										</p>
									</div>
									<Button
										variant="ghost"
										size="sm"
										class="gap-2"
										onclick={() => copySnippet('dial', dialSnippet)}
									>
										{#if copiedTarget === 'dial'}
											<Check class="h-4 w-4 text-emerald-500" />
											Copied
										{:else}
											<Copy class="h-4 w-4" />
											Copy
										{/if}
									</Button>
								</CardHeader>
								<CardBody padding="lg">
									<pre class="overflow-x-auto text-xs sm:text-sm"><code
											>{dialSnippet}</code
										></pre>
								</CardBody>
							</Card>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="border-t border-border py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-5xl">
				<div class="mx-auto max-w-3xl text-center">
					<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">
						Current boundaries
					</h2>
					<p class="text-base text-muted-foreground sm:text-lg">
						The current integration is intentionally narrow. That is by design.
					</p>
				</div>

				<div class="mt-10 grid gap-4 md:grid-cols-2">
					{#each guardrails as guardrail}
						<div
							class="flex gap-3 rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak"
						>
							<CheckCircle2 class="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
							<p class="text-sm text-foreground">{guardrail}</p>
						</div>
					{/each}
				</div>

				<Alert variant="warning" class="mt-8">
					<p class="text-sm text-foreground">
						Task write tools are opt-in per key. Broader write surfaces, approvals, and
						long-running delegated runs are still outside this bridge while the trust
						boundary matures.
					</p>
				</Alert>
			</div>
		</div>
	</section>

	<section class="border-t border-border bg-card py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<Card variant="elevated" class="mx-auto max-w-4xl shadow-ink tx tx-bloom tx-weak">
				<CardBody padding="lg" class="text-center">
					<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">
						Ready to connect OpenClaw?
					</h2>
					<p class="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
						Start by generating a BuildOS Agent Key, then paste the emitted values into
						your OpenClaw plugin or secret configuration.
					</p>

					<div class="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
						<a
							href="/profile?tab=agent-keys"
							class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90"
						>
							Generate Agent Key
							<ArrowRight class="h-4 w-4" />
						</a>
						<a
							href="mailto:dj@build-os.com"
							class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent"
						>
							<MessageSquare class="h-4 w-4" />
							Ask a Question
						</a>
					</div>

					<p class="text-sm text-muted-foreground">
						If you are already signed in, the setup UI is at
						<a
							href="/profile?tab=agent-keys"
							class="ml-1 font-medium text-accent hover:underline"
						>
							/profile?tab=agent-keys
						</a>.
					</p>
				</CardBody>
			</Card>
		</div>
	</section>
</div>
