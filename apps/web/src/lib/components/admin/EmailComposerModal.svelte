<!-- apps/web/src/lib/components/admin/EmailComposerModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import UserContextPanel from './UserContextPanel.svelte';
	import EmailHistoryViewerModal from './EmailHistoryViewerModal.svelte';
	import type { EmailGenerationContext } from '$lib/services/email-generation-service';
	import {
		LoaderCircle,
		Copy,
		Sparkles,
		Send,
		Bot,
		PenTool,
		ArrowRight,
		SquarePen,
		ChevronDown,
		ChevronUp,
		History,
		Eye
	} from 'lucide-svelte';

	interface Props {
		isOpen?: boolean;
		userId: string;
		userName?: string | null;
		userEmail: string;
		onEmailSent?: (data: { userId: string; email: string }) => void;
	}

	let {
		isOpen = $bindable(false),
		userId,
		userName = null,
		userEmail,
		onEmailSent
	}: Props = $props();

	let instructions = $state('');
	let generatedEmail = $state('');
	let manualEmail = $state('');
	let emailType = $state<EmailGenerationContext['emailType']>('custom');
	let tone = $state<EmailGenerationContext['tone']>('friendly');
	let isGenerating = $state(false);
	let isSending = $state(false);
	let userContext = $state<EmailGenerationContext['userInfo'] | null>(null);
	let contextLoading = $state(true);
	let contextPanelExpanded = $state(false); // Start collapsed on mobile
	let editMode = $state<'manual' | 'ai' | 'split'>('split');
	let showSystemPrompt = $state(false);
	let customSystemPrompt = $state('');
	let defaultSystemPrompt = $state('');
	let emailHistory = $state<any[]>([]);
	let showEmailHistory = $state(false);
	let selectedEmailForViewer = $state<any>(null);
	let EmailHistoryViewerModalOpen = $state(false);

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

	// Load user context and email history when modal opens
	$effect(() => {
		if (!browser) return;
		if (isOpen && userEmail) {
			loadUserContext();
			loadEmailHistory();
		}
	});

	// Generate default system prompt when context changes
	$effect(() => {
		if (userContext) {
			defaultSystemPrompt = generateDefaultSystemPrompt();
			if (!customSystemPrompt) {
				customSystemPrompt = defaultSystemPrompt;
			}
		}
	});

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
		try {
			const response = await fetch(
				`/api/admin/emails/history?email=${encodeURIComponent(userEmail)}`
			);
			if (!response.ok) throw new Error('Failed to load email history');
			const data = await response.json();
			emailHistory = data.data || [];
		} catch (error) {
			console.error('Error loading email history:', error);
			emailHistory = [];
		}
	}

	function openEmailViewer(email: any) {
		selectedEmailForViewer = email;
		EmailHistoryViewerModalOpen = true;
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

			const result = await response.json();

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to generate email');
			}

			generatedEmail = result.data?.email;
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

			const result = await response.json();

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to send email');
			}

			toastService.success('Email sent successfully');
			onEmailSent?.({ userId, email: userEmail });
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
		contextPanelExpanded = false; // Reset to collapsed state for mobile
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

<EmailHistoryViewerModal bind:isOpen={EmailHistoryViewerModalOpen} email={selectedEmailForViewer} />

