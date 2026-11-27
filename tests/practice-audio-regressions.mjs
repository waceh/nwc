import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nwc-practice-audio-'))
fs.cpSync(new URL('../viewer/src/practice.js', import.meta.url), path.join(temp, 'practice.js'))
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
const { mixPracticeNotes } = await import(pathToFileURL(path.join(temp, 'practice.js')))
const audio = fs.readFileSync(new URL('../viewer/src/audio.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export /g, '').replace(/import\.meta\.url/g, '"file:///test/audio.js"')
const context = { mixPracticeNotes, console, URL, SoundFontEngine: class {
  constructor(options) { this.backend = options.backend }
} }
vm.createContext(context)
vm.runInContext(audio + '\nthis.Controller = PlaybackController', context)

test('the deployed viewer uses the bundled piano without requesting a missing SF2', async () => {
  const controller = new context.Controller()
  let requests = 0
  controller._engine = { loadSoundFont: async () => { requests++ }, setBackend() {} }
  await controller._loadSoundfont()
  assert.equal(requests, 0)
  assert.equal(controller._soundfontAttempted, true)
  assert.equal(controller._createEngine().backend, 'wavetable')
})

test('changing the rehearsal mix keeps the playback clock while replacing notes', async () => {
  const controller = new context.Controller()
  const notes = [{ staffIndex: 0, velocity: 0.8 }, { staffIndex: 1, velocity: 0.8 }]
  controller._allNotes = notes
  const calls = []
  controller._scheduler = {
    playing: true, currentTime: 12,
    load({ notes }) { calls.push(['load', notes]) },
    seek(time) { calls.push(['seek', time]) },
    play() { calls.push(['play']) },
  }
  controller.setPracticeSelection([1], 'guide')
  await controller._reloadFiltered()
  assert.deepEqual(calls.map(call => call[0]), ['load', 'seek', 'play'])
  assert.equal(calls[0][1][0].velocity, 0.2)
  assert.equal(calls[0][1][1].velocity, 0.8)
  assert.equal(calls[1][1], 12)
})
