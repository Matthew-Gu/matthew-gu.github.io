import { STREAM_DEMO_CONFIG } from '../config.js';

/* =========================================================
 * KaTeX Math Processor
 * ======================================================= */

export class KaTeXMathProcessor {
	constructor({ enabled = true } = {}) {
		this.enabled = enabled;
		this.batchId = 0;
	}

	setEnabled(enabled) {
		this.enabled = !!enabled;
	}

	prepare(source) {
		const markdown = String(source ?? '');

		if (!this.enabled || !markdown) {
			return {
				source: markdown,
				formulas: [],
				batchId: 0
			};
		}

		const formulas = [];
		const batchId = ++this.batchId;

		let output = '';
		let i = 0;

		while (i < markdown.length) {
			/*
			 * fenced code 优先保护：
			 *
			 * ```js
			 * const x = "$E = mc^2$";
			 * ```
			 *
			 * 代码块内部的 $...$ 不应变成公式。
			 */
			if (this._isFencePosition(markdown, i)) {
				const fence = this._readOpeningFence(markdown, i);

				if (fence) {
					const block = this._readFenceBlock(markdown, i, fence);

					output += block.text;
					i = block.end;
					continue;
				}
			}

			/*
			 * inline code 保护。
			 *
			 * 这里只在当前行寻找 closing backtick，
			 * 避免某个未闭合反引号把后面的数学公式全部吞掉。
			 */
			if (markdown[i] === '`') {
				const code = this._readCodeSpan(markdown, i);

				if (code) {
					output += code.text;
					i = code.end;
					continue;
				}
			}

			// $$ ... $$ display math，可跨行。
			if (markdown.startsWith('$$', i) && !this._isEscaped(markdown, i)) {
				const end = this._findClosing(markdown, '$$', i + 2);

				if (end !== -1) {
					output += this._makePlaceholder({
						formulas,
						batchId,
						expression: markdown.slice(i + 2, end),
						displayMode: true,
						delimiter: '$$'
					});

					i = end + 2;
					continue;
				}
			}

			// \[ ... \] display math，可跨行。
			if (markdown.startsWith('\\[', i) && !this._isEscaped(markdown, i)) {
				const end = this._findClosing(markdown, '\\]', i + 2);

				if (end !== -1) {
					output += this._makePlaceholder({
						formulas,
						batchId,
						expression: markdown.slice(i + 2, end),
						displayMode: true,
						delimiter: '\\['
					});

					i = end + 2;
					continue;
				}
			}

			// \( ... \) inline math，不跨行。
			if (markdown.startsWith('\\(', i) && !this._isEscaped(markdown, i)) {
				const end = this._findClosingBeforeNewline(markdown, '\\)', i + 2);

				if (end !== -1) {
					output += this._makePlaceholder({
						formulas,
						batchId,
						expression: markdown.slice(i + 2, end),
						displayMode: false,
						delimiter: '\\('
					});

					i = end + 2;
					continue;
				}
			}

			/*
			 * $ ... $ inline math，不跨行。
			 *
			 * opening 后和 closing 前不能是空白，
			 * 可以减少普通货币文本的误识别。
			 */
			if (
				markdown[i] === '$' &&
				markdown[i + 1] !== '$' &&
				!this._isEscaped(markdown, i) &&
				markdown[i + 1] &&
				!/\s/.test(markdown[i + 1])
			) {
				const end = this._findInlineDollarClose(markdown, i + 1);

				if (end !== -1) {
					output += this._makePlaceholder({
						formulas,
						batchId,
						expression: markdown.slice(i + 1, end),
						displayMode: false,
						delimiter: '$'
					});

					i = end + 1;
					continue;
				}
			}

			output += markdown[i];
			i++;
		}

		return {
			source: output,
			formulas,
			batchId
		};
	}

