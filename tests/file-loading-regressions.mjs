import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
const processCode = main.slice(main.indexOf('let loadGeneration = 0'), main.indexOf('\nwindow.rerender = rerender'))
const retryCode = main.slice(main.indexOf('function toggleParser()'), main.indexOf('\nconst parserBtn ='))

function loader() {
  const pending = new Map()
  const shown = []
  const panel = { style: {} }
  const message = { textContent: '' }
  const retry = { hidden: false }
  const elements = { file_error: panel, file_error_text: message, retry_parser: retry }
  let newParser = true
  const context = {
    window: {}, console: { log() {}, error() {} },
    document: { getElementById: id => elements[id] || null, body: { classList: { contains: () => false } } },
    isMusicXMLFile: (_, name) => name.endsWith('.musicxml'),
    parseMusicXML: (_, name) => new Promise((resolve, reject) => pending.set(name, { resolve, reject })),
    isMidiFile: () => false,
    decodeNwcArrayBuffer: payload => { if (payload === 'bad' && newParser) throw new Error('invalid NWC'); return payload },
    setDataAndRender: data => shown.push(data),
    getUseNewParser: () => newParser,
    setUseNewParser: value => { newParser = value },
    updateParserButton() {},
    localStorage: { setItem() {} },
    PARSER_STORAGE_KEY: 'nwc_use_new_parser',
  }
  vm.createContext(context)
  vm.runInContext(processCode + '\n' + retryCode + '\nthis.open = processData; this.retry = toggleParser', context)
  return { open: context.open, retryParser: context.retry, pending, shown, panel, message, retry, parserMode: () => newParser }
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
  assert.equal(app.panel.style.display, 'none')
})

test('a failed NWC load shows an inline parser retry while MusicXML does not', async () => {
  const app = loader()
  app.open('bad', 'bad.nwc')
  assert.equal(app.panel.style.display, 'flex')
  assert.match(app.message.textContent, /bad\.nwc/)
  assert.equal(app.retry.hidden, false)
  app.retryParser()
  assert.equal(app.parserMode(), false)
  assert.deepEqual(app.shown, ['bad'])
  assert.equal(app.panel.style.display, 'none')
  app.open('bad', 'bad.musicxml')
  app.pending.get('bad.musicxml').reject(new Error('invalid score'))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(app.retry.hidden, true)
  assert.match(app.message.textContent, /invalid score/)
})
