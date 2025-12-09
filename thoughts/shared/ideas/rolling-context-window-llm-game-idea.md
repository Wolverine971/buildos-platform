<!-- thoughts/shared/ideas/rolling-context-window-llm-game-idea.md -->
# Question

If I have a turn based dungeons and dragons game that is faciilitated in a llm chat window, what should be the limit for how many tokens can be used before the scenario becomes too expensive to keep going?

# Answer

Good question — the “too expensive” point depends on:

1. **Model choice** (different LLMs have different \$/token pricing).
2. **How much context** you keep in the window (because LLMs re-read the entire prompt + history every turn).
3. **How long you want the campaign to run** (number of turns).

Here’s a practical way to think about it:

---

### 1. Token Cost Basics

- Every **prompt + history + user message + assistant response** counts toward the token cost.
- In a D\&D chat, that usually means a lot of **worldbuilding context**, plus **running dialogue**.
- If you don’t prune the history, the cost grows _quadratically_ with turns, since each new response includes the entire history.

---

### 2. Approximate Costs

Let’s assume you’re using **GPT-4o** (as of mid-2025: \~\$5/1M input tokens, \~\$15/1M output tokens).

- A typical D\&D turn =
    - \~300–800 tokens of description/context,
    - \~200–400 tokens user message (choices, dice rolls),
    - \~400–800 tokens model response.

- That’s **\~1,000–2,000 tokens/turn**.
- Cost per turn ≈ **\$0.01–\$0.03**.

If you play a **50-turn session**, that’s **\$0.50–\$1.50**.
If you play a **200-turn campaign**, that’s **\$2–\$6**.
Not bad — _until you let context bloat_.

---

### 3. The Real Problem: Context Length

If you just dump everything into the chat history:

- By turn 100, you might have **150k tokens of history** (≈\$0.75 per prompt _just to feed it back_).
- Each new turn then costs \$1+ even if responses are short.

That’s when it becomes “too expensive.”

---

### 4. Practical Limits

- **Token Budget per Turn:** Keep under **2,000–3,000 tokens**.
- **Rolling Context Window:** Don’t let history exceed **20k–40k tokens** (≈\$0.10–\$0.20 to load). Summarize past events instead of replaying raw logs.
- **Campaign Summary Technique:** Every 10–15 turns, replace the old log with a **summary** (like a DM’s notes). That keeps context short and costs low.

---

✅ **Rule of Thumb**:
If each turn costs <\$0.05 and context never exceeds \~30k tokens, you can run a full multi-session campaign for <\$10 total.

---

# FOLLOW up question-

Ok lets adjust the scenario to a wargaming scenario game where a scenario setting is 10000 tokens long to set the scene, and we want to play out different scenarios and go further down into the scenarios, what would the costs look like?

Awesome—let’s price a **wargame** where the **scene-setting is 10,000 tokens** and you then play multiple branches deeper.

I’ll show costs for two popular options and two cheaper ones. (Pricing pulled from official pages.) ([OpenAI][1], [Anthropic][2])

---

# Assumptions (tweak as needed)

- **Scene “bible”** reused every turn: **10,000 input tokens**
- **Per turn (besides scene):** \~**400 input** (orders, dice, running notes), **600 output** (adjudication).
- We’ll show **20-turn branch**; you can scale linearly.

---

# Per-branch cost (≈20 turns)

| Model                                             | If you resend the full 10k scene each turn (no caching) | If you cache/reuse the 10k scene\* |
| ------------------------------------------------- | ------------------------------------------------------: | ---------------------------------: |
| **OpenAI GPT-4.1** (in \$/1M: **in 3, out 12**)   |                                             **\$0.768** |                       **\$0.3405** |
| **OpenAI GPT-4.1 mini** (in **0.8**, out **3.2**) |                                            **\$0.2048** |                       **\$0.0908** |
| **Claude Sonnet 4** (in **3**, out **15**)        |                                             **\$0.804** |                        **\$0.291** |
| **Claude Haiku 3.5** (in **0.8**, out **4**)      |                                            **\$0.2144** |                       **\$0.0776** |

\*“Caching” here means either provider **prompt caching** (discounted “cached input” price) or your own strategy that avoids re-sending the full 10k every turn by sending a hashed key / short handle. OpenAI and Anthropic list discounted rates for cached input. Details and rates: OpenAI pricing page; Anthropic pricing docs. ([OpenAI][1], [Anthropic][2])

---

# How those numbers were computed (example: GPT-4.1)

- Prices: **\$3/M input**, **\$12/M output**, **\$0.75/M cached input**. ([OpenAI][1])
- **No cache** (20 turns):
    - Scene each turn: 20 × 10,000 × \$3/M = **\$0.60**
    - Extra input: 20 × 400 × \$3/M = **\$0.024**
    - Output: 20 × 600 × \$12/M = **\$0.144**
    - **Total ≈ \$0.768**

- **With cache** (20 turns):
    - First send of scene (to “write” it): 10,000 × \$3/M = **\$0.03**
    - 19 cached turns: 19 × 10,000 × **\$0.75/M** = **\$0.1425**
    - Extra input: **\$0.024** (unchanged)
    - Output: **\$0.144** (unchanged)
    - **Total ≈ \$0.3405**

---

# Deeper play (same assumptions, GPT-4.1)

- **10 turns:** \~\$0.384 (no cache) → **\$0.1815** (cache)
- **50 turns:** \~\$1.92 (no cache) → **\$0.8175** (cache)
- **100 turns:** \~\$3.84 (no cache) → **\$1.6125** (cache)

---

# Practical tips to keep costs tiny

1. **Never resend the whole scene.** Use provider **prompt caching** or your own “scene handle” + short delta notes. (OpenAI & Anthropic both discount cached hits.) ([OpenAI][1], [Anthropic][2])
2. **Summarize the transcript** every 5–10 turns into a compact “DM log” (few hundred tokens).
3. **Branching:** if branches share the same 10k scene, you pay the initial scene once per cache window; subsequent branches mainly pay the **cached** rate.
4. **Choose model by need:** tactical sim logic often works great on **mini/haiku** tiers for \~¼ the cost above.

If you want, tell me your **expected turns per branch** and **number of branches**, and I’ll plug in your exact numbers and hand you a one-pager budget.

[1]: https://openai.com/api/pricing/?utm_source=chatgpt.com 'API Pricing - OpenAI'
[2]: https://docs.anthropic.com/en/docs/about-claude/pricing?utm_source=chatgpt.com 'Pricing - Anthropic API'

# takeaways

- Need to create and use a rolling context window after 5 levels deep, summarize past events and keep going.
- Can use prompt caching with chatgpt- send the base scenario prompt that is 10k tokens once and then reference that via a uuid and keep going levels deep. This cuts down costs alot
