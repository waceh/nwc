import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../viewer/src/viewer-settings.js', import.meta.url), 'utf8')
const { readViewerSettings, writeViewerSettings } = await import('data:text/javascript,' + encodeURIComponent(source))

function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('rehearsal controls survive a browser reload', () => {
  const localStorage = storage()
  const settings = {
    speed: 0.75, volume: 0.22, octave: 1, autoScroll: false,
    autoPageTurn: false, countIn: true, startNote: true,
    loopEnabled: true, loopStart: 2, loopEnd: 6,
    practiceMix: 'guide', focusPart: true, selectedParts: [0, 2], lyricPart: 2, menuSimple: false,
  }
  writeViewerSettings(localStorage, settings)
  assert.deepEqual(readViewerSettings(localStorage), settings)
})

test('invalid saved settings do not replace valid defaults', () => {
  const localStorage = storage()
  localStorage.setItem('nwc_viewer_settings', '{broken')
  assert.deepEqual(readViewerSettings(localStorage), {})
  localStorage.setItem('nwc_viewer_settings', JSON.stringify({
    speed: -2, volume: 0.5, practiceMix: 'unknown', selectedParts: [-1, 1, 1], lyricPart: -1, autoScroll: 'false',
  }))
  assert.deepEqual(readViewerSettings(localStorage), { volume: 0.5, selectedParts: [1] })
})

test('saved rehearsal settings restore the visible controls and playback state', () => {
  const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
  const start = main.indexOf('function restoreViewerSettings()')
  const end = main.indexOf('// ---- Initial score:', start)
  assert.ok(start >= 0 && end > start, 'viewer settings restore function is missing')
  const elements = Object.fromEntries([
    'loop_enabled', 'loop_start', 'loop_end', 'count_in', 'start_note', 'focus_part',
    'auto_page_turn', 'autoscroll_toggle', 'menu_toggle', 'speed_slider', 'speed_input', 'volume_slider', 'volume_label',
  ].map(id => [id, { checked: false, value: '', classList: { toggle() {} } }]))
  const radio = { checked: false }
  const classes = new Set(['menu-simple'])
  const calls = []
  const context = {
    viewerSettings: {
      speed: 0.75, volume: 0.22, octave: 1, autoScroll: false, autoPageTurn: false,
      countIn: true, startNote: true, loopEnabled: true, loopStart: 2, loopEnd: 6,
      practiceMix: 'guide', focusPart: true, menuSimple: false,
    },
    document: {
      getElementById: id => elements[id],
      querySelector: selector => selector === 'input[name="practice_mix"][value="guide"]' ? radio : null,
      body: { classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name) } } },
    },
    applySpeed: (value, save) => calls.push(['speed', value, save]),
    applyVolume: (value, save) => calls.push(['volume', value, save]),
    updateOctaveUI: () => calls.push(['octave', context.currentOctaveShift]),
    highlighter: { autoScrollEnabled: true, toggleAutoScroll() { this.autoScrollEnabled = false }, setAutoPageTurn(value) { calls.push(['autoPage', value]) } },
    updateMenuToggle() {}, currentOctaveShift: 0, autoScrollBtn: elements.autoscroll_toggle,
  }
  vm.createContext(context)
  vm.runInContext(main.slice(start, end), context)
  context.restoreViewerSettings()
  assert.deepEqual(calls, [['speed', 0.75, false], ['volume', 0.22, false], ['octave', 1], ['autoPage', false]])
  assert.equal(elements.loop_enabled.checked, true)
  assert.equal(elements.loop_start.value, 2)
  assert.equal(elements.loop_end.value, 6)
  assert.equal(elements.count_in.checked, true)
  assert.equal(elements.start_note.checked, true)
  assert.equal(elements.focus_part.checked, true)
  assert.equal(elements.auto_page_turn.checked, false)
  assert.equal(radio.checked, true)
  assert.equal(classes.has('menu-simple'), false)
})

test('speed and volume changes update playback and stored preferences', () => {
  const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
  const changes = []
  const speedSlider = { max: '3', value: '1' }
  const speedInput = { value: '1' }
  const volumeSlider = { value: '0.08' }
  const volumeLabel = { textContent: '8%' }
  const context = {
    speedSlider, speedInput, volumeSlider, volumeLabel,
    playback: { setSpeed(value) { changes.push(['playbackSpeed', value]) }, setVolume(value) { changes.push(['playbackVolume', value]) } },
    persistViewerSettings(value) { changes.push(['saved', value]) },
  }
  vm.createContext(context)
  vm.runInContext(main.slice(main.indexOf('function applySpeed('), main.indexOf('if (speedSlider)')), context)
  vm.runInContext(main.slice(main.indexOf('function applyVolume('), main.indexOf('if (volumeSlider)')), context)
  context.applySpeed(0.75)
  context.applyVolume(0.22)
  assert.equal(speedInput.value, 0.75)
  assert.equal(volumeSlider.value, 0.22)
  assert.equal(volumeLabel.textContent, '22%')
  assert.deepEqual(changes.map(([kind, value]) => [kind, JSON.stringify(value)]), [
    ['playbackSpeed', '0.75'], ['saved', '{"speed":0.75}'],
    ['playbackVolume', '0.22'], ['saved', '{"volume":0.22}'],
  ])
})

test('saved loop bounds survive an initial short score and restore on the next score', () => {
  const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
  const start = { value: 1 }
  const end = { value: 1 }
  let measureCount = 1
  const context = {
    viewerSettings: { loopStart: 2, loopEnd: 6 },
    document: { getElementById: id => ({ loop_start: start, loop_end: end })[id] },
    buildPlaybackSegments: () => [], collectMeasures: () => Array.from({ length: measureCount }),
    buildTempoMap: () => [], buildMeasureOccurrences: () => [], ticksToSeconds: () => 0,
    updatePracticeLoop() {},
  }
  vm.createContext(context)
  vm.runInContext(main.slice(main.indexOf('function updatePracticeTimeline('), main.indexOf('function updatePracticeLoop()')), context)
  context.updatePracticeTimeline({ score: { staves: [] } })
  assert.deepEqual([start.value, end.value], [1, 1])
  measureCount = 8
  context.updatePracticeTimeline({ score: { staves: [] } })
  assert.deepEqual([start.value, end.value], [2, 6])
})
