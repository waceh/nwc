const STORAGE_KEY = 'nwc_viewer_settings'

const BOOLEAN_KEYS = [
	'autoScroll', 'autoPageTurn', 'countIn', 'startNote',
	'loopEnabled', 'focusPart', 'menuSimple',
]

const NUMBER_RANGES = {
	speed: [0.1, 4],
	volume: [0, 1.5],
	octave: [-2, 2],
	loopStart: [1, 9999],
	loopEnd: [1, 9999],
	lyricPart: [0, 99],
}

/** Read only recognized values so stale or damaged storage cannot break controls. */
export function readViewerSettings(storage) {
	let saved
	try {
		saved = JSON.parse(storage.getItem(STORAGE_KEY))
	} catch {
		return {}
	}
	if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}

	const settings = {}
	for (const key of BOOLEAN_KEYS) {
		if (typeof saved[key] === 'boolean') settings[key] = saved[key]
	}
	for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
		const value = saved[key]
		if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max &&
			(!['octave', 'loopStart', 'loopEnd', 'lyricPart'].includes(key) || Number.isInteger(value))) {
			settings[key] = value
		}
	}
	if (['all', 'guide', 'minus-one'].includes(saved.practiceMix)) settings.practiceMix = saved.practiceMix
	if (Array.isArray(saved.selectedParts)) {
		settings.selectedParts = [...new Set(saved.selectedParts.filter(index => Number.isInteger(index) && index >= 0 && index < 100))]
	}
	return settings
}

export function writeViewerSettings(storage, settings) {
	storage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
