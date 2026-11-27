/** Group timed lyric syllables into one display line per score system. */
export function buildLyricLines(notes, selectedParts = []) {
	const lyricNotes = notes.filter(note => typeof note.token?.text === 'string' && note.token.text.trim() && note.token.text !== '_')
	const part = selectedParts.length ? selectedParts[0] : lyricNotes[0]?.staffIndex
	if (part == null) return []

	const lines = []
	let line = null
	let previous = null
	for (const note of notes) {
		if (note.staffIndex !== part) continue
		if (previous && note.time === previous.time && note.tokenIndex === previous.tokenIndex) continue
		const head = note.token.drawingNoteHead
			?? note.token.notes?.find(child => child.drawingNoteHead)?.drawingNoteHead
		const system = head?._sysIdx ?? note.token._sysIdx ?? 0
		if (!line || system !== line.system || (previous && note.tokenIndex < previous.tokenIndex)) {
			line = { startTime: note.time, system, entries: [] }
			lines.push(line)
		}
		if (typeof note.token?.text === 'string' && note.token.text.trim() && note.token.text !== '_') {
			const prior = line.entries.at(-1)
			line.entries.push({
				time: note.time,
				text: note.token.text,
				separator: prior && !prior.text.endsWith('-') ? ' ' : '',
			})
		}
		previous = note
	}
	return lines.some(candidate => candidate.entries.length) ? lines : []
}

/** Find the score line and syllable at the current playback time. */
export function currentLyric(lines, time) {
	if (!lines.length) return null
	let lineIndex = 0
	for (let i = 1; i < lines.length && lines[i].startTime <= time; i++) lineIndex = i
	const entries = lines[lineIndex].entries
	let entryIndex = -1
	for (let i = 0; i < entries.length && entries[i].time <= time; i++) entryIndex = i
	return { lineIndex, entryIndex }
}
