import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'
import { after, test } from 'node:test'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nwc-lyrics-test-'))
fs.cpSync(new URL('../viewer/src/', import.meta.url), path.join(temp, 'src'), { recursive: true })
fs.cpSync(new URL('../viewer/lib/', import.meta.url), path.join(temp, 'lib'), { recursive: true })
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
after(() => fs.rmSync(temp, { recursive: true, force: true }))
const { parseNWCTxt } = await import(pathToFileURL(path.join(temp, 'lib/nwc2xml/nwctxt-parser.js')))
const { toMusicXML } = await import(pathToFileURL(path.join(temp, 'lib/nwc2xml/writer.js')))
const { NoteAttr } = await import(pathToFileURL(path.join(temp, 'lib/nwc2xml/constants.js')))
const { decodeNwcArrayBuffer, setUseNewParser } = await import(pathToFileURL(path.join(temp, 'src/nwc.js')))
const { interpret } = await import(pathToFileURL(path.join(temp, 'src/interpreter.js')))
const textScore = lines => '!NoteWorthyComposer(2.75)\n|AddStaff|Name:"Test"\n|Clef|Type:Treble\n|TimeSig|Signature:4/4\n' + lines.join('\n') + '\n!NoteWorthyComposer-End'
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn() } finally { console.log = log } }
function decode(buffer, newParser = true) {
  setUseNewParser(newParser)
  return quiet(() => { const data = decodeNwcArrayBuffer(buffer); interpret(data); return data })
}

test('slur start, middle and end propagate through barlines and chord children', () => {
  const file = parseNWCTxt(textScore([
    '|Note|Dur:4th,Slur|Pos:0', '|Bar', '|Chord|Dur:4th,Slur|Pos:1,3',
    '|Note|Dur:4th|Pos:2', '|Note|Dur:4th|Pos:3',
  ]))
  const notes = file.staffs[0].objects.filter(o => o.getAttributes)
  assert.deepEqual(notes.map(o => o.getAttributes() & NoteAttr.SlurMask),
    [NoteAttr.SlurBeg, NoteAttr.SlurMid, NoteAttr.SlurEnd, 0])
  for (const child of notes[1].children) assert.equal(child.getAttributes() & NoteAttr.SlurMask, NoteAttr.SlurMid)
})

test('a rest terminates an outgoing slur without suppressing the next note lyric', () => {
  const file = parseNWCTxt(textScore(['|Note|Dur:4th,Slur|Pos:0', '|Rest|Dur:4th', '|Note|Dur:4th|Pos:1']))
  const notes = file.staffs[0].objects.filter(o => o.getAttributes)
  assert.equal(notes.at(-1).getAttributes() & NoteAttr.SlurMask, 0)
})

