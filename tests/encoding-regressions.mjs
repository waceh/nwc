import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'
import { after, test } from 'node:test'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nwc-encoding-test-'))
fs.cpSync(new URL('../viewer/src/', import.meta.url), path.join(temp, 'src'), { recursive: true })
fs.cpSync(new URL('../viewer/lib/', import.meta.url), path.join(temp, 'lib'), { recursive: true })
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
after(() => fs.rmSync(temp, { recursive: true, force: true }))
const { parseNWC } = await import(pathToFileURL(path.join(temp, 'lib/nwc2xml/parser.js')))
const { toMusicXML } = await import(pathToFileURL(path.join(temp, 'lib/nwc2xml/writer.js')))
const { BinaryReader, decodeString } = await import(pathToFileURL(path.join(temp, 'lib/nwc2xml/reader.js')))
const { decodeNwcArrayBuffer, setUseNewParser } = await import(pathToFileURL(path.join(temp, 'src/nwc.js')))
const { interpret } = await import(pathToFileURL(path.join(temp, 'src/interpreter.js')))
const packed = fs.readFileSync(new URL("../viewer/samples/One Call Away - Dad's Harmony.nwc", import.meta.url))
const unpacked = inflateSync(packed.subarray(6))
const binaryHeader = unpacked.subarray(0, unpacked.indexOf('!NoteWorthyComposer'))
const template = '!NoteWorthyComposer(2.75)\n|SongInfo|Title:"TITLE"|Author:"AUTHOR"|Copyright1:"RIGHTS"\n|AddStaff|Name:"STAFF"\n|Lyric1|Text:"LYRICS"\n|Clef|Type:Treble\n|TimeSig|Signature:4/4\n|Note|Dur:4th|Pos:0\n|Note|Dur:4th|Pos:1\n|Note|Dur:4th|Pos:2\n|Note|Dur:4th|Pos:3\n!NoteWorthyComposer-End\n'
const encodings = {
  utf8: { title: Buffer.from('한글 악보'), lyrics: Buffer.from('한 글 가 사'), staff: Buffer.from('똠방각하') },
  cp949: { title: Buffer.from('c7d1b1db20bec7bab8', 'hex'), lyrics: Buffer.from('c7d120b1db20b0a120bbe7', 'hex'), staff: Buffer.from('8c63b9e6b0a2c7cf', 'hex') },
}
function fixture(encoding) {
  const fields = { TITLE: encoding.title, LYRICS: encoding.lyrics, STAFF: encoding.staff,
    AUTHOR: Buffer.from('Café', 'latin1'), RIGHTS: Buffer.from('© 2026', 'latin1') }
  return Buffer.concat(template.split(/(TITLE|LYRICS|STAFF|AUTHOR|RIGHTS)/).map(s => fields[s] || Buffer.from(s)))
}
function viewer(bytes, newParser) {
  setUseNewParser(newParser)
  const log = console.log
  console.log = () => {}
  try {
    const data = decodeNwcArrayBuffer(bytes)
    interpret(data)
    return data
  } finally { console.log = log }
}

for (const [encoding, fields] of Object.entries(encodings)) {
  for (const form of ['plain', 'embedded', 'compressed']) {
    test(`${encoding} Korean title, CP949 extended Hangul and lyrics survive ${form} import and MusicXML export`, () => {
      const text = fixture(fields)
      const embedded = Buffer.concat([binaryHeader, text])
      const input = form === 'plain' ? text : form === 'embedded' ? embedded : Buffer.concat([Buffer.from('[NWZ]\0'), deflateSync(embedded)])
      const file = parseNWC(input)
      assert.equal(file.title, '한글 악보')
      assert.equal(file.author, 'Café')
      assert.equal(file.copyright1, '© 2026')
      assert.equal(file.staffs[0].name, '똠방각하')
      assert.deepEqual(file.staffs[0].lyrics[0], ['한', '글', '가', '사'])
      const xml = toMusicXML(file)
      assert.match(xml, /<work-title>한글 악보<\/work-title>/)
      for (const syllable of ['한', '글', '가', '사']) assert.ok(xml.includes(`<text>${syllable}</text>`))
      assert.doesNotMatch(xml, /\ufffd/)
      for (const newParser of [true, false]) {
        // The legacy Node compressed path uses browser-only globals. Check
        // its decompressed payload; the shared decoder is the same in-browser.
        const data = viewer(form === 'compressed' && !newParser ? embedded : input, newParser)
        assert.deepEqual(data.score.staves[0].tokens.filter(t => t.type === 'Note').map(t => t.text), ['한', '글', '가', '사'])
      }
    })
  }
}

test('UTF-8 BOM and LF/CRLF plain NWCTXT work in both viewer parsers', () => {
  for (const newline of ['\n', '\r\n']) {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(template.replace(/\n/g, newline)
      .replace('TITLE', '한글 악보').replace('LYRICS', '한 글 가 사').replace('STAFF', '똠방각하'))])
    assert.equal(parseNWC(bytes).title, '한글 악보')
    for (const newParser of [true, false]) assert.deepEqual(viewer(bytes, newParser).score.staves[0].tokens
      .filter(t => t.type === 'Note').map(t => t.text), ['한', '글', '가', '사'])
  }
})

test('binary string reader preserves UTF-8, CP949 and Western strings', () => {
  for (const fields of Object.values(encodings)) {
    const reader = new BinaryReader(Buffer.concat([fields.title, Buffer.from([0]), fields.staff, Buffer.from([0])]))
    assert.equal(reader.readStringNul(), '한글 악보')
    assert.equal(reader.readStringNul(), '똠방각하')
  }
  assert.equal(decodeString(Buffer.from('Café ©', 'latin1')), 'Café ©')
})