	restore(root, prepared) {
		const { formulas = [], batchId = 0 } = prepared ?? {};

		if (!this.enabled || formulas.length === 0) {
			return;
		}

		const canRender = typeof window.katex?.render === 'function';

		const prefix = `MATHPLACEHOLDER${batchId}X`;

		const tokenPattern = new RegExp(`${prefix}(\\d+)END`, 'g');

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

		const targets = [];

		while (walker.nextNode()) {
			const textNode = walker.currentNode;

			/*
			 * 双保险：
			 * placeholder 不在 code / pre 中恢复。
			 */
			if (textNode.parentElement?.closest('code, pre')) {
				continue;
			}

			if (textNode.nodeValue?.includes(prefix)) {
				targets.push(textNode);
			}
		}

		for (const textNode of targets) {
			const value = textNode.nodeValue;

			const fragment = document.createDocumentFragment();

			let lastIndex = 0;
			let match;

			tokenPattern.lastIndex = 0;

			while ((match = tokenPattern.exec(value))) {
				if (match.index > lastIndex) {
					fragment.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
				}

				const formula = formulas[Number(match[1])];

				if (formula) {
					fragment.appendChild(
						canRender ? this._renderFormula(formula) : document.createTextNode(this._restoreRawFormula(formula))
					);
				} else {
					fragment.appendChild(document.createTextNode(match[0]));
				}

				lastIndex = match.index + match[0].length;
			}

			if (lastIndex < value.length) {
				fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
			}

			textNode.replaceWith(fragment);
		}
	}

	_makePlaceholder({ formulas, batchId, expression, displayMode, delimiter }) {
		const index = formulas.length;

		formulas.push({
			expression,
			displayMode,
			delimiter
		});

		/*
		 * 使用纯字母数字 placeholder，
		 * 避免 marked 将它识别为 Markdown punctuation。
		 */
		return `MATHPLACEHOLDER${batchId}X` + `${index}END`;
	}

	_renderFormula(formula) {
		const host = document.createElement('span');

		host.className = formula.displayMode ? 'math-display-host' : 'math-inline-host';

		try {
			window.katex.render(formula.expression.trim(), host, {
				displayMode: formula.displayMode,

				/*
				 * Streaming 过程中公式可能暂时不完整。
				 */
				throwOnError: false,
				strict: 'warn',
				trust: false,
				output: 'htmlAndMathml'
			});
		} catch {
			host.classList.add('math-error');

			host.textContent = this._restoreRawFormula(formula);
		}

		return host;
	}

	_restoreRawFormula(formula) {
		if (formula.delimiter === '\\[') {
			return `\\[` + formula.expression + `\\]`;
		}

		if (formula.delimiter === '\\(') {
			return `\\(` + formula.expression + `\\)`;
		}

		return formula.delimiter + formula.expression + formula.delimiter;
	}

	_isFencePosition(source, index) {
		const lineStart = source.lastIndexOf('\n', index - 1) + 1;

		return /^[ \t]{0,3}$/.test(source.slice(lineStart, index));
	}