test('MusicXML writes matching slur start/stop and consumes one lyric for the slur', () => {
  const file = parseNWCTxt(textScore([
    '|Lyric1|Text:"One call"', '|Note|Dur:4th,Slur|Pos:0', '|Note|Dur:4th|Pos:1', '|Note|Dur:Half|Pos:2',
  ]))
  const xml = toMusicXML(file)
  const notes = [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(m => m[1])
  assert.match(notes[0], /<slur type="start"/)
  assert.match(notes[1], /<slur type="stop"/)
  assert.match(notes[0], /<text>One<\/text>/)
  assert.doesNotMatch(notes[1], /<lyric/)
  assert.match(notes[2], /<text>call<\/text>/)
})

test('explicit Lyric=Always/Never overrides apply in viewer and MusicXML', () => {
  const text = textScore([
    '|Lyric1|Text:"One call"', '|Note|Dur:4th,Slur|Pos:0',
    '|Note|Dur:4th|Pos:1|Opts:Lyric=Always', '|Note|Dur:Half|Pos:2|Opts:Lyric=Never',
  ])
  const file = parseNWCTxt(text)
  assert.equal(file.staffs[0].objects.find(o => o.lyricSyllable === 1).getLyricSyllable(), 1)
  const xml = toMusicXML(file)
  const notes = [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(m => m[1])
  assert.match(notes[1], /<text>call<\/text>/)
  assert.doesNotMatch(notes[2], /<lyric/)
  const packed = fs.readFileSync(new URL("../viewer/samples/One Call Away - Dad's Harmony.nwc", import.meta.url))
  const original = inflateSync(packed.subarray(6))
  const header = original.subarray(0, original.indexOf('!NoteWorthyComposer'))
  const data = decode(Buffer.concat([header, Buffer.from(text)]))
  assert.deepEqual(data.score.staves[0].tokens.filter(t => t.type === 'Note').map(t => t.text), ['One', 'call', undefined])
})

for (const newParser of [true, false]) {
  test(`One Call Away third-part lyrics stay aligned to the outro (${newParser ? 'new' : 'legacy'} parser)`, () => {
    const packed = fs.readFileSync(new URL("../viewer/samples/One Call Away - Dad's Harmony.nwc", import.meta.url))
    const data = decode(inflateSync(packed.subarray(6)), newParser)
    const bars = new Map()
    let bar = 1
    for (const token of data.score.staves[2].tokens) {
      if (token.type === 'Note') {
        const notes = bars.get(bar) || []; notes.push(token); bars.set(bar, notes)
      }
      if (token.type === 'Barline') bar++
    }
    assert.deepEqual(bars.get(38).map(t => t.text), ['One', undefined, 'call', 'a-', 'way'])
    assert.equal(bars.get(38)[1].slur, 2)
    for (const b of [42, 58]) assert.deepEqual(bars.get(b).map(t => t.text), [b === 42 ? 'no-' : 'No-', undefined, 'thing', 'on', 'me'])
    assert.deepEqual(bars.get(40).map(t => t.text), ['save', 'the', 'day'])
    assert.deepEqual(bars.get(53).map(t => t.text), ['I', 'am', 'on-', 'ly'])
    assert.deepEqual(bars.get(62).map(t => t.text), ['One', 'call', 'a-'])
    assert.equal(bars.get(63)[0].text, 'way')
    const originalText = bars.get(38).map(t => t.text)
    quiet(() => interpret(data))
    assert.deepEqual(bars.get(38).map(t => t.text), originalText)
  })
}

test('restored lyrics reach the final phrase in all five parts without extra placeholders', () => {
  const packed = fs.readFileSync(new URL("../viewer/samples/One Call Away - Dad's Harmony.nwc", import.meta.url))
  const data = decode(packed)
  for (const staff of data.score.staves) {
    let bar = 1
    const final = []
    for (const token of staff.tokens) {
      if (token.type === 'Note' && bar >= 62 && token.text) final.push(token.text)
      if (token.type === 'Barline') bar++
    }
    assert.deepEqual(final, ['One', 'call', 'a-', 'way'])
  }
})

test('RestChord retains its rest and sounding voice in both parsers', () => {
  const text = textScore([
    '|RestChord|Dur:8th,DblDotted|Opts:Stem=Up|Dur2:Whole|Pos2:-8,-6,-3',
    '|Note|Dur:4th|Pos:0',
    '|RestChord|Dur:8th|Opts:Stem=Down|Dur2:Half,Dotted|Pos2:#-3^',
    '|Note|Dur:4th|Pos:-3',
  ])
  for (const mode of [true, false]) {
    const data = decode(Buffer.from(text), mode)
    const events = data.score.staves[0].tokens.filter(t => t.type === 'Chord' || t.type === 'Note')
    assert.deepEqual(events[0].notes.map(n => n.position), [-8, -6, -3])
    assert.deepEqual(events[0].notes.map(n => n.duration), [1, 1, 1])
    assert.equal(events[0].durValue.value(), 1)
    assert.equal(events[0].rest.durValue.value(), 7 / 32)
    assert.equal(events[1].tickValue, 7 / 32)
    assert.equal(events[2].notes[0].accidental, '#')
    assert.equal(events[2].notes[0].tie, 1)
    assert.equal(events[2].duration, 2)
    assert.equal(events[2].dots, 1)
    assert.equal(events[3].tickValue - events[2].tickValue, 1 / 8)
  }
})

test('MusicXML RestChord preserves simultaneous rest and notes without shifting the next onset', () => {
  const file = parseNWCTxt(textScore([
    '|RestChord|Dur:8th,DblDotted|Dur2:Whole|Pos2:-8,-6,-3',
    '|Note|Dur:4th|Pos:0',
  ]))
  const xml = toMusicXML(file)
  const div = Number(xml.match(/<divisions>(\d+)<\/divisions>/)[1])
  let time = 0, onset = 0
  const notes = []
  for (const match of xml.matchAll(/<(note|backup|forward)>([\s\S]*?)<\/\1>/g)) {
    const [, kind, body] = match
    const duration = Number(body.match(/<duration>(\d+)<\/duration>/)?.[1] || 0)
    if (kind === 'backup') time -= duration
    else if (kind === 'forward') time += duration
    else {
      if (!body.includes('<chord/>')) { onset = time; time += duration }
      notes.push({ onset, duration, rest: body.includes('<rest') })
    }
  }
  assert.equal(notes.length, 5)
  assert.equal(notes[0].rest, true)
  assert.deepEqual(notes.slice(1, 4).map(n => n.onset), [0, 0, 0])
  assert.deepEqual(notes.slice(1, 4).map(n => n.duration), [div * 4, div * 4, div * 4])
  assert.equal(notes[4].onset, div * 7 / 8)
})
