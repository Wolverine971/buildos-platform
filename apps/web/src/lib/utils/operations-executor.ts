// apps/web/src/lib/utils/operations-executor.ts
// This file now re-exports from the modular operations directory
// The original 1500+ line file has been split into focused modules:
// - operations-executor.ts: Main executor class (300 lines)
// - operation-validator.ts: Validation logic (200 lines)
// - reference-resolver.ts: Reference resolution (250 lines)
// - validation-schemas.ts: Table schemas (140 lines)
// - validation-utils.ts: Utility functions (120 lines)
// - types.ts: TypeScript interfaces (20 lines)

export { OperationsExecutor } from './operations/operations-executor';
export { OperationValidator } from './operations/operation-validator';
export { ReferenceResolver } from './operations/reference-resolver';
export * from './operations/types';
export * from './operations/validation-utils';
export { tableSchemas, UUID_REGEX, fieldTypeMappings } from './operations/validation-schemas';
