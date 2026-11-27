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
  const buttons = Object.fromEntries(['fullscreen_toggle', 'fullscreen_exit', 'menu_simple_toggle', 'menu_full_toggle'].map(id => [id, {}]))
  const context = {
    document: { body: { classList }, getElementById: id => buttons[id] ?? {}, addEventListener() {} },
    requestAnimationFrame: callback => callback(),
    resizeToFit() {}, getLayoutMode: () => 'page', getZoomFitMode: () => 'width', applyZoomFit() {},
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
    buttons.fullscreen_exit.onclick()
    assert.equal(classes.has('fullscreen-mode'), false)
  }
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
