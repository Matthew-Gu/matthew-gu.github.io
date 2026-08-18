/* =========================================================
 * Markdown Stream Segmenter
 *
 * 不渲染 Markdown。
 *
 * 只寻找“足够安全，可以先 commit”的 block 边界。
 * ======================================================= */

export class MarkdownStreamSegmenter {
	constructor() {
		this.pending = '';
	}

	append(chunk) {
		this.pending += String(chunk ?? '');

		return this._extract(false);
	}

	finish() {
		return this._extract(true);
	}

	_extract(force) {
		if (force) {
			const rest = this.pending;

			this.pending = '';

			return {
				completed: rest ? [rest] : [],
				active: ''
			};
		}

		const safeOffset = this._findSafeOffset(this.pending);

		if (safeOffset <= 0) {
			return {
				completed: [],
				active: this.pending
			};
		}

		const completed = this.pending.slice(0, safeOffset);

		this.pending = this.pending.slice(safeOffset);

		return {
			completed: completed ? [completed] : [],
			active: this.pending
		};
	}

	_findSafeOffset(source) {
		const lines = this._completeLines(source);

		if (lines.length === 0) {
			return 0;
		}

		let i = 0;
		let safeOffset = 0;

		while (i < lines.length) {
			const text = lines[i].text;

			const trimmed = text.trim();

			// blank line
			if (trimmed === '') {
				safeOffset = lines[i].end;

				i++;
				continue;
			}

			/*
			 * 独占一行的 display math：
			 *
			 * $$
			 * ...
			 * $$
			 *
			 * \[
			 * ...
			 * \]
			 */
			const mathClose = trimmed === '$$' ? '$$' : trimmed === '\\[' ? '\\]' : null;

			if (mathClose) {
				let j = i + 1;
				let closed = false;

				while (j < lines.length) {
					if (lines[j].text.trim() === mathClose) {
						closed = true;
						j++;
						break;
					}

					j++;
				}

				if (!closed) {
					break;
				}

				i = j;
				safeOffset = lines[i - 1].end;

				continue;
			}

			// fenced code
			const fence = this._openingFence(text);

			if (fence) {
				let j = i + 1;
				let closed = false;

				while (j < lines.length) {
					if (this._closingFence(lines[j].text, fence)) {
						closed = true;
						j++;
						break;
					}

					j++;
				}

				if (!closed) {
					break;
				}

				i = j;
				safeOffset = lines[i - 1].end;

				continue;
			}

			// heading / horizontal rule
			if (/^(#{1,6})[ \t]+/.test(text) || /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(text)) {
				i++;

				safeOffset = lines[i - 1].end;

				continue;
			}

			// blockquote
			if (/^\s{0,3}>/.test(text)) {
				let j = i + 1;

				while (j < lines.length) {
					const current = lines[j].text;

					if (current.trim() === '' || /^\s{0,3}>/.test(current)) {
						j++;
						continue;
					}

					break;
				}

				if (j >= lines.length) {
					break;
				}

				i = j;
				safeOffset = lines[i - 1].end;

				continue;
			}

			// list
			if (this._isListItem(text)) {
				let j = i + 1;

				while (j < lines.length) {
					const current = lines[j].text;

					if (current.trim() === '' || this._isListItem(current) || /^[ \t]+\S/.test(current)) {
						j++;
						continue;
					}

					break;
				}

				if (j >= lines.length) {
					break;
				}

				i = j;
				safeOffset = lines[i - 1].end;

				continue;
			}

			// GFM table
			if (i + 1 < lines.length && this._looksLikeTableHeader(text) && this._isTableSeparator(lines[i + 1].text)) {
				let j = i + 2;
				let ended = false;

				while (j < lines.length) {
					if (lines[j].text.trim() === '') {
						ended = true;
						j++;
						break;
					}

					j++;
				}

				if (!ended) {
					break;
				}

				i = j;
				safeOffset = lines[i - 1].end;

				continue;
			}

			// ordinary paragraph
			let j = i + 1;
			let ended = false;

			while (j < lines.length) {
				const current = lines[j].text;

				if (current.trim() === '') {
					ended = true;
					j++;
					break;
				}

				if (
					/^(#{1,6})[ \t]+/.test(current) ||
					this._openingFence(current) ||
					/^\s{0,3}>/.test(current) ||
					this._isListItem(current)
				) {
					ended = true;
					break;
				}

				j++;
			}

			if (!ended) {
				break;
			}

			i = j;

			safeOffset = lines[i - 1].end;
		}

		return safeOffset;
	}

	_completeLines(source) {
		const result = [];
		let start = 0;

		while (true) {
			const newline = source.indexOf('\n', start);

			if (newline === -1) {
				break;
			}

			result.push({
				text: source.slice(start, newline),
				start,
				end: newline + 1
			});

			start = newline + 1;
		}

		return result;
	}

	_openingFence(line) {
		const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);

		if (!match) {
			return null;
		}

		return {
			char: match[1][0],
			length: match[1].length
		};
	}

	_closingFence(line, fence) {
		const trimmed = line.trim();

		let count = 0;

		while (count < trimmed.length && trimmed[count] === fence.char) {
			count++;
		}

		return count >= fence.length && trimmed.slice(count).trim() === '';
	}

	_isListItem(line) {
		return /^([ \t]*)([-+*]|\d+[.)])[ \t]+/.test(line);
	}

	_looksLikeTableHeader(line) {
		return line.includes('|');
	}

	_isTableSeparator(line) {
		let text = line.trim();

		if (text.startsWith('|')) {
			text = text.slice(1);
		}

		if (text.endsWith('|')) {
			text = text.slice(0, -1);
		}

		const cells = text.split('|').map((cell) => cell.trim());

		return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
	}
}

