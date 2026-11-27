import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

const html = fs.readFileSync(new URL('../converter/index.html', import.meta.url), 'utf8')
const midiCode = html.slice(html.indexOf('    const STEP_SEMITONES'), html.indexOf('    // ── UI'))

function element(tagName, children = [], attributes = {}, textContent = '') {
  const node = { tagName, children, textContent, getAttribute: name => attributes[name] ?? null }
  node.querySelectorAll = selector => {
    const parts = selector.split(' ')
    let roots = [node]
    for (const part of parts) {
      const match = /^([\w-]+)(?:\[([\w-]+)(?:="([^"]+)")?\])?$/.exec(part)
      roots = roots.flatMap(root => {
        const found = []
        const visit = item => {
          for (const child of item.children) {
            if (child.tagName === match[1] && (!match[2] || (child.getAttribute(match[2]) !== null && (match[3] === undefined || child.getAttribute(match[2]) === match[3])))) found.push(child)
            visit(child)
          }
        }
        visit(root)
        return found
      })
    }
    return roots
  }
  node.querySelector = selector => node.querySelectorAll(selector)[0] ?? null
  return node
}

const leaf = (name, value) => element(name, [], {}, String(value))
const note = (pitch, duration, ties = []) => element('note', [
  element('pitch', [leaf('step', pitch[0]), leaf('octave', pitch[1])]),
  leaf('duration', duration),
  ...ties.map(type => element('tie', [], { type })),
])

function convert(doc) {
  const context = { DOMParser: class { parseFromString() { return doc } }, Uint8Array, Math }
  vm.createContext(context)
  vm.runInContext(midiCode + '\nthis.convert = musicXMLtoMidi', context)
  return context.convert('<score-partwise/>')
}

function tracks(midi) {
  const data = Buffer.from(midi)
  const result = []
  for (let offset = 14; offset < data.length;) {
    assert.equal(data.toString('ascii', offset, offset + 4), 'MTrk')
    const end = offset + 8 + data.readUInt32BE(offset + 4)
    offset += 8
    let tick = 0
    const events = []
    while (offset < end) {
      let delta = 0, byte
      do { byte = data[offset++]; delta = (delta << 7) | (byte & 0x7f) } while (byte & 0x80)
      tick += delta
      const status = data[offset++]
      if (status === 0xff) {
        const type = data[offset++]
        const length = data[offset++]
        events.push({ tick, type, bytes: [...data.subarray(offset, offset + length)] })
        offset += length
      } else {
        const length = (status & 0xf0) === 0xc0 ? 1 : 2
        events.push({ tick, status, bytes: [...data.subarray(offset, offset + length)] })
        offset += length
      }
    }
    result.push(events)
  }
  return result
}

test('MIDI retains tempo changes at their musical position', () => {
  const part = element('part', [
    element('measure', [
      element('attributes', [leaf('divisions', 1)]),
      element('direction', [element('sound', [], { tempo: '120' })]),
      note(['C', 4], 1),
      element('direction', [element('sound', [], { tempo: '60' })]),
      note(['D', 4], 1),
    ]),
  ], { id: 'P1' })
  const doc = element('score-partwise', [element('score-part', [], { id: 'P1' }), part])
  const tempo = tracks(convert(doc))[0].filter(event => event.type === 0x51)
  assert.deepEqual(tempo.map(event => [event.tick, event.bytes]), [
    [0, [0x07, 0xa1, 0x20]],
    [480, [0x0f, 0x42, 0x40]],
  ])
  assert.equal(tracks(convert(doc))[0].find(event => event.type === 0x58).tick, 0)
})

test('MIDI sustains tied notes without retriggering them', () => {
  const part = element('part', [element('measure', [
    element('attributes', [leaf('divisions', 1)]),
    note(['C', 4], 1, ['start']),
    note(['C', 4], 1, ['stop']),
  ])], { id: 'P1' })
  const doc = element('score-partwise', [element('score-part', [], { id: 'P1' }), part])
  const notes = tracks(convert(doc))[1].filter(event => [0x80, 0x90].includes(event.status & 0xf0))
  assert.deepEqual(notes.map(event => [event.tick, event.status & 0xf0, event.bytes[0]]), [
    [0, 0x90, 60], [960, 0x80, 60],
  ])
})

test('MIDI accepts tempo sound elements placed directly in a measure', () => {
  const part = element('part', [element('measure', [
    element('attributes', [leaf('divisions', 1)]),
    note(['C', 4], 1),
    element('sound', [], { tempo: '90' }),
  ])], { id: 'P1' })
  const doc = element('score-partwise', [element('score-part', [], { id: 'P1' }), part])
  const tempo = tracks(convert(doc))[0].filter(event => event.type === 0x51)
  assert.deepEqual(tempo.map(event => event.tick), [0, 480])
  assert.deepEqual(tempo[1].bytes, [0x0a, 0x2c, 0x2b])
})
