<!-- apps/web/src/lib/components/tables/TableColumnTypeIcon.svelte -->
<script lang="ts">
	import type { TableColumn } from '@buildos/shared-agent-ops/tables';
	import {
		AlignLeft,
		AtSign,
		Calendar,
		CheckSquare,
		CircleDot,
		Clock,
		DollarSign,
		Hash,
		Link,
		Link2,
		ListChecks,
		Percent,
		Type
	} from '$lib/icons/lucide';

	let {
		column,
		class: className = 'h-3.5 w-3.5'
	}: { column: Pick<TableColumn, 'type' | 'options'>; class?: string } = $props();

	const Icon = $derived.by(() => {
		switch (column.type) {
			case 'long_text':
				return AlignLeft;
			case 'number':
				if (column.options?.format === 'currency') return DollarSign;
				if (column.options?.format === 'percent') return Percent;
				if (column.options?.format === 'hours') return Clock;
				return Hash;
			case 'date':
				return Calendar;
			case 'select':
				return CircleDot;
			case 'multi_select':
				return ListChecks;
			case 'checkbox':
				return CheckSquare;
			case 'url':
				return Link;
			case 'email':
				return AtSign;
			case 'link':
				return Link2;
			default:
				return Type;
		}
	});
</script>

<Icon class={className} aria-hidden="true" />
