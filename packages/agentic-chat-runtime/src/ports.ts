import type {
	AgenticChatRuntimeEvent,
	AgenticChatTurnCommand,
	AgenticChatTurnOutcome
} from './contracts';

/**
 * The runtime's replaceable data shapes. Adapters refine these fields while
 * keeping the orchestration surface stable and transport neutral.
 */
export interface AgenticChatRuntimeTypeMap {
	command: AgenticChatTurnCommand;
	context: unknown;
	history: unknown;
	preparedPrompt: unknown;
	promptInput: unknown;
	prompt: unknown;
	llmInput: unknown;
	llmEvent: unknown;
	llmResult: unknown;
	toolCatalogInput: unknown;
	toolDefinition: unknown;
	toolExecutionInput: unknown;
	toolExecutionResult: unknown;
	event: AgenticChatRuntimeEvent;
	turnWrite: unknown;
	messageWrite: unknown;
	toolExecutionWrite: unknown;
	persistenceResult: unknown;
	supervisorInput: unknown;
	supervisorResult: unknown;
	checkpointWrite: unknown;
	postProcessingInput: unknown;
	postProcessingResult: unknown;
	telemetryRecord: unknown;
	costRecord: unknown;
	debugArtifact: unknown;
	outcome: AgenticChatTurnOutcome;
}

export interface AgenticChatClockPort {
	now(): Date;
	monotonicNowMs(): number;
}

export interface AgenticChatCancellationPort {
	readonly signal: AbortSignal;
	getReason(): string | null;
}

export interface AgenticChatPortContext<TCommand extends AgenticChatTurnCommand> {
	readonly command: TCommand;
	readonly clock: AgenticChatClockPort;
	readonly cancellation: AgenticChatCancellationPort;
}

export interface AgenticChatLoaderPort<TCommand extends AgenticChatTurnCommand, TResult> {
	load(context: AgenticChatPortContext<TCommand>): Promise<TResult>;
}

export interface AgenticChatPromptPort<TCommand extends AgenticChatTurnCommand, TInput, TResult> {
	build(input: TInput, context: AgenticChatPortContext<TCommand>): Promise<TResult>;
}

export interface AgenticChatLlmStreamObserver<TEvent> {
	onEvent(event: TEvent): Promise<void>;
}

export interface AgenticChatLlmStreamingPort<
	TCommand extends AgenticChatTurnCommand,
	TInput,
	TEvent,
	TResult
> {
	stream(
		input: TInput,
		observer: AgenticChatLlmStreamObserver<TEvent>,
		context: AgenticChatPortContext<TCommand>
	): Promise<TResult>;
}

export interface AgenticChatToolCatalogPort<
	TCommand extends AgenticChatTurnCommand,
	TInput,
	TTool
> {
	list(input: TInput, context: AgenticChatPortContext<TCommand>): Promise<readonly TTool[]>;
}

export interface AgenticChatToolExecutionPort<
	TCommand extends AgenticChatTurnCommand,
	TInput,
	TResult
> {
	execute(input: TInput, context: AgenticChatPortContext<TCommand>): Promise<TResult>;
}

/** Public-event delivery only; response creation and connection lifecycle remain host concerns. */
export interface AgenticChatEventSinkPort<
	TCommand extends AgenticChatTurnCommand,
	TEvent extends AgenticChatRuntimeEvent
> {
	emit(event: TEvent, context: AgenticChatPortContext<TCommand>): Promise<void>;
}

export interface AgenticChatWriterPort<
	TCommand extends AgenticChatTurnCommand,
	TOperation,
	TResult
> {
	write(operation: TOperation, context: AgenticChatPortContext<TCommand>): Promise<TResult>;
}

export interface AgenticChatSupervisorPort<
	TCommand extends AgenticChatTurnCommand,
	TInput,
	TResult
> {
	evaluate(input: TInput, context: AgenticChatPortContext<TCommand>): Promise<TResult>;
}

export interface AgenticChatPostProcessingPort<
	TCommand extends AgenticChatTurnCommand,
	TInput,
	TResult
> {
	run(input: TInput, context: AgenticChatPortContext<TCommand>): Promise<TResult>;
}

export interface AgenticChatRecordPort<TCommand extends AgenticChatTurnCommand, TRecord> {
	record(record: TRecord, context: AgenticChatPortContext<TCommand>): Promise<void>;
}

export interface AgenticChatDebugArtifactPort<TCommand extends AgenticChatTurnCommand, TArtifact> {
	write(artifact: TArtifact, context: AgenticChatPortContext<TCommand>): Promise<void>;
}

export type AgenticChatRuntimePorts<
	TTypes extends AgenticChatRuntimeTypeMap = AgenticChatRuntimeTypeMap
> = {
	loaders: {
		context: AgenticChatLoaderPort<TTypes['command'], TTypes['context']>;
		history: AgenticChatLoaderPort<TTypes['command'], TTypes['history']>;
		preparedPrompt: AgenticChatLoaderPort<TTypes['command'], TTypes['preparedPrompt'] | null>;
	};
	prompt: AgenticChatPromptPort<TTypes['command'], TTypes['promptInput'], TTypes['prompt']>;
	llm: AgenticChatLlmStreamingPort<
		TTypes['command'],
		TTypes['llmInput'],
		TTypes['llmEvent'],
		TTypes['llmResult']
	>;
	tools: {
		catalog: AgenticChatToolCatalogPort<
			TTypes['command'],
			TTypes['toolCatalogInput'],
			TTypes['toolDefinition']
		>;
		execution: AgenticChatToolExecutionPort<
			TTypes['command'],
			TTypes['toolExecutionInput'],
			TTypes['toolExecutionResult']
		>;
	};
	events: AgenticChatEventSinkPort<TTypes['command'], TTypes['event']>;
	persistence: {
		turns: AgenticChatWriterPort<
			TTypes['command'],
			TTypes['turnWrite'],
			TTypes['persistenceResult']
		>;
		messages: AgenticChatWriterPort<
			TTypes['command'],
			TTypes['messageWrite'],
			TTypes['persistenceResult']
		>;
		toolExecutions: AgenticChatWriterPort<
			TTypes['command'],
			TTypes['toolExecutionWrite'],
			TTypes['persistenceResult']
		>;
	};
	supervisor: {
		decisions: AgenticChatSupervisorPort<
			TTypes['command'],
			TTypes['supervisorInput'],
			TTypes['supervisorResult']
		>;
		checkpoints: AgenticChatWriterPort<
			TTypes['command'],
			TTypes['checkpointWrite'],
			TTypes['persistenceResult']
		>;
	};
	postProcessing: AgenticChatPostProcessingPort<
		TTypes['command'],
		TTypes['postProcessingInput'],
		TTypes['postProcessingResult']
	>;
	telemetry: AgenticChatRecordPort<TTypes['command'], TTypes['telemetryRecord']>;
	costs: AgenticChatRecordPort<TTypes['command'], TTypes['costRecord']>;
	cancellation: AgenticChatCancellationPort;
	clock: AgenticChatClockPort;
	debugArtifacts: AgenticChatDebugArtifactPort<TTypes['command'], TTypes['debugArtifact']>;
};

export type RunAgenticChatTurn<
	TTypes extends AgenticChatRuntimeTypeMap = AgenticChatRuntimeTypeMap
> = (
	command: TTypes['command'],
	ports: AgenticChatRuntimePorts<TTypes>
) => Promise<TTypes['outcome']>;
