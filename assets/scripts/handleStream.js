const isValidString = (str) => (str ?? '').trim() !== '';

const splitStream = () => {
	let buffer = '';

	return new TransformStream({
		transform(streamChunk, controller) {
			// 转换流数据
			buffer += streamChunk;

			const parts = buffer.split('\n\n');
			parts.slice(0, -1).forEach((part) => {
				if (isValidString(part)) {
					controller.enqueue(part);
				}
			});

			buffer = parts[parts.length - 1];
		},
		flush(controller) {
			// 转换完成的清理工作
			if (isValidString(buffer)) {
				controller.enqueue(buffer);
			}
		}
	});
};

const splitPart = () => {
	return new TransformStream({
		transform(partChunk, controller) {
			const lines = partChunk.split('\n');
			const sseEvent = lines.reduce((acc, line) => {
				const index = line.indexOf(':');
				if (index !== -1) {
					const key = line.slice(0, index);
					if (!isValidString(key)) return acc;
					const value = line.slice(index + 1);
					return { ...acc, [key]: value };
				}
			}, {});

			if (Object.keys(sseEvent).length === 0) return;
			controller.enqueue(sseEvent);
		}
	});
};

const handleStream = (readableStream) => {
	const decoderStream = new TextDecoderStream();
	const stream = readableStream
		.pipeThrough(decoderStream) // 解码 utf-8
		.pipeThrough(splitStream()) // 流式数据分割
		.pipeThrough(splitPart()); // 分割data:

	// 将stream变成异步可迭代数据
	stream[Symbol.asyncIterator] = async function* () {
		const reader = this.getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			yield value;
		}
	};

	return stream;
};


export default handleStream