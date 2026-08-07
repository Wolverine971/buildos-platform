// apps/web/src/lib/services/agentic-chat/tools/registry/install-loop-catalog.ts
//
// Installs web's real providers behind the loop's injected ports. Every shim
// over a port-dependent loop module imports this first, so any web path that
// reaches loop classification or repair instructions has them installed.
import {
	provideAgenticChatLoopSkillLookup,
	provideAgenticChatLoopToolCatalog
} from '@buildos/agentic-chat-runtime/loop';
import { getSkillById, getSkillByReference } from '../skills/registry';
import { getToolRegistry } from './tool-registry';

provideAgenticChatLoopToolCatalog(() => getToolRegistry());
provideAgenticChatLoopSkillLookup(() => ({
	getSkillIdByReference: (reference) => getSkillByReference(reference)?.id ?? null,
	getSkillParentId: (skillId) => getSkillById(skillId)?.parentId ?? null
}));
