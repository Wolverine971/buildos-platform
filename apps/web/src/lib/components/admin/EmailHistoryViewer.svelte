<!-- apps/web/src/lib/components/admin/EmailHistoryViewer.svelte -->
<script lang="ts">
	import { X, Mail, Calendar, User, FileText } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let email: {
		id?: string;
		to?: string;
		subject?: string;
		body?: string;
		html?: string;
		sent_at?: string;
		created_at?: string;
	} | null = null;

	export let isOpen = false;

	function closeViewer() {
		isOpen = false;
	}

	function formatDate(dateString: string | undefined): string {
		if (!dateString) return '';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	$: displayContent = email?.html || email?.body || '';
</script>

{#if isOpen && email}
	<div class="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
			<!-- Header -->
			<div
				class="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
			>
				<div class="flex items-center gap-3 min-w-0">
					<Mail class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
					<div class="min-w-0">
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
							{email.subject || 'Email'}
						</h2>
						{#if email.to}
							<p class="text-sm text-gray-600 dark:text-gray-400 truncate">{email.to}</p>
						{/if}
					</div>
				</div>
				<button
					on:click={closeViewer}
					class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
				>
					<X class="w-5 h-5 text-gray-600 dark:text-gray-400" />
				</button>
			</div>

			<!-- Email Info -->
			<div class="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
					{#if email.to}
						<div class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
							<User class="w-4 h-4 flex-shrink-0" />
							<span class="truncate"><strong>To:</strong> {email.to}</span>
						</div>
					{/if}
					{#if email.sent_at || email.created_at}
						<div class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
							<Calendar class="w-4 h-4 flex-shrink-0" />
							<span>
								<strong>Sent:</strong>
								{formatDate(email.sent_at || email.created_at)}
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Email Content (scrollable) -->
			<div
				class="flex-1 overflow-y-auto bg-white dark:bg-gray-800 px-4 sm:px-6 py-6"
			>
				<div
					class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 prose dark:prose-invert max-w-none"
				>
					{#if email.html}
						<!-- Render HTML email content safely -->
						<div class="break-words">
							{@html email.html}
						</div>
					{:else if email.body}
						<!-- Plain text email content -->
						<div class="whitespace-pre-wrap text-gray-900 dark:text-gray-100 text-sm">
							{email.body}
						</div>
					{:else}
						<div class="text-gray-500 dark:text-gray-400 italic">No email content available</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
				<Button variant="outline" on:click={closeViewer} class="w-full sm:w-auto">
					Close
				</Button>
			</div>
		</div>
	</div>
{/if}

<style global>
	/* Safe HTML email styles */
	:global(.prose) {
		@apply text-gray-900 dark:text-gray-100;
	}

	:global(.prose p) {
		@apply mb-4;
	}

	:global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
		@apply font-semibold mt-6 mb-3;
	}

	:global(.prose a) {
		@apply text-blue-600 dark:text-blue-400 hover:underline;
	}

	:global(.prose img) {
		@apply max-w-full h-auto rounded;
	}

	:global(.prose table) {
		@apply w-full border-collapse border border-gray-300 dark:border-gray-600 mt-4 mb-4;
	}

	:global(.prose table td, .prose table th) {
		@apply border border-gray-300 dark:border-gray-600 p-2;
	}

	:global(.prose blockquote) {
		@apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-300 my-4;
	}

	:global(.prose code) {
		@apply bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono;
	}

	:global(.prose pre) {
		@apply bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-x-auto mb-4;
	}

	:global(.prose pre code) {
		@apply bg-transparent p-0;
	}
</style>
