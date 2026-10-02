import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

const moduleURL = new URL('../viewer/src/sample-scores.js', import.meta.url)
const html = fs.readFileSync(new URL('../viewer/index.html', import.meta.url), 'utf8')

function picker(fetchScore) {
	class Element {
		constructor() { this.events = {}; this.children = []; this.hidden = false; this.open = false }
		addEventListener(type, handler) { this.events[type] = handler }
		append(child) { this.children.push(child) }
		focus() { this.focused = true }
		showModal() { this.open = true }
		close() { this.open = false; this.events.close?.() }
	}
	const elements = Object.fromEntries(['app_version', 'sample_scores_open', 'sample_scores_dialog',
		'sample_scores_list', 'sample_scores_status', 'sample_scores_close'].map(id => [id, new Element()]))
	elements.sample_scores_open.hidden = true
	let now = 0
	const opened = []
	const context = {
		document: { getElementById: id => elements[id], createElement: () => new Element() },
		performance: { now: () => now }, URL, AbortController,
		fetch: fetchScore, console: { error() {} },
	}
	vm.createContext(context)
	vm.runInContext(fs.readFileSync(moduleURL, 'utf8').replace('export function', 'function')
		.replace('import.meta.url', JSON.stringify(moduleURL.href)), context)
	context.initSampleScores((buffer, name) => opened.push({ buffer, name }))
	return { elements, opened, clickVersion(time) { now = time; elements.app_version.events.click() } }
}

test('sample button is initially hidden and requires five version clicks within three seconds', () => {
	assert.match(html, /id="sample_scores_open"[^>]*\bhidden\b/)
	const p = picker()
	for (const t of [0, 500, 1000, 1500]) p.clickVersion(t)
	assert.equal(p.elements.sample_scores_open.hidden, true)
	p.clickVersion(3001)
	assert.equal(p.elements.sample_scores_open.hidden, true)
	for (const t of [3500, 4000, 4500, 5000]) p.clickVersion(t)
	assert.equal(p.elements.sample_scores_open.hidden, false)
	assert.equal(p.elements.sample_scores_open.focused, true)
})

test('both sample choices load the exact packaged NWC and close the picker', async () => {
	const p = picker(async url => ({ ok: true, arrayBuffer: async () => {
		const bytes = fs.readFileSync(url)
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	} }))
	const buttons = p.elements.sample_scores_list.children.map(li => li.children[0])
	const hashes = {
		"One Call Away - Dad's Harmony.nwc": '6cb901f5366e893d16ede3b581f50984780d968167ce43e75b33a329929ada99',
		'the blenders-you.nwc': '1dfee3685b27c1cfbc4b00aa356a33b9e6e47e9d70aa6ad10bd57bf52116dd7f',
	}
	assert.equal(buttons.length, 2)
	for (const button of buttons) {
		p.elements.sample_scores_open.events.click()
		await button.events.click()
		assert.equal(p.elements.sample_scores_dialog.open, false)
		const { buffer, name } = p.opened.at(-1)
		assert.equal(createHash('sha256').update(Buffer.from(buffer)).digest('hex'), hashes[name])
		assert.equal(button.disabled, false)
	}
})

test('failed fetch shows an error and allows retry', async () => {
	const p = picker(async () => ({ ok: false, status: 404 }))
	p.elements.sample_scores_open.events.click()
	const button = p.elements.sample_scores_list.children[0].children[0]
	await button.events.click()
	assert.equal(p.opened.length, 0)
	assert.equal(p.elements.sample_scores_dialog.open, true)
	assert.match(p.elements.sample_scores_status.textContent, /다시 선택/)
	assert.equal(button.disabled, false)
})

test('closing during a fetch cancels loading without opening a score', async () => {
	let resolve
	const p = picker(() => new Promise(r => { resolve = r }))
	p.elements.sample_scores_open.events.click()
	const button = p.elements.sample_scores_list.children[0].children[0]
	const pending = button.events.click()
	p.elements.sample_scores_close.events.click()
	resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
	await pending
	assert.equal(p.opened.length, 0)
	assert.equal(button.disabled, false)
	assert.equal(p.elements.sample_scores_status.textContent, '')
})
