<!-- packages/agent-orchestrator/src/testing/harness/candidates/README.md -->

# Slice A0 candidate pool

`candidates.json` contains 11 anonymized, production-derived requests with proposed—not frozen—route
labels and acceptance checks. Source references are one-way hashes of production turn IDs; raw
session, user, project, and entity IDs are not stored.

DJ selects eight candidates and confirms their labels at gate 1. Only the selected, approved forms
move into `../corpus/`; rejected alternatives remain here as provenance for the selection decision.
