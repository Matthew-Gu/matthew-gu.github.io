const createAbortError = () => {
	if (typeof DOMException === 'function') {
		return new DOMException('The operation was aborted.', 'AbortError');
	}

	const error = new Error('The operation was aborted.');
	error.name = 'AbortError';

	return error;
};

const isAbortError = (error) => error?.name === 'AbortError';

const delay = (duration, signal) => {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(createAbortError());

			return;
		}

		let timerId = 0;

		const cleanup = () => {
			clearTimeout(timerId);
			signal?.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			cleanup();
			reject(createAbortError());
		};

		timerId = setTimeout(() => {
			cleanup();
			resolve();
		}, duration);

		signal?.addEventListener('abort', onAbort, { once: true });
	});
};

export { createAbortError, isAbortError, delay };

