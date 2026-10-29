// apps/mobile/src/components/today/follow-reader.tsx
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect } from 'react';

/**
 * Reports the task open in the reader sheet, including after Prev or Next walks it to another,
 * so Today's accent bar marks the row last read. Renders nothing; it lives in its own component
 * so global route changes re-render only it, not the whole day.
 */
export function FollowReader({ onTask }: { onTask: (taskId: string) => void }) {
	const pathname = usePathname();
	const params = useGlobalSearchParams<{ kind?: string; id?: string }>();
	const taskId =
		pathname === '/reader' && params.kind !== 'document' && typeof params.id === 'string'
			? params.id
			: null;

	useEffect(() => {
		if (taskId) onTask(taskId);
	}, [taskId, onTask]);

	return null;
}
