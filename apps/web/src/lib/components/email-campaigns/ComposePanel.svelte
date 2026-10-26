<!-- apps/web/src/lib/components/email-campaigns/ComposePanel.svelte -->
<script lang="ts">
	import { Info, TriangleAlert } from 'lucide-svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import ImageUploadModal from '$lib/components/email/ImageUploadModal.svelte';
	import RichEmailEditor from './RichEmailEditor.svelte';
	import MergeFieldChips from './MergeFieldChips.svelte';
	import EmailRenderFrame from './EmailRenderFrame.svelte';
	import { findUnknownMergeFields, renderCampaignEmail } from '$lib/email-campaigns/render';
	import type { CampaignRecipientView } from '$lib/email-campaigns/types';
	import { displayName } from '$lib/email-campaigns/ui-helpers';

	type Field = 'from_name' | 'subject_template' | 'body_template';

	let {
		fromName,
		subject,
		body,
		editable,
		ownVersionsOnly = false,
		recipients,
		onfield
	}: {
		fromName: string;
		subject: string;
		body: string;
		editable: boolean;
		/** Everyone has their own (imported/tailored/edited) version; the template only covers people added later. */
		ownVersionsOnly?: boolean;
		recipients: CampaignRecipientView[];
		onfield: (field: Field, value: string) => void;
	} = $props();

	let mode = $state<'edit' | 'preview'>('edit');
	let lastFocus = $state<'subject' | 'body'>('body');
	let subjectInput = $state<HTMLInputElement | null>(null);
	let editorRef = $state<ReturnType<typeof RichEmailEditor> | null>(null);
	let showImageModal = $state(false);
	let previewRecipientId = $state<string>('');

	const unknownFields = $derived([
		...new Set([...findUnknownMergeFields(subject), ...findUnknownMergeFields(body)])
	]);

	// People who actually get the template (no own version), for the preview picker.
	const templatePeople = $derived(
		recipients.filter((recipient) => recipient.included && !recipient.body_override?.trim())
	);
	const previewPerson = $derived(
		templatePeople.find((recipient) => recipient.id === previewRecipientId) ??
			templatePeople[0] ??
			null
	);
	const previewRendered = $derived(
		renderCampaignEmail(
			{ subject_template: subject, body_template: body },
			previewPerson
				? { ...previewPerson, subject_override: null, body_override: null }
				: { first_name: null, context: {} }
		)
	);

	function insertToken(token: string) {
		if (!editable) return;
		if (lastFocus === 'subject' && subjectInput) {
			const start = subjectInput.selectionStart ?? subject.length;
			const end = subjectInput.selectionEnd ?? subject.length;
			const next = `${subject.slice(0, start)}${token}${subject.slice(end)}`;
			onfield('subject_template', next);
			queueMicrotask(() => {
				subjectInput?.focus();
				subjectInput?.setSelectionRange(start + token.length, start + token.length);
			});
			return;
		}
		if (mode !== 'edit') mode = 'edit';
		queueMicrotask(() => editorRef?.insertText(token));
	}
</script>

<div class="space-y-4">
	{#if ownVersionsOnly}
		<div
			class="flex gap-2.5 rounded-lg border border-info/30 bg-info/10 px-3 py-2.5 text-sm text-foreground tx tx-thread tx-weak"
		>
			<Info class="mt-0.5 h-4 w-4 shrink-0 text-info" />
			<p>
				Everyone here has their own draft — review them in step 4. The template below only
				applies to people you add later, so it can stay empty.
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
		<FormField
			label="From name"
			labelFor="campaign-from-name"
			hint="Sends from dj@build-os.com"
			showOptional={false}
		>
			<TextInput
				id="campaign-from-name"
				value={fromName}
				disabled={!editable}
				size="md"
				oninput={(event) =>
					onfield('from_name', (event.currentTarget as HTMLInputElement).value)}
			/>
		</FormField>
		<FormField label="Subject" labelFor="campaign-subject" required={!ownVersionsOnly}>
			<input
				id="campaign-subject"
				bind:this={subjectInput}
				value={subject}
				disabled={!editable}
				placeholder={ownVersionsOnly
					? 'Only for people without their own draft'
					: 'you signed up for buildos a year ago'}
				autocomplete="off"
				class="w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-70 sm:text-sm"
				onfocus={() => (lastFocus = 'subject')}
				oninput={(event) =>
					onfield('subject_template', (event.currentTarget as HTMLInputElement).value)}
			/>
		</FormField>
	</div>

	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<MergeFieldChips disabled={!editable} oninsert={(token) => insertToken(token)} />
		<div class="inline-flex shrink-0 self-start rounded-lg bg-muted p-0.5" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'edit'}
				onclick={() => (mode = 'edit')}
				class="min-h-9 rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 {mode ===
				'edit'
					? 'bg-card text-foreground shadow-ink'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				Write
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'preview'}
				onclick={() => (mode = 'preview')}
				class="min-h-9 rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 {mode ===
				'preview'
					? 'bg-card text-foreground shadow-ink'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				Preview
			</button>
		</div>
	</div>

	{#if unknownFields.length > 0}
		<p
			class="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
		>
			<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
			<span>
				{unknownFields.map((key) => `{{${key}}}`).join(', ')}
				{unknownFields.length === 1 ? "isn't a fill-in I know" : "aren't fill-ins I know"}.
				Use the buttons above so the names match.
			</span>
		</p>
	{/if}

	<div class={mode === 'edit' ? '' : 'hidden'}>
		<RichEmailEditor
			bind:this={editorRef}
			value={body}
			{editable}
			placeholder={ownVersionsOnly
				? 'Optional: a template for anyone you add later.'
				: 'Hi {{first_name}}, …'}
			onchange={(html) => onfield('body_template', html)}
			onfocus={() => (lastFocus = 'body')}
			onrequestimage={editable ? () => (showImageModal = true) : undefined}
		/>
		<p class="mt-1.5 text-xs text-muted-foreground">
			Every email gets an unsubscribe line and the BuildOS PO box at the bottom automatically.
		</p>
	</div>

	{#if mode === 'preview'}
		<div class="space-y-2">
			{#if templatePeople.length > 1}
				<label class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					Preview as
					<select
						value={previewPerson?.id ?? ''}
						onchange={(event) =>
							(previewRecipientId = (event.currentTarget as HTMLSelectElement).value)}
						class="max-w-full rounded-md border border-border-strong bg-background px-2 py-1 text-base text-foreground sm:text-sm"
					>
						{#each templatePeople as person (person.id)}
							<option value={person.id}>{displayName(person)}</option>
						{/each}
					</select>
				</label>
			{:else if !previewPerson}
				<p class="text-xs text-muted-foreground">
					Nobody uses the template yet, so fill-ins show their fallbacks.
				</p>
			{/if}
			<EmailRenderFrame
				subject={previewRendered.subject}
				bodyHtml={previewRendered.bodyHtml}
				{fromName}
				toLabel={previewPerson
					? `${displayName(previewPerson)} <${previewPerson.email}>`
					: ''}
			/>
		</div>
	{/if}
</div>

{#if editable}
	<ImageUploadModal
		bind:isOpen={showImageModal}
		emailId={null}
		onClose={() => (showImageModal = false)}
		onImageSelected={(image) => {
			showImageModal = false;
			editorRef?.insertImage(image.url, image.original_filename || image.filename);
		}}
	/>
{/if}
