<!-- apps/web/src/lib/components/email-campaigns/EmailRenderFrame.svelte -->
<!--
	The email exactly as the recipient gets it: plain template, the unsubscribe
	line, and the PO box footer. Rendered in a sandboxed iframe (no scripts);
	links open in a new tab.
-->
<script lang="ts">
	import { renderCampaignEmailDocument } from '$lib/email-campaigns/render';

	let {
		subject,
		bodyHtml,
		fromName = 'DJ',
		fromEmail = 'dj@build-os.com',
		toLabel = '',
		minHeight = 420,
		class: className = ''
	}: {
		subject: string;
		bodyHtml: string;
		fromName?: string;
		fromEmail?: string;
		toLabel?: string;
		minHeight?: number;
		class?: string;
	} = $props();

	const PREVIEW_CSP =
		"default-src 'none'; script-src 'none'; object-src 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src https: http: data:";

	const srcdoc = $derived.by(() => {
		const html = renderCampaignEmailDocument(
			{ subject, bodyHtml },
			{ unsubscribeUrl: '#unsubscribe-preview' }
		);
		const head = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><base target="_blank">`;
		return html.includes('<head>') ? html.replace('<head>', `<head>${head}`) : `${head}${html}`;
	});
</script>

<div class="overflow-hidden rounded-lg border border-border bg-background shadow-ink {className}">
	<dl class="space-y-1 border-b border-border bg-muted/40 px-3 py-2.5 text-xs">
		<div class="flex min-w-0 gap-2">
			<dt class="w-14 shrink-0 text-muted-foreground">From</dt>
			<dd class="min-w-0 truncate text-foreground">{fromName} &lt;{fromEmail}&gt;</dd>
		</div>
		{#if toLabel}
			<div class="flex min-w-0 gap-2">
				<dt class="w-14 shrink-0 text-muted-foreground">To</dt>
				<dd class="min-w-0 truncate text-foreground">{toLabel}</dd>
			</div>
		{/if}
		<div class="flex min-w-0 gap-2">
			<dt class="w-14 shrink-0 text-muted-foreground">Subject</dt>
			<dd class="min-w-0 break-words font-medium text-foreground">
				{subject || '(no subject)'}
			</dd>
		</div>
	</dl>
	<iframe
		title="Email preview: {subject || 'no subject'}"
		{srcdoc}
		sandbox="allow-popups allow-popups-to-escape-sandbox"
		referrerpolicy="no-referrer"
		class="block w-full bg-white"
		style="min-height: {minHeight}px; height: {minHeight}px;"
	></iframe>
</div>
