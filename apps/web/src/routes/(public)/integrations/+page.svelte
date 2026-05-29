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
			title: 'Generate a key in BuildOS',
			description:
				'Go to Profile > Agent Keys. Pick which projects the key can see and whether it can read or also write.',
			detail: 'BuildOS shows a one-time token plus an env block you can paste directly into your tool. The full secret is shown once — BuildOS only stores a hash.',
			icon: Lock
		},
		{
			title: 'Paste the env block into your tool',
			description:
				'Drop the values into your tool’s config file or secret store — Claude Code config, Cursor settings, ChatGPT Custom GPT actions, your own script’s env.',
			detail: 'Never paste the token into chat input or have the agent read it from a chat message. It belongs in env, not memory.',
			icon: Brain
		},
		{
			title: 'Tell your agent to dial BuildOS',
			description:
				'Say something like “connect to BuildOS, list my projects.” Your tool calls the BuildOS gateway and opens a scoped session.',
			detail: 'BuildOS verifies the caller and the scope before any tools are exposed. Per-project, per-op, per-key.',
			icon: MessageSquare
		},
		{
			title: 'Work off the same sheet of paper',
			description:
				'Your agent can list projects, read tasks and docs, and — if the key allows — write back to them. Same project state every session.',
			detail: 'Surfaced tools: skill_load, tool_search, tool_schema, plus direct ops like list_onto_projects, list_onto_tasks, create_onto_task, and update_onto_task.',
			icon: Target
		}
	];

	const supportedTools = [
		{
			name: 'Claude Code',
			description:
				'CLI for engineering and writing. Paste the env into your config file, ask Claude to dial BuildOS.',
			status: 'works today'
		},
		{
			name: 'Cursor',
			description:
				'IDE-native AI. Drop the env into agent settings, then prompt Cursor to list your projects.',
			status: 'works today'
		},
		{
			name: 'Claude Desktop',
			description:
				'Chat with file access. Configure the connector with the env block and ask Claude to connect.',
			status: 'works today'
		},
		{
			name: 'ChatGPT (Custom GPT)',
			description:
				'Wire BuildOS into a Custom GPT’s actions with the bearer token from the env block.',
			status: 'works today'
		},
		{
			name: 'Custom HTTP / scripts',
			description:
				'Any tool that can make an HTTP request works. The bootstrap URL gives you the env block.',
			status: 'works today'
		},
		{
			name: 'OpenClaw',
			description:
				'The original integration. Use this surface once the OpenClaw connector ships.',
			status: 'connector in progress'
		}
	];

	const callConcepts = [
		{
			title: 'Your BuildOS workspace',
			description:
				'Each user has an internal BuildOS agent identity. Your tool dials this when it wants to read or write your projects.',
			icon: Users
		},
		{
			title: 'Agent key',
			description:
				'Each tool gets its own BuildOS-issued bearer token. BuildOS stores only the hash. Rotate or revoke any time.',
			icon: Lock
		},
		{
			title: 'Scoped session',
			description:
				'The tool does not impersonate your browser session. It opens a separate, scoped call session that BuildOS can accept or reject.',
			icon: GitBranch
		},
		{
			title: 'Per-op tool access',
			description:
				'Read access is included by default. Write ops appear only when the key explicitly grants them.',
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
		'Your tool gets a BuildOS-issued key, never your browser session.',
		'Calls are user-scoped. A caller cannot dial another user’s BuildOS workspace.',
		'Project scoping is enforced before any tool runs.',
		'Read access is included by default. Write ops appear only when the key explicitly grants them.',
		'Keys can be rotated or revoked from Profile > Agent Keys.'
	];

	const envSnippet = `BUILDOS_BASE_URL=https://build-os.com
BUILDOS_AGENT_TOKEN=boca_your_one_time_secret
BUILDOS_CALLEE_HANDLE=buildos:user:YOUR_USER_ID
BUILDOS_CALLER_KEY=your-tool:install:your-handle`;

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
      "provider": "claude-code",
      "caller_key": "your-tool:install:your-handle"
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
	title="Connect Anthropic, OpenAI, and OpenClaw to BuildOS"
	description="One key, every project. Connect Claude, ChatGPT, OpenClaw, or any HTTP-capable tool to your BuildOS workspace with per-project scope and audit logs."
	canonical="https://build-os.com/integrations"
	keywords="BuildOS integrations, Anthropic BuildOS, OpenAI BuildOS, OpenClaw, Claude Code BuildOS, Cursor BuildOS, Claude Desktop BuildOS, ChatGPT BuildOS, agent context, AI context surface, agent keys"
	ogType="website"
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		'@id': `${SITE_URL}/integrations`,
		name: 'Connect Anthropic, OpenAI, and OpenClaw to BuildOS',
		description:
			'Give Claude (Anthropic), ChatGPT (OpenAI), OpenClaw, or any HTTP-capable tool a scoped read/write into your BuildOS projects. Per-project scope, per-op write whitelist, audit log.',
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
					<span>Live now: connect your AI tools to BuildOS</span>
				</div>

				<h1 class="mb-6 text-3xl font-bold tracking-tight sm:text-4xl lg:text-6xl">
					Connect your <span class="text-accent">agents</span> to BuildOS
				</h1>

				<div class="mx-auto mb-8 max-w-3xl space-y-4 text-base text-muted-foreground sm:text-lg lg:text-xl">
					<p>
						BuildOS is not another agent. BuildOS is where the project lives so every
						human and agent can work from the same memory.
					</p>
					<p>
						Give Claude Code, Cursor, Claude Desktop, ChatGPT, or any HTTP-capable tool
						a scoped read/write into it.
					</p>
				</div>

				<div class="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
					<a
						href="/profile?tab=agent-keys"
						class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90"
					>
						Generate a key
						<ArrowRight class="h-4 w-4" />
					</a>
					<a
						href="#how-it-works"
						class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent"
					>
						How it works
					</a>
				</div>

				<div
					class="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground"
				>
					<Badge variant="success" size="sm">Per-project scope</Badge>
					<Badge variant="info" size="sm">Per-op write whitelist</Badge>
					<Badge variant="default" size="sm">Audit log</Badge>
					<Badge variant="warning" size="sm">Rotate or revoke any time</Badge>
				</div>
			</div>
		</div>
	</section>

	<!-- Tools that work today -->
	<section class="border-b border-border py-12 sm:py-16">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-3xl text-center mb-8">
				<h2 class="mb-3 text-2xl font-bold sm:text-3xl">
					Works with Anthropic, OpenAI, and OpenClaw
				</h2>
				<p class="text-base text-muted-foreground">
					Same key. Same scope. Different tools. Anything that can call HTTP can connect.
				</p>
			</div>

			<!-- Provider chips — mirrors the "Works with" row in /landing-v2 -->
			<div class="mx-auto max-w-3xl mb-10">
				<div
					class="text-center text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground mb-3"
				>
					Works with
				</div>
				<div class="flex flex-wrap items-center justify-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-ink-inner px-3 py-1.5"
						title="Anthropic — Claude / Claude Code / Claude Desktop"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							class="w-4 h-4 text-foreground"
							fill="currentColor"
						>
							<path
								d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5527h3.7442L10.5363 3.541Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"
							/>
						</svg>
						<span class="text-xs font-medium text-foreground">Anthropic · Claude</span>
					</span>
					<span
						class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-ink-inner px-3 py-1.5"
						title="OpenAI — ChatGPT / Codex"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							class="w-4 h-4 text-foreground"
							fill="currentColor"
						>
							<path
								d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
							/>
						</svg>
						<span class="text-xs font-medium text-foreground">OpenAI · ChatGPT</span>
					</span>
					<span
						class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-ink-inner px-3 py-1.5"
						title="OpenClaw"
					>
						<img
							src="/brands/openclaw.png"
							alt=""
							aria-hidden="true"
							class="w-4 h-4 object-contain"
							width="16"
							height="16"
							decoding="async"
						/>
						<span class="text-xs font-medium text-foreground">OpenClaw</span>
					</span>
				</div>
				<p
					class="mt-3 text-center text-xs text-muted-foreground max-w-xl mx-auto leading-relaxed"
				>
					Anthropic (Claude / Claude Code / Claude Desktop) and OpenAI (ChatGPT / Codex)
					connect today with the same env block. The OpenClaw connector is in progress —
					same key will work once it ships.
				</p>
			</div>

			<div class="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each supportedTools as tool}
					<Card variant="default" class="shadow-ink tx tx-frame tx-weak">
						<CardBody padding="md">
							<div class="flex items-start justify-between gap-2 mb-2">
								<h3 class="text-base font-semibold text-foreground">{tool.name}</h3>
								{#if tool.status === 'works today'}
									<Badge variant="success" size="sm">Works today</Badge>
								{:else}
									<Badge variant="warning" size="sm">In progress</Badge>
								{/if}
							</div>
							<p class="text-sm text-muted-foreground">{tool.description}</p>
						</CardBody>
					</Card>
				{/each}
			</div>
		</div>
	</section>

	<section class="border-b border-border bg-card py-12 sm:py-16 lg:py-20">
		<div class="container mx-auto px-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-5xl">
				<Alert variant="info" class="mb-8">
					<p class="text-sm text-foreground">
						<strong>Status:</strong> the agent-key gateway is live. Read access is
						included by default, write ops appear only when explicitly granted. Manage
						keys in
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
							Your projects, your tools, one place
						</h2>
						<p class="mb-6 text-base text-muted-foreground sm:text-lg">
							Your AI tools forget every session. BuildOS doesn’t. Your projects live
							here. Your tools read off them — not from your last copy-paste.
						</p>

						<div class="space-y-4">
							{#each ['BuildOS is the system of record for your projects, tasks, docs, and decisions.', 'Your tools never get direct database access. They go through a scoped session.', 'BuildOS verifies the caller before any tool runs. Per-project, per-op, per-key.', 'No vendor SDK. No OAuth dance. No retraining your agents on your context every session.'] as point}
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
							<h3 class="text-xl font-semibold">One key per tool</h3>
							<p class="mt-2 text-sm text-muted-foreground">
								Each tool installation gets its own BuildOS-issued key. The secret
								is shown once on generate — BuildOS only stores a hash.
							</p>
						</CardHeader>
						<CardBody class="space-y-3">
							<p class="text-sm text-muted-foreground">
								Scope each key to specific projects. Whitelist which write ops it
								can perform. Rotate or revoke from your profile any time. Audit log
								shows every tool call, every write, every error.
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
					Four steps from cold install to your agent reading your projects. Same flow for
					every tool — the only thing that changes is where you paste the env.
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
				<h2 class="mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">The trust model</h2>
				<p class="text-base text-muted-foreground sm:text-lg">
					Think of it like a phone call:
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
							What your tools can do today
						</h2>
						<p class="mb-6 text-base text-muted-foreground sm:text-lg">
							A small, explicit tool surface. Tools are only exposed after the call is
							accepted, and write ops only when the key explicitly grants them.
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
							What you paste into your tool
						</h2>
						<p class="mb-6 text-base text-muted-foreground">
							BuildOS generates the env block. Your tool stores it in a secret store
							or config file and uses it when calling the gateway. Same block, every
							tool.
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
											Your tool dials BuildOS, lists what it can call, then
											calls tools by name.
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
						long-running delegated runs are still outside this surface while the trust
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
						Stop re-explaining your projects to every chat
					</h2>
					<p class="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
						Generate your first key, paste it into the tool you use most, and let your
						agents read off the same sheet of paper as you.
					</p>

					<div class="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
						<a
							href="/profile?tab=agent-keys"
							class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90"
						>
							Generate your first key
							<ArrowRight class="h-4 w-4" />
						</a>
						<a
							href="mailto:dj@build-os.com"
							class="inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-3 font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:text-accent"
						>
							<MessageSquare class="h-4 w-4" />
							Ask a question
						</a>
					</div>

					<p class="text-sm text-muted-foreground">
						Signed in already? Go straight to
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
