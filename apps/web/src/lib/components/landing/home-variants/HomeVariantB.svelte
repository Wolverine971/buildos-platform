<!-- apps/web/src/lib/components/landing/home-variants/HomeVariantB.svelte -->
<!--
  Homepage version B, "Try it": the box is the hero. A visitor writes (or picks an example)
  and the card beside it shows the kind of project BuildOS builds. Pressing Build carries their
  text through signup into chat (HomeDraftBox). Everything else on the page stays short.
-->
<script lang="ts">
	import {
		ArrowRight,
		ArrowUp,
		Bot,
		FolderKanban,
		LockKeyhole,
		MessageSquare,
		UserPlus
	} from '$lib/icons/lucide';
	import HomeDraftBox from './HomeDraftBox.svelte';
	import AssemblyPreview from './b/AssemblyPreview.svelte';
	import UpdateDemo from './b/UpdateDemo.svelte';
	import { ASSEMBLY_EXAMPLES, type AssemblyExample } from './b/examples';

	let draft = $state('');
	let draftBox = $state<ReturnType<typeof HomeDraftBox> | null>(null);
	let activeId = $state<AssemblyExample['id']>('novel');
	let runId = $state(0);

	const activeExample = $derived(
		ASSEMBLY_EXAMPLES.find((example) => example.id === activeId) ?? ASSEMBLY_EXAMPLES[0]
	);
	const previewCaption = $derived.by(() => {
		const text = draft.trim();
		if (!text) return `Example: a messy note about ${activeExample.subject} becomes this.`;
		if (text === activeExample.note.trim())
			return 'Example: what BuildOS builds from this note.';
		return 'Example of the result. Press Build and yours gets made from your notes.';
	});

	const STEPS = [
		{
			icon: UserPlus,
			title: 'Make an account.',
			body: 'Email or Google. Your notes come with you.'
		},
		{
			icon: MessageSquare,
			title: 'Chat opens with your notes.',
			body: 'Read them over, add anything you forgot, and press Send.'
		},
		{
			icon: FolderKanban,
			title: 'Your project appears and stays.',
			body: 'Goals, tasks, and docs you can open, change, and come back to.'
		}
	] as const;

	function pickExample(example: AssemblyExample) {
		activeId = example.id;
		draft = example.note;
		runId += 1;
		// On touch screens, opening the keyboard would cover the card that is building below.
		if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
			draftBox?.focusAtEnd();
		}
	}

	function backToBox() {
		draftBox?.focusAtEnd();
	}
</script>

<div class="min-h-screen bg-background text-foreground">
	<!-- Hero: the box -->
	<section class="border-b border-border">
		<div
			class="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12 lg:px-10 lg:py-20"
		>
			<div class="min-w-0">
				<h1
					class="text-balance text-4xl font-bold leading-[1.04] tracking-tighter sm:text-5xl lg:text-6xl"
				>
					Get the project out of your head<span class="text-accent">.</span>
				</h1>
				<p class="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
					Paste the messy version. BuildOS turns messy thinking into structured work you
					can come back to.
				</p>

				<div class="mt-7">
					<HomeDraftBox
						bind:this={draftBox}
						bind:value={draft}
						id="home-b-draft"
						rows={6}
						placeholder="What are you working on? Paste your notes, the half-plan, the parts you're stuck on."
					/>
				</div>

				<div class="mt-4">
					<p id="home-b-examples" class="text-xs text-muted-foreground">
						Or start from an example:
					</p>
					<div
						class="mt-2 flex flex-wrap gap-2"
						role="group"
						aria-labelledby="home-b-examples"
					>
						{#each ASSEMBLY_EXAMPLES as example (example.id)}
							{@const active = example.id === activeId}
							<button
								type="button"
								onclick={() => pickExample(example)}
								aria-pressed={active}
								class="pressable inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none {active
									? 'border-foreground bg-foreground text-background'
									: 'border-border-strong bg-background text-foreground hover:border-foreground/60 hover:bg-muted/50'}"
							>
								{example.chip}
							</button>
						{/each}
					</div>
				</div>

				<p class="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
					<LockKeyhole class="h-4 w-4 shrink-0" />
					<span>
						<strong class="font-semibold text-foreground">Private by default.</strong>
						14-day free trial, no credit card.
					</span>
				</p>
			</div>

			<div class="min-w-0 lg:pt-2">
				<p class="mb-3 text-xs text-muted-foreground" aria-live="polite">
					{previewCaption}
				</p>
				<AssemblyPreview example={activeExample} {runId} />
			</div>
		</div>
	</section>

	<!-- What happens when you press Build -->
	<section class="border-b border-border">
		<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
			<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
				What happens when you press Build
			</h2>
			<ol class="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
				{#each STEPS as step, index (step.title)}
					<li class="flex gap-4 sm:block">
						<span
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground"
						>
							<step.icon class="h-5 w-5" />
						</span>
						<div class="sm:mt-4">
							<h3 class="font-semibold">
								<span class="stamp mr-1 text-muted-foreground">{index + 1}.</span>
								{step.title}
							</h3>
							<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
								{step.body}
							</p>
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- Then tell it what changed -->
	<section class="border-b border-border bg-card/30">
		<div
			class="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-12 lg:px-10"
		>
			<div>
				<h2 class="text-2xl font-bold tracking-tight sm:text-3xl">
					Then tell it what changed.
				</h2>
				<p class="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
					Plans move. Say it in plain words and BuildOS finds the right task and updates
					it, so the project stays true without you tidying it.
				</p>
			</div>
			<UpdateDemo />
		</div>
	</section>

	<!-- Agents -->
	<section class="border-b border-border">
		<div
			class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10"
		>
			<div class="flex items-start gap-3">
				<Bot class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
				<p class="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
					<strong class="font-semibold text-foreground">Bring your agents.</strong>
					Claude, ChatGPT/Codex, and OpenClaw can read and update the same project through
					the BuildOS connector.
				</p>
			</div>
			<a
				href="/integrations"
				class="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-md px-2 text-sm font-semibold text-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:self-auto"
			>
				Connect an agent
				<ArrowRight class="h-4 w-4 shrink-0" />
			</a>
		</div>
	</section>

	<!-- Closing CTA -->
	<section class="py-14 sm:py-20">
		<div class="mx-auto max-w-2xl px-4 text-center sm:px-6">
			<h2 class="text-balance text-3xl font-bold tracking-tighter sm:text-4xl">
				Start with the messy version.
			</h2>
			<p class="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
				One project, the notes you already have. You can fix the rest as you go.
			</p>
			<div class="mt-7 flex flex-wrap items-center justify-center gap-3">
				<button
					type="button"
					onclick={backToBox}
					class="tx-button tx-button-accent inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<ArrowUp class="h-4 w-4 shrink-0" />
					Write it down
				</button>
				<a
					href="/pricing"
					class="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					See pricing
				</a>
			</div>
		</div>
	</section>
</div>
