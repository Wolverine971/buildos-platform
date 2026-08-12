<!-- apps/web/src/lib/components/agent/AgentClientActionCard.svelte -->
<script lang="ts">
	import { Check, CircleAlert, ExternalLink, Loader, Mail } from 'lucide-svelte';
	import { startGmailOAuth } from '$lib/services/gmail-oauth.client';
	import type {
		AgentClientActionCompletion,
		GmailConnectionClientAction
	} from './agent-chat-client-actions';

	interface Props {
		action: GmailConnectionClientAction;
		onComplete?: (completion: AgentClientActionCompletion) => void | Promise<void>;
	}

	let { action, onComplete }: Props = $props();
	let status = $state<'idle' | 'connecting' | 'connected' | 'error'>('idle');
	let statusMessage = $state('');

	async function runAction() {
		if (status === 'connecting' || status === 'connected') return;
		status = 'connecting';
		statusMessage = 'Waiting for Google authorization…';
		try {
			const connection = await startGmailOAuth({
				connectionId: action.connectionId,
				emailAddress: action.emailAddress
			});
			status = 'connected';
			statusMessage = `${connection.emailAddress} is connected with read-only Gmail access.`;
			await onComplete?.({
				kind: 'connect_google_gmail',
				actionId: action.actionId,
				requestedEmailAddress: action.emailAddress,
				connectedEmailAddress: connection.emailAddress,
				connectionId: connection.id
			});
		} catch (error) {
			status = 'error';
			statusMessage =
				error instanceof Error ? error.message : 'Unable to connect this Gmail account.';
		}
	}
</script>

<section class="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-3 shadow-ink">
	<div class="flex items-start gap-2.5">
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-background text-accent"
		>
			{#if status === 'connected'}
				<Check class="h-4 w-4" aria-hidden="true" />
			{:else}
				<Mail class="h-4 w-4" aria-hidden="true" />
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<h3 class="text-sm font-semibold text-foreground">{action.title}</h3>
			<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{action.description}</p>

			<button
				type="button"
				onclick={runAction}
				disabled={status === 'connecting' || status === 'connected'}
				class="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground shadow-ink transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-65"
			>
				{#if status === 'connecting'}
					<Loader class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
					Connecting…
				{:else if status === 'connected'}
					<Check class="h-3.5 w-3.5" aria-hidden="true" />
					Connected
				{:else}
					<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
					{status === 'error' ? 'Try again' : action.buttonLabel}
				{/if}
			</button>

			{#if statusMessage}
				<p
					class="mt-2 flex items-start gap-1.5 text-xs {status === 'error'
						? 'text-destructive'
						: status === 'connected'
							? 'text-success'
							: 'text-muted-foreground'}"
					role="status"
				>
					{#if status === 'error'}
						<CircleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{/if}
					<span>{statusMessage}</span>
				</p>
			{/if}
		</div>
	</div>
</section>