<Modal {isOpen} onClose={closeModal} size="xl">
	<div class="flex flex-col h-full max-h-[90vh]">
		<!-- Header -->
		<div class="px-3 py-2 border-b border-border bg-muted/30">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm sm:text-base font-semibold text-foreground truncate">
					{userName || userEmail}
				</h2>
				{#if emailHistory.length > 0}
					<button
						onclick={() => (showEmailHistory = !showEmailHistory)}
						class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded
								 bg-muted text-muted-foreground border border-border
								 hover:bg-accent/10 hover:text-accent transition-colors pressable"
					>
						<History class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">History</span> ({emailHistory.length})
					</button>
				{/if}
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 px-3 py-2 space-y-2 overflow-y-auto">
			<!-- Email History Section -->
			{#if showEmailHistory && emailHistory.length > 0}
				<div class="bg-muted/50 border border-border rounded-lg p-2 tx tx-thread tx-weak">
					<div class="space-y-1 max-h-32 overflow-y-auto">
						{#each emailHistory as email (email.id)}
							<button
								onclick={() => openEmailViewer(email)}
								class="w-full text-left px-2 py-1.5 rounded hover:bg-accent/10 transition-colors text-xs pressable"
							>
								<div class="flex items-center gap-2">
									<Eye class="w-3.5 h-3.5 text-accent flex-shrink-0" />
									<span class="font-medium text-foreground truncate flex-1">
										{email.subject || 'No subject'}
									</span>
									<span class="text-muted-foreground shrink-0">
										{new Date(email.created_at || email.sent_at).toLocaleDateString()}
									</span>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Edit Mode Toggle -->
			<div class="flex gap-1 pb-2 border-b border-border">
				<button
					onclick={() => (editMode = 'manual')}
					class="px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors pressable
						{editMode === 'manual'
						? 'bg-accent text-accent-foreground'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					<PenTool class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">Manual</span>
				</button>
				<button
					onclick={() => (editMode = 'split')}
					class="px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors pressable
						{editMode === 'split'
						? 'bg-accent text-accent-foreground'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					<SquarePen class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">Split</span>
				</button>
				<button
					onclick={() => (editMode = 'ai')}
					class="px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors pressable
						{editMode === 'ai'
						? 'bg-accent text-accent-foreground'
						: 'bg-muted text-muted-foreground hover:text-foreground'}"
				>
					<Bot class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">AI</span>
				</button>
			</div>
			<!-- User Context Panel - Collapsible -->
			{#if contextLoading}
				<div class="flex items-center justify-center py-3">
					<LoaderCircle class="w-4 h-4 animate-spin text-accent" />
					<span class="ml-2 text-xs text-muted-foreground">Loading context...</span>
				</div>
			{:else if userContext}
				<div class="bg-card rounded border border-border overflow-hidden shadow-ink tx tx-frame tx-weak">
					<button
						onclick={() => (contextPanelExpanded = !contextPanelExpanded)}
						class="w-full px-2 py-1.5 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
					>
						<span class="text-xs font-medium text-foreground">Context</span>
						{#if contextPanelExpanded}
							<ChevronUp class="w-3.5 h-3.5 text-muted-foreground" />
						{:else}
							<ChevronDown class="w-3.5 h-3.5 text-muted-foreground" />
						{/if}
					</button>
					{#if contextPanelExpanded}
						<div class="px-2 py-2 border-t border-border">
							<UserContextPanel
								{userContext}
								expanded={true}
								on:composeEmail={(e) => {
									instructions = e.detail.instructions;
									emailType = 'custom';
									setTimeout(() => generateEmail(), 100);
								}}
							/>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Email Configuration -->
			<div class="space-y-2">
				<div class="grid grid-cols-2 gap-2">
					<!-- Template Selection -->
					<div class="space-y-1">
						<label for="email-template" class="text-xs font-medium text-muted-foreground">
							Template
						</label>
						<select
							id="email-template"
							class="w-full px-2 py-1.5 text-xs border border-border rounded
									 bg-background text-foreground shadow-ink-inner
									 focus:border-accent focus:ring-1 focus:ring-ring"
							bind:value={emailType}
							onchange={handleTemplateChange}
						>
							{#each emailTemplates as template}
								<option value={template.value}>{template.label}</option>
							{/each}
						</select>
					</div>

					<!-- Tone Selection -->
					<div class="space-y-1">
						<label for="email-tone" class="text-xs font-medium text-muted-foreground">
							Tone
						</label>
						<select
							id="email-tone"
							class="w-full px-2 py-1.5 text-xs border border-border rounded
									 bg-background text-foreground shadow-ink-inner
									 focus:border-accent focus:ring-1 focus:ring-ring"
							bind:value={tone}
							onchange={() => {
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
					<div class="space-y-2">
						<!-- Instructions -->
						<div class="space-y-1">
							<div class="flex items-center justify-between">
								<label for="instructions" class="text-xs font-medium text-muted-foreground">
									Instructions
								</label>
								<span class="text-[10px] text-muted-foreground">{instructions.length}/5000</span>
							</div>
							<textarea
								id="instructions"
								bind:value={instructions}
								placeholder="Describe what the email should communicate..."
								rows="2"
								maxlength="5000"
								class="w-full px-2 py-1.5 text-xs border border-border rounded
										 bg-background text-foreground shadow-ink-inner
										 placeholder:text-muted-foreground
										 focus:border-accent focus:ring-1 focus:ring-ring resize-none"
							></textarea>
						</div>

						<!-- System Prompt Toggle -->
						<button
							onclick={() => (showSystemPrompt = !showSystemPrompt)}
							class="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
						>
							{#if showSystemPrompt}
								<ChevronUp class="w-3 h-3"></ChevronUp>
								Hide prompt
							{:else}
								<ChevronDown class="w-3 h-3"></ChevronDown>
								Edit prompt
							{/if}
						</button>

						<!-- System Prompt Editor -->
						{#if showSystemPrompt}
							<div class="space-y-1">
								<div class="flex items-center justify-between">
									<label for="system-prompt" class="text-xs font-medium text-muted-foreground">
										System Prompt
									</label>
									<button
										onclick={() => (customSystemPrompt = defaultSystemPrompt)}
										class="text-[10px] text-accent hover:underline"
									>
										Reset
									</button>
								</div>
								<textarea
									id="system-prompt"
									bind:value={customSystemPrompt}
									placeholder="System prompt..."
									rows="4"
									class="w-full px-2 py-1.5 text-xs border border-border rounded
											 bg-background text-foreground shadow-ink-inner
											 placeholder:text-muted-foreground font-mono
											 focus:border-accent focus:ring-1 focus:ring-ring resize-y"
								></textarea>
							</div>
						{/if}

						<!-- Generate Button -->
						<div class="flex justify-end gap-2">
							{#if instructions}
								<button
									onclick={() => (instructions = '')}
									disabled={isGenerating}
									class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
								>
									Clear
								</button>
							{/if}
							<button
								onclick={generateEmail}
								disabled={!instructions.trim() || isGenerating || !userContext}
								class="px-3 py-1.5 text-xs rounded bg-accent text-accent-foreground
									   shadow-ink pressable disabled:opacity-50 flex items-center gap-1.5"
							>
								{#if isGenerating}
									<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
									Generating...
								{:else}
									<Sparkles class="w-3.5 h-3.5" />
									Generate
								{/if}
							</button>
						</div>
					</div>
				{/if}

				<!-- Email Editors -->
				<div class="space-y-2 flex-1 min-h-0">
					{#if editMode === 'split'}
						<!-- Copy buttons in split mode -->
						<div class="flex gap-3 text-xs">
							<button
								onclick={useAiContent}
								disabled={!generatedEmail}
								class="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline disabled:opacity-40"
							>
								<ArrowRight class="w-3 h-3"></ArrowRight>
								Use AI
							</button>
							<button
								onclick={copyManualToAi}
								disabled={!manualEmail}
								class="text-accent inline-flex items-center gap-1 hover:underline disabled:opacity-40"
							>
								<Copy class="w-3 h-3"></Copy>
								Copy to AI
							</button>
						</div>
					{/if}

					<div class={editMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-2 gap-2' : ''}>
						<!-- Manual Editor -->
						{#if editMode === 'manual' || editMode === 'split'}
							<div class="space-y-1">
								<div class="flex items-center gap-1.5">
									<PenTool class="w-3 h-3 text-muted-foreground"></PenTool>
									<label for="manual-email" class="text-xs font-medium text-muted-foreground">
										Manual
									</label>
								</div>
								<textarea
									id="manual-email"
									bind:value={manualEmail}
									placeholder="Write your email..."
									rows={editMode === 'split' ? 5 : 8}
									class="w-full px-2 py-1.5 text-xs border border-border rounded
											 bg-background text-foreground shadow-ink-inner
											 placeholder:text-muted-foreground
											 focus:border-accent focus:ring-1 focus:ring-ring resize-y"
								></textarea>
							</div>
						{/if}

						<!-- AI Editor -->
						{#if editMode === 'ai' || editMode === 'split'}
							<div class="space-y-1">
								<div class="flex items-center gap-1.5">
									<Bot class="w-3 h-3 text-accent"></Bot>
									<label for="generated-email" class="text-xs font-medium text-muted-foreground">
										AI Generated
									</label>
								</div>
								<textarea
									id="generated-email"
									bind:value={generatedEmail}
									placeholder="AI content appears here..."
									rows={editMode === 'split' ? 5 : 8}
									class="w-full px-2 py-1.5 text-xs border border-border rounded
											 bg-background text-foreground shadow-ink-inner
											 placeholder:text-muted-foreground
											 focus:border-accent focus:ring-1 focus:ring-ring resize-y"
								></textarea>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="px-3 py-2 border-t border-border bg-muted/30">
			<div class="flex items-center justify-between gap-2">
				<button
					onclick={closeModal}
					class="px-3 py-1.5 text-xs rounded border border-border bg-card text-foreground
						   hover:bg-muted shadow-ink pressable"
				>
					Cancel
				</button>

				{#if generatedEmail || manualEmail}
					<div class="flex items-center gap-2">
						<button
							onclick={copyToClipboard}
							class="px-2 py-1.5 text-xs rounded border border-border bg-card text-foreground
								   hover:bg-muted shadow-ink pressable flex items-center gap-1.5"
						>
							<Copy class="w-3.5 h-3.5" />
							<span class="hidden sm:inline">Copy</span>
						</button>
						<button
							onclick={sendEmail}
							disabled={isSending}
							class="px-3 py-1.5 text-xs rounded bg-accent text-accent-foreground
								   shadow-ink pressable disabled:opacity-50 flex items-center gap-1.5"
						>
							{#if isSending}
								<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
								Sending...
							{:else}
								<Send class="w-3.5 h-3.5" />
								Send
							{/if}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</Modal>
