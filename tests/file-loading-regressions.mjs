import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
const processCode = main.slice(main.indexOf('let loadGeneration = 0'), main.indexOf('\nwindow.rerender = rerender'))

function loader() {
  const pending = new Map()
  const shown = []
  const alerts = []
  const context = {
    window: {}, console: { log() {}, error() {} },
    isMusicXMLFile: (_, name) => name.endsWith('.musicxml'),
    parseMusicXML: (_, name) => new Promise((resolve, reject) => pending.set(name, { resolve, reject })),
    isMidiFile: () => false,
    decodeNwcArrayBuffer: payload => payload,
    setDataAndRender: data => shown.push(data),
    alert: message => alerts.push(message),
  }
  vm.createContext(context)
  vm.runInContext(processCode + '\nthis.open = processData', context)
  return { open: context.open, pending, shown, alerts }
}

test('an older MusicXML load cannot replace a newer NWC score', async () => {
  const app = loader()
  app.open('old', 'old.musicxml')
  app.open('new', 'new.nwc')
  app.pending.get('old.musicxml').resolve('old parsed')
  await Promise.resolve()
  assert.deepEqual(app.shown, ['new'])
})

test('only the latest of two MusicXML loads may display or report an error', async () => {
  const app = loader()
  app.open('first', 'first.musicxml')
  app.open('second', 'second.musicxml')
  app.pending.get('second.musicxml').resolve('second parsed')
  await Promise.resolve()
  app.pending.get('first.musicxml').reject(new Error('stale failure'))
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(app.shown, ['second parsed'])
  assert.deepEqual(app.alerts, [])
})
