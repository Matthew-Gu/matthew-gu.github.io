export class TopLevelDomPatcher {
	constructor({ className = 'stream-preview', listItemEnterClass = 'stream-list-item-enter' } = {}) {
		this.className = className;
		this.listItemEnterClass = listItemEnterClass;
	}

	patch({ container, anchor, oldNodes, fragment }) {
		const newNodes = [...fragment.childNodes];
		const result = [];

		const count = Math.max(oldNodes.length, newNodes.length);

		for (let i = 0; i < count; i++) {
			const oldNode = oldNodes[i];
			const newNode = newNodes[i];

			/*
			 * 可以复用顶层节点。
			 */
			if (oldNode && newNode && this._canReuse(oldNode, newNode)) {
				this._patchNode(oldNode, newNode);

				result.push(oldNode);

				continue;
			}

			/*
			 * 新旧都有，但是节点类型不同。
			 */
			if (oldNode && newNode) {
				const inserted = this._prepareNewNode(newNode);

				oldNode.replaceWith(inserted);

				result.push(inserted);

				continue;
			}

			/*
			 * 新增顶层节点。
			 */
			if (!oldNode && newNode) {
				const inserted = this._prepareNewNode(newNode);

				container.insertBefore(inserted, anchor);

				result.push(inserted);

				continue;
			}

			/*
			 * 删除多余节点。
			 */
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

	/*
	 * 顶层节点 patch。
	 */
	_patchNode(oldNode, newNode) {
		/*
		 * TextNode：
		 * 直接更新内容。
		 */
		if (oldNode.nodeType === Node.TEXT_NODE) {
			if (oldNode.nodeValue !== newNode.nodeValue) {
				oldNode.nodeValue = newNode.nodeValue;
			}

			return;
		}

		if (oldNode.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		/*
		 * 同步顶层 attributes。
		 *
		 * class 单独处理，因为顶层节点需要
		 * 一直保留 stream-preview。
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
			if (attribute.name === 'class') {
				return;
			}

			if (oldNode.getAttribute(attribute.name) !== attribute.value) {
				oldNode.setAttribute(attribute.name, attribute.value);
			}
		});

		/*
		 * 同步 class，
		 * 同时保留 stream-preview。
		 */
		const classes = new Set(newNode.classList);

		classes.add(this.className);

		oldNode.className = [...classes].join(' ');

		/*
		 * ============================
		 * 列表特殊处理
		 * ============================
		 *
		 * ul / ol / li 不再直接
		 * replaceChildren，
		 * 而是递归 patch。
		 *
		 * 这样已经存在的 li 不会
		 * 每个 chunk 都重新创建。
		 */
		if (this._isListNode(oldNode)) {
			this._patchListChildren(oldNode, newNode);

			return;
		}

		/*
		 * 非列表节点继续使用原来的策略。
		 *
		 * 比如：
		 *
		 * p
		 * h1
		 * blockquote
		 * pre
		 *
		 * 顶层 identity 仍然不变。
		 */
		oldNode.replaceChildren(...[...newNode.childNodes]);
	}

	/*
	 * ul / ol / li 都属于列表结构。
	 */
	_isListNode(node) {
		return (
			node?.nodeType === Node.ELEMENT_NODE && (node.tagName === 'UL' || node.tagName === 'OL' || node.tagName === 'LI')
		);
	}

	/*
	 * ============================
	 * 列表 children 增量 patch
	 * ============================
	 */
	_patchListChildren(oldParent, newParent) {
		const oldChildren = [...oldParent.childNodes];

		const newChildren = [...newParent.childNodes];

		const count = Math.max(oldChildren.length, newChildren.length);

		for (let i = 0; i < count; i++) {
			const oldNode = oldChildren[i];
			const newNode = newChildren[i];

			/*
			 * 同类型：
			 * 继续复用。
			 */
			if (oldNode && newNode && this._canReuse(oldNode, newNode)) {
				this._patchListChild(oldNode, newNode);

				continue;
			}

			/*
			 * 两边都有，
			 * 但节点类型已经变化。
			 *
			 * 替换后，如果其中出现新的 li，
			 * 添加 CSS enter class。
			 */
			if (oldNode && newNode) {
				this._markInsertedTree(newNode);

				oldNode.replaceWith(newNode);

				continue;
			}

			/*
			 * ============================
			 * 新增节点
			 * ============================
			 *
			 * 流式生成新的列表项时，
			 * 最主要会进入这里。
			 */
			if (!oldNode && newNode) {
				/*
				 * 先添加动画 class，
				 * 再插入 DOM。
				 *
				 * 浏览器第一次绘制时就会
				 * 带上 animation class。
				 */
				this._markInsertedTree(newNode);

				oldParent.appendChild(newNode);

				continue;
			}

			/*
			 * 删除节点。
			 */
			if (oldNode && !newNode) {
				oldNode.remove();
			}
		}
	}

	/*
	 * patch 列表内部的单个节点。
	 */
	_patchListChild(oldNode, newNode) {
		/*
		 * TextNode：
		 *
		 * 只修改 nodeValue，
		 * 不重新创建 TextNode。
		 *
		 * 因此：
		 *
		 * <li>正在生成</li>
		 *
		 * →
		 *
		 * <li>正在生成更多文字</li>
		 *
		 * li 本身完全不会变化。
		 */
		if (oldNode.nodeType === Node.TEXT_NODE) {
			if (oldNode.nodeValue !== newNode.nodeValue) {
				oldNode.nodeValue = newNode.nodeValue;
			}

			return;
		}

		if (oldNode.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		/*
		 * 同步元素属性。
		 */
		this._syncAttributes(oldNode, newNode);

		/*
		 * 如果还是：
		 *
		 * ul
		 * ol
		 * li
		 *
		 * 继续递归。
		 */
		if (this._isListNode(oldNode)) {
			this._patchListChildren(oldNode, newNode);

			return;
		}

		/*
		 * li 里面的普通元素仍然使用简单策略。
		 *
		 * 例如：
		 *
		 * <li>
		 *   <strong>xxx</strong>
		 * </li>
		 *
		 * strong 本身可能重新同步内部内容，
		 * 但 li identity 不会变化。
		 */
		oldNode.replaceChildren(...[...newNode.childNodes]);
	}

	/*
	 * 同步列表内部元素属性。
	 *
	 * 注意：
	 *
	 * stream-list-item-enter
	 * 是 renderer 自己加的临时状态 class，
	 * marked 新生成的 DOM 里没有它。
	 *
	 * 所以同步 class 时必须主动保留，
	 * 否则下一个 chunk 会把动画 class
	 * 提前删除。
	 */
	_syncAttributes(oldNode, newNode) {
		/*
		 * 是否需要保留列表进入动画 class。
		 */
		const keepEnterClass = oldNode.classList.contains(this.listItemEnterClass);

		/*
		 * 删除 newNode 已经不存在的属性。
		 *
		 * class 单独处理。
		 */
		[...oldNode.attributes].forEach((attribute) => {
			if (attribute.name === 'class') {
				return;
			}

			if (!newNode.hasAttribute(attribute.name)) {
				oldNode.removeAttribute(attribute.name);
			}
		});

		/*
		 * 添加 / 更新新属性。
		 */
		[...newNode.attributes].forEach((attribute) => {
			if (attribute.name === 'class') {
				return;
			}

			if (oldNode.getAttribute(attribute.name) !== attribute.value) {
				oldNode.setAttribute(attribute.name, attribute.value);
			}
		});

		/*
		 * 同步 class。
		 */
		const classes = new Set(newNode.classList);

		/*
		 * 保留我们自己添加的 enter class。
		 */
		if (keepEnterClass) {
			classes.add(this.listItemEnterClass);
		}

		oldNode.className = [...classes].join(' ');
	}

	/*
	 * ============================
	 * 准备新的顶层节点
	 * ============================
	 */
	_prepareNewNode(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return node;
		}

		/*
		 * 保留原来的顶层 preview class。
		 */
		node.classList.add(this.className);

		/*
		 * 如果整个列表第一次出现：
		 *
		 * <ul>
		 *   <li>第一项</li>
		 * </ul>
		 *
		 * 此时 ul 是整个被插入的，
		 * 不会经过 _patchListChildren。
		 *
		 * 所以这里需要给其中的 li
		 * 添加动画 class。
		 */
		this._markInsertedTree(node);

		return node;
	}

	/*
	 * ============================
	 * 标记刚刚出现的列表项
	 * ============================
	 *
	 * 这里只负责添加 CSS class，
	 * 完全不负责具体动画。
	 *
	 * 动画样式由 CSS 决定。
	 */
	_markInsertedTree(node) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		/*
		 * 当前节点自己就是 li。
		 */
		if (node.tagName === 'LI') {
			this._markListItem(node);
		}

		/*
		 * 当前节点内部包含 li。
		 *
		 * 可以覆盖：
		 *
		 * ul > li
		 *
		 * 以及：
		 *
		 * ul
		 *   li
		 *     ul
		 *       li
		 */
		node.querySelectorAll?.('li').forEach((li) => {
			this._markListItem(li);
		});
	}

	/*
	 * 给新 li 添加进入动画 class。
	 */
	_markListItem(node) {
		if (node?.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'LI') {
			return;
		}

		node.classList.add(this.listItemEnterClass);
	}
}
