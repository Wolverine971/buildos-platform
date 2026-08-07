// apps/web/src/lib/services/agentic-chat/tools/registry/install-loop-catalog.ts
//
// Installs the real web tool registry as the loop's injected catalog. Every
// shim over a catalog-dependent loop module imports this first, so any web
// path that reaches loop classification has the catalog installed.
import { provideAgenticChatLoopToolCatalog } from '@buildos/agentic-chat-runtime/loop';
import { getToolRegistry } from './tool-registry';

provideAgenticChatLoopToolCatalog(() => getToolRegistry());
