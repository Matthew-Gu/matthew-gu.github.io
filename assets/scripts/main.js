import handleStream from "./handleStream.js";
import StreamingMarkdownRenderer from "./streamingMDRenderer.js";

const markdownBody = document.querySelector('.markdown-body');

function randomSplit(str, minLength = 3, maxLength = 9) {
	// str = str.replace(/\n/g, " ");
	if (minLength < 1 || maxLength < minLength) {
		throw new Error('Invalid length range. Ensure minLength >= 1 and maxLength >= minLength.');
	}

	let result = [];
	let startIndex = 0;

	while (startIndex < str.length) {
		// 随机选择下一个分割点，确保每个部分长度在[minLength, maxLength]之间
		let nextLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
		let endIndex = Math.min(startIndex + nextLength, str.length);

		// 分割字符串并添加到结果数组
		result.push(str.substring(startIndex, endIndex));

		// 更新起始索引
		startIndex = endIndex;
	}

	return result;
}

function mockReadableStream(content) {
	const sseChunks = [];
	const contentChunks = randomSplit(content, 15, 25);

	for (let i = 0; i < contentChunks.length; i++) {
		const jsonData = JSON.stringify({
			id: i,
			content: contentChunks[i]
		});
		const sseEventPart = `data: ${jsonData}\n\n`;
		sseChunks.push(sseEventPart);
	}

	return new ReadableStream({
		async start(controller) {
			for (const chunk of sseChunks) {
				await new Promise((resolve) => setTimeout(resolve, 60));
				controller.enqueue(new TextEncoder().encode(chunk));
			}
			controller.close();
		}
	});
}


const renderer = new StreamingMarkdownRenderer(markdownBody);

function loadFile(fileName) {
	fetch(`./assets/${fileName}`)
		.then((r) => r.text())
		.then(async (res) => {
			// 获取模拟流式数据
			const response = mockReadableStream(res);
			// 处理流式数据
			const stream = handleStream(response);

			for await (const chunk of stream) {
				const { content: newChunk } = JSON.parse(chunk.data);
				renderer.appendText(newChunk);
			}

			renderer.finish();
		});
}

loadFile('RESUME.md');
