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
		blur() { this.focused = false }
		showModal() { this.open = true }
		close() { this.open = false; this.events.close?.() }
	}
	const elements = Object.fromEntries(['app_version', 'sample_scores_open', 'sample_scores_dialog',
		'sample_scores_list', 'sample_scores_status', 'sample_scores_close'].map(id => [id, new Element()]))
	elements.sample_scores_open.hidden = true
	let now = 0
	let plays = 0
	const opened = []
	const documentEvents = {}
	const context = {
		document: { getElementById: id => elements[id], createElement: () => new Element(),
			body: {}, addEventListener: (type, handler) => { documentEvents[type] = handler } },
		performance: { now: () => now }, URL, AbortController,
		fetch: fetchScore, console: { error() {} },
		handlePlayToggleGesture: () => { plays++ },
	}
	vm.createContext(context)
	vm.runInContext(fs.readFileSync(moduleURL, 'utf8').replace('export function', 'function')
		.replace('import.meta.url', JSON.stringify(moduleURL.href)), context)
	context.initSampleScores((buffer, name) => opened.push({ buffer, name }))
	const main = fs.readFileSync(new URL('../viewer/src/main.js', import.meta.url), 'utf8')
	const start = main.indexOf("document.addEventListener('keydown'", main.indexOf('// Spacebar play/pause'))
	vm.runInContext(main.slice(start, main.indexOf('\n})', start) + 3), context)
	return { elements, opened, plays: () => plays,
		pressSpace(target) {
			context.document.activeElement = target
			let stopped = false, prevented = false
			const event = { code: 'Space', stopPropagation() { stopped = true }, preventDefault() { prevented = true } }
			target.events.keydown?.(event)
			if (!stopped) documentEvents.keydown(event)
			if (!prevented) target.events.click?.()
		},
		clickVersion(time) { now = time; elements.app_version.events.click() } }
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
		"One Call Away - Dad's Harmony.nwc": '4580733cd2774f834055480caf565771abcf481eaafe5d5a4143ee7d13e9f15d',
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

test('Space after loading a sample starts playback instead of reopening the list', async () => {
	const p = picker(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
	p.elements.sample_scores_open.events.click()
	await p.elements.sample_scores_list.children[0].children[0].events.click()
	assert.equal(p.elements.sample_scores_open.focused, true)
	p.pressSpace(p.elements.sample_scores_open)
	assert.equal(p.plays(), 1)
	assert.equal(p.elements.sample_scores_dialog.open, false)
	assert.equal(p.elements.sample_scores_open.focused, false)
})

test('Space remains local to the open sample dialog', () => {
	const p = picker()
	p.elements.sample_scores_open.events.click()
	p.pressSpace(p.elements.sample_scores_dialog)
	assert.equal(p.plays(), 0)
})
