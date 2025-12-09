<!-- apps/web/docs/prompts/chat/README.md -->

# Chat System Prompts

This directory contains automatically generated prompt audits from the BuildOS chat compression system.

## Directory Structure

```
chat/
└── compression/    - Chat compression and title generation prompts
```

## Purpose

These files are generated in **development mode only** to help you:

- **Audit** compression quality
- **Optimize** token reduction strategies
- **Monitor** title generation
- **Debug** conversation summarization

## Compression Prompts

### `title-generation-prompt.md`

- **When**: After first few messages in a chat session
- **Purpose**: Generate concise, descriptive title (max 50 chars)
- **Metadata**: Session ID, message count, user ID

### `conversation-compression-prompt.md`

- **When**: Conversation exceeds token threshold (default: 4000 tokens)
- **Purpose**: Compress older messages while preserving key information
- **Metadata**: Messages to compress, target tokens, current tokens

### `segment-compression-prompt.md`

- **When**: Smart compression groups related messages
- **Purpose**: Compress message groups (3+ messages) into summaries
- **Metadata**: Context type, message count, group characteristics

## Compression Strategy

The chat system uses **smart compression** that:

1. Preserves all tool calls and tool results (never compressed)
2. Groups regular messages by time proximity (5-minute gaps)
3. Compresses groups of 3+ messages into summaries
4. Keeps recent messages (last 4) uncompressed

## File Format

Each prompt file includes:

- **Timestamp**: When the prompt was generated
- **System Prompt**: Instructions for compression/title generation
- **User Prompt**: Conversation to compress or analyze
- **Metadata**: Session info, token counts, compression ratios
- **Token Estimates**: Before/after compression estimates

## Development Only

⚠️ **Important**: These files are only generated when `NODE_ENV !== 'production'`. They are automatically overwritten on each execution to show the latest prompt for each scenario type.
