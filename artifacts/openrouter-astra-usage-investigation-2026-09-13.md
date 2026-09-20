<!-- artifacts/openrouter-astra-usage-investigation-2026-09-13.md -->

# OpenRouter GPT-6 Astra usage investigation

Investigated September 13, 2026. All times below are America/New_York (EDT).

## Finding

The Astra charges came from the Codex task **Inspect BuildOS project** (`01a09336-5083-7fd0-9e4f-1aabf2de639a`). That task began in the Codex CLI with DeepSeek V4.1 Flash and the custom `openrouter` provider. On September 12, its model changed to `gpt-6-astra`, while its provider remained `openrouter`. Subsequent Astra requests therefore used the configured OpenRouter API key and consumed OpenRouter credits.

The evidence establishes the settings transition. It does not identify the exact UI gesture or whether retaining the provider was intentional.

## Reconciled usage

The requested reporting window is September 7–13, 2026, inclusive in Eastern time.

| Measure                  | Evidence                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Astra spend              | $42.31 in OpenRouter's filtered overview                                                     |
| Share of all model spend | 83.3% in the original Explore table                                                          |
| Astra requests           | 218 in OpenRouter; exactly 218 distinct Astra response IDs in the task's local usage records |
| Token volume             | 31.3M in OpenRouter; 31,323,534 in local usage records                                       |
| Input tokens             | 31,252,828 across the 218 requests                                                           |
| Cached input tokens      | 30,598,562; consistent with OpenRouter's 97.9% cache hit rate                                |
| Output tokens            | 70,706, including 27,665 reasoning tokens                                                    |
| API key name             | `buildos`                                                                                    |
| App / origin             | Codex / `https://openai.com/codex/` for 100% of the filtered Astra spend                     |
| Usage interval           | September 12, approximately 4:13–5:24 PM                                                     |

Token totals accumulate across requests, including repeated conversation context; they are not 31.3 million newly authored tokens.

OpenRouter's last Astra generation detail identifies the same session ID as the Codex task. Its generation ID, `gen-1789248243-BiXaXy0lbW7mSKFYdhWW`, exactly matches the task's last local Astra usage record. This directly corroborates the attribution beyond matching timestamps and totals.

## Timeline

1. **September 11, 9:23 PM:** Task created by `codex-tui`, using `deepseek/deepseek-v4.1-flash` through `openrouter`. Initial requests concerned access to the BuildOS project and whether gate reassessment issues were fixed.
2. **September 12, 4:11:33 PM:** A `thread_settings_applied` event changes the model to `gpt-6-astra`; `model_provider_id` remains `openrouter`.
3. **4:11:34 PM:** Reasoning effort changes from medium to high. Provider remains `openrouter`.
4. **4:13 PM:** Work resumes on Google Calendar credentials and the agentic gate setup. This turn records 56 Astra requests.
5. **4:23 PM:** A follow-up continues the setup. This turn records 159 Astra requests and ends with an OpenRouter 402 error.
6. **5:23 PM:** A follow-up asks to investigate the payment error without adding credits. It records three more Astra requests before another 402 error.

The three Astra turns total **56 + 159 + 3 = 218** requests.

The 402 message says the request would exceed available credits given current in-flight requests. It is an OpenRouter credit/reservation error, not evidence that a Google Calendar payment was needed.

## Configuration and present state

- `/Users/djwayne/.codex/config.toml:197` defines a custom OpenRouter provider with base URL `https://openrouter.ai/api/v1` and `wire_api = "responses"`.
- The provider's authentication command obtains its credential from the macOS Keychain item `openrouter-api-key`. No credential was retrieved or exposed during this investigation.
- The global model is `gpt-6-astra`. There is no top-level `model_provider` override in the inspected configuration. Official documentation defines the default provider as `openai`.
- The affected task's stored provider is still `openrouter`, with model `gpt-6-astra`. Before resuming it, select the intended OpenAI/ChatGPT provider or continue the work in a task verified to use that provider.
- This investigation's task is recorded with provider `openai` and model `gpt-6-astra`.
- No Astra reference was found in the searched BuildOS runtime model configuration, worker configuration, test harness, or inspected local model environment settings. The reconciled requests belong to the Codex coding task.

No application code, model settings, keys, billing settings, or task provider settings were changed.

## Removal completed at the user's request

After the investigation, the user explicitly requested removal of OpenRouter from Codex.

- Removed the OpenRouter provider and its Keychain authentication command from `/Users/djwayne/.codex/config.toml`.
- Set `model_provider = "openai"` explicitly in the base configuration.
- Removed the active `/Users/djwayne/.codex/deepseek.config.toml` profile. Backups of the previous settings are in `/Users/djwayne/.codex/backups/openrouter-removal-20260913T232401Z/`, with restricted permissions and filenames that do not activate as profiles.
- Used Codex's local app-server settings API to migrate the three ordinary saved tasks that selected OpenRouter to `openai`. The affected **Inspect BuildOS project** task keeps `gpt-6-astra` with high reasoning; the two completed DeepSeek test tasks now use the configured default model, `gpt-6-astra`, with low reasoning.
- Verified both the task database and the latest persisted task-settings events report `openai` for all three tasks. No prompts or model generations were submitted during this migration.
- A historical internal approval-review task retains its original provider attribution; it was not restarted. The removed provider definition cannot be selected by a fresh Codex configuration.
- BuildOS application configuration, its API key, and the Keychain credential were not changed.

The previous “present state” section describes the investigation snapshot before removal. Restart Codex to clear any provider configuration cached in an already-running app or CLI process.

## Sources

- [OpenRouter Astra usage, September 7–13](https://openrouter.ai/activity?from=2026-09-07T04%3A00%3A00.000Z&to=2026-09-14T03%3A59%3A59.999Z&model_slug=openai%2Fgpt-6-astra-20260903)
- [OpenRouter matching session](https://openrouter.ai/logs?tab=sessions&session_id=01a09336-5083-7fd0-9e4f-1aabf2de639a)
- [OpenRouter matched last generation](https://openrouter.ai/logs?from=2026-09-07T04%3A00%3A00.000Z&to=2026-09-14T03%3A59%3A59.999Z&model_slug=openai%2Fgpt-6-astra-20260903&transaction=gen-1789248243-BiXaXy0lbW7mSKFYdhWW)
- Codex task title and failure messages verified with the Codex task reader.
- Read-only Codex database query: `/Users/djwayne/.codex/state_5.sqlite`, `threads` row for the affected task.
- Local task record: `/Users/djwayne/.codex/sessions/2026/09/11/rollout-2026-09-11T21-23-25-01a09336-5083-7fd0-9e4f-1aabf2de639a.jsonl`. Provider at line 1; original model at line 6; Astra/provider settings transition at lines 335–337; first Astra usage at line 349. Only relevant metadata and usage totals are reproduced here.
- [Official Codex configuration reference: provider selection and authentication](https://learn.chatgpt.com/docs/config-file/config-reference)
