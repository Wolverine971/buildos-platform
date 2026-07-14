<!-- apps/web/src/lib/components/email/EmailPreview.svelte -->
<script lang="ts">
	import { generateSafeEmailPreviewHTML } from '$lib/utils/emailPreview';
	import { Eye, Calendar, Users } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';

	let {
		emailData,
		showTracking = false,
		trackingData = null
	}: {
		emailData: any;
		showTracking?: boolean;
		trackingData?: any;
	} = $props();

	let timeZone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		});
	}

	let emailHTML = $derived(
		generateSafeEmailPreviewHTML({
			subject: emailData.subject || 'Preview',
			content: emailData.content || '',
			trackingPixel: '' // No tracking pixel in preview
		})
	);

	function openPreviewInNewWindow(): void {
		const previewUrl = URL.createObjectURL(new Blob([emailHTML], { type: 'text/html' }));
		const previewWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer');

		if (previewWindow) {
			previewWindow.opener = null;
		}

		// The new document only needs the object URL while it is loading.
		window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
	}
</script>

<div class="space-y-6">
	<!-- Email Metadata -->
	<div class="bg-muted rounded-lg p-4">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
			<div>
				<span class="font-medium text-foreground">From:</span>
				<span class="text-foreground ml-2">
					{emailData.from_name} &lt;{emailData.from_email}&gt;
				</span>
			</div>
			<div>
				<span class="font-medium text-foreground">Subject:</span>
				<span class="text-foreground ml-2">{emailData.subject}</span>
			</div>
			<div>
				<span class="font-medium text-foreground">Recipients:</span>
				<span class="text-foreground ml-2">{emailData.recipients.length}</span>
			</div>
			<div>
				<span class="font-medium text-foreground">Status:</span>
				<span
					class="inline-flex ml-2 px-2 py-1 text-xs font-medium rounded-full {emailData.status ===
					'sent'
						? 'bg-success/10 text-success'
						: emailData.status === 'scheduled'
							? 'bg-info/10 text-info'
							: emailData.status === 'failed'
								? 'bg-destructive/10 text-destructive'
								: 'bg-muted text-foreground dark:text-muted-foreground'}"
				>
					{emailData.status}
				</span>
			</div>
		</div>

		{#if emailData.scheduled_at}
			<div class="mt-2 flex items-center text-sm text-muted-foreground">
				<Calendar class="h-4 w-4 mr-1" />
				Scheduled for: {formatDate(emailData.scheduled_at)}
			</div>
		{/if}
	</div>

	<!-- Tracking Information -->
	{#if showTracking && trackingData}
		<div class="bg-info/10 rounded-lg p-4">
			<h3 class="font-medium text-info mb-3 flex items-center">
				<Eye class="h-4 w-4 mr-2" />
				Email Tracking
			</h3>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
				<div>
					<span class="font-medium text-info">Total Opens:</span>
					<span class="text-foreground ml-2">{trackingData.total_opens || 0}</span>
				</div>
				<div>
					<span class="font-medium text-info">Unique Opens:</span>
					<span class="text-foreground ml-2">{trackingData.unique_opens || 0}</span>
				</div>
				<div>
					<span class="font-medium text-info">Open Rate:</span>
					<span class="text-foreground ml-2">
						{trackingData.open_rate ? `${trackingData.open_rate.toFixed(1)}%` : '0%'}
					</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Email Preview -->
	<div class="border border-border rounded-lg overflow-hidden">
		<div class="bg-muted px-4 py-2 border-b border-border">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-foreground">Email Preview</span>
				<div class="flex items-center space-x-2">
					<Button
						onclick={openPreviewInNewWindow}
						variant="ghost"
						size="sm"
						class="!text-info hover:!text-info/80"
					>
						Open in new window
					</Button>
				</div>
			</div>
		</div>

		<!-- Preview Container -->
		<div class="bg-card relative">
			<!-- Mobile Preview Toggle -->
			<div class="p-4 border-b border-border bg-muted">
				<div class="flex items-center justify-center space-x-4">
					<span class="text-sm text-muted-foreground">Preview:</span>
					<Button variant="secondary" size="sm" class="!bg-info/10 !text-info">
						Desktop
					</Button>
				</div>
			</div>

			<!-- Email Content Frame -->
			<div class="p-4 bg-muted min-h-[600px]">
				<div
					class="max-w-full mx-auto bg-card rounded-lg shadow-ink-strong overflow-hidden"
				>
					<iframe
						title={`Email preview: ${emailData.subject || 'Preview'}`}
						srcdoc={emailHTML}
						sandbox="allow-popups allow-popups-to-escape-sandbox"
						referrerpolicy="no-referrer"
						class="block h-[600px] w-full bg-card border-0"
					></iframe>
				</div>
			</div>
		</div>
	</div>

	<!-- Recipients List -->
	{#if emailData?.recipients?.length > 0}
		<div class="bg-card rounded-lg border border-border overflow-hidden">
			<div class="px-4 py-3 border-b border-border">
				<h3 class="font-medium text-foreground flex items-center">
					<Users class="h-4 w-4 mr-2" />
					Recipients ({emailData.recipients.length})
				</h3>
			</div>
			<div class="max-h-64 overflow-y-auto">
				<div class="divide-y divide-border">
					{#each emailData.recipients as recipient (recipient.id ?? recipient.recipient_email)}
						<div class="px-4 py-3 flex items-center justify-between">
							<div class="flex items-center space-x-3">
								<div class="flex-shrink-0">
									<div
										class="h-8 w-8 rounded-full bg-info/10 flex items-center justify-center"
									>
										<span class="text-xs font-medium text-info">
											{recipient.recipient_name
												? recipient.recipient_name.charAt(0).toUpperCase()
												: recipient.recipient_email.charAt(0).toUpperCase()}
										</span>
									</div>
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium text-foreground truncate">
										{recipient.recipient_name || 'Unknown'}
									</p>
									<p class="text-sm text-muted-foreground truncate">
										{recipient.recipient_email}
									</p>
								</div>
							</div>
							<div class="flex items-center space-x-2">
								{#if recipient.status}
									<span
										class="inline-flex px-2 py-1 text-xs font-medium rounded-full {recipient.status ===
										'sent'
											? 'bg-success/10 text-success'
											: recipient.status === 'delivered'
												? 'bg-info/10 text-info'
												: recipient.status === 'failed'
													? 'bg-destructive/10 text-destructive'
													: 'bg-muted text-foreground dark:text-muted-foreground'}"
									>
										{recipient.status}
									</span>
								{/if}
								{#if recipient.opened_at}
									<span class="text-xs text-success flex items-center">
										<Eye class="h-3 w-3 mr-1" />
										Opened
									</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
