<!-- apps/web/src/lib/components/admin/EmailComposerModal.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import UserContextPanel from './UserContextPanel.svelte';
	import EmailHistoryViewer from './EmailHistoryViewer.svelte';
	import type { EmailGenerationContext } from '$lib/services/email-generation-service';
	import {
		Loader2,
		Mail,
		Copy,
		Sparkles,
		Send,
		Bot,
		PenTool,
		ArrowRight,
		Edit3,
		ChevronDown,
		ChevronUp,
		History,
		Eye
	} from 'lucide-svelte';

	export let isOpen = false;
	export let userId: string;
	export let userName: string | null = null;
	export let userEmail: string;

	const dispatch = createEventDispatcher();

	let instructions = '';
	let generatedEmail = '';
	let manualEmail = '';
	let emailType: EmailGenerationContext['emailType'] = 'custom';
	let tone: EmailGenerationContext['tone'] = 'friendly';
	let isGenerating = false;
	let isSending = false;
	let userContext: EmailGenerationContext['userInfo'] | null = null;
	let contextLoading = true;
	let contextPanelExpanded = false; // Start collapsed on mobile
	let editMode: 'manual' | 'ai' | 'split' = 'split';
	let showSystemPrompt = false;
	let customSystemPrompt = '';
	let defaultSystemPrompt = '';
	let emailHistory: any[] = [];
	let emailHistoryLoading = false;
	let showEmailHistory = false;
	let selectedEmailForViewer: any = null;
	let emailHistoryViewerOpen = false;

	const emailTemplates = [
		{ value: 'custom', label: 'Custom Message' },
		{ value: 'welcome', label: 'Welcome to BuildOS' },
		{ value: 'follow-up', label: 'Check-in / Follow-up' },
		{ value: 'feedback', label: 'Beta Feedback Request' },
		{ value: 'feature', label: 'Feature Announcement' }
	];

	const toneOptions = [
		{ value: 'professional', label: 'Professional' },
		{ value: 'friendly', label: 'Friendly' },
		{ value: 'casual', label: 'Casual' }
	];

	$: if (isOpen && userEmail) {
		loadUserContext();
		loadEmailHistory();
	}

	// Generate default system prompt when context changes
	$: if (userContext) {
		defaultSystemPrompt = generateDefaultSystemPrompt();
		if (!customSystemPrompt) {
			customSystemPrompt = defaultSystemPrompt;
		}
	}

	function generateDefaultSystemPrompt() {
		if (!userContext) return '';

		const userContextStr = formatUserContext(userContext);
		return `You are composing a personalized email for a BuildOS user. BuildOS is a productivity platform that helps users manage projects, tasks, and daily workflows with AI assistance.

Generate an email that is ${tone} in tone and focused on ${emailType === 'custom' ? 'the user instructions' : emailType}.

User Context:
${userContextStr}

Guidelines:
- Keep the email concise and engaging
- Reference specific user activity
- Use the user's name if available
- Make the email feel personal, not automated
- Include a clear call-to-action when appropriate
- Sign the email as "DJ" for more personal messages
- Do not include subject line - only the email body`;
	}

	function formatUserContext(userInfo: EmailGenerationContext['userInfo']): string {
		let context = `User Information:\n`;
		context += `- Name: ${userInfo.basic.name || 'Not provided'}\n`;
		context += `- Email: ${userInfo.basic.email}\n`;
		context += `- Member since: ${new Date(userInfo.basic.created_at).toLocaleDateString()}\n`;
		context += `- Subscription: ${userInfo.basic.subscription_status || 'Free'}\n`;

		if (userInfo.basic.last_visit) {
			context += `- Last active: ${new Date(userInfo.basic.last_visit).toLocaleDateString()}\n`;
		}

		if (userInfo.beta) {
			context += `\nBeta Program:\n`;
			context += `- Tier: ${userInfo.beta.beta_tier || 'Standard'}\n`;
			if (userInfo.beta.company_name) {
				context += `- Company: ${userInfo.beta.company_name}\n`;
			}
		}

		context += `\nActivity (Last 30 days):\n`;
		context += `- Projects: ${userInfo.activity.project_count}\n`;
		context += `- Tasks created: ${userInfo.activity.tasks_created}\n`;
		context += `- Tasks completed: ${userInfo.activity.tasks_completed}\n`;

		return context;
	}

	async function loadUserContext() {
		contextLoading = true;
		try {
			// Check if this is a beta member without a user account
			const isBetaOnly = !userId || userId === '';
			let url = '';

			if (isBetaOnly) {
				// For beta members without accounts, pass email and name as query params
				const params = new URLSearchParams({
					beta: 'true',
					email: userEmail,
					name: userName || ''
				});
				url = `/api/admin/users/beta-only/context?${params}`;
			} else {
				// Regular user with account
				url = `/api/admin/users/${userId}/context`;
			}

			const response = await fetch(url);
			if (!response.ok) throw new Error('Failed to load user context');
			const data = await response.json();
			userContext = data.data;
		} catch (error) {
			console.error('Error loading user context:', error);
			toastService.error('Failed to load user information');
		} finally {
			contextLoading = false;
		}
	}

	async function loadEmailHistory() {
		emailHistoryLoading = true;
		try {
			const response = await fetch(`/api/admin/emails/history?email=${encodeURIComponent(userEmail)}`);
			if (!response.ok) throw new Error('Failed to load email history');
			const data = await response.json();
			emailHistory = data.data || [];
		} catch (error) {
			console.error('Error loading email history:', error);
			// Silently fail - email history is optional
			emailHistory = [];
		} finally {
			emailHistoryLoading = false;
		}
	}

	function openEmailViewer(email: any) {
		selectedEmailForViewer = email;
		emailHistoryViewerOpen = true;
	}

	async function generateEmail() {
		if (!instructions.trim()) {
			toastService.error('Please provide instructions for the email');
			return;
		}

		if (!userContext) {
			toastService.error('User context not loaded');
			return;
		}

		isGenerating = true;
		try {
			// Use 'beta-only' as userId for beta members without accounts
			const effectiveUserId = !userId || userId === '' ? 'beta-only' : userId;

			const response = await fetch('/api/admin/emails/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: effectiveUserId,
					instructions,
					emailType,
					tone,
					userInfo: userContext,
					customSystemPrompt: showSystemPrompt ? customSystemPrompt : undefined
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to generate email');
			}

			const data = await response.json();
			generatedEmail = data.data.email;
			toastService.success('Email generated successfully');
		} catch (error) {
			console.error('Error generating email:', error);
			toastService.error(error instanceof Error ? error.message : 'Failed to generate email');
		} finally {
			isGenerating = false;
		}
	}

	function useAiContent() {
		manualEmail = generatedEmail;
		toastService.success('AI content copied to manual editor');
	}

	function copyManualToAi() {
		generatedEmail = manualEmail;
		toastService.success('Manual content copied to AI editor');
	}

	function getFinalEmail() {
		// Return the email from whichever editor is active or has content
		if (editMode === 'manual') {
			return manualEmail;
		} else if (editMode === 'ai') {
			return generatedEmail;
		} else {
			// In split mode, prefer manual if it has content, otherwise AI
			return manualEmail || generatedEmail;
		}
	}

	async function copyToClipboard() {
		const finalEmail = getFinalEmail();
		if (!finalEmail) {
			toastService.error('No email content to copy');
			return;
		}

		try {
			await navigator.clipboard.writeText(finalEmail);
			toastService.success('Email copied to clipboard');
		} catch (error) {
			console.error('Error copying to clipboard:', error);
			toastService.error('Failed to copy email');
		}
	}

	async function sendEmail() {
		const finalEmail = getFinalEmail();
		if (!finalEmail) {
			toastService.error('Please write or generate an email first');
			return;
		}

		const confirmed = confirm(`Send this email to ${userEmail}?`);
		if (!confirmed) return;

		isSending = true;
		try {
			// Use 'beta-only' as userId for beta members without accounts
			const effectiveUserId = !userId || userId === '' ? 'beta-only' : userId;

			const response = await fetch('/api/admin/emails/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					to: userEmail,
					subject: `Message from BuildOS`,
					body: finalEmail,
					userId: effectiveUserId
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Failed to send email');
			}

			toastService.success('Email sent successfully');
			dispatch('emailSent', { userId, email: userEmail });
			closeModal();
		} catch (error) {
			console.error('Error sending email:', error);
			toastService.error(error instanceof Error ? error.message : 'Failed to send email');
		} finally {
			isSending = false;
		}
	}

	function closeModal() {
		isOpen = false;
		instructions = '';
		generatedEmail = '';
		manualEmail = '';
		emailType = 'custom';
		tone = 'friendly';
		userContext = null;
		contextPanelExpanded = true;
		editMode = 'split';
		showSystemPrompt = false;
		customSystemPrompt = '';
	}

	function handleTemplateChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		emailType = target.value as EmailGenerationContext['emailType'];

		// Set default instructions based on template
		switch (emailType) {
			case 'welcome':
				instructions =
					'Welcome this new user to BuildOS. Highlight key features that match their interests and encourage them to start their first project.';
				break;
			case 'follow-up':
				instructions =
					'Check in on their progress with BuildOS. Reference their recent activity and offer assistance if needed.';
				break;
			case 'feedback':
				instructions =
					"Request feedback on their BuildOS experience. Ask specific questions about features they've used and what improvements they'd like to see.";
				break;
			case 'feature':
				instructions =
					'Announce a new BuildOS feature that would be relevant to their workflow based on their usage patterns.';
				break;
			default:
				instructions = '';
		}
		// Regenerate system prompt when template changes
		defaultSystemPrompt = generateDefaultSystemPrompt();
		if (!showSystemPrompt) {
			customSystemPrompt = defaultSystemPrompt;
		}
	}
