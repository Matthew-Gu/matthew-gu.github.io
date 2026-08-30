import { createAbortError, isAbortError } from './utils.js';
import { mockReadableStream, handleStream } from './stream/sse.js';
import { StreamingMarkdownRenderer } from './renderer/streaming-renderer.js';

const mountStreamDemo = () => {
	const $ = document.querySelector.bind(document);

	const textarea = $('#text-area');

	const sendBtn = $('#send-btn');

	const messageList = $('#message-list');

	const messageWrapper = $('#message-wrapper');

	const MIN_TEXTAREA_HEIGHT = 44;

	const MAX_TEXTAREA_HEIGHT = 180;

	const resizeTextarea = () => {
		textarea.style.height = 'auto';

		const contentHeight = textarea.scrollHeight;
		const nextHeight = Math.min(Math.max(contentHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);

		textarea.style.height = `${nextHeight}px`;
		textarea.style.overflowY = contentHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
	};

	resizeTextarea();

	const updateMessageScrollbarWidth = () => {
		const scrollbarWidth = Math.max(0, messageWrapper.offsetWidth - messageWrapper.clientWidth);

		document.documentElement.style.setProperty('--message-scrollbar-width', `${scrollbarWidth}px`);
	};

	updateMessageScrollbarWidth();

	window.addEventListener('resize', updateMessageScrollbarWidth);

	const STREAM_STATES = Object.freeze({
		IDLE: 'idle',
		STREAMING: 'streaming',
		SUCCESS: 'success',
		ERROR: 'error',
		CANCELED: 'canceled'
	});

	let isPending = false;
	let currentState = STREAM_STATES.IDLE;
	let activeRequest = null;
	let followLatest = true;

	const scrollDistanceFromLatest = () => {
		return Math.max(0, messageWrapper.scrollHeight - messageWrapper.clientHeight - messageWrapper.scrollTop);
	};

	const scrollToLatest = ({ force = false } = {}) => {
		updateMessageScrollbarWidth();

		if (!force && !followLatest) {
			return;
		}

		messageWrapper.scrollTo({
			top: messageWrapper.scrollHeight,
			behavior: 'auto'
		});
	};

	messageWrapper.addEventListener('scroll', () => {
		followLatest = scrollDistanceFromLatest() < 80;
	});

	const setState = (state) => {
		currentState = state;

		const isStreaming = state === STREAM_STATES.STREAMING;

		sendBtn.disabled = false;
		sendBtn.textContent = isStreaming ? '取消' : '发送';
		sendBtn.setAttribute('aria-label', isStreaming ? '取消生成' : '发送');
		sendBtn.classList.toggle('is-cancel', isStreaming);
	};

	const appendStreamError = (bubble, message) => {
		const errorMessage = document.createElement('p');

		errorMessage.className = 'stream-error';
		errorMessage.textContent = message;
		bubble.appendChild(errorMessage);
	};

	const createAnswerItem = () => {
		const answerItem = document.createElement('div');
		const bubble = document.createElement('div');

		answerItem.classList.add('message-box', 'answer-item');
		bubble.classList.add('bubble', 'markdown-body');
		bubble.setAttribute('aria-live', 'polite');
		answerItem.appendChild(bubble);
		messageList.appendChild(answerItem);

		return {
			answerItem,
			bubble
		};
	};

	const cancelStream = () => {
		if (!activeRequest) {
			return;
		}

		activeRequest.controller.abort();
		activeRequest.renderer?.cancel();
	};

	const readStream = async () => {
		const text = textarea.value;

		if (isPending || text.trim() === '') {
			return;
		}

		isPending = true;
		followLatest = true;
		setState(STREAM_STATES.STREAMING);

		/*
		 * 创建问题框：
		 */
		const questionItem = document.createElement('div');

		questionItem.classList.add('message-box', 'question-item');

		const bubble1 = document.createElement('div');

		bubble1.className = 'bubble';

		bubble1.innerText = text;

		questionItem.appendChild(bubble1);

		messageList.appendChild(questionItem);

		textarea.value = '';
		resizeTextarea();
		textarea.blur();

		scrollToLatest({ force: true });

		/*
		 * 获取模拟流式数据。
		 */
		const controller = new AbortController();
		const response = mockReadableStream(text, {
			signal: controller.signal
		});

		const stream = handleStream(response);

		const { answerItem, bubble: bubble2 } = createAnswerItem();

		const renderer = new StreamingMarkdownRenderer(bubble2);

		activeRequest = {
			controller,
			renderer,
			answerItem
		};

		try {
			for await (const event of stream) {
				if (event.type === 'done') {
					break;
				}

				if (event.type === 'error') {
					throw event.error;
				}

				if (event.type === 'delta') {
					renderer.appendText(event.content);
					scrollToLatest();
				}
			}

			if (controller.signal.aborted) {
				throw createAbortError();
			}

			await renderer.finish();

			if (controller.signal.aborted) {
				throw createAbortError();
			}

			setState(STREAM_STATES.SUCCESS);
			scrollToLatest({ force: true });
		} catch (error) {
			renderer.cancel();

			if (isAbortError(error) || controller.signal.aborted) {
				appendStreamError(bubble2, '生成已取消。');
				setState(STREAM_STATES.CANCELED);
			} else {
				console.error(error);
				appendStreamError(bubble2, '生成失败，请重试。');
				setState(STREAM_STATES.ERROR);
			}

			scrollToLatest({ force: true });
		} finally {
			isPending = false;
			activeRequest = null;

			if (currentState === STREAM_STATES.STREAMING) {
				setState(STREAM_STATES.IDLE);
			}
		}
	};

	sendBtn.addEventListener('click', () => {
		if (currentState === STREAM_STATES.STREAMING) {
			cancelStream();

			return;
		}

		readStream();
	});

	textarea.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			readStream();
		}
	});

	textarea.addEventListener('input', resizeTextarea);
};

mountStreamDemo();
