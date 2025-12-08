// apps/web/src/lib/utils/cn.ts
export function cn(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(' ');
}
