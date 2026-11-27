import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../viewer/src/lyric-follow.js', import.meta.url), 'utf8')
const { buildLyricLines, currentLyric } = await import('data:text/javascript,' + encodeURIComponent(source))

const note = (time, staffIndex, tokenIndex, text, sysIdx) => ({
  time, staffIndex, tokenIndex, token: { text, drawingNoteHead: { _sysIdx: sysIdx } },
})

test('follows the selected part one score line at a time through repeats', () => {
  const notes = [
    note(0, 0, 1, 'Other', 0),
    note(0, 1, 1, 'Call', 0), note(1, 1, 2, 'me', 0), note(2, 1, 3, 'ba-', 0), note(3, 1, 4, 'by', 0),
    note(4, 1, 5, 'now', 1),
    note(5, 1, 1, 'Call', 0), note(6, 1, 2, 'me', 0),
  ]
  const lines = buildLyricLines(notes, [1])
  assert.equal(lines.length, 3)
  assert.deepEqual(lines[0].entries.map(entry => entry.separator + entry.text), ['Call', ' me', ' ba-', 'by'])
  assert.deepEqual(currentLyric(lines, 2.5), { lineIndex: 0, entryIndex: 2 })
  assert.deepEqual(currentLyric(lines, 4.5), { lineIndex: 1, entryIndex: 0 })
  assert.deepEqual(currentLyric(lines, 5.5), { lineIndex: 2, entryIndex: 0 })
})

test('skips duplicate chord events for the selected part', () => {
  const token = { text: 'Hello', drawingNoteHead: { _sysIdx: 0 } }
  const notes = [
    { time: 0, staffIndex: 0, tokenIndex: 0, token: { drawingNoteHead: { _sysIdx: 0 } } },
    { time: 0, staffIndex: 1, tokenIndex: 1, token },
    { time: 0, staffIndex: 1, tokenIndex: 1, token },
  ]
  const lines = buildLyricLines(notes, [1])
  assert.deepEqual(lines.map(line => line.entries.map(entry => entry.text)), [['Hello']])
  assert.deepEqual(currentLyric(lines, 0), { lineIndex: 0, entryIndex: 0 })
})

test('uses the selected part and the cursor system even before its first lyric', () => {
  const notes = [
    note(0, 0, 0, 'Other', 0),
    note(0, 1, 0, undefined, 0), note(1, 1, 1, 'Sing', 0), note(2, 1, 2, 'along', 0),
    note(3, 1, 3, undefined, 1), note(4, 1, 4, 'Next', 1),
  ]
  const lines = buildLyricLines(notes, [1])
  assert.deepEqual(lines.map(line => line.entries.map(entry => entry.text)), [['Sing', 'along'], ['Next']])
  assert.deepEqual(currentLyric(lines, 0.5), { lineIndex: 0, entryIndex: -1 })
  assert.deepEqual(currentLyric(lines, 2.5), { lineIndex: 0, entryIndex: 1 })
  assert.deepEqual(currentLyric(lines, 3.5), { lineIndex: 1, entryIndex: -1 })
  assert.deepEqual(buildLyricLines(notes, [2]), [], 'a selected part without lyrics must not show another part')
})
