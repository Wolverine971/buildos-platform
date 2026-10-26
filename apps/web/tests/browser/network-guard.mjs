// apps/web/tests/browser/network-guard.mjs
// Loaded only by the isolated browser runner, never by the production application.
import net from 'node:net';
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
	const value = args[0];
	const options = Array.isArray(value) ? value[0] : value;
	const host =
		typeof options === 'object'
			? options.host
			: typeof args[1] === 'string'
				? args[1]
				: undefined;
	if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) {
		throw new Error(`Browser fixture blocked external connection to ${host}`);
	}
	return connect.apply(this, args);
};
