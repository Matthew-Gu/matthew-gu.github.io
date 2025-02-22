import MarkdownIt from 'https://esm.sh/markdown-it';
import hljs from 'https://esm.sh/highlight.js';

const mdi = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language));
    if (validLang) {
      return highlightBlock(hljs.highlight(language, code, true).value, language);
    }
    return highlightBlock(hljs.highlightAuto(code).value);
  },
});

function highlightBlock(str, language = '') {
  return `<pre class="code-block-wrapper"><code class="hljs ${language} code-block-body">${str}</code></pre>`;
}

const $ = document.querySelector.bind(document);

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
  const contentChunks = randomSplit(`Mock success return. You said:\n${content}`);

  for (let i = 0; i < contentChunks.length; i++) {
    const jsonData = JSON.stringify({
      id: i,
      content: contentChunks[i],
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
    },
  });
}

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
    },
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
    },
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

const textarea = $('#text-area');
const sendBtn = $('#send-btn');
const messageList = $('#message-list');
const messageWrapper = $('#message-wrapper');
let isPending = false;

const readStream = async () => {
  const text = textarea.value;
  if (isPending || text.trim() === '') return;
  isPending = true;
  sendBtn.disabled = true;

  // 创建问题框
  const questionItem = document.createElement('div');
  questionItem.classList.add('message-box', 'question-item');
  const bubble1 = document.createElement('div');
  bubble1.className = 'bubble';
  bubble1.innerText = text;
  questionItem.appendChild(bubble1);
  messageList.appendChild(questionItem);

  textarea.value = '';
  textarea.blur();

  messageWrapper.scrollTo({
    top: messageWrapper.scrollHeight,
  });

  // 获取模拟流式数据
  const response = mockReadableStream(text);
  // 处理流式数据
  const stream = handleStream(response);

  // 创建回答框
  const answerItem = document.createElement('div');
  answerItem.classList.add('message-box', 'answer-item');
  const bubble2 = document.createElement('div');
  bubble2.classList.add('bubble', 'markdown-body');
  answerItem.appendChild(bubble2);
  messageList.appendChild(answerItem);

  let answer = '';
  for await (const chunk of stream) {
    const chunkData = JSON.parse(chunk.data);
    answer += chunkData.content;
    bubble2.innerHTML = mdi.render(answer);
  }
  isPending = false;
  sendBtn.disabled = false;
};

sendBtn.onclick = readStream;

textarea.addEventListener('keydown', (e) => {
  // 监听键盘事件，实现shift换行
  if (e.keyCode == 13) {
    if (!e.shiftKey) {
      e.preventDefault();
      readStream();
      return;
    }
  }
});
