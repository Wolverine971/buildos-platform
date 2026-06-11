<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/references/ai-ui-smoke-test.md -->

# AI-Generated UI Smoke Test

Use this reference when reviewing AI-generated UI from v0, Lovable, Cursor, Bolt, or similar tools — or when a screen "looks like AI slop" and you need to name why. Run this fingerprint scan first, then continue with the normal review sequence.

| AI-slop pattern                                              | Why it reads as slop                          | Corrective move                                                          |
| ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------ |
| `rounded-2xl` + `shadow-md` + `border` stacked on every card | Triple belt-and-suspenders                    | Pick one.                                                                |
| `text-gray-400` / `text-slate-500` on every muted element    | Pure grey on colored backgrounds reads dull   | Replace with a lighter S/B variant of the brand hue.                     |
| `shadow-md` everywhere, no elevation distinction             | No elevation ladder                           | Define an elevation ladder.                                              |
| `bg-gradient-to-r from-blue-500 to-purple-500`               | "AI gradient" — distant hues blended          | Rotate hue across a single family or remove.                             |
| Inter, Inter, Inter                                          | Single biggest fingerprint of AI-generated UI | Swap to Satoshi / Metropolis / Figtree, or pair with a display headline. |
| Default `p-4` / `gap-4` / `space-y-4` everywhere             | Tight Tailwind defaults                       | Double the spacing values.                                               |
| Outline buttons everywhere                                   | Ghost buttons feel weightless                 | Soft-solid based on text color at low alpha.                             |
| Borders separating every form field, table row, card section | Borders as the only hierarchy lever           | Replace with zebra striping, off-white blocks, or spacing.               |

Each fingerprint found is a finding: cite the class string or component as Evidence, severity medium by default (high if it degrades contrast or task clarity).

For deeper AI-slop coverage and corrective tokens, escalate to `visual_craft_fundamentals`.
