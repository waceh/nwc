const SAMPLE_NAMES = [
	"One Call Away - Dad's Harmony.nwc",
	'the blenders-you.nwc',
]

/** Reveal the sample picker after five version clicks within three seconds. */
export function initSampleScores(openScore) {
	const version = document.getElementById('app_version')
	const trigger = document.getElementById('sample_scores_open')
	const dialog = document.getElementById('sample_scores_dialog')
	const list = document.getElementById('sample_scores_list')
	const status = document.getElementById('sample_scores_status')
	const close = document.getElementById('sample_scores_close')
	let clickCount = 0
	let firstClickTime = 0
	let request = null
	const buttons = []

	version.addEventListener('click', () => {
		if (!trigger.hidden) return
		const now = performance.now()
		if (clickCount === 0 || now - firstClickTime > 3000) {
			firstClickTime = now
			clickCount = 0
		}
		if (++clickCount === 5) {
			trigger.hidden = false
			trigger.focus()
		}
	})
	version.addEventListener('keydown', event => event.stopPropagation())
	trigger.addEventListener('keydown', event => event.stopPropagation())

	for (const name of SAMPLE_NAMES) {
		const item = document.createElement('li')
		const button = document.createElement('button')
		button.type = 'button'
		button.textContent = name.replace(/\.nwc$/i, '')
		buttons.push(button)
		item.append(button)
		list.append(item)
		button.addEventListener('click', async () => {
			if (request) return
			const controller = new AbortController()
			request = controller
			buttons.forEach(b => { b.disabled = true })
			status.textContent = '악보를 불러오는 중…'
			try {
				const url = new URL('../samples/' + encodeURIComponent(name), import.meta.url)
				const response = await fetch(url, { signal: controller.signal })
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				const payload = await response.arrayBuffer()
				if (controller.signal.aborted || !dialog.open) return
				openScore(payload, name)
				dialog.close()
			} catch (error) {
				if (controller.signal.aborted) return
				console.error('Failed to load sample score:', error)
				status.textContent = '악보를 불러오지 못했습니다. 다시 선택해 주세요.'
			} finally {
				if (request === controller) {
					request = null
					buttons.forEach(b => { b.disabled = false })
				}
			}
		})
	}

	trigger.addEventListener('click', () => {
		status.textContent = ''
		dialog.showModal()
	})
	close.addEventListener('click', () => dialog.close())
	dialog.addEventListener('close', () => {
		request?.abort()
		request = null
		buttons.forEach(b => { b.disabled = false })
		status.textContent = ''
		trigger.focus()
	})
	// Keep Space/Enter and Escape local to the picker instead of playback controls.
	dialog.addEventListener('keydown', event => event.stopPropagation())
}
