/** Measure boundaries use score ticks; playback order is handled separately. */
export function collectMeasures(staves, maxTick) {
	if (!(maxTick > 0)) return []
	const bars = (staves[0]?.tokens || [])
		.filter(token => token.type === 'Barline' && Number.isFinite(token.tickValue))
		.map(token => token.tickValue)
	const boundaries = [0, ...new Set(bars.filter(tick => tick > 0 && tick <= maxTick)), maxTick]
		.sort((a, b) => a - b)
	const unique = [...new Set(boundaries)]
	return unique.slice(1).map((endTick, index) => ({
		number: index + 1, startTick: unique[index], endTick,
	}))
}

/** Project each written measure onto the repeat-aware playback timeline. */
export function buildMeasureOccurrences(measures, segments, toSeconds) {
	const occurrences = []
	let offset = 0
	for (const segment of segments) {
		const segmentStart = toSeconds(segment.startTick)
		for (const measure of measures) {
			const startTick = Math.max(measure.startTick, segment.startTick)
			const endTick = Math.min(measure.endTick, segment.endTick)
			if (endTick <= startTick) continue
			occurrences.push({
				number: measure.number,
				start: offset + toSeconds(startTick) - segmentStart,
				end: offset + toSeconds(endTick) - segmentStart,
			})
		}
		offset += toSeconds(segment.endTick) - segmentStart
	}
	return occurrences
}

/** Choose the current or next pass of the requested written measure range. */
export function resolveLoop(occurrences, startMeasure, endMeasure, afterTime = 0) {
	if (startMeasure > endMeasure) return null
	const starts = occurrences.filter(item => item.number === startMeasure)
	const start = starts.find(item => item.end > afterTime) || starts[0]
	if (!start) return null
	const end = occurrences.find(item => item.number === endMeasure && item.end > start.start)
	return end && end.end > start.start ? { start: start.start, end: end.end } : null
}

/** Checked staves are the singer's selected parts. */
export function mixPracticeNotes(notes, selected, mode) {
	if (mode === 'guide') {
		return notes.map(note => selected.has(note.staffIndex)
			? note : { ...note, velocity: note.velocity * 0.25 })
	}
	if (mode === 'minus-one') return notes.filter(note => !selected.has(note.staffIndex))
	return notes.filter(note => selected.has(note.staffIndex))
}

export function swipePageDirection(deltaX, deltaY, horizontalOverflow) {
	if (horizontalOverflow || Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return 0
	return deltaX < 0 ? 1 : -1
}

export function leadInPlan({ startNote = null, countIn = false, bpm = 120, beats = 4 }) {
	const referenceDuration = startNote == null ? 0 : 0.6
	const beatLength = 60 / Math.max(20, Math.min(300, bpm))
	const firstBeat = referenceDuration ? referenceDuration + 0.15 : 0
	const beatTimes = countIn ? Array.from({ length: Math.max(1, Math.min(12, beats)) }, (_, i) => firstBeat + i * beatLength) : []
	const duration = countIn ? firstBeat + beatTimes.length * beatLength : referenceDuration ? referenceDuration + 0.15 : 0
	return { referenceDuration, beatTimes, duration }
}

export function scheduleLeadIn(context, plan, startNote) {
	const oscillators = []
	const tone = (offset, duration, frequency, volume) => {
		const oscillator = context.createOscillator()
		const gain = context.createGain()
		const start = context.currentTime + offset
		oscillator.frequency.setValueAtTime(frequency, start)
		gain.gain.setValueAtTime(volume, start)
		gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
		oscillator.connect(gain)
		gain.connect(context.destination)
		oscillator.start(start)
		oscillator.stop(start + duration)
		oscillators.push(oscillator)
	}
	if (startNote != null && plan.referenceDuration) {
		tone(0, plan.referenceDuration, 440 * 2 ** ((startNote - 69) / 12), 0.13)
	}
	plan.beatTimes.forEach((time, index) => tone(time, 0.08, index === 0 ? 880 : 660, 0.1))
	return () => {
		for (const oscillator of oscillators) {
			try { oscillator.stop(context.currentTime) } catch (_) { /* already stopped */ }
		}
	}
}

export function buildStaffFocusBands(systems, staffYs, fontSize) {
	if (!systems?.length || !staffYs?.length) return []
	const bands = []
	for (const system of systems) {
		const offset = system.topY + fontSize - staffYs[0]
		for (let i = 0; i < staffYs.length; i++) {
			const topY = i === 0 ? staffYs[i] - fontSize : (staffYs[i - 1] + staffYs[i]) / 2
			const bottomY = i === staffYs.length - 1 ? staffYs[i] + fontSize * 1.5 : (staffYs[i] + staffYs[i + 1]) / 2
			bands.push({
				staffIndex: i, topY: topY + offset, bottomY: bottomY + offset,
				startX: system.startX, endX: system.endX,
				shared: (i > 0 && staffYs[i] === staffYs[i - 1]) || (i < staffYs.length - 1 && staffYs[i] === staffYs[i + 1]),
			})
		}
	}
	return bands
}
