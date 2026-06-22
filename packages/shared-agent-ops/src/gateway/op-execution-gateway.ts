// packages/shared-agent-ops/src/gateway/op-execution-gateway.ts
//
// Public facade for the BuildOS gateway execution surface. Keep this subpath
// stable: web, worker, and package consumers import from it. Implementation is
// split across focused modules below.
export * from './op-execution-gateway.core';
export * from './op-execution-gateway.mutations';
export * from './op-execution-gateway.validation';
export * from './op-execution-gateway.worker';
export * from './op-execution-gateway.staging';
