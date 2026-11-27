import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nwc-practice-'))
after(() => fs.rmSync(temp, { recursive: true, force: true }))
fs.cpSync(new URL('../viewer/src/practice.js', import.meta.url), path.join(temp, 'practice.js'))
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
const { collectMeasures, buildMeasureOccurrences, resolveLoop, mixPracticeNotes, swipePageDirection,
  leadInPlan, scheduleLeadIn, buildStaffFocusBands } = await import(pathToFileURL(path.join(temp, 'practice.js')))

test('measure ranges include every bar without an extra trailing bar', () => {
  const staves = [{ tokens: [
    { type: 'Note', tickValue: 0, durValue: 1 },
    { type: 'Barline', tickValue: 1 },
    { type: 'Barline', tickValue: 2 },
    { type: 'Barline', tickValue: 3 },
  ] }]
  assert.deepEqual(collectMeasures(staves, 3), [
    { number: 1, startTick: 0, endTick: 1 },
    { number: 2, startTick: 1, endTick: 2 },
    { number: 3, startTick: 2, endTick: 3 },
  ])
})

test('A-B loop resolves the next played occurrence across a repeat', () => {
  const measures = [
    { number: 1, startTick: 0, endTick: 1 },
    { number: 2, startTick: 1, endTick: 2 },
    { number: 3, startTick: 2, endTick: 3 },
  ]
  const segments = [{ startTick: 0, endTick: 2 }, { startTick: 0, endTick: 2 }, { startTick: 2, endTick: 3 }]
  const occurrences = buildMeasureOccurrences(measures, segments, tick => tick)
  assert.deepEqual(resolveLoop(occurrences, 1, 2, 2.1), { start: 2, end: 4 })
  assert.deepEqual(resolveLoop(occurrences, 3, 3, 0), { start: 4, end: 5 })
})

test('part radio modes keep all, guide, and minus-one sounds distinct', () => {
  const notes = [
    { staffIndex: 0, velocity: 0.8, midi: 60 },
    { staffIndex: 1, velocity: 0.8, midi: 64 },
  ]
  const selected = new Set([1])
  assert.deepEqual(mixPracticeNotes(notes, selected, 'all').map(n => n.midi), [64])
  assert.deepEqual(mixPracticeNotes(notes, selected, 'guide').map(n => [n.midi, n.velocity]), [[60, 0.2], [64, 0.8]])
  assert.deepEqual(mixPracticeNotes(notes, selected, 'minus-one').map(n => n.midi), [60])
})

test('full-view swipe turns pages only for a deliberate horizontal gesture', () => {
  assert.equal(swipePageDirection(-90, 12, false), 1)
  assert.equal(swipePageDirection(90, 12, false), -1)
  assert.equal(swipePageDirection(-35, 2, false), 0)
  assert.equal(swipePageDirection(-90, 80, false), 0)
  assert.equal(swipePageDirection(-90, 12, true), 0)
})

test('reference pitch precedes one measure of count-in at score tempo', () => {
  assert.deepEqual(leadInPlan({ startNote: 60, countIn: true, bpm: 120, beats: 3 }), {
    referenceDuration: 0.6, beatTimes: [0.75, 1.25, 1.75], duration: 2.25,
  })
})

test('lead-in tones are scheduled before playback and can be cancelled', () => {
  const started = [], stopped = []
  const context = {
    currentTime: 10, destination: {},
    createOscillator() {
      return { frequency: { setValueAtTime() {} }, connect() {}, start(t) { started.push(t) }, stop(t) { stopped.push(t) } }
    },
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }
    },
  }
  const cancel = scheduleLeadIn(context, leadInPlan({ startNote: 60, countIn: true, bpm: 120, beats: 2 }), 60)
  assert.deepEqual(started, [10, 10.75, 11.25])
  cancel()
  assert.ok(stopped.length >= 3)
})

test('staff focus bands separate choir lines and identify layered staves', () => {
  const systems = [{ topY: 72, startX: 10, endX: 500 }]
  const bands = buildStaffFocusBands(systems, [100, 200], 28)
  assert.deepEqual(bands.map(b => [b.staffIndex, b.topY, b.bottomY, b.shared]), [
    [0, 72, 150, false], [1, 150, 242, false],
  ])
  assert.equal(buildStaffFocusBands(systems, [100, 100], 28)[0].shared, true)
})
