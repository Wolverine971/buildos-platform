<!-- apps/web/src/lib/components/profile/ContactImportPreview.svelte -->
<script lang="ts">
	import type { ContactImportPreviewRow } from '$lib/types/profile-contacts';

	interface Props {
		rows: ContactImportPreviewRow[];
	}

	let { rows }: Props = $props();

	function maskMethodValue(methodType: string, value: string): string {
		if (methodType === 'email') {
			const [local = '', domain = ''] = value.split('@');
			if (!domain) return '***';
			const localMask = local.length <= 1 ? '*' : `${local[0]}***`;
			return `${localMask}@${domain}`;
		}

		if (
			methodType === 'phone' ||
			methodType === 'sms' ||
			methodType === 'whatsapp' ||
			methodType === 'telegram'
		) {
			const digits = value.replace(/\D/g, '');
			if (digits.length <= 4) return '***';
			return `***${digits.slice(-4)}`;
		}

		if (value.length <= 6) return '***';
		return `${value.slice(0, 2)}***${value.slice(-2)}`;
	}

	function formatMethods(row: ContactImportPreviewRow): string {
		const methods = row.normalized_input?.methods ?? [];
		if (methods.length === 0) return 'No methods';
		return methods
			.map((method) => {
				const methodType = method.method_type || 'method';
				return `${methodType}: ${maskMethodValue(methodType, method.value)}`;
			})
			.join(' · ');
	}

	function formatLabel(value: string): string {
		if (!value) return '';
		const spaced = value.replace(/_/g, ' ');
		return spaced.charAt(0).toUpperCase() + spaced.slice(1);
	}

	function statusTextClass(status: ContactImportPreviewRow['status']): string {
		if (status === 'ready') return 'text-success';
		if (status === 'error') return 'text-destructive';
		return 'text-muted-foreground';
	}

	function statusBadgeClass(status: ContactImportPreviewRow['status']): string {
		if (status === 'ready') return 'border-success/30 bg-success/10 text-success';
		if (status === 'error') {
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		}
		return 'border-border bg-muted text-muted-foreground';
	}

	function rowReason(row: ContactImportPreviewRow): string {
		return (
			row.reason ??
			(row.matched_contact_name ? `Matched ${row.matched_contact_name}` : 'Ready')
		);
	}
</script>

<!-- P12: phone composition keeps every field visible without horizontal panning. -->
<div
	class="max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1 md:hidden"
	data-testid="contact-import-mobile-list"
	role="list"
	aria-label="CSV import preview rows"
>
	{#each rows as row (`mobile-import-preview-${row.row_number}`)}
		{@const contactName = row.normalized_input?.display_name ?? 'Unknown'}
		<article
			class="min-w-0 rounded-md border border-border bg-card p-2.5 shadow-ink tx tx-frame tx-weak"
			role="listitem"
			aria-label={`Import row ${row.row_number}: ${contactName}`}
		>
			<div class="flex min-w-0 items-start gap-2">
				<span
					class="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
				>
					#{row.row_number}
				</span>
				<div class="min-w-0 flex-1">
					<h4
						class="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]"
					>
						{contactName}
					</h4>
					<p
						class="mt-0.5 line-clamp-2 break-words text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]"
					>
						{formatMethods(row)}
					</p>
				</div>
				<span
					class="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold {statusBadgeClass(
						row.status
					)}"
				>
					{formatLabel(row.status)}
				</span>
			</div>

			<dl
				class="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-border pt-2 text-xs"
			>
				<dt class="micro-label font-semibold text-muted-foreground">Action</dt>
				<dd class="min-w-0 truncate text-foreground" title={formatLabel(row.action)}>
					{formatLabel(row.action)}
				</dd>
				<dt class="micro-label font-semibold text-muted-foreground">Reason</dt>
				<dd
					class="min-w-0 line-clamp-2 break-words text-muted-foreground [overflow-wrap:anywhere]"
					title={rowReason(row)}
				>
					{rowReason(row)}
				</dd>
			</dl>
		</article>
	{/each}
</div>

<!-- Preserve the scan-efficient table on tablet and desktop. -->
<div
	class="hidden max-h-64 overflow-auto rounded-md border border-border md:block"
	data-testid="contact-import-desktop-table"
>
	<table class="w-full min-w-[640px] text-sm">
		<thead class="sticky top-0 bg-muted/60 text-left">
			<tr>
				<th class="px-3 py-2">Row</th>
				<th class="px-3 py-2">Contact</th>
				<th class="px-3 py-2">Methods (masked)</th>
				<th class="px-3 py-2">Status</th>
				<th class="px-3 py-2">Action</th>
				<th class="px-3 py-2">Reason</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (`desktop-import-preview-${row.row_number}`)}
				<tr class="border-t border-border">
					<td class="px-3 py-2 tabular-nums">{row.row_number}</td>
					<td class="px-3 py-2">{row.normalized_input?.display_name ?? 'Unknown'}</td>
					<td class="px-3 py-2 text-muted-foreground">{formatMethods(row)}</td>
					<td class="px-3 py-2">
						<span class="font-medium {statusTextClass(row.status)}">
							{formatLabel(row.status)}
						</span>
					</td>
					<td class="px-3 py-2 text-muted-foreground">{formatLabel(row.action)}</td>
					<td class="px-3 py-2 text-muted-foreground">{rowReason(row)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
