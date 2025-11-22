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

	// Editor state
	let editor: Editor;
	let editorElement: HTMLElement;
	let aiEditorElement: HTMLElement;
	let aiEditor: Editor;
	let activeTab: 'compose' | 'preview' = 'compose';
	let previousTab: 'compose' | 'preview' = 'compose';
	let composeMode: 'manual' | 'ai-assist' = 'manual';
	let aiGeneratedContent = '';
	let isGeneratingEmail = false;
	let generationInstructions = '';

	// Email data
	let emailData = {
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
					class: `max-w-none min-h-[400px] p-4 focus:outline-none prose prose-gray dark:text-white max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-blue-600 prose-blockquote:text-gray-700 dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300 dark:prose-strong:text-white dark:prose-a:text-blue-400 dark:prose-blockquote:text-gray-300 dark:prose-hr:border-gray-700`
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
			content: aiGeneratedContent || '<p>AI-generated email will appear here...</p>',
			editorProps: {
				attributes: {
					class: `max-w-none min-h-[300px] p-4 focus:outline-none prose prose-gray dark:text-white max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-blue-600 prose-blockquote:text-gray-700 dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300 dark:prose-strong:text-white dark:prose-a:text-blue-400 dark:prose-blockquote:text-gray-300 dark:prose-hr:border-gray-700`
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
						brain_dumps_count: 0,
						daily_briefs_count: 0,
						phases_generated_count: 0,
						notes_count: 0,
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
			scheduleDate = scheduledDate.toISOString().split('T')[0];
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

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
	<!-- Header -->
	<div class="border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-3">
				<Mail class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
					{emailData.id ? 'Edit Email' : 'Compose Email'}
				</h2>
				{#if emailData.status && emailData.status !== 'draft'}
					<span
						class="inline-flex px-2 py-1 text-xs font-medium rounded-full {emailData.status ===
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
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="flex items-center space-x-2">
				<Button
					onclick={saveEmail}
					disabled={isSaving || isEmailSent}
					variant="secondary"
					size="md"
					icon={Save}
					loading={isSaving}
				>
					{isSaving ? 'Saving...' : 'Save'}
				</Button>

				<Button
					onclick={() => (showSendModal = true)}
					disabled={!canSend || isSending || isEmailSent}
					variant="primary"
					size="md"
					icon={Send}
					loading={isSending}
				>
					{isSending ? 'Sending...' : 'Send'}
				</Button>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="mt-4 border-b border-gray-200 dark:border-gray-700">
			<nav class="-mb-px flex space-x-8">
				<Button
					onclick={() => (activeTab = 'compose')}
					variant="ghost"
					size="sm"
					class="!py-2 !px-1 !border-b-2 !rounded-none {activeTab === 'compose'
						? '!border-blue-500 !text-blue-600 dark:!text-blue-400'
						: '!border-transparent !text-gray-500 hover:!text-gray-700 hover:!border-gray-300 dark:!text-gray-400 dark:hover:!text-gray-300'}"
				>
					Compose
				</Button>
				<Button
					onclick={() => (activeTab = 'preview')}
					variant="ghost"
					size="sm"
					class="!py-2 !px-1 !border-b-2 !rounded-none {activeTab === 'preview'
						? '!border-blue-500 !text-blue-600 dark:!text-blue-400'
						: '!border-transparent !text-gray-500 hover:!text-gray-700 hover:!border-gray-300 dark:!text-gray-400 dark:hover:!text-gray-300'}"
				>
					Preview
				</Button>
			</nav>
		</div>
	</div>

	<!-- Messages -->
	{#if error}
		<div
			class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 m-4 rounded-md"
		>
			<div class="flex justify-between items-center">
				<p class="text-red-800 dark:text-red-200">{error}</p>
				<Button
					onclick={clearMessages}
					variant="ghost"
					size="sm"
					icon={Trash2}
					class="!text-red-400 hover:!text-red-600"
				/>
			</div>
		</div>
	{/if}

	{#if success}
		<div
			class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 m-4 rounded-md"
		>
			<div class="flex justify-between items-center">
				<p class="text-green-800 dark:text-green-200">{success}</p>
				<Button
					onclick={clearMessages}
					variant="ghost"
					size="sm"
					icon={Trash2}
					class="!text-green-400 hover:!text-green-600"
				/>
			</div>
		</div>
	{/if}

	<!-- Content Area -->
	<div class="p-4 sm:p-6">
		{#if activeTab === 'compose'}
			<!-- Compose Mode Toggle -->
			<div class="mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-4">
						<Button
							onclick={() => (composeMode = 'manual')}
							variant={composeMode === 'manual' ? 'primary' : 'secondary'}
							size="sm"
							icon={PenTool}
							class={composeMode === 'manual' ? '' : '!bg-gray-100 dark:!bg-gray-700'}
						>
							Manual Draft
						</Button>
						<Button
							onclick={() => (composeMode = 'ai-assist')}
							variant={composeMode === 'ai-assist' ? 'primary' : 'secondary'}
							size="sm"
							icon={Bot}
							class={composeMode === 'ai-assist'
								? ''
								: '!bg-gray-100 dark:!bg-gray-700'}
						>
							AI Assist
						</Button>
					</div>
					{#if composeMode === 'ai-assist'}
						<div class="flex items-center space-x-2">
							<Button
								onclick={useAiContent}
								disabled={!aiGeneratedContent ||
									aiGeneratedContent ===
										'<p>AI-generated email will appear here...</p>'}
								variant="ghost"
								size="sm"
								icon={ArrowRight}
								class="!text-green-600 hover:!text-green-700 dark:!text-green-400"
								title="Use AI content in main editor"
							>
								Use AI Content
							</Button>
							<Button
								onclick={copyToAi}
								disabled={!emailData.content || emailData.content === ''}
								variant="ghost"
								size="sm"
								icon={Copy}
								class="!text-blue-600 hover:!text-blue-700 dark:!text-blue-400"
								title="Copy manual content to AI editor"
							>
								Copy to AI
							</Button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Email Form -->
			<div class="space-y-6">
				<!-- Basic Fields -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<FormField label="From Email" labelFor="from-email">
						<Select
							bind:value={emailData.from_email}
							onchange={(e) => (emailData.from_email = e)}
							disabled={isEmailSent}
							size="md"
							placeholder="Select sender email"
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
							size="md"
						/>
					</FormField>
				</div>

				<!-- Subject -->
				<FormField label="Subject *" labelFor="subject">
					<TextInput
						id="subject"
						bind:value={emailData.subject}
						disabled={isEmailSent}
						inputmode="text"
						enterkeyhint="next"
						placeholder="Email subject..."
						size="md"
					/>
				</FormField>

				<!-- Recipients -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<p class="block text-sm font-medium text-gray-700 dark:text-gray-300">
							Recipients ({emailData.recipients.length})
						</p>
						<Button
							onclick={() => (showRecipientModal = true)}
							disabled={isEmailSent}
							variant="ghost"
							size="sm"
							icon={Users}
							class="!text-blue-600 dark:!text-blue-400 hover:!text-blue-800 dark:hover:!text-blue-300"
						>
							{emailData.recipients.length > 0 ? 'Edit' : 'Add'} Recipients
						</Button>
					</div>
					{#if emailData.recipients.length > 0}
						<div class="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
							<div class="flex flex-wrap gap-2">
								{#each emailData.recipients.slice(0, 10) as recipient}
									<span
										class="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 rounded-full"
									>
										{recipient.recipient_name ||
											recipient.name ||
											recipient.recipient_email ||
											recipient.email}
									</span>
								{/each}
								{#if emailData.recipients.length > 10}
									<span
										class="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300 rounded-full"
									>
										+{emailData.recipients.length - 10} more
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Scheduling -->
				<div>
					<div class="flex items-center space-x-3 mb-3">
						<label class="flex items-center cursor-pointer">
							<input
								type="checkbox"
								bind:checked={isScheduled}
								disabled={isEmailSent}
								class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer dark:bg-gray-700 dark:checked:bg-blue-600"
							/>
							<span class="ml-2 text-sm text-gray-700 dark:text-gray-300"
								>Schedule for later</span
							>
						</label>
					</div>
					{#if isScheduled}
						<div class="grid grid-cols-2 gap-4">
							<FormField label="Date" labelFor="schedule-date">
								<TextInput
									id="schedule-date"
									type="date"
									inputmode="numeric"
									enterkeyhint="next"
									bind:value={scheduleDate}
									disabled={isEmailSent}
									size="md"
								/>
							</FormField>
							<FormField label="Time" labelFor="schedule-time">
								<TextInput
									id="schedule-time"
									type="time"
									inputmode="numeric"
									enterkeyhint="done"
									bind:value={scheduleTime}
									disabled={isEmailSent}
									size="md"
								/>
							</FormField>
						</div>
					{/if}
				</div>

				<!-- AI Generation Panel (only visible in AI assist mode) -->
				{#if composeMode === 'ai-assist'}
					<div
						class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800"
					>
						<div class="flex items-center gap-2 mb-3">
							<Bot class="h-4 w-4 text-blue-600 dark:text-blue-400" />
							<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
								AI Email Generation
							</h3>
						</div>
						<div class="space-y-4">
							<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
								<FormField label="Email Type" labelFor="email-type">
									<Select id="email-type" bind:value={emailType} size="sm">
										<option value="custom">Custom</option>
										<option value="welcome">Welcome</option>
										<option value="follow-up">Follow-up</option>
										<option value="feature">Feature Update</option>
										<option value="feedback">Feedback Request</option>
									</Select>
								</FormField>
								<FormField label="Tone" labelFor="email-tone">
									<Select id="email-tone" bind:value={emailTone} size="sm">
										<option value="friendly">Friendly</option>
										<option value="professional">Professional</option>
										<option value="casual">Casual</option>
									</Select>
								</FormField>
								<div class="flex items-end">
									<Button
										onclick={generateEmail}
										disabled={isGeneratingEmail ||
											emailData.recipients.length === 0}
										variant="primary"
										size="sm"
										icon={Sparkles}
										loading={isGeneratingEmail}
										class="w-full"
									>
										{isGeneratingEmail ? 'Generating...' : 'Generate Email'}
									</Button>
								</div>
							</div>
							<FormField label="Instructions for AI" labelFor="ai-instructions">
								<textarea
									id="ai-instructions"
									bind:value={generationInstructions}
									enterkeyhint="done"
									placeholder="Describe what you want the email to say... (e.g., 'Thank them for signing up for the beta program and highlight the key features they can explore')"
									rows="3"
									class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
								></textarea>
							</FormField>
							{#if emailData.recipients.length === 0}
								<div
									class="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded"
								>
									<Users class="h-4 w-4" />
									<span
										>Please select recipients first to generate personalized
										content</span
									>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Editor Toolbar -->
				<div class="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
					<div
						class="bg-gray-50 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 p-3"
					>
						<div class="flex flex-wrap items-center gap-2">
							<!-- Text Formatting -->
							<Button
								onclick={toggleBold}
								variant="ghost"
								size="sm"
								class="!p-2 {editor?.isActive('bold')
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Bold"
							>
								<strong>B</strong>
							</Button>
							<Button
								onclick={toggleItalic}
								variant="ghost"
								size="sm"
								class="!p-2 {editor?.isActive('italic')
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Italic"
							>
								<em>I</em>
							</Button>

							<div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2"></div>

							<!-- Headings -->
							<Button
								onclick={() => insertHeading(1)}
								variant="ghost"
								size="sm"
								class="!px-2 !py-1 {editor?.isActive('heading', { level: 1 })
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Heading 1"
							>
								H1
							</Button>
							<Button
								onclick={() => insertHeading(2)}
								variant="ghost"
								size="sm"
								class="!px-2 !py-1 {editor?.isActive('heading', { level: 2 })
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Heading 2"
							>
								H2
							</Button>

							<div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2"></div>

							<!-- Text Alignment -->
							<Button
								onclick={() => setTextAlign('left')}
								variant="ghost"
								size="sm"
								class="!p-2 {editor?.isActive({ textAlign: 'left' })
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Align Left"
							>
								⫸
							</Button>
							<Button
								onclick={() => setTextAlign('center')}
								variant="ghost"
								size="sm"
								class="!p-2 {editor?.isActive({ textAlign: 'center' })
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Align Center"
							>
								⫷
							</Button>
							<Button
								onclick={() => setTextAlign('right')}
								variant="ghost"
								size="sm"
								class="!p-2 {editor?.isActive({ textAlign: 'right' })
									? '!bg-gray-200 dark:!bg-gray-600'
									: ''}"
								title="Align Right"
							>
								⫸
							</Button>

							<div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2"></div>

							<!-- Insert Options -->
							<Button
								onclick={addLink}
								variant="ghost"
								size="sm"
								class="!p-2"
								title="Add Link"
							>
								<svg
									class="w-4 h-4"
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
							</Button>
							<Button
								onclick={() => (showImageModal = true)}
								variant="ghost"
								size="sm"
								icon={ImageIcon}
								class="!p-2"
								title="Insert Image"
							/>
						</div>
					</div>

					<!-- Editor Content -->
					<div
						class={composeMode === 'ai-assist'
							? 'grid grid-cols-1 lg:grid-cols-2 gap-4'
							: ''}
					>
						<!-- Manual Editor -->
						<div
							class={composeMode === 'ai-assist'
								? ''
								: 'bg-white dark:bg-gray-800 min-h-[400px]'}
						>
							{#if composeMode === 'ai-assist'}
								<div
									class="bg-gray-50 dark:bg-gray-700 px-3 py-2 border-b border-gray-300 dark:border-gray-600 flex items-center gap-2"
								>
									<PenTool class="h-4 w-4 text-gray-600 dark:text-gray-400" />
									<span
										class="text-sm font-medium text-gray-700 dark:text-gray-300"
										>Manual Draft</span
									>
								</div>
							{/if}
							<div class="bg-white dark:bg-gray-800 min-h-[400px]">
								<div bind:this={editorElement}></div>
							</div>
						</div>

						<!-- AI Editor (only visible in AI assist mode) -->
						{#if composeMode === 'ai-assist'}
							<div>
								<div
									class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-700 dark:to-indigo-700 px-3 py-2 border-b border-blue-300 dark:border-blue-600 flex items-center gap-2"
								>
									<Bot class="h-4 w-4 text-blue-900 dark:text-blue-100" />
									<span
										class="text-sm font-medium text-blue-900 dark:text-blue-100"
										>AI-Generated Draft</span
									>
								</div>
								<div
									class="bg-white dark:bg-gray-800 min-h-[400px] border-l-2 border-blue-200 dark:border-blue-700"
								>
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
	on:confirm={sendEmail}
	on:cancel={() => (showSendModal = false)}
>
	<div slot="content">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Are you sure you want to send this email to {emailData.recipients.length} recipient{emailData
				.recipients.length !== 1
				? 's'
				: ''}?
		</p>
		{#if emailData.recipients.length > 0}
			<div class="mt-3 text-sm text-gray-600 dark:text-gray-400">
				<p><strong>Recipients include:</strong></p>
				<ul class="mt-1 space-y-1">
					{#each emailData.recipients.slice(0, 5) as recipient}
						<li class="flex items-center">
							<span class="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
							{recipient.recipient_name || recipient.name || 'No name'}
							&lt;{recipient.recipient_email || recipient.email}&gt;
							{#if recipient.recipient_type === 'custom' || recipient.type === 'custom'}
								<span class="ml-2 text-xs bg-gray-100 text-gray-600 px-1 rounded"
									>Custom</span
								>
							{/if}
						</li>
					{/each}
					{#if emailData.recipients.length > 5}
						<li class="text-gray-500 italic">
							...and {emailData.recipients.length - 5} more
						</li>
					{/if}
				</ul>
			</div>
		{/if}
	</div>
	<div slot="details">
		<div class="mt-3 text-sm text-gray-600 dark:text-gray-400">
			<p><strong>Subject:</strong> {emailData.subject}</p>
			<p><strong>From:</strong> {emailData.from_name} &lt;{emailData.from_email}&gt;</p>
			{#if isScheduled && scheduleDate && scheduleTime}
				<p><strong>Scheduled for:</strong> {scheduleDate} at {scheduleTime}</p>
			{/if}
		</div>
	</div>
</ConfirmationModal>

<ImageUploadModal
	isOpen={showImageModal}
	emailId={emailData.id}
	on:close={() => (showImageModal = false)}
	on:imageSelected={(event) => addImage(event.detail)}
/>

<RecipientSelector
	isOpen={showRecipientModal}
	selectedRecipients={emailData.recipients}
	on:close={() => (showRecipientModal = false)}
	on:recipientsSelected={(event) => updateRecipients(event.detail)}
/>
