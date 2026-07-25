import type { ModelUsageEvent } from '../contracts';

export type { ModelUsageEvent } from '../contracts';

export interface MeteredTextResponse {
	text: string;
	usage: ModelUsageEvent[];
}
