<!-- apps/web/src/lib/components/email/EmailPreview.svelte -->
<script lang="ts">
	import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
	import { Eye, Calendar, Users } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';

	export let emailData: any;
	export let showTracking: boolean = false;
	export let trackingData: any = null;

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

	$: emailHTML = generateMinimalEmailHTML({
		subject: emailData.subject || 'Preview',
		content: emailData.content || '',
		trackingPixel: '' // No tracking pixel in preview
	});
</script>

<div class="space-y-6">
	<!-- Email Metadata -->
	<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
			<div>
				<span class="font-medium text-gray-700 dark:text-gray-300">From:</span>
				<span class="text-gray-900 dark:text-white ml-2">
					{emailData.from_name} &lt;{emailData.from_email}&gt;
				</span>
			</div>
			<div>
				<span class="font-medium text-gray-700 dark:text-gray-300">Subject:</span>
				<span class="text-gray-900 dark:text-white ml-2">{emailData.subject}</span>
			</div>
			<div>
				<span class="font-medium text-gray-700 dark:text-gray-300">Recipients:</span>
				<span class="text-gray-900 dark:text-white ml-2">{emailData.recipients.length}</span
				>
			</div>
			<div>
				<span class="font-medium text-gray-700 dark:text-gray-300">Status:</span>
				<span
					class="inline-flex ml-2 px-2 py-1 text-xs font-medium rounded-full {emailData.status ===
					'sent'
						? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
						: emailData.status === 'scheduled'
							? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
							: emailData.status === 'failed'
								? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
								: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'}"
				>
					{emailData.status}
				</span>
			</div>
		</div>

		{#if emailData.scheduled_at}
			<div class="mt-2 flex items-center text-sm text-gray-600 dark:text-gray-400">
				<Calendar class="h-4 w-4 mr-1" />
				Scheduled for: {formatDate(emailData.scheduled_at)}
			</div>
		{/if}
	</div>

	<!-- Tracking Information -->
	{#if showTracking && trackingData}
		<div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
			<h3 class="font-medium text-blue-900 dark:text-blue-300 mb-3 flex items-center">
				<Eye class="h-4 w-4 mr-2" />
				Email Tracking
			</h3>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
				<div>
					<span class="font-medium text-blue-700 dark:text-blue-300">Total Opens:</span>
					<span class="text-blue-900 dark:text-blue-100 ml-2"
						>{trackingData.total_opens || 0}</span
					>
				</div>
				<div>
					<span class="font-medium text-blue-700 dark:text-blue-300">Unique Opens:</span>
					<span class="text-blue-900 dark:text-blue-100 ml-2"
						>{trackingData.unique_opens || 0}</span
					>
				</div>
				<div>
					<span class="font-medium text-blue-700 dark:text-blue-300">Open Rate:</span>
					<span class="text-blue-900 dark:text-blue-100 ml-2">
						{trackingData.open_rate ? `${trackingData.open_rate.toFixed(1)}%` : '0%'}
					</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Email Preview -->
	<div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
		<div
			class="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600"
		>
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Email Preview</span
				>
				<div class="flex items-center space-x-2">
					<Button
						onclick={() => {
							const newWindow = window.open('', '_blank');
							newWindow.document.write(emailHTML);
							newWindow.document.close();
						}}
						variant="ghost"
						size="sm"
						class="!text-blue-600 dark:!text-blue-400 hover:!text-blue-800 dark:hover:!text-blue-300"
					>
						Open in new window
					</Button>
				</div>
			</div>
		</div>

		<!-- Preview Container -->
		<div class="bg-white dark:bg-gray-800 relative">
			<!-- Mobile Preview Toggle -->
			<div
				class="p-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
			>
				<div class="flex items-center justify-center space-x-4">
					<span class="text-sm text-gray-600 dark:text-gray-400">Preview:</span>
					<Button
						variant="secondary"
						size="sm"
						class="!bg-blue-100 !text-blue-800 dark:!bg-blue-900 dark:!text-blue-300"
					>
						Desktop
					</Button>
				</div>
			</div>

			<!-- Email Content Frame -->
			<div class="p-4 bg-gray-100 dark:bg-gray-900 min-h-[600px]">
				<div class="max-w-full mx-auto">
					<!-- Render the email HTML -->
					<div class="bg-white rounded-lg shadow-lg overflow-hidden">
						{@html emailHTML}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Recipients List -->
	{#if emailData?.recipients?.length > 0}
		<div
			class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
		>
			<div class="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
				<h3 class="font-medium text-gray-900 dark:text-white flex items-center">
					<Users class="h-4 w-4 mr-2" />
					Recipients ({emailData.recipients.length})
				</h3>
			</div>
			<div class="max-h-64 overflow-y-auto">
				<div class="divide-y divide-gray-200 dark:divide-gray-600">
					{#each emailData.recipients as recipient}
						<div class="px-4 py-3 flex items-center justify-between">
							<div class="flex items-center space-x-3">
								<div class="flex-shrink-0">
									<div
										class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
									>
										<span
											class="text-xs font-medium text-blue-800 dark:text-blue-200"
										>
											{recipient.recipient_name
												? recipient.recipient_name.charAt(0).toUpperCase()
												: recipient.recipient_email.charAt(0).toUpperCase()}
										</span>
									</div>
								</div>
								<div class="min-w-0 flex-1">
									<p
										class="text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{recipient.recipient_name || 'Unknown'}
									</p>
									<p class="text-sm text-gray-500 dark:text-gray-400 truncate">
										{recipient.recipient_email}
									</p>
								</div>
							</div>
							<div class="flex items-center space-x-2">
								{#if recipient.status}
									<span
										class="inline-flex px-2 py-1 text-xs font-medium rounded-full {recipient.status ===
										'sent'
											? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
											: recipient.status === 'delivered'
												? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
												: recipient.status === 'failed'
													? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
													: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'}"
									>
										{recipient.status}
									</span>
								{/if}
								{#if recipient.opened_at}
									<span
										class="text-xs text-green-600 dark:text-green-400 flex items-center"
									>
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

<style lang="postcss">
	/* Ensure email content in preview looks good */
	:global(.email-content img) {
		max-width: 100%;
		height: auto;
		border-radius: 8px;
		margin: 16px 0;
	}

	:global(.email-content h1) {
		font-size: 28px;
		font-weight: 700;
		color: #111827;
		margin-bottom: 16px;
	}

	:global(.email-content h2) {
		font-size: 24px;
		font-weight: 600;
		color: #1f2937;
		margin-top: 24px;
		margin-bottom: 12px;
	}

	:global(.email-content p) {
		font-size: 16px;
		margin-bottom: 16px;
		color: #4b5563;
	}

	:global(.email-content a) {
		color: #3b82f6;
		text-decoration: none;
	}

	:global(.email-content a:hover) {
		text-decoration: underline;
	}
</style>
