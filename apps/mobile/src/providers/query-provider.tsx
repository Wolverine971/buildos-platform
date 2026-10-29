// apps/mobile/src/providers/query-provider.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { type PropsWithChildren, useState } from 'react';

import { createQueryClient } from '@/lib/query-client';

export function QueryProvider({ children }: PropsWithChildren) {
	const [client] = useState(createQueryClient);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
