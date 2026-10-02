import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nwc-voices-'))
for (const dir of ['src', 'lib']) fs.cpSync(new URL(`../viewer/${dir}/`, import.meta.url), path.join(temp, dir), { recursive: true })
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
after(() => fs.rmSync(temp, { recursive: true, force: true }))
const load = name => import(pathToFileURL(path.join(temp, name)))
const node = { style: {}, clientWidth: 1000, clientHeight: 800, getBoundingClientRect: () => ({ width: 1000, height: 800 }) }
globalThis.window = globalThis
globalThis.document = { getElementById: () => node, body: node }
globalThis.ctx = new Proxy({ measureText: text => ({ width: String(text).length * 8 }) }, { get: (obj, key) => obj[key] || (() => {}) })
globalThis.canvas = { width: 1000, height: 800, style: {} }
globalThis.smuflFont = { unitsPerEm: 1000, charToGlyph: () => ({ advanceWidth: 400, getPath: () => ({ commands: [], getBoundingBox: () => ({ x1: 0, y1: -28, x2: 12, y2: 0 }), draw() {} }) }) }
const { decodeNwcArrayBuffer, setUseNewParser } = await load('src/nwc.js')
const { interpret } = await load('src/interpreter.js')
const { buildPlaybackSegments } = await load('src/playback-order.js')
const { score } = await load('src/layout/typeset.js')
const { setLayoutMode } = await load('src/constants.js')
const { parseNWCTxt } = await load('lib/nwc2xml/nwctxt-parser.js')
const { toMusicXML } = await load('lib/nwc2xml/writer.js')
// Exercise real event conversion and controller methods without an audio device.
const audio = fs.readFileSync(new URL('../viewer/src/audio.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export /g, '').replace(/import\.meta\.url/g, '"file:///test/audio.js"')
const context = { buildPlaybackSegments, interpret, console }
vm.createContext(context)
vm.runInContext(audio + '\nthis.events = buildNoteEvents; this.Controller = PlaybackController;', context)
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn() } finally { console.log = log } }
const text = lines => '!NoteWorthyComposer(2.75)\n|AddStaff|Name:"Test"|Label:"Voice"\n|Clef|Type:Treble\n|TimeSig|Signature:4/4\n' + lines.join('\n') + '\n!NoteWorthyComposer-End'
function decode(lines, mode = true) {
  setUseNewParser(mode)
  return quiet(() => { const data = decodeNwcArrayBuffer(Buffer.from(text(lines))); interpret(data); return data })
}
const eventSummary = data => Array.from(context.events(data).notes, n => [n.midi, n.time, n.duration])
for (const mode of [true, false]) {
  test(`split NWC chord voices preserve every pitch, duration and onset (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Chord|Dur:4th|Pos:0,2|Opts:Stem=Up|Dur2:Half|Pos2:4', '|Note|Dur:4th|Pos:0'], mode)
    const chord = data.score.staves[0].tokens.find(t => t.type === 'Chord')
    assert.deepEqual(chord.notes.map(n => [n.position, n.duration, n.stem]), [[0, 4, 1], [2, 4, 1], [4, 2, 2]])
    assert.deepEqual(eventSummary(data), [[71, 0, .5], [74, 0, .5], [77, 0, 1], [71, .5, .5]])
  })
  test(`partial chord ties keep unrelated notes and chains (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Chord|Dur:4th|Pos:0^,2', '|Chord|Dur:4th|Pos:0^,3', '|Chord|Dur:4th|Pos:0,4'], mode)
    assert.deepEqual(eventSummary(data), [[71, 0, 1.5], [74, 0, .5], [76, .5, .5], [77, 1, .5]])
    const chords = data.score.staves[0].tokens.filter(t => t.type === 'Chord')
    assert.deepEqual(chords[1].notes.map(n => !!n.tieEnd), [true, false])
  })
  test(`tie accidental survives a barline and explicit pitch changes break ties (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Note|Dur:4th|Pos:#0^', '|Bar', '|Note|Dur:4th|Pos:0', '|Note|Dur:4th|Pos:#0^', '|Note|Dur:4th|Pos:n0'], mode)
    const notes = eventSummary(data)
    assert.deepEqual(notes.slice(0, 2), [[72, 0, 1], [72, 1, .5]])
    assert.deepEqual(notes[2], [71, 1.5, .5])
  })
  test(`staff layout, chord articulation and endings survive NWC import (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|StaffProperties|BoundaryTop:19|BoundaryBottom:11|WithNextStaff:Bracket,Brace,Layer,ConnectBars|Lines:5|EndingBar:Section Close', '|Ending|Endings:4,7,D', '|Chord|Dur:4th|Pos:0,2|Opts:Staccato,Tenuto,Beam=First', '|Note|Dur:4th|Pos:0'], mode)
    const staff = data.score.staves[0]
    assert.equal(staff.staff_label, 'Voice')
    assert.equal(staff.boundaryTop, 19); assert.equal(staff.boundaryBottom, 11)
    for (const key of ['bracketWithNext', 'braceWithNext', 'layerWithNext', 'connectBarsWithNext']) assert.equal(staff[key], true)
    assert.equal(staff.endingBar, 0)
    const ending = staff.tokens.find(t => t.type === 'Ending')
    assert.equal(ending.repeat, 200); assert.equal(ending.style || 0, 0)
    const chord = staff.tokens.find(t => t.type === 'Chord')
    assert.equal(chord.staccato, 1); assert.equal(chord.tenuto, 1); assert.equal(chord.beam, 1)
    assert.equal(chord.durValue.value(), .25) // articulations must not set triplet bits
    assert.equal(staff.tokens.at(-1).tickValue, .25)
  })
  test(`split voices render separate stems in all layouts (${mode ? 'new' : 'legacy'})`, () => {
    for (const layout of ['scroll', 'wrap', 'page']) {
      const data = decode(['|Chord|Dur:4th|Pos:-4,-2|Opts:Stem=Up|Dur2:Half|Pos2:2'], mode)
      setLayoutMode(layout)
      quiet(() => score(data))
      const stems = [...window.drawing.set].filter(g => g.constructor.name === 'Stem')
      assert.equal(stems.length, 2, layout)
      assert.ok(data.score.staves[0].tokens.find(t => t.type === 'Chord').notes.every(n => n.drawingNoteHead))
    }
  })
}

