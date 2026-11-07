import { createContext } from 'svelte';
import type { ReaderItem } from '$lib/components/projects/desktop/reader-model';

// The full-page reader can switch items without reloading the route. Let the
// header ask the mounted reader which task is on screen when chat opens.
export type ReaderChatContext = {
	readItem?: () => {
		item: ReaderItem;
		itemTitle: string;
		projectId: string;
		projectName: string;
	};
};
export const [getReaderChatContext, setReaderChatContext] = createContext<ReaderChatContext>();