	_readOpeningFence(source, index) {
		const lineEnd = source.indexOf('\n', index);

		const end = lineEnd === -1 ? source.length : lineEnd;

		const match = source.slice(index, end).match(/^(`{3,}|~{3,})/);

		if (!match) {
			return null;
		}

		return {
			char: match[1][0],
			length: match[1].length
		};
	}

	_readFenceBlock(source, start, fence) {
		let cursor = source.indexOf('\n', start);

		if (cursor === -1) {
			return {
				text: source.slice(start),
				end: source.length
			};
		}

		cursor++;

		while (cursor < source.length) {
			const lineEnd = source.indexOf('\n', cursor);

			const end = lineEnd === -1 ? source.length : lineEnd;

			const line = source.slice(cursor, end);

			const trimmed = line.trim();

			let count = 0;

			while (count < trimmed.length && trimmed[count] === fence.char) {
				count++;
			}

			if (count >= fence.length && trimmed.slice(count).trim() === '') {
				const blockEnd = lineEnd === -1 ? source.length : lineEnd + 1;

				return {
					text: source.slice(start, blockEnd),
					end: blockEnd
				};
			}

			if (lineEnd === -1) {
				break;
			}

			cursor = lineEnd + 1;
		}

		/*
		 * 未闭合 fenced code：
		 * 剩余内容整体保护。
		 */
		return {
			text: source.slice(start),
			end: source.length
		};
	}

	_readCodeSpan(source, start) {
		let run = 1;

		while (source[start + run] === '`') {
			run++;
		}

		const marker = '`'.repeat(run);

		const lineEnd = source.indexOf('\n', start + run);

		const searchEnd = lineEnd === -1 ? source.length : lineEnd;

		const end = source.indexOf(marker, start + run);

		if (end === -1 || end >= searchEnd) {
			return null;
		}

		return {
			text: source.slice(start, end + run),
			end: end + run
		};
	}

	_findClosing(text, marker, from) {
		let pos = from;

		while (pos < text.length) {
			pos = text.indexOf(marker, pos);

			if (pos === -1) {
				return -1;
			}

			if (!this._isEscaped(text, pos)) {
				return pos;
			}

			pos += marker.length;
		}

		return -1;
	}

	_findClosingBeforeNewline(text, marker, from) {
		const newline = text.indexOf('\n', from);

		const limit = newline === -1 ? text.length : newline;

		let pos = from;

		while (pos < limit) {
			pos = text.indexOf(marker, pos);

			if (pos === -1 || pos >= limit) {
				return -1;
			}

			if (!this._isEscaped(text, pos)) {
				return pos;
			}

			pos += marker.length;
		}

		return -1;
	}

	_findInlineDollarClose(text, from) {
		const newline = text.indexOf('\n', from);

		const limit = newline === -1 ? text.length : newline;

		let pos = from;

		while (pos < limit) {
			pos = text.indexOf('$', pos);

			if (pos === -1 || pos >= limit) {
				return -1;
			}

			if (text[pos + 1] !== '$' && !this._isEscaped(text, pos) && pos > from && !/\s/.test(text[pos - 1])) {
				return pos;
			}

			pos++;
		}

		return -1;
	}

	_isEscaped(text, index) {
		let slashes = 0;
		let i = index - 1;

		while (i >= 0 && text[i] === '\\') {
			slashes++;
			i--;
		}

		return slashes % 2 === 1;
	}
}

/* =========================================================
 * highlight.js Processor
 * ======================================================= */

export class HighlightJsProcessor {
	apply(root) {
		if (!root || typeof window.hljs?.highlightElement !== 'function') {
			return;
		}

		root.querySelectorAll('pre code').forEach((code) => {
			/*
			 * Marked 会生成：
			 *
			 * <code class="language-js">
			 *
			 * 如果 hljs 不认识 language，
			 * 去掉 class 让它自动检测。
			 */
			const languageClass = [...code.classList].find((name) => name.startsWith('language-'));

			if (languageClass) {
				const language = languageClass.slice('language-'.length).toLowerCase();

				if (language === 'mermaid') {
					return;
				}

				if (language && !window.hljs.getLanguage(language)) {
					code.classList.remove(languageClass);
				}
			}

			/*
			 * active block 可能被重复渲染；
			 * 新生成的 DOM 理论上没有 data-highlighted，
			 * 这里删除一次用于兼容未来的 patch。
			 */
			code.removeAttribute('data-highlighted');

			window.hljs.highlightElement(code);
		});
	}
}

/* =========================================================
 * Mermaid Processor
 * ======================================================= */

export class MermaidProcessor {
	constructor({ enabled = true, loader } = {}) {
		this.enabled = enabled;
		this.loader = loader ?? (() => import(STREAM_DEMO_CONFIG.mermaid.url));
		this.mermaidPromise = null;
		this.renderId = 0;
	}

	setEnabled(enabled) {
		this.enabled = !!enabled;
	}

	prepare(root) {
		if (!this.enabled || !root || typeof root.querySelectorAll !== 'function') {
			return;
		}

		root.querySelectorAll('pre > code').forEach((code) => {
			const languageClass = [...code.classList].find((name) => name.toLowerCase() === 'language-mermaid');

			if (!languageClass) {
				return;
			}

			const pre = code.parentElement;

			if (!pre || pre.dataset.mermaidPrepared === 'true') {
				return;
			}

			const fallback = pre.cloneNode(true);

			fallback.classList.add('mermaid-fallback');

			const host = document.createElement('div');

			host.className = 'mermaid-diagram';
			host.dataset.mermaidPrepared = 'true';
			host.dataset.mermaidStatus = 'pending';
			host.dataset.mermaidSource = code.textContent ?? '';
			host.setAttribute('role', 'img');
			host.setAttribute('aria-label', 'Mermaid 图表');
			host.appendChild(fallback);

			pre.replaceWith(host);
		});
	}

	hydrate(root) {
		if (!this.enabled) {
			return Promise.resolve();
		}

		const hosts = this._findHosts(root);

		return Promise.all(hosts.map((host) => this._renderHost(host))).then(() => undefined);
	}

	_findHosts(root) {
		if (!root) {
			return [];
		}

		const roots = Array.isArray(root) ? root : [root];
		const hosts = [];

		for (const item of roots) {
			if (item?.nodeType === Node.ELEMENT_NODE && item.matches('.mermaid-diagram[data-mermaid-status="pending"]')) {
				hosts.push(item);
			}

			if (typeof item?.querySelectorAll === 'function') {
				hosts.push(...item.querySelectorAll('.mermaid-diagram[data-mermaid-status="pending"]'));
			}
		}

		return [...new Set(hosts)];
	}

