import {
	KaTeXMathProcessor,
	HighlightJsProcessor,
	MermaidProcessor,
	MarkedRendererAdapter
} from '../markdown/processing.js';
import { MarkdownStreamSegmenter } from '../markdown/segmenter.js';
import { TopLevelDomPatcher } from './dom-patcher.js';

/* =========================================================
 * StreamingMarkdownRenderer
 * ======================================================= */

export class StreamingMarkdownRenderer {
	constructor(container, { math = true } = {}) {
		this.container = container;

		this.mathProcessor = new KaTeXMathProcessor({
			enabled: math
		});

		this.codeHighlighter = new HighlightJsProcessor();

		this.mermaidProcessor = new MermaidProcessor();

		this.renderer = new MarkedRendererAdapter({
			mathProcessor: this.mathProcessor,

			codeHighlighter: this.codeHighlighter,

			mermaidProcessor: this.mermaidProcessor
		});

		this.segmenter = new MarkdownStreamSegmenter();

		this.patcher = new TopLevelDomPatcher({
			className: 'stream-preview'
		});

		this.fullSource = '';
		this.activeSource = '';
		this.activeNodes = [];
		this.rafId = 0;
		this.finished = false;
		this.canceled = false;

		this.container.replaceChildren();

		/*
		 * 只使用 Comment 作为 active range 的结束锚点，
		 * 不增加任何 wrapper element。
		 */
		this.activeAnchor = document.createComment('stream-active-anchor');

		this.container.appendChild(this.activeAnchor);
	}

	appendText(text) {
		if (!text || this.finished) {
			return;
		}

		const chunk = String(text).replace(/\r\n?/g, '\n');

		this.fullSource += chunk;

		const { completed, active } = this.segmenter.append(chunk);

		/*
		 * commit 前先把当前 active preview 移除。
		 *
		 * completed block 会由专业 Markdown parser
		 * 重新生成正式 DOM。
		 */
		if (completed.length > 0) {
			this._clearActiveNodes();

			for (const markdown of completed) {
				this._commit(markdown);
			}
		}

		this.activeSource = active;

		this._scheduleActiveRender();
	}

	/*
	 * 如果以后想统一成 view.append(chunk)，也可直接使用。
	 */
	append(text) {
		this.appendText(text);
	}

	async finish() {
		if (this.finished) {
			return;
		}

		this.finished = true;

		cancelAnimationFrame(this.rafId);

		this.rafId = 0;

		/*
		 * 最终进行 canonical full render。
		 *
		 * 这是非常重要的一步：
		 * - Reference Link
		 * - 后文影响前文的 Markdown
		 * - KaTeX
		 * - highlight.js
		 *
		 * 最终结果全部以完整 Markdown 文档为准。
		 */
		const fragment = this.renderer.render(this.fullSource, {
			allowMermaid: true
		});

		/*
		 * finish 后恢复为最纯粹的原始 DOM：
		 * container 下面直接就是 Markdown 元素，
		 * Comment anchor 也一起删除。
		 */
		this.container.replaceChildren(fragment);

		await this.mermaidProcessor.hydrate(this.container);

		this.activeNodes = [];
		this.activeSource = '';
	}

	cancel() {
		if (this.finished) {
			return;
		}

		this.finished = true;
		this.canceled = true;

		cancelAnimationFrame(this.rafId);

		this.rafId = 0;
		this.activeSource = '';
	}

	setMathEnabled(enabled) {
		this.mathProcessor.setEnabled(enabled);

		if (!this.finished) {
			this._scheduleActiveRender(true);
		}
	}

	_commit(markdown) {
		if (!markdown) {
			return;
		}

		const fragment = this.renderer.render(markdown, {
			allowMermaid: true
		});

		const nodes = [...fragment.childNodes];

		/*
		 * committed 节点直接插在原 container 下，
		 * 没有 wrapper。
		 */
		for (const node of nodes) {
			if (node.nodeType === Node.ELEMENT_NODE) {
				node.classList.remove('stream-preview');

				node.classList.remove('is-streaming');
			}

			this.container.insertBefore(node, this.activeAnchor);
		}

		this.mermaidProcessor.hydrate(nodes);
	}

	_scheduleActiveRender(force = false) {
		if (this.rafId && !force) {
			return;
		}

		if (this.rafId && force) {
			cancelAnimationFrame(this.rafId);
		}

		this.rafId = requestAnimationFrame(() => {
			this.rafId = 0;
			this._renderActive();
		});
	}

	_renderActive() {
		if (this.finished) {
			return;
		}

		if (!this.activeSource) {
			this._clearActiveNodes();
			return;
		}

		const fragment = this.renderer.render(this.activeSource, {
			allowMermaid: false
		});

		this.activeNodes = this.patcher.patch({
			container: this.container,

			anchor: this.activeAnchor,

			oldNodes: this.activeNodes,

			fragment
		});

		this._updateStreamingCursor();
	}

	_clearActiveNodes() {
		for (const node of this.activeNodes) {
			node.remove();
		}

		this.activeNodes = [];
	}

	_updateStreamingCursor() {
		this.container.querySelectorAll('.is-streaming').forEach((element) => element.classList.remove('is-streaming'));

		const lastElement = [...this.activeNodes].reverse().find((node) => node.nodeType === Node.ELEMENT_NODE);

		if (lastElement) {
			lastElement.classList.add('is-streaming');
		}
	}
}
