import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

const html = fs.readFileSync(new URL('../viewer/index.html', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
const constants = fs.readFileSync(new URL('../viewer/src/constants.js', import.meta.url), 'utf8')

test('new visitors see one page at a time by default', () => {
  const context = { global: {} }
  vm.createContext(context)
  vm.runInContext(constants.replace(/export\s*\{[\s\S]*?\}\s*$/, '') + '\nthis.pageMode = getPageViewMode()', context)
  assert.equal(context.pageMode, 'single-page')
  assert.match(html, /<option value="single-page" selected>한 페이지씩<\/option>/)
  assert.doesNotMatch(html, /<option value="two-up" selected>/)
})

test('full view button is beside Menu View in the always visible toolbar', () => {
  assert.match(html, /<button id="menu_full_toggle"[^>]*>메뉴 보기<\/button>\s*<button id="fullscreen_toggle"[^>]*>전체보기<\/button>/)
  assert.equal((html.match(/id="fullscreen_toggle"/g) || []).length, 1)
})

test('full view works with both compact and expanded menus', () => {
  const classes = new Set(['menu-simple'])
  const classList = {
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name) },
    contains(name) { return classes.has(name) },
  }
  const buttons = Object.fromEntries(['fullscreen_toggle', 'fullscreen_exit', 'fullscreen_play_toggle', 'menu_simple_toggle', 'menu_full_toggle'].map(id => [id, {}]))
  let playToggles = 0
  const context = {
    document: { body: { classList }, getElementById: id => buttons[id] ?? {}, addEventListener() {} },
    requestAnimationFrame: callback => callback(),
    resizeToFit() {}, getLayoutMode: () => 'page', getZoomFitMode: () => 'width', applyZoomFit() {},
    fullscreenPlayBtn: buttons.fullscreen_play_toggle,
    handlePlayToggleGesture: () => { playToggles++ },
  }
  vm.createContext(context)
  const start = main.indexOf('const fullscreenToggleBtn =')
  const end = main.indexOf('// ---- Spacing density slider ----', start)
  vm.runInContext(main.slice(start, end), context)

  for (const compact of [true, false]) {
    buttons[compact ? 'menu_simple_toggle' : 'menu_full_toggle'].onclick()
    buttons.fullscreen_toggle.onclick()
    assert.equal(classes.has('fullscreen-mode'), true)
    assert.equal(classes.has('menu-simple'), compact)
    buttons.fullscreen_play_toggle.onclick()
    buttons.fullscreen_exit.onclick()
    assert.equal(classes.has('fullscreen-mode'), false)
  }
  assert.equal(playToggles, 2)
})

test('mobile rehearsal options are configurable before entering full view', () => {
  for (const id of ['loop_enabled', 'loop_start', 'loop_end', 'count_in', 'start_note',
    'focus_part', 'auto_page_turn']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing`)
  }
  for (const mode of ['all', 'guide', 'minus-one']) {
    assert.ok(html.includes(`value="${mode}"`), `${mode} mix is missing`)
  }
  const nav = html.indexOf('id="page_nav"')
  const expandedToolbar = html.indexOf('<div class="toolbar menu-extra">')
  assert.ok(nav > 0 && nav < expandedToolbar, 'page navigation must stay visible in the compact menu')
  assert.ok(html.includes('id="auto_page_turn" type="checkbox" checked'), 'automatic page turning should start on')
})

test('mobile full view has a top-left play/pause control wired to the existing gesture handler', () => {
  assert.match(html, /<button id="fullscreen_play_toggle"[^>]*>재생<\/button>/)
  assert.match(html, /body\.fullscreen-mode #fullscreen_play_toggle\s*\{[^}]*display:\s*inline-block/s)
  assert.match(html, /#fullscreen_play_toggle\s*\{[^}]*left:\s*8px/s)
  assert.match(main, /fullscreenPlayBtn\.onclick\s*=\s*handlePlayToggleGesture/)
})

test('full-view button label follows playback and end state', () => {
  const buttons = { play: { textContent: '재생' }, fullscreen_play_toggle: { textContent: '재생' } }
  const callbacks = {}
  const context = {
    document: { getElementById: id => buttons[id] || { value: 0, textContent: '' } },
    playback: {
      onTime(fn) { callbacks.time = fn }, onNoteOn() {}, onNoteOff() {},
      onStateChange(fn) { callbacks.state = fn }, onEnd(fn) { callbacks.end = fn },
      get duration() { return 0 },
    },
    highlighter: { start() {}, pause() {}, stop() {} },
    pianoKeyboard: { noteOn() {}, noteOff() {}, clear() {} },
    formatTime: () => '0:00',
  }
  vm.createContext(context)
  const start = main.indexOf('const playBtn =')
  const end = main.indexOf('// Tracks which score data', start)
  vm.runInContext(main.slice(start, end) + '\nthis.labels = [playBtn, fullscreenPlayBtn]', context)
  callbacks.state(true)
  assert.deepEqual(Array.from(context.labels, button => button.textContent), ['일시정지', '일시정지'])
  callbacks.state(false)
  assert.deepEqual(Array.from(context.labels, button => button.textContent), ['재생', '재생'])
  callbacks.state(true)
  callbacks.end()
  assert.deepEqual(Array.from(context.labels, button => button.textContent), ['재생', '재생'])
})
