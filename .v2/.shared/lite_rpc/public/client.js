if (typeof fetch === 'undefined') {
	throw new Error(
		'[serviceLookup] fetch is not available. ' +
			'Node.js 18+ includes native fetch. ' +
			'For older versions, polyfill globalThis.fetch before calling serviceLookup.',
	);
}

/**
 * Chuyển mọi function trong T thành async function,
 * bỏ các property không phải function
 *
 * @template T
 * @typedef {{
 *   [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]:
 *     T[K] extends (...args: infer A) => infer R
 *       ? (...args: A) => Promise<Awaited<R>>
 *       : never
 * }} Asyncify
 */

/**
 * @template {typeof import('./shared.js').ServiceInterface} T
 * @param {string} address
 * @param {T} asType - Abstract class dùng làm interface
 * @param {RequestInit} [init] - Fetch RequestInit (method và body sẽ bị bỏ qua)
 * @param {{ serializer?: { parse: (text: string) => any, stringify: (data: any) => string } }} [options] - Tuỳ chọn custom serializer
 * @returns {Asyncify<InstanceType<T>>}
 */
export function serviceLookup(address, asType, init = {}, options = {}) {
	const serializer = options.serializer || JSON;

	// Warning bỏ qua nếu method hoặc body bị truyền vào
	if (init.method && init.method !== 'POST')
		console.warn('[serviceLookup] Custom method is ignored. RPC always uses POST.');
	if (init.body) console.warn('[serviceLookup] Custom body is ignored. RPC manages request body.');

	// Bỏ method và body từ init
	const { method, body, ...requestInit } = init;

	/** @type {Set<PropertyKey>} */
	const allowedKeys = getMethods(asType.prototype);

	// @ts-expect-error: Unable to type safety for Proxy
	return new Proxy(
		{},
		{
			get(_target, methodName) {
				// Bỏ qua các symbol mặc định
				if (typeof methodName === 'symbol') return undefined;

				// Validate method name
				if (!allowedKeys.has(methodName))
					throw new Error(`RPC method "${String(methodName)}" is not declared in [${asType.name}]`);

				/**
				 * @param {any[]} args
				 */
				return async (...args) => {
					const res = await fetch(address, {
						...requestInit,
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...requestInit.headers,
						},
						body: serializer.stringify({ path: [methodName], args }),
					});

					const rawText = await res.text();
					const data = serializer.parse(rawText);

					if (data.error) throw new Error(data.error);
					return data.result;
				};
			},
		},
	);
}

/**
 * Thu thập toàn bộ method name từ prototype chain
 *
 * @param {object} proto
 * @returns {Set<PropertyKey>}
 */
function getMethods(proto) {
	const keys = new Set();

	while (proto && proto !== Object.prototype) {
		for (const k of Reflect.ownKeys(proto)) {
			if (k === 'constructor') continue;

			const desc = Object.getOwnPropertyDescriptor(proto, k);
			if (desc && typeof desc.value === 'function') {
				keys.add(k);
			}
		}
		proto = Object.getPrototypeOf(proto);
	}

	return keys;
}
