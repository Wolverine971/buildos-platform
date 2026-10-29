// packages/api-client/src/contract.ts
/**
 * Contract version the client announces on every request as
 * `X-BuildOS-Api-Contract`. Phone builds lag web deploys by weeks, so the API only
 * ever adds fields; bump this when a change is not additive and the server needs
 * to tell old clients apart.
 */
export const API_CLIENT_CONTRACT_VERSION = 1;

export const API_CONTRACT_HEADER = 'x-buildos-api-contract';
