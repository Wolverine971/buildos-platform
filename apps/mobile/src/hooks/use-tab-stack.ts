// apps/mobile/src/hooks/use-tab-stack.ts
import { createContext, use } from 'react';

import type { TabStack } from '@/lib/routes';

/**
 * Which tab's stack a screen lives in. Set once per tab by app/(tabs)/(today,workspace)/_layout.tsx;
 * anything rendered outside a tab (none today) pushes projects on Workspace, their home.
 */
export const TabStackContext = createContext<TabStack>('workspace');

/** The current tab's stack: build project links with `projectHref(useTabStack(), id)`. */
export function useTabStack(): TabStack {
	return use(TabStackContext);
}
