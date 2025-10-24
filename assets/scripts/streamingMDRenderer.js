export default class StreamingMarkdownRenderer {
	constructor(container) {
		this.container = container;
		this.container.innerHTML = '';
		this.buffer = '';
		this.state = 'awaiting_block'; // 'awaiting_block' | 'in_paragraph' | 'in_code_block' | 'in_blockquote'
		this.pendingParagraph = null;
		this.currentList = null;
		this.codeBlock = null;
		this.blockquote = null;
		this.codeBlockLang = '';
		this.consecutiveNewlines = 0;
	}

	appendText(text) {
		this.buffer += text;
		this._processBuffer();
	}

	finish() {
		if (this.buffer) {
			this._processChunk(this.buffer, true);
			this.buffer = '';
		}
		this._finalizeAll();
	}

	_processBuffer() {
		if (this.state === 'in_code_block') {
			this._processChunk(this.buffer, false);
			this.buffer = '';
		} else {
			const lines = this.buffer.split('\n');
			for (let i = 0; i < lines.length - 1; i++) {
				this._processLine(lines[i], false);
			}
			this.buffer = lines[lines.length - 1] || '';
		}
	}

	_processChunk(chunk, isFinal) {
		if (this.state === 'in_code_block') {
			this._handleCodeBlockChunk(chunk, isFinal);
		} else {
			this._processLine(chunk, isFinal);
		}
	}

	_processLine(line, isFinal) {
		const trimmed = line.trim();

		// --- Code fence ---
		const codeFenceMatch = trimmed.match(/^```(?:\s*(\w+))?\s*$/);
		if (codeFenceMatch) {
			if (this.state === 'in_code_block') {
				this._finalizeCodeBlock();
			} else {
				this._finalizeAllBlocks();
				this.codeBlockLang = codeFenceMatch[1] || '';
				this._startCodeBlock();
			}
			return;
		}

		if (this.state === 'in_code_block') {
			this._appendCodeLine(line);
			return;
		}

		// --- Horizontal rule ---
		if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
			this._finalizeAllBlocks();
			const hr = this._createElement('hr');
			this.container.appendChild(hr);
			return;
		}

		// --- Heading ---
		const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
		if (headingMatch) {
			this._finalizeAllBlocks();
			const level = Math.min(headingMatch[1].length, 6);
			const h = this._createElement(`h${level}`);
			h.innerHTML = this._inlineMarkdown(headingMatch[2]);
			this.container.appendChild(h);
			return;
		}

		// --- Blockquote ---
		if (trimmed.startsWith('> ')) {
			this._finalizePendingParagraph();
			this._finalizeList();
			const content = trimmed.slice(2);
			if (!this.blockquote) {
				this.blockquote = this._createElement('blockquote');
				this.container.appendChild(this.blockquote);
				this.state = 'in_blockquote';
			}
			const html = this.blockquote.innerHTML
				? this.blockquote.innerHTML + '<br>' + this._inlineMarkdown(content)
				: this._inlineMarkdown(content);
			this.blockquote.innerHTML = html;
			return;
		} else if (this.blockquote) {
			this._finalizeBlockquote();
		}

		// --- List item ---
		const listMatch = line.match(/^(\s*)([-*+]|[0-9]+\.)\s+(.*)/);
		if (listMatch) {
			this._finalizePendingParagraph();
			this._finalizeBlockquote();
			const indentSpaces = listMatch[1].length;
			const marker = listMatch[2];
			const rawContent = listMatch[3];
			const isOrdered = /^\d+\.$/.test(marker);

			let content = rawContent;
			let isTask = false;
			let taskChecked = false;
			const taskMatch = rawContent.match(/^\[([x\s])\]\s+(.*)/i);
			if (taskMatch) {
				isTask = true;
				taskChecked = taskMatch[1].toLowerCase() === 'x';
				content = taskMatch[2];
			}

			const listType = isOrdered ? 'ol' : 'ul';

			if (this.currentList && this.currentList.type === listType && this.currentList.indent === indentSpaces) {
				// continue current list
			} else {
				this._finalizeList();
				const listEl = this._createElement(listType);
				this.container.appendChild(listEl);
				this.currentList = {
					type: listType,
					node: listEl,
					indent: indentSpaces
				};
			}

			const li = this._createElement('li');
			if (isTask) {
				const checkbox = this._createElement('input', {
					type: 'checkbox',
					disabled: true,
					checked: taskChecked
				});
				li.appendChild(checkbox);
				li.insertAdjacentHTML('beforeend', this._inlineMarkdown(content));
			} else {
				li.innerHTML = this._inlineMarkdown(content);
			}
			this.currentList.node.appendChild(li);
			return;
		} else if (this.currentList) {
			this._finalizeList();
		}

		// --- Empty line ---
		if (trimmed === '') {
			this.consecutiveNewlines++;
			if (this.consecutiveNewlines >= 2) {
				this._finalizePendingParagraph();
			}
			this._finalizeBlockquote();
			return;
		}

		// --- Regular paragraph ---
		this.consecutiveNewlines = 0;
		if (!this.pendingParagraph) {
			this.pendingParagraph = this._createElement('p');
			this.container.appendChild(this.pendingParagraph);
			this.state = 'in_paragraph';
		}
		const currentText = this.pendingParagraph.textContent || '';
		this.pendingParagraph.innerHTML = this._inlineMarkdown((currentText ? currentText + ' ' : '') + line);
	}

	// --- Code Block (char-by-char) ---
	_handleCodeBlockChunk(chunk, isFinal) {
		let i = 0;
		while (i < chunk.length) {
			const ch = chunk[i];
			if (ch === '\r') {
				i++;
				continue;
			}

			if (ch === '`') {
				let j = i;
				let backtickCount = 0;
				while (j < chunk.length && chunk[j] === '`') {
					backtickCount++;
					j++;
				}
				if (backtickCount >= 3) {
					this._finalizeCodeBlock();
					i = j;
					continue;
				}
			}

			this._appendCodeChar(ch);
			i++;
		}
	}

	_startCodeBlock() {
		const code = this._createElement('code', {
			className: this.codeBlockLang ? `language-${this.codeBlockLang}` : ''
		});
		const pre = this._createElement('pre');
		pre.appendChild(code);
		this.container.appendChild(pre);
		this.codeBlock = code;
		this.state = 'in_code_block';
	}

	_appendCodeChar(ch) {
		if (this.codeBlock) {
			this.codeBlock.textContent += ch;
		}
	}

	_appendCodeLine(line) {
		if (this.codeBlock) {
			this.codeBlock.textContent += line + '\n';
		}
	}

	// --- Finalization ---
	_finalizePendingParagraph() {
		if (this.pendingParagraph) {
			this.pendingParagraph = null;
		}
	}

	_finalizeBlockquote() {
		if (this.blockquote) {
			this.blockquote = null;
		}
	}

	_finalizeList() {
		this.currentList = null;
	}

	_finalizeCodeBlock() {
		if (this.codeBlock) {
			// if (typeof hljs !== 'undefined') hljs.highlightElement(this.codeBlock);
			this.codeBlock = null;
			this.codeBlockLang = '';
		}
		this.state = 'awaiting_block';
	}

	_finalizeAllBlocks() {
		this._finalizePendingParagraph();
		this._finalizeBlockquote();
		this._finalizeList();
	}

	_finalizeAll() {
		this._finalizeAllBlocks();
		this._finalizeCodeBlock();
	}

	_createElement(tagName, attributes = {}, children) {
		const el = document.createElement(tagName);

		for (const [key, value] of Object.entries(attributes)) {
			if (key === 'className') {
				el.className = value;
			} else if (key in el) {
				el[key] = value;
			} else {
				el.setAttribute(key, value);
			}
		}

		if (children !== undefined && children !== null) {
			if (typeof children === 'string') {
				el.textContent = children;
			} else if (children instanceof Node) {
				el.appendChild(children);
			} else if (Array.isArray(children)) {
				children.forEach((child) => {
					if (child instanceof Node) {
						el.appendChild(child);
					} else if (typeof child === 'string') {
						el.appendChild(document.createTextNode(child));
					}
				});
			}
		}

		return el;
	}

	_inlineMarkdown(text) {
		if (!text) return '';
		return text
			.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;')
			.replace(/</g, '<')
			.replace(/>/g, '>')
			.replace(/``(.+?)``/g, '<code>$1</code>')
			.replace(/`([^`]+?)`/g, '<code>$1</code>')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/__(.+?)__/g, '<strong>$1</strong>')
			.replace(/\*(?!\*)(.+?)(?!\*)\*/g, '<em>$1</em>')
			.replace(/_(?!_)(.+?)(?!_)_/g, '<em>$1</em>');
	}
}
