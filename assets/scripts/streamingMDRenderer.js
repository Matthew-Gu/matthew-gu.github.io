export default class StreamingMarkdownRenderer {
	constructor(container) {
		this.container = container;
		this.container.innerHTML = '';
		this.buffer = '';
		this._pendingBlock = null;
		this._currentList = null;
		this._codeBlock = null; // { pre, code, lang }
	}

	appendText(text) {
		this.buffer += text;
		this._processBuffer();
	}

	finish() {
		// 处理剩余缓冲区行
		if (this.buffer.trim()) {
			this._processLine(this.buffer, true);
			this.buffer = '';
		}
		// 收尾所有状态
		this._finalizePendingBlock();
		this._finalizeList();
		this._finalizeCodeBlock();
	}

	_processBuffer() {
		const lines = this.buffer.split('\n');
		while (lines.length > 1) {
			const line = lines.shift();
			this._processLine(line, false);
		}
		this.buffer = lines[0] || '';
	}

	_processLine(rawLine, isFinal = false) {
		const line = rawLine;
		const trimmed = line.trim();

		const codeFenceMatch = trimmed.match(/^```(?:\s*(\w+))?\s*$/);
		if (codeFenceMatch) {
			const lang = codeFenceMatch[1] || '';
			if (this._codeBlock) {
				this._finalizeCodeBlock();
			} else {
				this._finalizePendingBlock();
				this._finalizeList();
				this._startCodeBlock(lang);
			}
			return;
		}

		// 如果正在代码块中，则直接追加文本
		if (this._codeBlock) {
			this._appendCodeLine(line);
			return;
		}

		// ---------- 水平线 ----------
		if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
			this._finalizePendingBlock();
			this._finalizeList();
			const hr = document.createElement('hr');
			hr.className = isFinal ? 'animating' : 'pending';
			this.container.appendChild(hr);
			if (isFinal) this._createAnimating(hr);
			return;
		}

		// ---------- 标题 ----------
		const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
		if (headingMatch) {
			this._finalizePendingBlock();
			this._finalizeList();
			const level = Math.min(headingMatch[1].length, 6);
			const h = document.createElement(`h${level}`);
			h.innerHTML = this._inlineMarkdown(headingMatch[2]);
			this.container.appendChild(h);
			this._createAnimating(h);
			return;
		}

		// ---------- 引用块 ----------
		if (trimmed.startsWith('> ')) {
			this._finalizePendingBlock();
			this._finalizeList();
			const quoteContent = trimmed.slice(2);
			if (this._pendingBlock && this._pendingBlock.type === 'blockquote') {
				this._pendingBlock.content += '\n' + quoteContent;
				this._pendingBlock.element.innerHTML = this._inlineMarkdown(
					this._pendingBlock.content.replace(/\n/g, '<br>')
				);
			} else {
				const blockquote = document.createElement('blockquote');
				blockquote.className = 'pending';
				blockquote.innerHTML = this._inlineMarkdown(quoteContent);
				this.container.appendChild(blockquote);
				this._pendingBlock = { element: blockquote, type: 'blockquote', content: quoteContent };
			}
			return;
		}

		// ---------- 列表 ----------
		const listMatch = line.match(/^(\s*)([-*+]|[0-9]+\.)\s+(.*)/);
		if (listMatch) {
			this._finalizePendingBlock();
			const indent = listMatch[1];
			const marker = listMatch[2];
			const rawContent = listMatch[3];
			const isOrdered = /^\d+\.$/.test(marker);
			const listType = isOrdered ? 'ol' : 'ul';

			let content = rawContent;
			let isTask = false;
			let taskChecked = false;
			const taskMatch = rawContent.match(/^\[([x\s])\]\s+(.*)/i);
			if (taskMatch) {
				isTask = true;
				taskChecked = taskMatch[1].toLowerCase() === 'x';
				content = taskMatch[2];
			}

			let listNode;
			if (this._currentList && this._currentList.type === listType && this._currentList.indent === indent) {
				listNode = this._currentList.node;
			} else {
				this._finalizeList();
				listNode = document.createElement(listType);
				this.container.appendChild(listNode);
				this._currentList = { type: listType, node: listNode, indent };
			}

			const li = document.createElement('li');
			if (isTask) {
				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.disabled = true;
				checkbox.checked = taskChecked;
				li.appendChild(checkbox);
				li.insertAdjacentHTML('beforeend', this._inlineMarkdown(content));
			} else {
				li.innerHTML = this._inlineMarkdown(content);
			}
			listNode.appendChild(li);
			this._createAnimating(li);
			return;
		}

		// ---------- 空行 ----------
		if (trimmed === '') {
			this._finalizePendingBlock();
			this._finalizeList();
			return;
		}

		// ---------- 普通段落 ----------
		if (this._pendingBlock && this._pendingBlock.type === 'paragraph') {
			this._pendingBlock.content += line + ' ';
			this._pendingBlock.element.innerHTML = this._inlineMarkdown(this._pendingBlock.content.trim());
		} else {
			this._finalizePendingBlock();
			const p = document.createElement('p');
			p.className = 'pending';
			const content = line + ' ';
			p.innerHTML = this._inlineMarkdown(content.trim());
			this.container.appendChild(p);
			this._pendingBlock = { element: p, type: 'paragraph', content };
		}
	}

	_finalizePendingBlock() {
		if (this._pendingBlock) {
			this._createAnimating(this._pendingBlock.element);
			this._pendingBlock = null;
		}
	}

	_finalizeList() {
		this._currentList = null;
	}

	// ---------- ✅ 代码块逻辑 ----------
	_startCodeBlock(lang = '') {
		const pre = document.createElement('pre');
		const code = document.createElement('code');
		if (lang) code.className = `language-${lang}`;
		pre.appendChild(code);
		this.container.appendChild(pre);
		this._codeBlock = { pre, code, lang, content: '' };
	}

	_appendCodeLine(line) {
		if (!this._codeBlock) return;
		this._codeBlock.content += line + '\n';
		this._codeBlock.code.textContent = this._codeBlock.content;
	}

	_finalizeCodeBlock() {
		if (!this._codeBlock) return;
		// 如果引入 highlight.js，可加自动高亮：
		// if (window.hljs) window.hljs.highlightElement(this._codeBlock.code);

		this._codeBlock = null;
	}

	_inlineMarkdown(text) {
		if (!text) return '';
		return text
			.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/``(.+?)``/g, '<code>$1</code>')
			.replace(/`([^`]+?)`/g, '<code>$1</code>')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/__(.+?)__/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/_(.+?)_/g, '<em>$1</em>');
	}

	_createAnimating(el) {
		el.className = 'animating';
		el.addEventListener('animationend', () => el.removeAttribute('class'), { once: true });
	}
}
