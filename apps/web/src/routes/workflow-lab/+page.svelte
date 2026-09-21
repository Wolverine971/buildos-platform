<!-- apps/web/src/routes/workflow-lab/+page.svelte -->
<script lang="ts">
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import ChatSessionAuditActions from '$lib/components/agent/ChatSessionAuditActions.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let projectId = $state('');
	let question = $state(
		'What should we prioritize next, and what risks or missing information could change that recommendation?'
	);
	let review = $state<{ projectId: string; question: string; name: string } | null>(null);
	// The chat session that actually exists for this review, reported by the modal. Never
	// guessed from the project or from "most recent"; cleared whenever a new review starts.
	let sessionId = $state<string | null>(null);
	function start(event: SubmitEvent) {
		event.preventDefault();
		const project = data.projects.find((project) => project.id === projectId);
		if (project && question.trim().length >= 3) {
			sessionId = null;
			review = { projectId, question: question.trim(), name: project.name };
		}
	}
</script>

<svelte:head><title>Workflow lab · BuildOS</title></svelte:head>

<main class="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
	<header>
		<p class="text-xs uppercase tracking-widest text-muted-foreground">
			BuildOS · Internal prototype
		</p>
		<h1 class="mt-2 text-2xl font-semibold text-foreground">One question. Two perspectives.</h1>
		<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
			A planner divides your question between a project analyst and a risk reviewer. BuildOS
			combines their findings into one recommendation.
		</p>
		<a
			href="/workflow-lab/specialists"
			class="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
			>Open specialist workbench →</a
		>
	</header>
	{#if review}
		<div class="flex items-center justify-between gap-3">
			<p class="min-w-0 truncate text-sm text-muted-foreground">
				Reviewing <strong class="text-foreground">{review.name}</strong>
			</p>
			<div class="flex shrink-0 items-center gap-2">
				<!-- Admin-only: Logs / Trace / Export for the real session. Renders nothing until
				     the modal reports a session id, and nothing for non-admins. Links open in a
				     new tab so the running review is never lost. -->
				<ChatSessionAuditActions {sessionId} includeWorkflowTrace={true} />
				<a class="text-sm underline" href="/workflow-lab" data-sveltekit-reload
					>New review</a
				>
			</div>
		</div>
		<div class="min-h-[36rem] flex-1 overflow-hidden rounded-xl border border-border bg-card">
			<AgentChatModal
				isOpen={true}
				embedded={true}
				contextType="project"
				entityId={review.projectId}
				initialProjectFocus={{
					projectId: review.projectId,
					projectName: review.name,
					focusType: 'project-wide',
					focusEntityId: null,
					focusEntityName: null
				}}
				initialDraft={`/workflow ${review.question}`}
				autoSendInitialDraft={true}
				onSessionChange={(id) => {
					sessionId = id;
				}}
				onClose={() => {
					review = null;
					sessionId = null;
				}}
				composerPlaceholder="Start another review with /workflow …"
			/>
		</div>
		<p class="text-xs text-muted-foreground">
			Use /workflow for each review. Other messages use ordinary project chat. Leaving this
			page does not cancel a running review; use Stop in chat.
		</p>
	{:else}
		<form
			onsubmit={start}
			class="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7"
		>
			<label class="block text-sm font-medium text-foreground"
				>Project
				<select
					bind:value={projectId}
					required
					class="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2"
				>
					<option value="" disabled>Choose a project</option>
					{#each data.projects as project (project.id)}<option value={project.id}
							>{project.name}</option
						>{/each}
				</select>
			</label>
			<label class="block text-sm font-medium text-foreground"
				>What would you like to understand?
				<textarea
					bind:value={question}
					required
					minlength="3"
					maxlength="6000"
					rows="4"
					class="mt-2 block w-full resize-y rounded-md border border-border bg-background px-3 py-2 leading-relaxed"
				></textarea>
			</label>
			<p class="text-sm text-muted-foreground">
				Reads saved project context and shows both specialists’ findings. This review does
				not edit your project or search the web.
			</p>
			<button
				type="submit"
				disabled={!projectId || question.trim().length < 3}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
				>Start project review</button
			>
			{#if data.projects.length === 0}<p class="text-sm text-muted-foreground">
					Create a project first, then return here to review it.
				</p>{/if}
		</form>
	{/if}
</main>
