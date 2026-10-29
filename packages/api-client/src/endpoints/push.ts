// packages/api-client/src/endpoints/push.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	PushDeviceListResponse,
	PushDeviceRegistration,
	PushDeviceRegistrationResponse,
	PushDeviceRemoval,
	PushDeviceRemovalResponse
} from '../types';

const DEVICES_PATH = '/api/push/devices';

export function createPushEndpoints(http: BuildOsHttp) {
	return {
		/** GET /api/push/devices — the person's active phones and browsers, for a settings screen. */
		listDevices: (options?: RequestOptions) =>
			http.request<PushDeviceListResponse>(DEVICES_PATH, options),

		/** POST /api/push/devices — register this install's Expo push token (idempotent per token). */
		registerDevice: (input: PushDeviceRegistration, options?: RequestOptions) =>
			http.request<PushDeviceRegistrationResponse>(DEVICES_PATH, {
				method: 'POST',
				body: input,
				...options
			}),

		/** DELETE /api/push/devices — stop sending to this token (sign-out, push turned off). */
		unregisterDevice: (input: PushDeviceRemoval, options?: RequestOptions) =>
			http.request<PushDeviceRemovalResponse>(DEVICES_PATH, {
				method: 'DELETE',
				body: input,
				...options
			})
	};
}

export type PushEndpoints = ReturnType<typeof createPushEndpoints>;
