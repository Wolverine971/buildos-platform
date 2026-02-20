<!-- apps/web/src/lib/components/email/EmailComposer.svelte -->
<script lang="ts">
	import { onMount, createEventDispatcher, afterUpdate } from 'svelte';
	import {
		Mail,
		Send,
		Save,
		Users,
		Image as ImageIcon,
		Trash2,
		Sparkles,
		Bot,
		PenTool,
		Copy,
		ArrowRight
	} from 'lucide-svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import TextAlign from '@tiptap/extension-text-align';
	import Color from '@tiptap/extension-color';
	import { TextStyle } from '@tiptap/extension-text-style';
	import ConfirmationModal from '../ui/ConfirmationModal.svelte';
	import EmailPreview from './EmailPreview.svelte';
	import ImageUploadModal from './ImageUploadModal.svelte';
	import RecipientSelector from './RecipientSelector.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let initialEmail: any = null;

	const dispatch = createEventDispatcher();

	// Recipient type for email data
	interface EmailRecipient {
		recipient_email?: string;
		recipient_name?: string;
		recipient_type?: string;
		recipient_id?: string;
		email?: string;
		name?: string;
		type?: string;
		id?: string;
		status?: string;
		sent_at?: string;
		delivered_at?: string;
		opened_at?: string;
		open_count?: number;
	}

	// Editor state
	let editor: Editor | null = null;
	let editorElement: HTMLElement;
	let aiEditorElement: HTMLElement;
	let aiEditor: Editor | null = null;
	let activeTab: 'compose' | 'preview' = 'compose';
	let previousTab: 'compose' | 'preview' = 'compose';
	let composeMode: 'manual' | 'ai-assist' = 'manual';
	let aiGeneratedContent = '';
	let isGeneratingEmail = false;
	let generationInstructions = '';

	// Email data
	let emailData: {
		id: string | null;
		subject: string;
		content: string;
		from_email: string;
		from_name: string;
		category: string;
		status: string;
		scheduled_at: string | null;
		recipients: EmailRecipient[];
		attachments: any[];
	} = {
		id: null,
		subject: '',
		content: '',
		from_email: 'dj@build-os.com',
		from_name: 'BuildOS Team',
		category: 'general',
		status: 'draft',
		scheduled_at: null,
		recipients: [],
		attachments: []
	};

	// AI Generation options
	let emailType: 'welcome' | 'follow-up' | 'feature' | 'feedback' | 'custom' = 'custom';
	let emailTone: 'professional' | 'friendly' | 'casual' = 'friendly';

	// UI state
	let isLoading = false;
	let isSaving = false;
	let isSending = false;
	let showSendModal = false;
	let showImageModal = false;
	let showRecipientModal = false;
	let error: string | null = null;
	let success: string | null = null;

	// Scheduling
	let scheduleDate = '';
	let scheduleTime = '';
	let isScheduled = false;

	// Track if editor needs reinitialization
	let editorNeedsInit = true;
	let aiEditorNeedsInit = true;

	onMount(() => {
		// Load initial email if provided
		if (initialEmail) {
			loadEmail(initialEmail);
		}
	});

	// Watch for tab changes and handle editor reinitialization
	$: if (activeTab !== previousTab) {
		handleTabChange(activeTab, previousTab);
		previousTab = activeTab;
	}

	// Watch for activeTab changes and ensure editor is initialized when switching to compose
	$: if (activeTab === 'compose' && editorElement && editorNeedsInit) {
		initializeEditor();
	}

	function handleTabChange(newTab: string, oldTab: string) {
		if (oldTab === 'compose') {
			if (editor) {
				// Save content before leaving compose tab
				emailData.content = editor.getHTML();
				// Destroy editor to prevent memory leaks
				editor.destroy();
				editor = null;
				editorNeedsInit = true;
			}
			if (aiEditor) {
				aiGeneratedContent = aiEditor.getHTML();
				aiEditor.destroy();
				aiEditor = null;
				aiEditorNeedsInit = true;
			}
		}
	}

	function initializeEditor() {
		// Clean up existing editor if it exists
		if (editor) {
			editor.destroy();
		}

		// Create new editor instance
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit,
				Image.configure({
					HTMLAttributes: {
						class: 'max-w-full h-auto rounded-lg'
					}
				}),
				Link.configure({
					openOnClick: false
				}),
				TextAlign.configure({
					types: ['heading', 'paragraph']
				}),
				Color,
				TextStyle
			],
			content: emailData.content,
			editorProps: {
				attributes: {
					class: `min-h-[320px] p-3 focus:outline-none prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-p:my-2 prose-li:text-foreground prose-strong:text-foreground prose-a:text-accent hover:prose-a:text-accent/80 prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground`
				}
			},
			onUpdate: ({ editor }) => {
				emailData.content = editor.getHTML();
			},
			onCreate: ({ editor }) => {
				// Editor is ready
				editorNeedsInit = false;
			}
		});
	}

	// Ensure editor is destroyed on component unmount
	function cleanup() {
		if (editor) {
			editor.destroy();
			editor = null;
		}
		if (aiEditor) {
			aiEditor.destroy();
			aiEditor = null;
		}
	}

	// Call cleanup on unmount
	onMount(() => {
		return cleanup;
	});

	// Initialize AI editor when needed
	$: if (
		activeTab === 'compose' &&
		composeMode === 'ai-assist' &&
		aiEditorElement &&
		aiEditorNeedsInit
	) {
		initializeAiEditor();
	}

	function initializeAiEditor() {
		// Clean up existing editor if it exists
		if (aiEditor) {
			aiEditor.destroy();
		}

		// Create new AI editor instance
		aiEditor = new Editor({
			element: aiEditorElement,
			extensions: [
				StarterKit,
				Image.configure({
					HTMLAttributes: {
						class: 'max-w-full h-auto rounded-lg'
					}
				}),
				Link.configure({
					openOnClick: false
				}),
				TextAlign.configure({
					types: ['heading', 'paragraph']
				}),
				Color,
				TextStyle
			],
			content:
				aiGeneratedContent ||
				'<p class="text-muted-foreground">AI-generated email will appear here...</p>',
			editorProps: {
				attributes: {
					class: `min-h-[320px] p-3 focus:outline-none prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-p:my-2 prose-li:text-foreground prose-strong:text-foreground prose-a:text-accent hover:prose-a:text-accent/80 prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-hr:border-border prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground`
				}
			},
			onUpdate: ({ editor }) => {
				aiGeneratedContent = editor.getHTML();
			},
			onCreate: ({ editor }) => {
				// Editor is ready
				aiEditorNeedsInit = false;
			}
		});
	}

	async function generateEmail() {
		if (!generationInstructions.trim()) {
			error = 'Please provide instructions for the email generation';
			return;
		}

		if (emailData.recipients.length === 0) {
			error = 'Please select at least one recipient to generate a personalized email';
			return;
		}

		isGeneratingEmail = true;
		error = null;

		try {
			// Get the first recipient's user context for personalization
			const recipient = emailData.recipients[0];
			if (!recipient) {
				error = 'No recipient available';
				return;
			}
			const recipientId = recipient.recipient_id || recipient.id;

			// Fetch user context first
			let userContext;
			if (recipientId && recipientId !== 'custom') {
				const contextResponse = await fetch(`/api/admin/users/${recipientId}/context`);
				if (!contextResponse.ok) {
					throw new Error('Failed to fetch user context');
				}
				const contextResult = await contextResponse.json();
				userContext = contextResult.data;
			} else {
				// For custom recipients, create minimal context
				userContext = {
					basic: {
						id: 'custom',
						email: recipient.recipient_email || recipient.email,
						name: recipient.recipient_name || recipient.name,
						created_at: new Date().toISOString(),
						subscription_status: null,
						subscription_plan_id: null,
						last_visit: null,
						is_admin: false
					},
					activity: {
						project_count: 0,
						tasks_created: 0,
						tasks_completed: 0,
						daily_briefs_count: 0,
						notes_count: 0,
						agentic_sessions_count: 0,
						agentic_messages_count: 0,
						calendar_connected: false,
						recent_projects: []
					}
				};
			}

			// Generate the email
			const response = await fetch('/api/admin/emails/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: recipientId || 'custom',
					instructions: generationInstructions,
					emailType,
					tone: emailTone,
					userInfo: userContext
				})
			});

			if (!response.ok) {
				throw new Error('Failed to generate email');
			}

			const result = await response.json();

			if (result.success) {
				aiGeneratedContent = result.data.email;
				if (aiEditor) {
					aiEditor.commands.setContent(aiGeneratedContent);
				}
				success = 'Email generated successfully!';
				setTimeout(() => {
					success = null;
				}, 3000);
			} else {
				throw new Error(result.error || 'Failed to generate email');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to generate email';
		} finally {
			isGeneratingEmail = false;
		}
	}

	function useAiContent() {
		if (aiEditor && editor) {
			const aiContent = aiEditor.getHTML();
			editor.commands.setContent(aiContent);
			emailData.content = aiContent;
			success = 'AI content copied to main editor!';
			setTimeout(() => {
				success = null;
			}, 2000);
		}
	}

	function copyToAi() {
		if (editor && aiEditor) {
			const manualContent = editor.getHTML();
			aiEditor.commands.setContent(manualContent);
			aiGeneratedContent = manualContent;
			success = 'Manual content copied to AI editor!';
			setTimeout(() => {
				success = null;
			}, 2000);
		}
	}

	function loadEmail(email: any) {
		emailData = {
			id: email.id,
			subject: email.subject || '',
			content: email.content || '',
			from_email: email.from_email || 'dj@build-os.com',
			from_name: email.from_name || 'BuildOS Team',
			category: email.category || 'general',
			status: email.status || 'draft',
			scheduled_at: email.scheduled_at,
			recipients: email.email_recipients
				? email.email_recipients.map((r: any) => ({
						recipient_email: r.recipient_email,
						recipient_name: r.recipient_name,
						recipient_type: r.recipient_type,
						recipient_id: r.recipient_id,
						status: r.status,
						sent_at: r.sent_at,
						delivered_at: r.delivered_at,
						opened_at: r.opened_at,
						open_count: r.open_count,
						// Also include in the format expected by RecipientSelector
						email: r.recipient_email,
						name: r.recipient_name,
						type: r.recipient_type,
						id: r.recipient_id
					}))
				: [],
			attachments: email.email_attachments || []
		};

		// Update editor content if editor exists
		if (editor) {
			editor.commands.setContent(emailData.content);
		}

		// Set schedule data if email is scheduled
		if (email.scheduled_at) {
			const scheduledDate = new Date(email.scheduled_at);
			scheduleDate = scheduledDate.toISOString().split('T')[0] ?? '';
			scheduleTime = scheduledDate.toTimeString().slice(0, 5);
			isScheduled = true;
		}
	}

	async function saveEmail() {
		if (!emailData.subject.trim()) {
			error = 'Subject is required';
			return;
		}

		// Ensure content is up to date
		if (editor) {
			emailData.content = editor.getHTML();
		}

		isSaving = true;
		error = null;

		try {
			const method = emailData.id ? 'PATCH' : 'POST';
			const url = emailData.id ? `/api/admin/emails/${emailData.id}` : '/api/admin/emails';

			// Convert recipients to the format expected by the API
			const apiRecipients = emailData.recipients.map((recipient) => ({
				email: recipient.recipient_email || recipient.email,
				name: recipient.recipient_name || recipient.name,
				type: recipient.recipient_type || recipient.type,
				id: recipient.recipient_id || recipient.id
			}));

			const payload = {
				subject: emailData.subject,
				content: emailData.content,
				from_email: emailData.from_email,
				from_name: emailData.from_name,
				category: emailData.category,
				recipients: apiRecipients,
				scheduled_at:
					isScheduled && scheduleDate && scheduleTime
						? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
						: null
			};

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				throw new Error('Failed to save email');
			}

			const result = await response.json();

			if (result.success) {
				emailData.id = result.data.email.id;
				emailData.status = result.data.email.status;
				success = 'Email saved successfully';
				dispatch('saved', result.data.email);

				// Clear success message after 3 seconds
				setTimeout(() => {
					success = null;
				}, 3000);
			} else {
				throw new Error(result.error || 'Failed to save email');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save email';
		} finally {
			isSaving = false;
		}
	}

	async function sendEmail() {
		if (!emailData.id) {
			await saveEmail();
			if (!emailData.id) return;
		}

		if (emailData.recipients.length === 0) {
			error = 'No recipients selected';
			return;
		}

		isSending = true;
		error = null;

		try {
			const response = await fetch(`/api/admin/emails/${emailData.id}/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ send_now: true })
			});

			if (!response.ok) {
				throw new Error('Failed to send email');
			}

			const result = await response.json();

			if (result.success) {
				success = `Email sent successfully! Sent: ${result.summary.sent}, Failed: ${result.summary.failed}`;
				emailData.status = 'sent';
				dispatch('sent', result);
				showSendModal = false;
			} else {
				throw new Error(result.error || 'Failed to send email');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to send email';
		} finally {
			isSending = false;
		}
	}

	function addImage(imageData: any) {
		if (editor) {
			editor.chain().focus().setImage({ src: imageData.url, alt: imageData.filename }).run();
		}
		showImageModal = false;
	}

	function updateRecipients(recipients: any[]) {
		// Convert recipients to the format expected by emailData
		emailData.recipients = recipients.map((recipient) => ({
			recipient_email: recipient.email,
			recipient_name: recipient.name,
			recipient_type: recipient.type,
			recipient_id: recipient.id,
			// Also include original format for compatibility
			email: recipient.email,
			name: recipient.name,
			type: recipient.type,
			id: recipient.id
		}));
		showRecipientModal = false;
	}

	// Editor formatting functions
	function toggleBold() {
		if (editor) {
			editor.chain().focus().toggleBold().run();
		}
	}

	function toggleItalic() {
		if (editor) {
			editor.chain().focus().toggleItalic().run();
		}
	}

	function toggleUnderline() {
		if (editor) {
			editor.chain().focus().toggleUnderline().run();
		}
	}

	function setTextAlign(alignment: 'left' | 'center' | 'right') {
		if (editor) {
			editor.chain().focus().setTextAlign(alignment).run();
		}
	}

	function addLink() {
		if (editor) {
			const url = prompt('Enter URL:');
			if (url) {
				editor.chain().focus().setLink({ href: url }).run();
			}
		}
	}

	function insertHeading(level: 1 | 2 | 3) {
		if (editor) {
			editor.chain().focus().toggleHeading({ level }).run();
		}
	}

	// Clear messages
	function clearMessages() {
		error = null;
		success = null;
	}

	$: canSend =
		emailData.subject.trim() && emailData.content.trim() && emailData.recipients.length > 0;
	$: isEmailSent = emailData.status === 'sent' || emailData.status === 'delivered';
</script>

<div class="bg-card rounded-lg shadow-ink border border-border overflow-hidden tx tx-frame tx-weak">
	<!-- Header with Strip texture for section separation -->
	<div class="border-b border-border px-4 py-3 sm:px-5 sm:py-4 tx tx-strip tx-weak">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2 min-w-0">
				<Mail class="h-5 w-5 text-accent shrink-0" />
				<h2 class="text-base font-semibold text-foreground truncate">
					{emailData.id ? 'Edit Email' : 'Compose Email'}
				</h2>
				{#if emailData.status && emailData.status !== 'draft'}
					<span
						class="inline-flex px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.15em] rounded shrink-0 {emailData.status ===
						'sent'
							? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
							: emailData.status === 'scheduled'
								? 'bg-accent/10 text-accent'
								: emailData.status === 'failed'
									? 'bg-red-500/10 text-red-600 dark:text-red-400'
									: 'bg-muted text-muted-foreground'}"
					>
						{emailData.status}
					</span>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="flex items-center gap-1.5 shrink-0">
				<Button
					onclick={saveEmail}
					disabled={isSaving || isEmailSent}
					variant="secondary"
					size="sm"
					icon={Save}
					loading={isSaving}
					class="pressable"
				>
					{isSaving ? 'Saving...' : 'Save'}
				</Button>

				<Button
					onclick={() => (showSendModal = true)}
					disabled={!canSend || isSending || isEmailSent}
					variant="primary"
					size="sm"
					icon={Send}
					loading={isSending}
					class="pressable"
				>
					{isSending ? 'Sending...' : 'Send'}
				</Button>
			</div>
		</div>

		<!-- Tab Navigation - tighter spacing -->
		<nav class="mt-3 -mb-px flex gap-4 border-b border-border">
			<button
				onclick={() => (activeTab = 'compose')}
				class="pb-2 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t {activeTab ===
				'compose'
					? 'border-accent text-accent'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				Compose
			</button>
			<button
				onclick={() => (activeTab = 'preview')}
				class="pb-2 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-t {activeTab ===
				'preview'
					? 'border-accent text-accent'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				Preview
			</button>
		</nav>
	</div>

	<!-- Messages - compact inline alerts -->
	{#if error}
		<div
			class="mx-4 mt-3 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 tx tx-static tx-weak"
		>
			<div class="flex justify-between items-center gap-2">
				<p class="text-xs text-red-600 dark:text-red-400">{error}</p>
				<button
					onclick={clearMessages}
					class="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 transition-colors shrink-0"
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	{/if}

	{#if success}
		<div
			class="mx-4 mt-3 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 tx tx-grain tx-weak"
		>
			<div class="flex justify-between items-center gap-2">
				<p class="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>
				<button
					onclick={clearMessages}
					class="p-0.5 rounded text-emerald-400 hover:text-emerald-600 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 transition-colors shrink-0"
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Content Area - tighter padding for density -->
	<div class="p-4 sm:p-5">
		{#if activeTab === 'compose'}
			<!-- Compose Mode Toggle - compact segmented control -->
			<div class="mb-4 pb-3 border-b border-border">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="inline-flex items-center p-0.5 bg-muted rounded-lg">
						<button
							onclick={() => (composeMode = 'manual')}
							class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all pressable {composeMode ===
							'manual'
								? 'bg-card text-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							<PenTool class="h-3.5 w-3.5" />
							Manual
						</button>
						<button
							onclick={() => (composeMode = 'ai-assist')}
							class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all pressable {composeMode ===
							'ai-assist'
								? 'bg-card text-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							<Bot class="h-3.5 w-3.5" />
							AI Assist
						</button>
					</div>
					{#if composeMode === 'ai-assist'}
						<div class="flex items-center gap-1">
							<button
								onclick={useAiContent}
								disabled={!aiGeneratedContent ||
									aiGeneratedContent ===
										'<p>AI-generated email will appear here...</p>'}
								class="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
								title="Use AI content in main editor"
							>
								<ArrowRight class="h-3.5 w-3.5" />
								Use AI
							</button>
							<button
								onclick={copyToAi}
								disabled={!emailData.content || emailData.content === ''}
								class="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
								title="Copy manual content to AI editor"
							>
								<Copy class="h-3.5 w-3.5" />
								To AI
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Email Form - tighter vertical rhythm -->
			<div class="space-y-3">
				<!-- Basic Fields - 2 column grid -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<FormField label="From Email" labelFor="from-email">
						<Select
							bind:value={emailData.from_email}
							onchange={(e) => (emailData.from_email = String(e))}
							disabled={isEmailSent}
							size="sm"
							placeholder="Select sender"
							id="from-email"
						>
							<option value="dj@build-os.com">dj@build-os.com</option>
						</Select>
					</FormField>

					<FormField label="From Name" labelFor="from-name">
						<TextInput
							id="from-name"
							bind:value={emailData.from_name}
							disabled={isEmailSent}
							inputmode="text"
							enterkeyhint="next"
							size="sm"
						/>
					</FormField>
				</div>

				<!-- Subject -->
				<FormField label="Subject" labelFor="subject" required>
					<TextInput
						id="subject"
						bind:value={emailData.subject}
						disabled={isEmailSent}
						inputmode="text"
						enterkeyhint="next"
						placeholder="Email subject..."
						size="sm"
					/>
				</FormField>

				<!-- Recipients - inline label with action -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span
							class="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em]"
						>
							Recipients
							<span class="text-foreground ml-1">{emailData.recipients.length}</span>
						</span>
						<button
							onclick={() => (showRecipientModal = true)}
							disabled={isEmailSent}
							class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded text-accent hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<Users class="h-3.5 w-3.5" />
							{emailData.recipients.length > 0 ? 'Edit' : 'Add'}
						</button>
					</div>
					{#if emailData.recipients.length > 0}
						<div
							class="bg-muted/30 rounded-lg px-2.5 py-2 border border-border/50 tx tx-thread tx-weak"
						>
							<div class="flex flex-wrap gap-1">
								{#each emailData.recipients.slice(0, 10) as recipient}
									<span
										class="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium bg-accent/10 text-accent rounded"
									>
										{recipient.recipient_name ||
											recipient.name ||
											recipient.recipient_email ||
											recipient.email}
									</span>
								{/each}
								{#if emailData.recipients.length > 10}
									<span
										class="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground rounded"
									>
										+{emailData.recipients.length - 10}
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Scheduling - compact -->
				<div class="flex items-center gap-3">
					<label class="flex items-center gap-1.5 cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={isScheduled}
							disabled={isEmailSent}
							class="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/30 focus:ring-offset-0 cursor-pointer bg-background checked:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
						/>
						<span
							class="text-xs text-muted-foreground group-hover:text-foreground transition-colors"
							>Schedule</span
						>
					</label>
					{#if isScheduled}
						<div class="flex items-center gap-2 flex-1">
							<TextInput
								id="schedule-date"
								type="date"
								inputmode="numeric"
								enterkeyhint="next"
								bind:value={scheduleDate}
								disabled={isEmailSent}
								size="sm"
								class="flex-1"
							/>
							<TextInput
								id="schedule-time"
								type="time"
								inputmode="numeric"
								enterkeyhint="done"
								bind:value={scheduleTime}
								disabled={isEmailSent}
								size="sm"
								class="w-24"
							/>
						</div>
					{/if}
				</div>

				<!-- AI Generation Panel (only visible in AI assist mode) -->
				{#if composeMode === 'ai-assist'}
					<div
						class="rounded-lg p-3 border border-accent/15 bg-accent/5 tx tx-bloom tx-weak"
					>
						<div class="flex items-center gap-1.5 mb-3">
							<Bot class="h-4 w-4 text-accent" />
							<span
								class="text-[0.65rem] font-medium text-accent uppercase tracking-[0.15em]"
							>
								AI Generation
							</span>
						</div>
						<div class="space-y-3">
							<!-- Controls row -->
							<div class="flex flex-wrap items-end gap-2">
								<div class="flex-1 min-w-[100px]">
									<label
										for="email-type"
										class="block text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em] mb-1"
										>Type</label
									>
									<Select id="email-type" bind:value={emailType} size="sm">
										<option value="custom">Custom</option>
										<option value="welcome">Welcome</option>
										<option value="follow-up">Follow-up</option>
										<option value="feature">Feature</option>
										<option value="feedback">Feedback</option>
									</Select>
								</div>
								<div class="flex-1 min-w-[100px]">
									<label
										for="email-tone"
										class="block text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em] mb-1"
										>Tone</label
									>
									<Select id="email-tone" bind:value={emailTone} size="sm">
										<option value="friendly">Friendly</option>
										<option value="professional">Professional</option>
										<option value="casual">Casual</option>
									</Select>
								</div>
								<Button
									onclick={generateEmail}
									disabled={isGeneratingEmail ||
										emailData.recipients.length === 0}
									variant="primary"
									size="sm"
									icon={Sparkles}
									loading={isGeneratingEmail}
									class="pressable"
								>
									{isGeneratingEmail ? 'Generating...' : 'Generate'}
								</Button>
							</div>
							<!-- Instructions textarea -->
							<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden">
								<textarea
									id="ai-instructions"
									bind:value={generationInstructions}
									enterkeyhint="done"
									placeholder="Describe what you want the email to say..."
									rows="2"
									class="relative z-10 w-full px-2.5 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-1 focus:ring-accent/30 text-foreground placeholder:text-muted-foreground outline-none resize-none transition-colors"
								></textarea>
							</div>
							{#if emailData.recipients.length === 0}
								<div
									class="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1.5 rounded-lg tx tx-static tx-weak"
								>
									<Users class="h-3.5 w-3.5 shrink-0" />
									<span>Add recipients first</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Editor Toolbar - compact and unified -->
				<div class="border border-border rounded-lg overflow-hidden shadow-ink">
					<div class="bg-muted/50 border-b border-border px-2 py-1.5">
						<div class="flex flex-wrap items-center gap-0.5">
							<!-- Text Formatting -->
							<button
								onclick={toggleBold}
								class="w-7 h-7 flex items-center justify-center rounded text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									'bold'
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Bold"
							>
								B
							</button>
							<button
								onclick={toggleItalic}
								class="w-7 h-7 flex items-center justify-center rounded text-xs italic text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									'italic'
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Italic"
							>
								I
							</button>

							<div class="w-px h-4 bg-border mx-1"></div>

							<!-- Headings -->
							<button
								onclick={() => insertHeading(1)}
								class="px-1.5 h-7 flex items-center justify-center rounded text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									'heading',
									{ level: 1 }
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Heading 1"
							>
								H1
							</button>
							<button
								onclick={() => insertHeading(2)}
								class="px-1.5 h-7 flex items-center justify-center rounded text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									'heading',
									{ level: 2 }
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Heading 2"
							>
								H2
							</button>

							<div class="w-px h-4 bg-border mx-1"></div>

							<!-- Text Alignment -->
							<button
								onclick={() => setTextAlign('left')}
								class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									{ textAlign: 'left' }
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Align Left"
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 10h18M3 6h12M3 14h18M3 18h12"
									/>
								</svg>
							</button>
							<button
								onclick={() => setTextAlign('center')}
								class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									{ textAlign: 'center' }
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Align Center"
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 10h18M6 6h12M3 14h18M6 18h12"
									/>
								</svg>
							</button>
							<button
								onclick={() => setTextAlign('right')}
								class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors {editor?.isActive(
									{ textAlign: 'right' }
								)
									? 'bg-card text-foreground shadow-ink-inner'
									: ''}"
								title="Align Right"
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 10h18M9 6h12M3 14h18M9 18h12"
									/>
								</svg>
							</button>

							<div class="w-px h-4 bg-border mx-1"></div>

							<!-- Insert Options -->
							<button
								onclick={addLink}
								class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
								title="Add Link"
							>
								<svg
									class="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
									/>
								</svg>
							</button>
							<button
								onclick={() => (showImageModal = true)}
								class="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
								title="Insert Image"
							>
								<ImageIcon class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>

					<!-- Editor Content -->
					<div
						class={composeMode === 'ai-assist' ? 'grid grid-cols-1 lg:grid-cols-2' : ''}
					>
						<!-- Manual Editor -->
						<div class={composeMode === 'ai-assist' ? 'lg:border-r border-border' : ''}>
							{#if composeMode === 'ai-assist'}
								<div
									class="bg-muted/30 px-2.5 py-1.5 border-b border-border flex items-center gap-1.5"
								>
									<PenTool class="h-3.5 w-3.5 text-muted-foreground" />
									<span
										class="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em]"
										>Manual</span
									>
								</div>
							{/if}
							<div class="bg-card min-h-[320px] tx tx-grid tx-weak">
								<div bind:this={editorElement}></div>
							</div>
						</div>

						<!-- AI Editor (only visible in AI assist mode) -->
						{#if composeMode === 'ai-assist'}
							<div>
								<div
									class="bg-accent/5 px-2.5 py-1.5 border-b border-accent/15 flex items-center gap-1.5"
								>
									<Bot class="h-3.5 w-3.5 text-accent" />
									<span
										class="text-[0.65rem] font-medium text-accent uppercase tracking-[0.15em]"
										>AI</span
									>
								</div>
								<div class="bg-card min-h-[320px] tx tx-bloom tx-weak">
									<div bind:this={aiEditorElement}></div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Preview Tab -->
			<EmailPreview {emailData} showTracking={false} />
		{/if}
	</div>
</div>

<!-- Modals -->
<ConfirmationModal
	isOpen={showSendModal}
	title="Send Email"
	confirmText="Send Now"
	cancelText="Cancel"
	confirmVariant="primary"
	icon="info"
	loading={isSending}
	loadingText="Sending..."
	onconfirm={sendEmail}
	oncancel={() => (showSendModal = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			Send this email to {emailData.recipients.length} recipient{emailData.recipients
				.length !== 1
				? 's'
				: ''}?
		</p>
		{#if emailData.recipients.length > 0}
			<div class="mt-3">
				<p
					class="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em] mb-2"
				>
					Recipients
				</p>
				<ul class="space-y-1">
					{#each emailData.recipients.slice(0, 5) as recipient}
						<li class="flex items-center text-sm text-muted-foreground">
							<span class="w-1 h-1 bg-accent rounded-full mr-2 shrink-0"></span>
							<span class="truncate">
								{recipient.recipient_name || recipient.name || 'No name'}
								<span class="text-muted-foreground/60 ml-1"
									>{recipient.recipient_email || recipient.email}</span
								>
							</span>
							{#if recipient.recipient_type === 'custom' || recipient.type === 'custom'}
								<span
									class="ml-2 text-[0.65rem] bg-muted text-muted-foreground px-1 py-0.5 rounded uppercase tracking-[0.15em] shrink-0"
									>Custom</span
								>
							{/if}
						</li>
					{/each}
					{#if emailData.recipients.length > 5}
						<li class="text-muted-foreground/60 text-xs pl-3">
							+{emailData.recipients.length - 5} more
						</li>
					{/if}
				</ul>
			</div>
		{/if}
	{/snippet}
	{#snippet details()}
		<div class="mt-4 pt-3 border-t border-border space-y-1.5">
			<div class="flex items-baseline gap-2 text-sm">
				<span
					class="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em] w-16 shrink-0"
					>Subject</span
				>
				<span class="text-foreground truncate">{emailData.subject}</span>
			</div>
			<div class="flex items-baseline gap-2 text-sm">
				<span
					class="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em] w-16 shrink-0"
					>From</span
				>
				<span class="text-foreground"
					>{emailData.from_name} &lt;{emailData.from_email}&gt;</span
				>
			</div>
			{#if isScheduled && scheduleDate && scheduleTime}
				<div class="flex items-baseline gap-2 text-sm">
					<span
						class="text-[0.65rem] font-medium text-muted-foreground uppercase tracking-[0.15em] w-16 shrink-0"
						>Scheduled</span
					>
					<span class="text-foreground">{scheduleDate} at {scheduleTime}</span>
				</div>
			{/if}
		</div>
	{/snippet}
</ConfirmationModal>

<ImageUploadModal
	bind:isOpen={showImageModal}
	emailId={emailData.id}
	onClose={() => (showImageModal = false)}
	onImageSelected={(image) => addImage(image)}
/>

<RecipientSelector
	isOpen={showRecipientModal}
	selectedRecipients={emailData.recipients}
	on:close={() => (showRecipientModal = false)}
	on:recipientsSelected={(event) => updateRecipients(event.detail)}
/>
