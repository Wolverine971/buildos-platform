// apps/web/src/lib/components/admin/chat/session-audit-ui.ts
import { Activity, Bot, Clock, Database, MessageSquare, RefreshCw, Wrench } from 'lucide-svelte';
import type {
	AuditTimelineSeverity,
	AuditTimelineType
} from '$lib/services/admin/chat-session-audit-types';

export function eventIcon(type: AuditTimelineType) {
	switch (type) {
		case 'session':
			return Activity;
		case 'message':
			return MessageSquare;
		case 'tool_execution':
			return Wrench;
		case 'llm_call':
			return Bot;
		case 'operation':
			return Database;
		case 'context_shift':
			return RefreshCw;
		case 'timing':
			return Clock;
		case 'turn_run':
			return Activity;
		case 'prompt_snapshot':
			return Database;
		case 'turn_event':
			return Bot;
		case 'eval_run':
			return RefreshCw;
		default:
			return Activity;
	}
}

export function eventSeverityClasses(severity: AuditTimelineSeverity): string {
	switch (severity) {
		case 'success':
			return 'bg-success/10 text-success border-success/20';
		case 'warning':
			return 'bg-warning/10 text-warning border-warning/20';
		case 'error':
			return 'bg-destructive/10 text-destructive border-destructive/20';
		case 'info':
		default:
			return 'bg-accent/10 text-foreground border-accent/30';
	}
}

export function timelineDotClasses(severity: AuditTimelineSeverity): string {
	switch (severity) {
		case 'success':
			return 'bg-success';
		case 'warning':
			return 'bg-warning';
		case 'error':
			return 'bg-destructive';
		case 'info':
		default:
			return 'bg-accent';
	}
}

export function statusBadge(status: string): string {
	switch (status) {
		case 'active':
			return 'bg-success/10 text-success';
		case 'archived':
			return 'bg-muted text-muted-foreground';
		case 'compressed':
			return 'bg-accent/15 text-foreground';
		case 'failed':
			return 'bg-destructive/10 text-destructive';
		default:
			return 'bg-muted text-muted-foreground';
	}
}

export function libriStatusClasses(status: string): string {
	switch (status) {
		case 'sent':
		case 'found':
		case 'queued':
			return 'bg-success/10 text-success';
		case 'partial':
		case 'pending':
		case 'needs_input':
		case 'not_configured':
			return 'bg-warning/10 text-warning';
		case 'failed':
		case 'error':
			return 'bg-destructive/10 text-destructive';
		default:
			return 'bg-muted text-muted-foreground';
	}
}
