import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function highlighter() {
  let paints = 0;
  const context = {
    getFontSize: () => 28,
    window: { quickDraw: () => paints++ },
    buildTempoMap: () => [], ticksToSeconds: t => t,
    buildPlaybackSegments: () => [
      { startTick: 0, endTick: 4 }, { startTick: 0, endTick: 4 }, { startTick: 4, endTick: 8 },
    ],
  };
  vm.createContext(context);
  vm.runInContext(read('viewer/src/playback-highlight.js').replace(/^import .*$/gm, '')
    .replace('export class PlaybackHighlighter', 'this.Highlighter = class PlaybackHighlighter'), context);
  return { h: new context.Highlighter(null), paints: () => paints };
}

test('seek shows a frozen cursor immediately before playback', () => {
  const { h, paints } = highlighter();
  h.seek(8);
  assert.equal(h._currentTime, 8);
  assert.equal(h._paused, true);
  assert.equal(h._running, false);
  assert.equal(paints(), 1);
});

test('click after a repeat seeks to playback time and retains lower staff targets', () => {
  const { h } = highlighter();
  const tokens = y => [0, 2, 4, 6].map((tick, i) => ({
    type: 'Note', tickValue: tick, drawingNoteHead: { x: 10 + i * 20, y, _sysIdx: 0 },
  }));
  h.setScore({ score: { staves: [{ tokens: tokens(0) }, { tokens: tokens(200) }] } });
  assert.equal(h.getTimeAtPosition(50, 0), 8);
  assert.equal(h.getTimeAtPosition(50, 200), 8);
  assert.equal(h.getTimeAtPosition(10, 0), 0);
});

test('repeat cursor does not jump before the boundary', () => {
  const { h } = highlighter();
  h._timeIndex = [
    { time: 0, x: 100, y: 0, sysIdx: 0, segIdx: 0 },
    { time: 1, x: 10, y: 0, sysIdx: 0, segIdx: 1 },
  ];
  assert.equal(h._getCursorPosition(0.95).x, 100);
  assert.equal(h._getCursorPosition(1).x, 10);
});

function clock(notes) {
  const messages = [];
  const context = {
    currentFrame: 0, sampleRate: 1000,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: m => messages.push(m) }; } },
    registerProcessor: (_, processor) => { context.Clock = processor; },
  };
  vm.createContext(context);
  vm.runInContext(read('viewer/vendor/soundfont-engine/src/scheduler-worklet.js'), context);
  const processor = new context.Clock();
  const send = (type, data) => processor.port.onmessage({ data: { type, data } });
  send('load', { notes });
  return { processor, messages, send, frame: n => { context.currentFrame = n; processor.process(); } };
}

test('note onset is not early; release follows changed playback speed', () => {
  const c = clock([{ time: 1, duration: 1, midi: 60 }]);
  c.send('play'); c.frame(950);
  assert.equal(c.messages.filter(m => m.type === 'noteOn').length, 0);
  c.frame(1000);
  assert.equal(c.messages.filter(m => m.type === 'noteOn').length, 1);
  c.send('speed', { speed: 2 }); c.frame(1499);
  assert.equal(c.messages.filter(m => m.type === 'noteOff').length, 0);
  c.frame(1500);
  assert.equal(c.messages.filter(m => m.type === 'noteOff').length, 1);
});

test('seek beyond last onset does not replay notes or release notes skipped by seek', () => {
  const c = clock([{ time: 0, duration: 2, midi: 60 }, { time: 1, duration: 2, midi: 60 }]);
  c.send('seek', { time: 1 }); c.send('play'); c.frame(0);
  assert.equal(c.messages.filter(m => m.type === 'noteOn').length, 1);
  c.frame(1000);
  assert.equal(c.messages.filter(m => m.type === 'noteOff').length, 0);
  c.send('seek', { time: 4 }); c.frame(1001);
  assert.equal(c.messages.filter(m => m.type === 'noteOn').length, 1);
});

test('line breaks follow available width and explicit author breaks', () => {
  const source = read('viewer/src/layout/typeset.js');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function computeSystemBreaks('), source.indexOf('const REFLOW_THRESHOLD')), context);
  const boundaries = Array.from({ length: 8 }, (_, i) => ({ x: (i + 1) * 100, systemBreak: false }));
  const wide = context.computeSystemBreaks(boundaries, 600, 0);
  const narrow = context.computeSystemBreaks(boundaries, 300, 0);
  assert.ok(narrow.length > wide.length);
  boundaries[2].systemBreak = true;
  assert.equal(context.computeSystemBreaks(boundaries, 600, 0)[0].boundaryIndex, 2);
});

test('NWCTXT triplet start, middle, and end all use triplet duration for notes, rests, and chords', () => {
  const context = {};
  vm.createContext(context);
  const constants = read('viewer/lib/nwc2xml/constants.js').replace(/export /g, '');
  const parser = read('viewer/lib/nwc2xml/nwctxt-parser.js').replace(/^import .*$/gm, '').replace(/export /g, '');
  vm.runInContext(constants + '\n' + parser + '\nthis.classes = [NoteTxtObj, RestTxtObj, ChordTxtObj];', context);
  for (const Klass of context.classes) {
    for (const [mark, expected] of [['Triplet=First', 4], ['Triplet', 8], ['Triplet=End', 12]]) {
      const obj = new Klass(null);
      obj.parse(['Dur:4th,' + mark, 'Pos:0']);
      assert.equal(obj.getDurationType() & 12, expected);
      assert.equal(obj.getDurationTicks(3), 2);
    }
  }
});

test('the blenders-you sample stays aligned across all 127 barlines', async () => {
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const temp = fs.mkdtempSync(join(tmpdir(), 'nwc-regression-'));
  const originalLog = console.log;
  try {
    fs.cpSync(new URL('../viewer/src/', import.meta.url), join(temp, 'src'), { recursive: true });
    fs.cpSync(new URL('../viewer/lib/', import.meta.url), join(temp, 'lib'), { recursive: true });
    fs.writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
    const { decodeNwcArrayBuffer } = await import(pathToFileURL(join(temp, 'src/nwc.js')));
    const { interpret } = await import(pathToFileURL(join(temp, 'src/interpreter.js')));
    console.log = () => {};
    const data = decodeNwcArrayBuffer(fs.readFileSync(new URL('../nwc/the blenders-you.nwc', import.meta.url)));
    interpret(data);
    const bars = data.score.staves.map(s => s.tokens.filter(t => t.type === 'Barline'));
    assert.equal(bars[0].length, 127);
    for (let staff = 1; staff < bars.length; staff++) {
      assert.equal(bars[staff].length, bars[0].length);
      for (let i = 0; i < bars[0].length; i++) {
        assert.ok(Math.abs(bars[staff][i].tickValue - bars[0][i].tickValue) < 1e-9,
          `Staff ${staff + 1}, bar ${i + 1} drifted`);
      }
    }
  } finally {
    console.log = originalLog;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
