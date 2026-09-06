/**
 * Cross-staff alignment tracker.
 *
 * Aligns tokens (notes, barlines, etc.) by their tabValue / tabUntilValue
 * across multiple staves.  The staff whose tokens occupy the most horizontal
 * space determines where tokens on other staves are placed.
 *
 * Barline alignment is tracked separately from note alignment:
 * - barlineTicks: stores where barline LINES are drawn (pre-gap), so
 *   matching barlines on different staves stack vertically.
 * - maxTicks: stores the furthest cursor position after each time slot
 *   (including post-gap for barlines), so notes on every staff land
 *   past all barline gaps.
 *
 * @param {number} xStretch - multiplier for lastPadRight in add().
 */
class TickTracker {
	constructor(xStretch) {
		this._xStretch = xStretch || 1.0
		this.reset()
	}

	reset() {
		this.maxTicks = {}
		this.barlineTicks = {}
	}

	/**
	 * Register a non-barline token's end position.
	 * Called after a note/chord/rest/clef/etc. has been laid out.
	 */
	add(token, cursor) {
		if (token.Visibility === 'hidden') return

		const refValue = token.tabUntilValue
		const which = this.maxTicks[refValue]

		const x = cursor.staveX + cursor.lastPadRight * this._xStretch || 0
		if (!which || x > which.staveX) {
			this.maxTicks[refValue] = {
				cursor,
				staveX: x,
				token: token,
			}
		}
	}

	/**
	 * Register a barline's positions for dual-purpose alignment:
	 * - barlineTicks[T] = where the barline LINE was drawn (pre-gap).
	 *   Tracks the widest position across staves for matching barlines.
	 * - maxTicks[T] = post-gap cursor position, so notes on other staves
	 *   are pushed past the barline gap.
	 */
	addBarline(token, drawnX, postGapX) {
		const key = token.barIndex != null ? ('bar_' + token.barIndex) : token.tabValue
		if (!(key in this.barlineTicks) || drawnX > this.barlineTicks[key]) {
			this.barlineTicks[key] = drawnX
		}
		const which = this.maxTicks[key]
		if (!which || postGapX > which.staveX) {
			this.maxTicks[key] = {
				cursor: null,
				staveX: postGapX,
				token: token,
			}
		}

		// Also register by tabValue for note alignment across staves
		if (token.tabValue != null && token.tabValue !== key) {
			const tKey = token.tabValue
			if (!(tKey in this.barlineTicks) || drawnX > this.barlineTicks[tKey]) {
				this.barlineTicks[tKey] = drawnX
			}
			const tWhich = this.maxTicks[tKey]
			if (!tWhich || postGapX > tWhich.staveX) {
				this.maxTicks[tKey] = {
					cursor: null,
					staveX: postGapX,
					token: token,
				}
			}
		}
	}

	/**
	 * Align a non-barline token to the widest position registered for
	 * its tabValue.  Uses Math.max so the cursor never snaps backward
	 * (prevents notes jumping back past a barline gap on their own staff).
	 */
	alignWithMax(token, cursor) {
		let moveX = cursor.staveX

		if (cursor.lastPadRight) {
			moveX += cursor.lastPadRight * this._xStretch
		}

		const key = token.tabValue
		if (key && key in this.maxTicks) {
			const which = this.maxTicks[key]
			moveX = Math.max(moveX, which.staveX)
		}

		cursor.staveX = moveX
		return false
	}

	/**
	 * Align a barline using barlineTicks (matching barlines on other
	 * staves) with maxTicks as fallback (position after preceding notes).
	 * Prefers measure-based key (token.barIndex) so barlines align across
	 * all staves regardless of floating-point tab differences.
	 */
	alignBarline(token, cursor) {
		let moveX = cursor.staveX
		const key = token.barIndex != null ? ('bar_' + token.barIndex) : token.tabValue
		if (key && key in this.barlineTicks) {
			moveX = Math.max(moveX, this.barlineTicks[key])
		} else if (key && key in this.maxTicks) {
			moveX = Math.max(moveX, this.maxTicks[key].staveX)
		}

		if (token.tabValue != null && token.tabValue !== key) {
			const tKey = token.tabValue
			if (tKey in this.barlineTicks) {
				moveX = Math.max(moveX, this.barlineTicks[tKey])
			} else if (tKey in this.maxTicks) {
				moveX = Math.max(moveX, this.maxTicks[tKey].staveX)
			}
		}

		cursor.staveX = moveX
	}
}

export { TickTracker }