</script>

<EmailHistoryViewer bind:isOpen={emailHistoryViewerOpen} email={selectedEmailForViewer} />

<Modal {isOpen} onClose={closeModal} size="xl">
	<div class="flex flex-col h-full max-h-[90vh]">
		<!-- Header -->
		<div class="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
				<h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
					Email: {userName || userEmail}
				</h2>
				{#if emailHistory.length > 0}
					<button
						on:click={() => (showEmailHistory = !showEmailHistory)}
						class="inline-flex items-center gap-1 text-xs sm:text-sm px-3 py-2 rounded-lg
								 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
								 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors w-full sm:w-auto justify-center"
					>
						<History class="w-4 h-4" />
						History ({emailHistory.length})
					</button>
				{/if}
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 sm:space-y-4">
			<!-- Email History Section -->
			{#if showEmailHistory && emailHistory.length > 0}
				<div
					class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4"
				>
					<h3 class="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
						Previous Emails ({emailHistory.length})
					</h3>
					<div class="space-y-2 max-h-48 overflow-y-auto">
						{#each emailHistory as email (email.id)}
							<button
								on:click={() => openEmailViewer(email)}
								class="w-full text-left p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors text-xs sm:text-sm"
							>
								<div class="flex items-start gap-2">
									<Eye class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
									<div class="min-w-0 flex-1">
										<p class="font-medium text-gray-900 dark:text-white truncate">
											{email.subject || 'No subject'}
										</p>
										<p class="text-xs text-gray-600 dark:text-gray-400 truncate">
											{new Date(email.created_at || email.sent_at).toLocaleDateString()}
										</p>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Edit Mode Toggle - Horizontal Scrollable on Mobile -->
			<div class="flex gap-2 pb-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
				<Button
					variant={editMode === 'manual' ? 'primary' : 'outline'}
					size="sm"
					on:click={() => (editMode = 'manual')}
					class="text-xs sm:text-sm flex-shrink-0"
				>
					<PenTool class="w-4 h-4" />
					<span class="ml-1 hidden sm:inline">Manual</span>
				</Button>
				<Button
					variant={editMode === 'split' ? 'primary' : 'outline'}
					size="sm"
					on:click={() => (editMode = 'split')}
					class="text-xs sm:text-sm flex-shrink-0"
				>
					<Edit3 class="w-4 h-4" />
					<span class="ml-1 hidden sm:inline">Split</span>
				</Button>
				<Button
					variant={editMode === 'ai' ? 'primary' : 'outline'}
					size="sm"
					on:click={() => (editMode = 'ai')}
					class="text-xs sm:text-sm flex-shrink-0"
				>
					<Bot class="w-4 h-4" />
					<span class="ml-1 hidden sm:inline">AI</span>
				</Button>
			</div>
			<!-- User Context Panel - Collapsible -->
			{#if contextLoading}
				<div class="flex items-center justify-center py-6">
					<Loader2 class="w-5 h-5 animate-spin text-primary-500" />
					<span class="ml-2 text-sm text-gray-600 dark:text-gray-400"
						>Loading user information...</span
					>
				</div>
			{:else if userContext}
				<div
					class="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
				>
					<button
						on:click={() => (contextPanelExpanded = !contextPanelExpanded)}
						class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
					>
						<span class="text-sm font-medium text-gray-900 dark:text-white">User Context</span>
						{#if contextPanelExpanded}
							<ChevronUp class="w-4 h-4 text-gray-600 dark:text-gray-400" />
						{:else}
							<ChevronDown class="w-4 h-4 text-gray-600 dark:text-gray-400" />
						{/if}
					</button>
					{#if contextPanelExpanded}
						<div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
							<UserContextPanel {userContext} expanded={true} />
						</div>
					{/if}
				</div>
			{/if}

			<!-- Email Configuration -->
			<div class="space-y-2 sm:space-y-3">
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
					<!-- Template Selection -->
					<div>
						<label
							for="email-template"
							class="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
						>
							Template
						</label>
						<select
							id="email-template"
							class="w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
									 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
									 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
							bind:value={emailType}
							on:change={handleTemplateChange}
						>
							{#each emailTemplates as template}
								<option value={template.value}>{template.label}</option>
							{/each}
						</select>
					</div>

					<!-- Tone Selection -->
					<div>
						<label
							for="email-tone"
							class="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
						>
							Tone
						</label>
						<select
							id="email-tone"
							class="w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
									 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
									 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
							bind:value={tone}
							on:change={() => {
								defaultSystemPrompt = generateDefaultSystemPrompt();
								if (!showSystemPrompt) {
									customSystemPrompt = defaultSystemPrompt;
								}
							}}
						>
							{#each toneOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Instructions / System Prompt Section -->
				{#if editMode !== 'manual'}
					<div class="space-y-2 sm:space-y-3">
						<!-- Instructions -->
						<div>
							<label
								for="instructions"
								class="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
							>
								Instructions for AI
							</label>
							<textarea
								id="instructions"
								bind:value={instructions}
								placeholder="Provide specific instructions..."
								rows="2"
								maxlength="5000"
								class="w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
										 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
										 placeholder-gray-400 dark:placeholder-gray-500
										 focus:ring-2 focus:ring-primary-500 focus:border-transparent
										 resize-none"
							/>
							<div class="mt-1 text-xs text-gray-500 dark:text-gray-400 text-right">
								{instructions.length}/5000
							</div>
						</div>

						<!-- System Prompt Toggle -->
						<button
							on:click={() => (showSystemPrompt = !showSystemPrompt)}
							class="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1"
						>
							{#if showSystemPrompt}
								<ChevronUp class="w-3 h-3" />
								Hide System Prompt
							{:else}
								<ChevronDown class="w-3 h-3" />
								Show/Edit System Prompt
							{/if}
						</button>

						<!-- System Prompt Editor -->
						{#if showSystemPrompt}
							<div>
								<label
									for="system-prompt"
									class="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>
									System Prompt
								</label>
								<textarea
									id="system-prompt"
									bind:value={customSystemPrompt}
									placeholder="System prompt for AI..."
									rows="5"
									class="w-full px-2 sm:px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg
											 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
											 placeholder-gray-400 dark:placeholder-gray-500
											 focus:ring-2 focus:ring-primary-500 focus:border-transparent
											 resize-y font-mono"
								/>
								<div class="mt-1 flex flex-col sm:flex-row justify-between gap-2">
									<Button
										variant="ghost"
										size="sm"
										on:click={() => (customSystemPrompt = defaultSystemPrompt)}
										class="text-xs"
									>
										Reset to Default
									</Button>
									<span class="text-xs text-gray-500 dark:text-gray-400">
										{customSystemPrompt.length} chars
									</span>
								</div>
							</div>
						{/if}
					</div>

					<!-- Generate Button -->
					<div class="flex flex-col sm:flex-row justify-end gap-2">
						<Button
							variant="outline"
							on:click={() => (instructions = '')}
							disabled={!instructions || isGenerating}
							class="text-sm"
						>
							Clear
						</Button>
						<Button
							on:click={generateEmail}
							disabled={!instructions.trim() || isGenerating || !userContext}
							class="text-sm"
						>
							{#if isGenerating}
								<Loader2 class="w-4 h-4 mr-2 animate-spin" />
								Generating...
							{:else}
								<Sparkles class="w-4 h-4 mr-2" />
								Generate
							{/if}
						</Button>
					</div>
				{/if}

				<!-- Email Editors -->
				<div class="space-y-2 sm:space-y-3">
					{#if editMode === 'split'}
						<!-- Copy buttons in split mode -->
						<div class="flex flex-col sm:flex-row gap-2 justify-center sm:justify-start">
							<Button
								variant="ghost"
								size="sm"
								on:click={useAiContent}
								disabled={!generatedEmail}
								class="text-xs sm:text-sm text-green-600 dark:text-green-400"
							>
								<ArrowRight class="w-3 h-3 mr-1" />
								<span class="hidden sm:inline">Use AI Content</span>
								<span class="sm:hidden">Use AI</span>
							</Button>
							<Button
								variant="ghost"
								size="sm"
								on:click={copyManualToAi}
								disabled={!manualEmail}
								class="text-xs sm:text-sm text-blue-600 dark:text-blue-400"
							>
								<Copy class="w-3 h-3 mr-1" />
								<span class="hidden sm:inline">Copy to AI</span>
								<span class="sm:hidden">Copy</span>
							</Button>
						</div>
					{/if}

					<div
						class={editMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3' : ''}
					>
						<!-- Manual Editor -->
						{#if editMode === 'manual' || editMode === 'split'}
							<div class="space-y-1">
								<div class="flex items-center gap-2">
									<PenTool class="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
									<label
										for="manual-email"
										class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300"
									>
										Manual Email
									</label>
								</div>
								<textarea
									id="manual-email"
									bind:value={manualEmail}
									placeholder="Write your email here..."
									rows={editMode === 'split' ? 6 : 10}
									class="w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
											 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
											 placeholder-gray-400 dark:placeholder-gray-500
											 focus:ring-2 focus:ring-primary-500 focus:border-transparent
											 resize-y"
								/>
							</div>
						{/if}

						<!-- AI Editor -->
						{#if editMode === 'ai' || editMode === 'split'}
							<div class="space-y-1">
								<div class="flex items-center gap-2">
									<Bot class="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
									<label
										for="generated-email"
										class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300"
									>
										AI-Generated Email
									</label>
								</div>
								<textarea
									id="generated-email"
									bind:value={generatedEmail}
									placeholder="AI-generated email will appear here..."
									rows={editMode === 'split' ? 6 : 10}
									class="w-full px-2 sm:px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
											 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
											 placeholder-gray-400 dark:placeholder-gray-500
											 focus:ring-2 focus:ring-primary-500 focus:border-transparent
											 resize-y"
								/>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div
			class="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
		>
			<div class="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-between">
				<Button variant="outline" on:click={closeModal} class="text-sm">Cancel</Button>

				{#if generatedEmail || manualEmail}
					<div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
						<Button
							variant="outline"
							on:click={copyToClipboard}
							class="text-sm"
						>
							<Copy class="w-4 h-4 mr-2" />
							<span class="hidden sm:inline">Copy to Clipboard</span>
							<span class="sm:hidden">Copy</span>
						</Button>
						<Button
							on:click={sendEmail}
							disabled={isSending}
							class="text-sm"
						>
							{#if isSending}
								<Loader2 class="w-4 h-4 mr-2 animate-spin" />
								Sending...
							{:else}
								<Send class="w-4 h-4 mr-2" />
								<span class="hidden sm:inline">Send Email</span>
								<span class="sm:hidden">Send</span>
							{/if}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</Modal>
