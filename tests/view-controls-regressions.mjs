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

test('the primary toolbar keeps file, playback, menu and full view in one order', () => {
  const primary = html.slice(html.indexOf('<div class="toolbar primary-toolbar">'), html.indexOf('<div class="toolbar menu-extra">'))
  const controls = ['id="open"', 'id="play"', 'id="menu_toggle"', 'id="fullscreen_toggle"']
  const positions = controls.map(control => primary.indexOf(control))
  assert.ok(positions.every(position => position >= 0), 'primary control is missing')
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  assert.match(primary, /id="open"[^>]*aria-label="악보 파일 열기"[^>]*>\s*<svg/s)
  for (const id of ['open', 'play', 'menu_toggle', 'fullscreen_toggle']) {
    assert.ok(new RegExp(`<button id="${id}"[^>]*>[\\s\\S]*?<svg`).test(primary), `${id} needs an SVG icon`)
    assert.ok(new RegExp(`<button id="${id}"[^>]*aria-label=`).test(primary), `${id} needs an accessible name`)
  }
  for (const id of ['volume_slider', 'speed_slider', 'octave_down', 'app_version', 'progress_bar']) {
    assert.ok(!primary.includes(`id="${id}"`), `${id} should leave the primary row`)
  }
  assert.doesNotMatch(html, /id="stop"/)
  assert.equal((html.match(/id="fullscreen_toggle"/g) || []).length, 1)
})

test('full view works with both compact and expanded menus', () => {
  const classes = new Set(['menu-simple'])
  const classList = {
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name) },
    contains(name) { return classes.has(name) },
  }
  const buttons = Object.fromEntries(['fullscreen_toggle', 'fullscreen_exit', 'fullscreen_play_toggle', 'menu_toggle'].map(id => [id, {}]))
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
    if (classes.has('menu-simple') !== compact) buttons.menu_toggle.onclick()
    buttons.fullscreen_toggle.onclick()
    assert.equal(classes.has('fullscreen-mode'), true)
    assert.equal(classes.has('menu-simple'), compact)
    assert.equal(buttons.menu_toggle.ariaExpanded, String(!compact))
    assert.equal(buttons.menu_toggle.ariaLabel, compact ? '연습 설정 보기' : '연습 설정 닫기')
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
  assert.ok(/<button id="fullscreen_play_toggle"[^>]*aria-label="재생"[^>]*>\s*<svg/.test(html))
  assert.ok(/<button id="fullscreen_exit"[^>]*aria-label="전체보기 종료"[^>]*>\s*<svg/.test(html))
  assert.ok(html.includes('.transport-button.is-playing .icon-pause { display: block; }'))
  assert.match(html, /body\.fullscreen-mode #fullscreen_play_toggle\s*\{[^}]*display:\s*inline-flex/s)
  assert.match(html, /#fullscreen_play_toggle\s*\{[^}]*left:\s*8px/s)
  assert.match(main, /fullscreenPlayBtn\.onclick\s*=\s*handlePlayToggleGesture/)
})

test('full-view button label follows playback and end state', () => {
  const makeButton = () => {
    const classes = new Set()
    return { ariaLabel: '재생', classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name) },
      contains(name) { return classes.has(name) },
    } }
  }
  const buttons = { play: makeButton(), fullscreen_play_toggle: makeButton() }
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
  assert.deepEqual(Array.from(context.labels, button => [button.ariaLabel, button.classList.contains('is-playing')]), [['일시정지', true], ['일시정지', true]])
  callbacks.state(false)
  assert.deepEqual(Array.from(context.labels, button => [button.ariaLabel, button.classList.contains('is-playing')]), [['재생', false], ['재생', false]])
  callbacks.state(true)
  callbacks.end()
  assert.deepEqual(Array.from(context.labels, button => [button.ariaLabel, button.classList.contains('is-playing')]), [['재생', false], ['재생', false]])
})

test('secondary practice controls keep visible values and remain in the expanded menu', () => {
  const expanded = html.slice(html.indexOf('<div class="toolbar menu-extra">'), html.indexOf('<div id="score">'))
  for (const id of ['volume_slider', 'speed_slider', 'octave_down', 'octave_up', 'part_checkbox_container']) {
    assert.ok(expanded.includes(`id="${id}"`), `${id} should be in settings`)
  }
  assert.ok(expanded.includes('8va'), 'octave should use a musical notation label')
  assert.ok(expanded.includes('>−</button>') && expanded.includes('>+</button>'), 'octave controls should use plus and minus')
  assert.ok(expanded.includes('>×</span>'), 'speed multiplier should use ×')
  assert.ok(expanded.includes('A–B 반복'), 'loop control should have a readable A–B label')
  assert.ok(/id="export_pdf"[^>]*>[\s\S]*?<svg[\s\S]*?PDF로 저장/.test(expanded), 'PDF export needs icon and label')
  const footer = html.slice(html.indexOf('<div id="footer">'), html.indexOf('</div>', html.indexOf('<div id="footer">')))
  assert.ok(footer.includes('id="app_version"'), 'version easter egg should move into the footer')
  for (const id of ['page_prev', 'page_next']) {
    assert.ok(new RegExp(`<button id="${id}"[^>]*aria-label="[^"]+"[^>]*><svg`).test(html), `${id} needs a labeled chevron icon`)
  }
})

test('PDF export changes its label while retaining the download icon', async () => {
  const label = { textContent: 'PDF로 저장' }
  const button = { disabled: false, iconPresent: true, querySelector: () => label,
    set textContent(_) { this.iconPresent = false }, get textContent() { return label.textContent } }
  const pdf = { addImage() {}, save() {} }
  const ctx = { scale() {}, fillRect() {}, save() {}, translate() {}, restore() {} }
  const context = {
    window: { _pageGeometry: { pagePositions: [{ x: 0, y: 0 }], pageCount: 1, pageWidth: 100, pageHeight: 140 },
      drawing: { draw() {} }, jspdf: { jsPDF: class { constructor() { return pdf } } }, __currentFile: 'test.nwc' },
    document: { getElementById: () => button, createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' }) },
    getLayoutMode: () => 'page', getPageOrientation: () => 'portrait', console, alert() {},
  }
  vm.createContext(context)
  const start = main.indexOf('async function exportPdf()')
  const end = main.indexOf('window.exportPdf = exportPdf', start)
  vm.runInContext(main.slice(start, end) + '\nthis.exportPdf = exportPdf', context)
  await context.exportPdf()
  assert.equal(button.iconPresent, true)
  assert.equal(label.textContent, 'PDF로 저장')
  assert.equal(button.disabled, false)
})

test('starting playback from the toolbar enters full view after unlocking audio', () => {
  const calls = []
  const playBtn = {}
  const context = {
    playBtn, preparingPlayback: false,
    playback: { playing: false, unlockAudio() { calls.push('unlock') } },
    togglePlayPause() { calls.push('toggle') },
    setFullscreenMode(on) { calls.push(['full', on]) },
  }
  vm.createContext(context)
  const start = main.indexOf('function handlePlayToggleGesture()')
  const end = main.indexOf('// Spacebar play/pause', start)
  vm.runInContext(main.slice(start, end), context)
  playBtn.onclick()
  assert.deepEqual(calls, ['unlock', 'toggle', ['full', true]])
  calls.length = 0
  context.playback.playing = true
  playBtn.onclick()
  assert.deepEqual(calls, ['toggle'])
})
