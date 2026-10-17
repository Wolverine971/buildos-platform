// packages/shared-agent-ops/src/gateway/op-execution-gateway.signal.ts
//
// Binds one AbortSignal to every PostgREST request a gateway handler builds, so
// a caller's write deadline cancels the HTTP requests themselves. That includes
// requests made by shared services that only receive `context.admin` (document
// head/version writes, activity logging, mention notifications) and never see a
// signal of their own. Callers without a signal get their client back unchanged.

const SIGNAL_BINDING = Symbol('buildos.gateway.signalBinding');

const MUTATING_QUERY_METHODS = new Set(['insert', 'upsert', 'update', 'delete']);

export type GatewayMutatingRequestKind = 'insert' | 'upsert' | 'update' | 'delete' | 'rpc';

/**
 * Hears about every request a bound client builds that can change data. An RPC
 * always counts: its side effects are not visible from the client. It is called
 * when the request is built, which always precedes sending it, so "never
 * called" proves no such request left through this client.
 */
export type GatewayClientRequestObserver = {
	onMutatingRequest(request: { kind: GatewayMutatingRequestKind; target: string }): void;
};

type SignalBinding = { signal: AbortSignal };

/**
 * Return a view of `client` whose `from(...)`, `rpc(...)` and `schema(...)`
 * builders carry `signal`. Everything else passes through to the real client.
 * Binding a client already bound to the same signal returns it as is.
 */
export function bindGatewayClientSignal<T>(
	client: T,
	signal: AbortSignal | undefined,
	observer?: GatewayClientRequestObserver
): T {
	if (!signal || client === null || typeof client !== 'object') return client;
	const existing = (client as { [SIGNAL_BINDING]?: SignalBinding })[SIGNAL_BINDING];
	if (existing?.signal === signal && !observer) return client;

	const withSignal = <B>(builder: B): B => {
		const candidate = builder as { abortSignal?: unknown } | null;
		if (candidate && typeof candidate.abortSignal === 'function') {
			(candidate.abortSignal as (value: AbortSignal) => unknown).call(candidate, signal);
		}
		return builder;
	};

	const bindQueryBuilder = (builder: unknown, relation: string): unknown => {
		if (builder === null || typeof builder !== 'object') return builder;
		return new Proxy(builder, {
			get(target, prop) {
				const value = Reflect.get(target, prop);
				if (typeof value !== 'function') return value;
				if (prop === 'select') {
					return (...args: unknown[]) => withSignal(value.apply(target, args));
				}
				if (typeof prop === 'string' && MUTATING_QUERY_METHODS.has(prop)) {
					return (...args: unknown[]) => {
						observer?.onMutatingRequest({
							kind: prop as GatewayMutatingRequestKind,
							target: relation
						});
						return withSignal(value.apply(target, args));
					};
				}
				return value.bind(target);
			}
		});
	};

	return new Proxy(client as object, {
		get(target, prop) {
			if (prop === SIGNAL_BINDING) {
				const binding: SignalBinding = { signal };
				return binding;
			}
			const value = Reflect.get(target, prop);
			if (typeof value !== 'function') return value;
			if (prop === 'from') {
				return (relation: string) =>
					bindQueryBuilder(value.call(target, relation), relation);
			}
			if (prop === 'rpc') {
				return (fn: string, ...rest: unknown[]) => {
					observer?.onMutatingRequest({ kind: 'rpc', target: String(fn) });
					return withSignal(value.call(target, fn, ...rest));
				};
			}
			if (prop === 'schema') {
				return (name: string) =>
					bindGatewayClientSignal(value.call(target, name), signal, observer);
			}
			return value.bind(target);
		}
	}) as T;
}
