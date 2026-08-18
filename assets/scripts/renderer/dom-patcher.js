/* =========================================================
 * Top-level DOM patcher
 *
 * 目的：
 * - 不添加 wrapper element
 * - active Markdown 节点仍直接放在原 container 下
 * - 尽量保持 top-level element identity
 *
 * 这样给 .stream-preview 配置的 animation
 * 不会随着每一个 chunk 都重新创建整个顶层节点。
 * ======================================================= */

export class TopLevelDomPatcher {
	constructor({ className = 'stream-preview' } = {}) {
		this.className = className;
	}

	patch({ container, anchor, oldNodes, fragment }) {
		const newNodes = [...fragment.childNodes];

		const result = [];

		const count = Math.max(oldNodes.length, newNodes.length);

		for (let i = 0; i < count; i++) {
			const oldNode = oldNodes[i];

			const newNode = newNodes[i];

			if (oldNode && newNode && this._canReuse(oldNode, newNode)) {
				this._patchNode(oldNode, newNode);

				result.push(oldNode);

				continue;
			}

			if (oldNode && newNode) {
				const inserted = this._prepareNewNode(newNode);

				oldNode.replaceWith(inserted);

				result.push(inserted);

				continue;
			}

			if (!oldNode && newNode) {
				const inserted = this._prepareNewNode(newNode);

				container.insertBefore(inserted, anchor);

				result.push(inserted);

				continue;
			}

			if (oldNode && !newNode) {
				oldNode.remove();
			}
		}

		return result;
	}

	_canReuse(oldNode, newNode) {
		if (oldNode.nodeType !== newNode.nodeType) {
			return false;
		}

		if (oldNode.nodeType === Node.ELEMENT_NODE) {
			return oldNode.tagName === newNode.tagName;
		}

		return true;
	}

	_patchNode(oldNode, newNode) {
		if (oldNode.nodeType === Node.TEXT_NODE) {
			oldNode.nodeValue = newNode.nodeValue;

			return;
		}

		if (oldNode.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		/*
		 * 同步属性，但保留 stream-preview。
		 */
		[...oldNode.attributes].forEach((attribute) => {
			if (attribute.name === 'class') {
				return;
			}

			if (!newNode.hasAttribute(attribute.name)) {
				oldNode.removeAttribute(attribute.name);
			}
		});

		[...newNode.attributes].forEach((attribute) => {
			if (attribute.name !== 'class') {
				oldNode.setAttribute(attribute.name, attribute.value);
			}
		});

		const newClasses = new Set(newNode.classList);

		newClasses.add(this.className);

		oldNode.className = [...newClasses].join(' ');

		/*
		 * KaTeX / highlight.js 已经在临时 fragment 中处理完，
		 * 这里直接同步内部 DOM。
		 *
		 * 顶层 oldNode identity 不变，
		 * 所以挂在 .stream-preview 上的 animation 不会重启。
		 */
		oldNode.replaceChildren(...[...newNode.childNodes]);
	}

	_prepareNewNode(node) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			node.classList.add(this.className);
		}

		return node;
	}
}