	_load() {
		if (!this.mermaidPromise) {
			this.mermaidPromise = this.loader().then((module) => {
				const mermaid = module?.default ?? module;

				if (!mermaid || typeof mermaid.initialize !== 'function' || typeof mermaid.render !== 'function') {
					throw new Error('Mermaid API 未加载');
				}

				mermaid.initialize({
					startOnLoad: false,
					securityLevel: 'strict',
					htmlLabels: false,
					flowchart: {
						/* 使用原生 SVG 文本，避免 foreignObject 被 SVG profile 清理掉。 */
						htmlLabels: false
					}
				});

				return mermaid;
			});
		}

		return this.mermaidPromise;
	}

	_renderHost(host) {
		const source = host.dataset.mermaidSource ?? '';
		const renderId = `stream-demo-mermaid-${++this.renderId}`;

		host.dataset.mermaidStatus = 'rendering';
		host.dataset.mermaidRenderId = renderId;

		return this._load()
			.then((mermaid) => mermaid.render(renderId, source.trim()))
			.then(({ svg }) => {
				if (!host.isConnected || host.dataset.mermaidRenderId !== renderId) {
					return;
				}

				if (typeof window.DOMPurify?.sanitize !== 'function') {
					throw new Error('DOMPurify 未加载，无法安全插入 Mermaid SVG');
				}

				const safeSvg = window.DOMPurify.sanitize(svg, {
					USE_PROFILES: {
						svg: true,
						mathMl: true
					}
				});

				host.innerHTML = safeSvg;
				host.dataset.mermaidStatus = 'rendered';
				host.classList.remove('mermaid-error');
			})
			.catch((error) => {
				document.getElementById(`d${renderId}`)?.remove();
				document.getElementById(renderId)?.remove();

				if (!host.isConnected || host.dataset.mermaidRenderId !== renderId) {
					return;
				}

				host.dataset.mermaidStatus = 'error';
				host.classList.add('mermaid-error');

				if (!host.querySelector('.mermaid-error-message')) {
					const message = document.createElement('p');

					message.className = 'mermaid-error-message';
					message.textContent = 'Mermaid 图表渲染失败，已保留源码。';

					host.appendChild(message);
				}

				console.warn('[StreamingMarkdownRenderer] Mermaid 渲染失败。', error);
			});
	}
}

/* =========================================================
 * Marked Adapter
 * ======================================================= */

export class MarkedRendererAdapter {
	constructor({ mathProcessor, codeHighlighter, mermaidProcessor }) {
		this.mathProcessor = mathProcessor;

		this.codeHighlighter = codeHighlighter;

		this.mermaidProcessor = mermaidProcessor;
	}

	render(source, { allowMermaid = false } = {}) {
		if (!window.marked || typeof window.marked.parse !== 'function') {
			throw new Error('marked.js 未加载');
		}

		const markdown = String(source ?? '');

		const prepared = this.mathProcessor.prepare(markdown);

		const rawHtml = window.marked.parse(prepared.source, {
			gfm: true,
			breaks: false
		});

		/*
		 * Marked 只负责 Markdown parser，
		 * 不负责 XSS sanitize。
		 */
		if (typeof window.DOMPurify?.sanitize !== 'function') {
			const fallback = document.createDocumentFragment();
			const errorMessage = document.createElement('p');
			const sourceBlock = document.createElement('pre');

			errorMessage.className = 'stream-error';
			errorMessage.textContent = 'Markdown 安全组件未加载，已保留原始内容。';
			sourceBlock.textContent = markdown;

			fallback.append(errorMessage, sourceBlock);

			return fallback;
		}

		const safeHtml = window.DOMPurify.sanitize(rawHtml, {
			USE_PROFILES: {
				html: true
			}
		});

		const host = document.createElement('div');

		host.innerHTML = safeHtml;

		/*
		 * DOMPurify 在 KaTeX 前执行：
		 * 避免 KaTeX 生成的大量 MathML/HTML
		 * 被 sanitizer 破坏。
		 */
		this.mathProcessor.restore(host, prepared);

		if (allowMermaid) {
			this.mermaidProcessor.prepare(host);
		}

		this.codeHighlighter.apply(host);

		const fragment = document.createDocumentFragment();

		while (host.firstChild) {
			fragment.appendChild(host.firstChild);
		}

		return fragment;
	}
}