test('the final long voice is not truncated to the short voice duration', () => {
  assert.deepEqual(eventSummary(decode(['|Chord|Dur:4th|Pos:0|Dur2:Half|Pos2:2'])), [[71, 0, .5], [74, 0, 1]])
})
test('MusicXML preserves split chord pitches and independent note lengths', () => {
  const file = parseNWCTxt(text(['|Chord|Dur:4th|Pos:0|Opts:Stem=Up|Dur2:Half|Pos2:2,4']))
  const xml = toMusicXML(file)
  const durations = [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(m => Number(m[1].match(/<duration>(\d+)<\/duration>/)[1]))
  const div = file.staffs[0].getDivisions()
  assert.deepEqual(durations, [div, div * 2, div * 2])
})
test('changing parts preserves both paused and playing positions', async () => {
  for (const playing of [false, true]) {
    let started = false
    const scheduler = { currentTime: 42, load() { this.currentTime = 0 }, seek(t) { this.currentTime = t }, play() { started = true } }
    await context.Controller.prototype._reloadFiltered.call({ _scheduler: scheduler, _allNotes: [{}], playing, currentTime: 42, _filterNotes: n => n })
    assert.equal(scheduler.currentTime, 42); assert.equal(started, playing)
  }
})

for (const mode of [true, false]) {
  test(`repeat jumps break ties while the final straight-through pass sustains its voices (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Bar|Style:Local Repeat Open', '|Chord|Dur:4th|Pos:0^|Dur2:Half|Pos2:2', '|Bar|Style:Local Repeat Close|Repeat:2', '|Note|Dur:4th|Pos:0'], mode)
    assert.deepEqual(eventSummary(data), [[71, 0, .5], [74, 0, .5], [71, .5, 1], [74, .5, 1]])
  })
  test(`a rest breaks short ties but preserves a held secondary voice until its next onset (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Chord|Dur:4th|Pos:0|Dur2:Half|Pos2:2^', '|Rest|Dur:4th', '|Chord|Dur:4th|Pos:0,2'], mode)
    assert.deepEqual(eventSummary(data), [[71, 0, .5], [74, 0, 1.5], [71, 1, .5]])
    const short = decode(['|Note|Dur:4th|Pos:0^', '|Rest|Dur:4th', '|Note|Dur:4th|Pos:0'], mode)
    assert.equal(short.score.staves[0].tokens.at(-1).tieEnd, 0)
    assert.deepEqual(eventSummary(short), [[71, 0, .5], [71, 1, .5]])
  })
  test(`beam first/middle/end and secondary triplet lengths stay independent (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Chord|Dur:8th|Pos:0|Opts:Beam=First,Stem=Up|Dur2:Half,Dotted|Pos2:2', '|Note|Dur:8th|Pos:1|Opts:Beam', '|Note|Dur:8th|Pos:2|Opts:Beam=End'], mode)
    assert.deepEqual(data.score.staves[0].tokens.filter(t => t.type === 'Chord' || t.type === 'Note').map(t => t.beam), [1, 2, 3])
    const triplet = decode(['|Chord|Dur:4th|Pos:0|Dur2:Half,Triplet|Pos2:2'], mode)
    assert.equal(triplet.score.staves[0].tokens.find(t => t.type === 'Chord').notes[1].durValue.value(), 1 / 3)
  })
  test(`hidden staves remain audible but do not create drawing anchors (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Note|Dur:4th|Pos:0', '|AddStaff|Name:"Hidden"', '|StaffProperties|Visible:N', '|Clef|Type:Treble', '|TimeSig|Signature:4/4', '|Note|Dur:4th|Pos:2'], mode)
    setLayoutMode('page')
    quiet(() => score(data))
    assert.equal(data.score.staves.length, 2)
    assert.equal(data.score.staves[1].tokens.at(-1).drawingNoteHead, undefined)
    assert.equal(context.events(data).notes.length, 2)
  })
}

test('legacy chord children without their own timing inherit the parent duration', () => {
  const data = { score: { staves: [{ tokens: [{ type: 'Clef', clef: 'treble' }, { type: 'Chord', duration: 2, dots: 1, notes: [{ position: 0 }, { position: 2 }] }] }] } }
  quiet(() => interpret(data))
  assert.deepEqual(eventSummary(data), [[71, 0, 1.5], [74, 0, 1.5]])
})
test('binary note beam markers use the beam byte, independently of stem-shift bits', async () => {
  const { NoteObj } = await load('lib/nwc2xml/objects.js')
  const { NoteAttr } = await load('lib/nwc2xml/constants.js')
  for (const [raw, expected] of [[1, NoteAttr.BeamBeg], [2, NoteAttr.BeamMid], [3, NoteAttr.BeamEnd]]) {
    const note = new NoteObj(null)
    note.attr1 = [0, 0]; note.attr2 = [5]; note.data2 = [0, 0, raw]
    assert.equal(note.getAttributes() & NoteAttr.BeamMask, expected)
    note.data2 = [0, raw, 0]
    assert.equal(note.getAttributes() & NoteAttr.BeamMask, 0)
  }
})

test('staff ending bars retain the closing bar style used by layout and MusicXML', () => {
  for (const [style, expected] of [['Section Close', 'light-heavy'], ['Double', 'light-light'], ['Hidden', 'none']]) {
    const xml = toMusicXML(parseNWCTxt(text([`|StaffProperties|EndingBar:${style}`, '|Note|Dur:4th|Pos:0'])))
    assert.ok(xml.includes(`<bar-style>${expected}</bar-style>`), style)
  }
})

// Baselines captured from v1.0.822 before the NWC voice changes.
for (const [name, count, digest] of [
  ["One Call Away - Dad's Harmony.nwc", 999, '8a6c4d260f66d82d7c431de7c5dbdbc65f4a0b3f7da1aa31992a27dffd0c02d5'],
  ['the blenders-you.nwc', 1816, 'ecba3bf49f12d9f79bdcc1f381c15685836f96de41b1d66f744cc22314e79976'],
]) {
  test(`existing sample retains all playback pitches, onsets and lengths: ${name}`, () => {
    setUseNewParser(true)
    const data = quiet(() => {
      const result = decodeNwcArrayBuffer(fs.readFileSync(new URL('../viewer/samples/' + name, import.meta.url)))
      interpret(result)
      return result
    })
    const notes = context.events(data).notes
    assert.equal(notes.length, count)
    const signature = Array.from(notes, n => JSON.stringify([n.staffIndex, n.midi, n.time, n.duration]))
    assert.equal(createHash('sha256').update(JSON.stringify(signature)).digest('hex'), digest)
  })
}

for (const mode of [true, false]) {
  test(`ties match sounding pitch under key signatures and repeated accidentals (${mode ? 'new' : 'legacy'})`, () => {
    const data = decode(['|Key|Signature:F#|Tonic:G', '|Note|Dur:4th|Pos:4^', '|Note|Dur:4th|Pos:#4', '|Note|Dur:4th|Pos:4^', '|Note|Dur:4th|Pos:n4'], mode)
    const notes = data.score.staves[0].tokens.filter(t => t.type === 'Note')
    assert.deepEqual(notes.map(n => !!n.tieEnd), [false, true, false, false])
    assert.deepEqual(eventSummary(data), [[78, 0, 1], [78, 1, .5], [77, 1.5, .5]])
  })
}
test('MusicXML tie continuations retain their accidental across barlines', () => {
  const xml = toMusicXML(parseNWCTxt(text(['|Note|Dur:4th|Pos:#0^', '|Bar', '|Note|Dur:4th|Pos:0'])))
  const notes = [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(m => m[1])
  assert.ok(notes.every(n => n.includes('<alter>1</alter>')))
  assert.ok(notes[1].includes('tie type="stop"'))
  assert.equal(notes[1].includes('<accidental>sharp</accidental>'), false)
})
