import { createAbortError, delay } from '../utils.js';

function randomSplit(str, minLength = 3, maxLength = 9) {
	if (minLength < 1 || maxLength < minLength) {
		throw new Error('Invalid length range. ' + 'Ensure minLength >= 1 ' + 'and maxLength >= minLength.');
	}

	const result = [];
	let startIndex = 0;

	while (startIndex < str.length) {
		const nextLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

		const endIndex = Math.min(startIndex + nextLength, str.length);

		result.push(str.substring(startIndex, endIndex));

		startIndex = endIndex;
	}

	return result;
}

function mockReadableStream(content, { signal } = {}) {
	const sseChunks = [];

	/*
	 * 输入本身如果包含 Markdown / LaTeX / code fence，
	 * 回显后会由新的 renderer 正常处理。
	 */
	const contentChunks = randomSplit(`Mock success return. You said:\n\n${content}`);

	for (let i = 0; i < contentChunks.length; i++) {
		const jsonData = JSON.stringify({
			id: i,
			content: contentChunks[i]
		});

		const sseEventPart = `data: ${jsonData}\n\n`;

		sseChunks.push(sseEventPart);
	}

	sseChunks.push('data: [DONE]\n\n');

	return new ReadableStream({
		async start(controller) {
			try {
				for (const chunk of sseChunks) {
					await delay(30, signal);

					controller.enqueue(new TextEncoder().encode(chunk));
				}

				controller.close();
			} catch (error) {
				controller.error(error);
			}
		}
	});
}

class SseEventParser {
	constructor() {
		this.buffer = '';
		this.dataLines = [];
		this.eventType = '';
		this.eventId = '';
		this.retry = null;
	}

	push(chunk) {
		this.buffer += String(chunk ?? '');

		return this._consume(false);
	}

	finish() {
		return this._consume(true);
	}

	_consume(force) {
		const events = [];

		while (true) {
			let newlineIndex = -1;
			let newlineLength = 0;

			for (let i = 0; i < this.buffer.length; i++) {
				if (this.buffer[i] === '\n' || this.buffer[i] === '\r') {
					newlineIndex = i;
					newlineLength = this.buffer[i] === '\r' && this.buffer[i + 1] === '\n' ? 2 : 1;

					break;
				}
			}

			if (newlineIndex === -1) {
				break;
			}

			const line = this.buffer.slice(0, newlineIndex);

			this.buffer = this.buffer.slice(newlineIndex + newlineLength);

			const event = this._processLine(line);

			if (event) {
				events.push(event);
			}
		}

		if (force && this.buffer) {
			const event = this._processLine(this.buffer);

			this.buffer = '';

			if (event) {
				events.push(event);
			}
		}

		if (force) {
			const event = this._dispatch();

			if (event) {
				events.push(event);
			}
		}

		return events;
	}

	_processLine(line) {
		if (line === '') {
			return this._dispatch();
		}

		if (line.startsWith(':')) {
			return null;
		}

		const index = line.indexOf(':');
		const field = index === -1 ? line : line.slice(0, index);
		let value = index === -1 ? '' : line.slice(index + 1);

		if (value.startsWith(' ')) {
			value = value.slice(1);
		}

		switch (field) {
			case 'data':
				this.dataLines.push(value);
				break;
			case 'event':
				this.eventType = value;
				break;
			case 'id':
				this.eventId = value;
				break;
			case 'retry':
				if (/^\d+$/.test(value)) {
					this.retry = Number(value);
				}
				break;
			default:
				break;
		}

		return null;
	}

	_dispatch() {
		if (this.dataLines.length === 0) {
			this._resetEvent();

			return null;
		}

		const data = this.dataLines.join('\n');
		const metadata = {
			event: this.eventType || 'message',
			id: this.eventId || undefined,
			retry: this.retry
		};

		this._resetEvent();

		if (data === '[DONE]') {
			return {
				type: 'done',
				...metadata
			};
		}

		let payload;

		try {
			payload = JSON.parse(data);
		} catch {
			return {
				type: 'error',
				error: new Error('SSE data 不是合法 JSON'),
				...metadata
			};
		}

		if (!payload || typeof payload !== 'object' || typeof payload.content !== 'string') {
			return {
				type: 'error',
				error: new Error('SSE payload 缺少字符串 content 字段'),
				...metadata
			};
		}

		return {
			type: 'delta',
			content: payload.content,
			...metadata
		};
	}

	_resetEvent() {
		this.dataLines = [];
		this.eventType = '';
		this.eventId = '';
		this.retry = null;
	}
}

const handleStream = (readableStream) => {
	return (async function* () {
		const reader = readableStream.getReader();
		const decoder = new TextDecoder();
		const parser = new SseEventParser();
		let sourceCompleted = false;

		try {
			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					sourceCompleted = true;

					break;
				}

				if (!value) {
					continue;
				}

				const text = decoder.decode(value, { stream: true });

				for (const event of parser.push(text)) {
					yield event;
				}
			}

			const tail = decoder.decode();

			for (const event of parser.push(tail)) {
				yield event;
			}

			for (const event of parser.finish()) {
				yield event;
			}
		} finally {
			if (!sourceCompleted) {
				await reader.cancel().catch(() => undefined);
			}

			reader.releaseLock();
		}
	})();
};

export { randomSplit, mockReadableStream, SseEventParser, handleStream };

