import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import type { StreamableOutputItem } from '@openrouter/sdk';
import { createAgent, type Agent, type Message } from './agent.js';
import { defaultTools } from './tools.js';

// Initialize agent (runs independently of UI)
const agent = createAgent({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'openrouter/auto',
  instructions: 'You are a helpful assistant. Be concise.',
  tools: defaultTools,
});

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={isUser ? 'cyan' : 'green'}>
        {isUser ? '▶ You' : '◀ Assistant'}
      </Text>
      <Text wrap="wrap">{message.content}</Text>
    </Box>
  );
}

// Render streaming items by type using the items-based pattern
function ItemRenderer({ item }: { item: StreamableOutputItem }) {
  switch (item.type) {
    case 'message': {
      const textContent = item.content?.find((c: { type: string }) => c.type === 'output_text');
      const text = textContent && 'text' in textContent ? textContent.text : '';
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">◀ Assistant</Text>
          <Text wrap="wrap">{text}</Text>
          {item.status !== 'completed' && <Text color="gray">▌</Text>}
        </Box>
      );
    }
    case 'function_call':
      return (
        <Text color="yellow">
          {item.status === 'completed' ? '  ✓' : '  🔧'} {item.name}
          {item.status === 'in_progress' && '...'}
        </Text>
      );
    case 'reasoning': {
      const reasoningText = item.content?.find((c: { type: string }) => c.type === 'reasoning_text');
      const text = reasoningText && 'text' in reasoningText ? reasoningText.text : '';
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="magenta">💭 Thinking</Text>
          <Text wrap="wrap" color="gray">{text}</Text>
        </Box>
      );
    }
    default:
      return null;
  }
}

function InputField({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  useInput((input, key) => {
    if (disabled) return;
    if (key.return) onSubmit();
    else if (key.backspace || key.delete) onChange(value.slice(0, -1));
    else if (input && !key.ctrl && !key.meta) onChange(value + input);
  });

  return (
    <Box>
      <Text color="yellow">{'> '}</Text>
      <Text>{value}</Text>
      <Text color="gray">{disabled ? ' ···' : '█'}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Use Map keyed by item ID for efficient React state updates (items-based pattern)
  const [items, setItems] = useState<Map<string, StreamableOutputItem>>(new Map());

  useInput((_, key) => {
    if (key.escape) exit();
  });

  // Subscribe to agent events using items-based streaming
  useEffect(() => {
    const onThinkingStart = () => {
      setIsLoading(true);
      setItems(new Map()); // Clear items for new response
    };

    // Items-based streaming: replace items by ID, don't accumulate
    const onItemUpdate = (item: StreamableOutputItem) => {
      const itemId = 'id' in item && item.id ? item.id : `unknown-${Date.now()}`;
      setItems((prev) => new Map(prev).set(itemId, item));
    };

    const onMessageAssistant = () => {
      setMessages(agent.getMessages());
      setItems(new Map()); // Clear streaming items
      setIsLoading(false);
    };

    const onError = (err: Error) => {
      setIsLoading(false);
    };

    agent.on('thinking:start', onThinkingStart);
    agent.on('item:update', onItemUpdate);
    agent.on('message:assistant', onMessageAssistant);
    agent.on('error', onError);

    return () => {
      agent.off('thinking:start', onThinkingStart);
      agent.off('item:update', onItemUpdate);
      agent.off('message:assistant', onMessageAssistant);
      agent.off('error', onError);
    };
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    await agent.send(text);
  }, [input, isLoading]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">🤖 OpenRouter Agent</Text>
        <Text color="gray"> (Esc to exit)</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {/* Render completed messages */}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {/* Render streaming items by type (items-based pattern) */}
        {Array.from(items.entries()).map(([id, item]) => (
          <ItemRenderer key={id} item={item} />
        ))}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <InputField
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          disabled={isLoading}
        />
      </Box>
    </Box>
  );
}

render(<App />);
