<!-- apps/web/src/routes/today/preview/+page.svelte -->
<!--
  TEMPORARY dev-only preview of the WP-0 readiness-aware /today empty states.
  Renders the three visual states with mock data so they can be eyeballed without
  auth or specific account data. DELETE this route before committing.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { MessageCircle, Send, Sparkles } from '$lib/icons/lucide';

	// Mock state so the copied markup renders without the real page's wiring.
	let captureText = $state('');
	let captureVoiceRecording = $state(false);
	const noop = () => {};

	const waitingProjects = [
		{
			id: 'p1',
			name: 'Spooky Good Processing Speed',
			next_step_short: 'Draft week 3 speed-ladder session and log baseline times',
			next_step_long: null
		},
		{
			id: 'p2',
			name: 'BuildOS Marketing — Anti-feed',
			next_step_short: 'Record the T36 TikTok script and queue the LinkedIn lane',
			next_step_long: null
		},
		{
			id: 'p3',
			name: 'Investor Update — Q3',
			next_step_short: 'Pull the latest activation numbers into the deck',
			next_step_long: null
		}
	];
</script>

{#if !dev}
	<div class="p-10 text-center text-muted-foreground">Preview is dev-only.</div>
{:else}
	<div class="min-h-screen bg-background">
		<div class="mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-10">
			<p
				class="mb-6 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
			>
				⚠️ Temporary preview of the new <code>/today</code> empty states (WP-0). Not a real page
				— mock data, no auth. This route gets deleted before commit.
			</p>
		</div>

		<!-- STATE 1: zero-project first-run hero -->
		<div class="mx-auto max-w-2xl px-3 sm:px-4">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				State 1 — Brand-new user, zero projects
			</h3>
		</div>
		<main class="mx-auto max-w-2xl px-3 py-2 sm:px-4">
			<section class="mt-6 sm:mt-10" aria-label="Start your first project">
				<div
					class="wt-paper tx tx-grain tx-weak flex flex-col items-center gap-4 p-5 text-center sm:p-8"
				>
					<div class="rounded-md border border-accent/20 bg-accent/10 p-2.5">
						<Sparkles class="h-5 w-5 text-accent" />
					</div>
					<div class="max-w-md">
						<h2 class="text-lg font-semibold text-foreground sm:text-xl">
							Get it out of your head
						</h2>
						<p class="mt-1.5 text-sm text-muted-foreground">
							Brain-dump whatever you're working on — messy is fine. BuildOS turns it
							into a structured project with tasks and a clear next move.
						</p>
					</div>
					<div class="w-full max-w-md">
						<div
							class="wt-ghost border-dashed border-accent/40 p-2 text-left transition-colors focus-within:border-accent sm:p-2.5"
							role="presentation"
						>
							<TextareaWithVoice
								bind:value={captureText}
								bind:isRecording={captureVoiceRecording}
								placeholder="What are you working on? Dump it all here…"
								rows={3}
								maxRows={10}
								autoResize={true}
								showStatusRow={false}
								textareaClass="border-0 bg-transparent px-1 py-1 text-sm shadow-none focus:ring-0"
							/>
						</div>
						<div class="mt-3 flex justify-center">
							<Button
								onclick={noop}
								variant="primary"
								size="sm"
								icon={Send}
								disabled={!captureText.trim() || captureVoiceRecording}
							>
								Structure my first project
							</Button>
						</div>
					</div>
				</div>
			</section>
		</main>

		<hr class="mx-auto my-10 max-w-2xl border-border" />

		<!-- STATE 2: has projects, empty agenda -> "what's waiting" -->
		<div class="mx-auto max-w-2xl px-3 sm:px-4">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				State 2 — Has projects, nothing scheduled today
			</h3>
		</div>
		<main class="mx-auto max-w-2xl px-3 py-2 sm:px-4">
			<section class="mt-6 sm:mt-8" aria-label="What's waiting">
				<div class="wt-ghost border-dashed p-4 sm:p-6">
					<div class="mb-3 flex items-center gap-2">
						<Sparkles class="h-4 w-4 shrink-0 text-accent" />
						<h2 class="text-sm sm:text-base font-semibold text-foreground">
							Clear schedule — here's what's waiting
						</h2>
					</div>
					<ul class="flex flex-col gap-1">
						{#each waitingProjects as project (project.id)}
							<li>
								<a
									href={`/projects/${project.id}`}
									class="group flex items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									title={project.next_step_long ??
										project.next_step_short ??
										project.name}
								>
									<span
										class="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent"
									>
										Next
									</span>
									<span class="min-w-0 flex-1">
										<span
											class="block truncate text-xs text-foreground sm:text-sm"
										>
											{project.next_step_short}
										</span>
										<span
											class="block truncate text-[11px] text-muted-foreground"
										>
											{project.name}
										</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
					<div class="mt-3">
						<Button onclick={noop} variant="outline" size="sm" icon={MessageCircle}>
							Plan my day
						</Button>
					</div>
				</div>
			</section>
		</main>

		<hr class="mx-auto my-10 max-w-2xl border-border" />

		<!-- STATE 3: has projects, no undated next-steps -> calm clear-day fallback -->
		<div class="mx-auto max-w-2xl px-3 sm:px-4">
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				State 3 — Genuinely clear day (calm fallback)
			</h3>
		</div>
		<main class="mx-auto max-w-2xl px-3 py-2 sm:px-4">
			<div
				class="mt-8 flex flex-col items-center gap-3 wt-ghost border-dashed p-6 text-center sm:mt-12 sm:p-10"
			>
				<div class="rounded-md border border-accent/20 bg-accent/10 p-2 sm:p-3">
					<Sparkles class="h-4 w-4 text-accent sm:h-5 sm:w-5" />
				</div>
				<div>
					<h2 class="text-sm font-semibold text-foreground sm:text-base">
						Clear day ahead
					</h2>
					<p class="mt-1 text-xs text-muted-foreground sm:text-sm">
						Nothing scheduled and no tasks due. Capture what's on your mind or plan the
						day with a chat.
					</p>
				</div>
				<Button onclick={noop} variant="outline" size="sm" icon={MessageCircle}>
					Plan my day
				</Button>
			</div>
		</main>

		<div class="mx-auto max-w-2xl px-3 py-10 sm:px-4">
			<p class="text-xs text-muted-foreground">
				Not shown here (it's a routing behavior, covered by passing tests): an un-onboarded
				user hitting <code>/</code> or <code>/today</code> is redirected into
				<code>/onboarding</code> rather than seeing any of the above.
			</p>
		</div>
	</div>
{/if}
