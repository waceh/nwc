// NWCTXT Parser for NWC 2.75+ files
import { staffProperties } from './text-properties.js';
import { NWCFile, NWCStaff } from './parser.js';
import { ObjType, Accidental, NoteAttr, DurationType } from './constants.js';

// Extract everything after the first colon in a field string.
// Using indexOf instead of split(':')[1] to correctly handle values that
// contain colons (e.g. URLs in copyright fields, tempo text, etc.).
function fieldValue(f) {
  const idx = f.indexOf(':');
  return idx === -1 ? '' : f.substring(idx + 1);
}

// NWCTXT backslash-escapes quote and backslash characters inside quoted
// string fields (e.g. Title:"Dad\'s Harmony" for a literal apostrophe) —
// unescape after stripping the surrounding quotes.
export function unescapeNwcString(s) {
  return s.replace(/\\(.)/g, '$1');
}

// Strip surrounding quotes from a field value and unescape its contents.
function quotedFieldValue(f) {
  return unescapeNwcString(fieldValue(f).replace(/^"|"$/g, ''));
}

// Parse NWC lyric text into a flat syllable array for the MusicXML writer.
// NWC format: "word1 syl-la-ble _ next-word"
//   - spaces separate tokens
//   - hyphens split syllables within a word; continuation syllables get "-" prefix
//   - "_" = melisma (extend previous syllable; writer will skip this slot)
//   - "\n" (literal backslash-n) = phrase separator, treated as space
function parseLyricText(raw) {
  const text = unescapeNwcString(
    raw
      .replace(/^"|"$/g, '')   // strip surrounding quotes
      .replace(/\\n/g, ' ')    // literal \n → space (before generic unescape below)
      .replace(/\n/g, ' ')     // real newline → space
  );

  const syllables = [];
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    if (token === '_') { syllables.push('_'); continue; }
    if (/^-+$/.test(token)) { syllables.push('-'); continue; }
    const parts = token.split('-');
    if (parts[0]) syllables.push(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      if (parts[i]) syllables.push('-' + parts[i]);
    }
  }
  return syllables;
}

class NWCTxtObj {
  constructor(type, staff) { this.type = type; this.staff = staff; this.children = []; }
  getLyricSyllable() { return this.lyricSyllable || 0; }
}

class ClefTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Clef, s); this.clefType = 0; this.octaveShift = 0; }
  parse(fields) {
    const types = { Treble: 0, Bass: 1, Alto: 2, Tenor: 3, Percussion: 4 };
    for (const f of fields) {
      if (f.startsWith('Type:')) this.clefType = types[fieldValue(f)] || 0;
      if (f.startsWith('OctaveShift:')) {
        const v = fieldValue(f);
        this.octaveShift = v.includes('Down') ? -1 : v.includes('Up') ? 1 : 0;
      }
    }
  }
}

class KeySigTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.KeySig, s); this.sharp = 0; this.flat = 0; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Signature:')) {
        const sig = fieldValue(f);
        this.sharp = (sig.match(/#/g) || []).length;
        this.flat = (sig.match(/b/g) || []).length;
      }
    }
  }
  getFifths() { return this.sharp - this.flat; }
  getChromAlter() {
    const ca = new Array(7).fill(0);
    const sharpOrder = [5, 2, 6, 3, 0, 4, 1]; // F C G D A E B → indices in [A,B,C,D,E,F,G]
    const flatOrder  = [1, 4, 0, 3, 6, 2, 5]; // B E A D G C F → indices in [A,B,C,D,E,F,G]
    for (let i = 0; i < this.sharp; i++) ca[sharpOrder[i]] = 1;
    for (let i = 0; i < this.flat; i++) ca[flatOrder[i]] = -1;
    return ca;
  }
}

class TimeSigTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.TimeSig, s); this.beats = 4; this.beatValue = 4; this.style = 0; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Signature:')) {
        const sig = fieldValue(f);
        if (sig === 'Common') { this.beats = 4; this.beatValue = 4; this.style = 1; }
        else if (sig === 'AllaBreve') { this.beats = 2; this.beatValue = 2; this.style = 2; }
        else {
          const m = sig.match(/(\d+)\/(\d+)/);
          if (m) { this.beats = parseInt(m[1]); this.beatValue = parseInt(m[2]); }
        }
      }
    }
  }
  getBeatType() { return this.beatValue; }
}

class BarLineTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.BarLine, s); this.style = 0; this.repeatCount = 2; this._sysBreak = false; }
  parse(fields) {
    const styles = { Single: 0, Double: 1, SectionOpen: 2, SectionClose: 3, LocalRepeatOpen: 4, LocalRepeatClose: 5, MasterRepeatOpen: 6, MasterRepeatClose: 7 };
    for (const f of fields) {
      if (f.startsWith('Style:')) this.style = styles[fieldValue(f).replace(/\s/g, '')] || 0;
      if (f.startsWith('Repeat:')) this.repeatCount = parseInt(fieldValue(f)) || 2;
      if (f.startsWith('SysBreak:') && fieldValue(f) === 'Y') this._sysBreak = true;
    }
  }
  getStyle() { return this.style; }
  systemBreak() { return this._sysBreak; }
}

const DUR_MAP = { Whole: 0, Half: 1, '4th': 2, '8th': 3, '16th': 4, '32nd': 5, '64th': 6 };

class NoteTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Note, s); this.duration = 2; this.pos = 0; this.accidental = Accidental.Normal; this.dots = 0; this.attr = 0; this.durationAttr = 0; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Dur:')) {
        const parts = fieldValue(f).split(',');
        this.duration = DUR_MAP[parts[0]] ?? 2;
        for (const p of parts) {
          if (p === 'Dotted') this.dots = 1;
          if (p === 'DblDotted') this.dots = 2;
          if (p === 'Triplet=First') this.durationAttr |= DurationType.TriStart;
          else if (p === 'Triplet=End') this.durationAttr |= DurationType.TriStop;
          else if (p === 'Triplet') this.durationAttr |= DurationType.TriCont;
          if (p === 'Slur') this.attr |= NoteAttr.SlurBeg;
          if (p === 'Grace') this.attr |= NoteAttr.Grace;
        }
      }
      if (f.startsWith('Pos:')) {
        const pos = fieldValue(f).split(',')[0];
        const m = pos.match(/([#bnxv]?)(-?\d+)/);
        if (m) {
          // Negate to match binary parser convention (adapter will negate back)
          this.pos = -parseInt(m[2]);
          const acc = { '#': Accidental.Sharp, 'b': Accidental.Flat, 'n': Accidental.Natural, 'x': Accidental.SharpSharp, 'v': Accidental.FlatFlat };
          this.accidental = acc[m[1]] ?? Accidental.Normal;
        }
        // A trailing "^" on the Pos field marks a tie starting at this note
        // (NWCTXT convention — distinct from the "Opts:Tie" flag below, which
        // this format doesn't actually use). Without this, ties encoded this
        // way went undetected: the tied continuation note was treated as a
        // fresh note and wrongly consumed a lyric syllable, drifting every
        // later syllable in the line onto the wrong (earlier) note.
        if (pos.endsWith('^')) this.attr |= NoteAttr.TieBeg;
      }
      if (f.startsWith('Opts:')) {
        const opts = fieldValue(f);
        if (opts.includes('Tie')) this.attr |= NoteAttr.TieBeg;
        if (opts.includes('Accent')) this.attr |= NoteAttr.Accent;
        if (opts.includes('Staccato') && !opts.includes('Staccatissimo')) this.attr |= NoteAttr.Staccato;
        if (opts.includes('Staccatissimo')) this.attr |= NoteAttr.Staccatissimo;
        if (opts.includes('Tenuto')) this.attr |= NoteAttr.Tenuto;
        if (opts.includes('Marcato')) this.attr |= NoteAttr.Marcato;
        if (opts.includes('Sforzando')) this.attr |= NoteAttr.Sforzando;
        if (opts.includes('Fermata')) this.attr |= NoteAttr.Fermata;
        if (opts.includes('Beam=First')) this.attr |= NoteAttr.BeamBeg;
        if (opts.includes('Beam=End')) this.attr |= NoteAttr.BeamEnd;
        if (opts.includes('Beam=Middle') || opts.split(',').includes('Beam')) this.attr |= NoteAttr.BeamMid;
        if (opts.includes('Stem=Up')) this.attr |= NoteAttr.StemUp;
        if (opts.includes('Stem=Down')) this.attr |= NoteAttr.StemDown;
      }
    }
  }
  getDuration() { return this.duration; }
  getDurationType() {
    let dt = this.durationAttr & DurationType.Triplet;
    if (this.dots === 2) dt |= DurationType.DotDot;
    else if (this.dots === 1) dt |= DurationType.Dot;
    return dt;
  }
  getDurationTicks(div) {
    let d = div / (1 << this.duration);
    const dt = this.getDurationType();
    if (dt & DurationType.DotDot) d *= 7 / 4;
    else if (dt & DurationType.Dot) d += d / 2;
    if (dt & DurationType.Triplet) d = d * 2 / 3;
    return Math.round(d * 4);
  }
  getDivision() {
    let d = 1 << this.duration;
    if (this.dots === 2) d <<= 2;
    else if (this.dots === 1) d <<= 1;
    if (this.durationAttr & DurationType.Triplet) d = (d % 2) ? d * 3 : (d / 2) * 3;
    return d;
  }
  getAccidental() { return this.accidental; }
  getAttributes() { return this.attr; }
  getOctaveStep(clefShift, measureAlter) {
    const p = clefShift + this.pos;
    const octave = Math.floor((4 * 7 - p + 6) / 7);
    const stepIdx = ((4 * 7 - p + 1) % 7 + 7) % 7;
    const step = String.fromCharCode(65 + stepIdx);
    const acc = this.accidental;
    let alter;
    if (acc <= Accidental.FlatFlat) {
      alter = [1, -1, 0, 2, -2][acc];
      measureAlter[stepIdx] = alter;
    } else {
      alter = this.tiedAlter ?? measureAlter[stepIdx];
    }
    return { octave, step, alter };
  }
}

class RestTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Rest, s); this.duration = 2; this.dots = 0; this.attr = 0; this.offset = 0; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Dur:')) {
        const parts = fieldValue(f).split(',');
        this.duration = DUR_MAP[parts[0]] ?? 2;
        for (const p of parts) {
          if (p === 'Dotted') this.dots = 1;
          if (p === 'DblDotted') this.dots = 2;
          if (p === 'Triplet=First') this.attr |= DurationType.TriStart;
          else if (p === 'Triplet=End') this.attr |= DurationType.TriStop;
          else if (p === 'Triplet') this.attr |= DurationType.TriCont;
        }
      }
      if (f.startsWith('Offset:')) this.offset = parseInt(fieldValue(f)) || 0;
    }
  }
  getDuration() { return this.duration; }
  getDurationType() {
    let dt = this.attr & DurationType.Triplet;
    if (this.dots === 2) dt |= DurationType.DotDot;
    else if (this.dots === 1) dt |= DurationType.Dot;
    return dt;
  }
  getDurationTicks(div) {
    let d = div / (1 << this.duration);
    const dt = this.getDurationType();
    if (dt & DurationType.DotDot) d *= 7 / 4;
    else if (dt & DurationType.Dot) d += d / 2;
    if (dt & DurationType.Triplet) d = d * 2 / 3;
    return Math.round(d * 4);
  }
  getDivision() {
    let d = 1 << this.duration;
    if (this.dots === 2) d <<= 2;
    else if (this.dots === 1) d <<= 1;
    if (this.attr & DurationType.Triplet) d = (d % 2) ? d * 3 : (d / 2) * 3;
    return d;
  }
  getOctaveStep(clefShift) { return { octave: 4, step: 'B', hasPos: this.offset !== 0 }; }
}

// RestChord advances by Dur while its sounding voice uses Dur2 / Pos2.
class RestChordTxtObj extends RestTxtObj {
  getDivision() { return this.rest.getDivision(); }
  getDurationType() { return this.rest.getDurationType(); }
  getAttributes() { return this.attr; }
  constructor(s) { super(s); this.type = ObjType.RestCM; }
  parse(fields) {
    super.parse(fields);
    const chord = new ChordTxtObj(this.staff);
    chord.parse(fields.filter(f => !f.startsWith('Dur:') && !f.startsWith('Pos:'))
      .map(f => f.startsWith('Dur2:') ? f.replace('Dur2:', 'Dur:')
        : f.startsWith('Pos2:') ? f.replace('Pos2:', 'Pos:') : f));
    this.children = chord.children;
    this.attr = chord.attr;
    this.count = this.children.length;
    this.rest = new RestTxtObj(this.staff);
    this.rest.parse(fields);
  }
}

class ChordTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.NoteCM, s); this.duration = 2; this.dots = 0; this.attr = 0; this.durationAttr = 0; this.pos = 0; this.accidental = Accidental.Normal; this.children = []; this.count = 0; }
  parse(fields) {
    const common = fields.filter(f => !/^(Dur2?|Pos2?):/.test(f));
    for (const voice of [1, 2]) {
      const suffix = voice === 1 ? '' : '2';
      const positions = fields.find(f => f.startsWith(`Pos${suffix}:`));
      if (!positions) continue;
      const duration = fields.find(f => f.startsWith(`Dur${suffix}:`)) || 'Dur:4th';
      for (const position of fieldValue(positions).split(',')) {
        if (!/([#bnxv]?)(-?\d+)/.test(position)) continue;
        const child = new NoteTxtObj(this.staff);
        child.parse([...common, `Dur:${fieldValue(duration)}`, `Pos:${position}`]);
        child.voice = voice;
        if (voice === 2) {
          const stem = child.attr & NoteAttr.StemMask;
          child.attr = (child.attr & ~(NoteAttr.StemMask | NoteAttr.BeamMask))
            | (stem === NoteAttr.StemUp ? NoteAttr.StemDown : stem === NoteAttr.StemDown ? NoteAttr.StemUp : 0);
        }
        this.children.push(child);
      }
    }
    this.count = this.children.length;
    const first = this.children[0];
    if (first) {
      this.duration = first.duration; this.dots = first.dots; this.durationAttr = first.durationAttr;
      this.pos = first.pos; this.accidental = first.accidental;
      this.attr = first.attr;
      if (this.children.some(n => n.attr & NoteAttr.TieBeg)) this.attr |= NoteAttr.TieBeg;
    }
  }
  getDuration() { return this.duration; }
  getDurationType() {
    let dt = this.durationAttr & DurationType.Triplet;
    if (this.dots === 2) dt |= DurationType.DotDot;
    else if (this.dots === 1) dt |= DurationType.Dot;
    return dt;
  }
  getDurationTicks(div) {
    let d = div / (1 << this.duration);
    const dt = this.getDurationType();
    if (dt & DurationType.DotDot) d *= 7 / 4;
    else if (dt & DurationType.Dot) d += d / 2;
    if (dt & DurationType.Triplet) d = d * 2 / 3;
    return Math.round(d * 4);
  }
  getDivision() {
    let d = 1 << this.duration;
    if (this.dots === 2) d <<= 2;
    else if (this.dots === 1) d <<= 1;
    if (this.durationAttr & DurationType.Triplet) d = (d % 2) ? d * 3 : (d / 2) * 3;
    return d;
  }
  getAccidental() { return this.accidental; }
  getAttributes() { return this.attr; }
  getOctaveStep(clefShift, measureAlter) {
    const p = clefShift + this.pos;
    const octave = Math.floor((4 * 7 - p + 6) / 7);
    const stepIdx = ((4 * 7 - p + 1) % 7 + 7) % 7;
    const step = String.fromCharCode(65 + stepIdx);
    const acc = this.accidental;
    let alter;
    if (acc <= Accidental.FlatFlat) {
      alter = [1, -1, 0, 2, -2][acc];
      measureAlter[stepIdx] = alter;
    } else {
      alter = measureAlter[stepIdx];
    }
    return { octave, step, alter };
  }
}

class TempoTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Tempo, s); this.value = 120; this.base = 2; this.text = ''; this.dotted = false; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Tempo:')) this.value = parseInt(fieldValue(f)) || 120;
      if (f.startsWith('Base:')) {
        const b = fieldValue(f);
        if (b.includes('Dotted')) this.dotted = true;
        if (b.includes('Eighth')) this.base = 3;
        else if (b.includes('Half')) this.base = 1;
        else this.base = 2;
      }
      if (f.startsWith('Text:')) this.text = quotedFieldValue(f);
    }
  }
  getTempoNote() { return ['half', 'half', 'quarter', 'eighth'][this.base] || 'quarter'; }
  isDotted() { return this.dotted; }
  getSpeed() { return this.value; }
}

class DynamicTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Dynamic, s); this.style = 4; }
  parse(fields) {
    const styles = { ppp: 0, pp: 1, p: 2, mp: 3, mf: 4, f: 5, ff: 6, fff: 7 };
    for (const f of fields) {
      if (f.startsWith('Style:')) this.style = styles[fieldValue(f)] ?? 4;
    }
  }
  getStyleName() { return ['ppp','pp','p','mp','mf','f','ff','fff'][this.style] || 'mf'; }
}

class TextTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Text, s); this.text = ''; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Text:')) {
        const t = f.substring(5);
        this.text = t.startsWith('"') && t.endsWith('"') ? unescapeNwcString(t.slice(1, -1)) : t;
      }
    }
  }
}

class EndingTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.Ending, s); this.style = 0; }
  parse(fields) {
    for (const f of fields) {
      if (f.startsWith('Endings:')) {
        const e = fieldValue(f);
        for (const number of e.split(',')) {
          const n = Number(number);
          if (Number.isInteger(n) && n >= 1 && n <= 7) this.style |= 1 << (n - 1);
          if (number === 'D') this.style |= 0x80;
        }
      }
    }
  }
}

class FlowTxtObj extends NWCTxtObj {
  constructor(s) { super(ObjType.FlowDir, s); this.style = 0; }
  parse(fields) {
    const styles = { Coda: 0, Segno: 1, Fine: 2, ToCoda: 3, DaCapo: 4, DCAlCoda: 5, DCAlFine: 6, DalSegno: 7, DSAlCoda: 8, DSAlFine: 9 };
    for (const f of fields) {
      if (f.startsWith('Style:')) this.style = styles[fieldValue(f).replace(/ /g, '')] ?? 0;
    }
  }
}

export function parseNWCTxt(text) {
  const file = new NWCFile();
  file.version = 0x024B;
  let staff = null;
  
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#') || line.trim() === '') continue;
    if (line.startsWith('!NoteWorthyComposer-End')) break;
    
    if (line.startsWith('|')) {
      const parts = line.split('|').filter(p => p);
      if (parts.length === 0) continue;
      const type = parts[0];
      const fields = parts.slice(1);
      
      if (type === 'SongInfo') {
        for (const f of fields) {
          if (f.startsWith('Title:')) file.title = quotedFieldValue(f);
          if (f.startsWith('Author:')) file.author = quotedFieldValue(f);
          if (f.startsWith('Lyricist:')) file.lyricist = quotedFieldValue(f);
          if (f.startsWith('Copyright1:')) file.copyright1 = quotedFieldValue(f);
          if (f.startsWith('Copyright2:')) file.copyright2 = quotedFieldValue(f);
        }
      } else if (type === 'PgSetup') {
        file.pgSetup = Object.fromEntries(fields.map(f => [f.slice(0, f.indexOf(':')), fieldValue(f)]));
        file.measureStart = Number(file.pgSetup.StartingBar) || 1;
        file.allowLayering = file.pgSetup.AllowLayering !== 'N';
      } else if (type === 'AddStaff') {
        staff = new NWCStaff(file);
        file.staffs.push(staff);
        for (const f of fields) {
          if (f.startsWith('Name:')) staff.name = quotedFieldValue(f);
          if (f.startsWith('Label:')) staff.label = quotedFieldValue(f);
          if (f.startsWith('Group:')) staff.group = quotedFieldValue(f);
        }
      } else if (type === 'StaffProperties' && staff) {
        Object.assign(staff, staffProperties(fields));
      } else if (type === 'StaffInstrument' && staff) {
        for (const f of fields) {
          if (f.startsWith('Patch:')) staff.patchName = parseInt(fieldValue(f)) || 0;
          if (f.startsWith('Trans:')) staff.transposition = parseInt(fieldValue(f)) || 0;
        }
      } else if (/^Lyric\d+$/.test(type) && staff) {
        const verseIdx = parseInt(type.replace('Lyric', '')) - 1;
        for (const f of fields) {
          if (f.startsWith('Text:')) {
            staff.lyrics[verseIdx] = parseLyricText(fieldValue(f));
          }
        }
      } else if (staff) {
        let obj = null;
        if (type === 'Clef') obj = new ClefTxtObj(staff);
        else if (type === 'Key') obj = new KeySigTxtObj(staff);
        else if (type === 'TimeSig') obj = new TimeSigTxtObj(staff);
        else if (type === 'Bar') obj = new BarLineTxtObj(staff);
        else if (type === 'Note') obj = new NoteTxtObj(staff);
        else if (type === 'Rest') obj = new RestTxtObj(staff);
        else if (type === 'Chord') obj = new ChordTxtObj(staff);
        else if (type === 'RestChord') obj = new RestChordTxtObj(staff);
        else if (type === 'Tempo') obj = new TempoTxtObj(staff);
        else if (type === 'Dynamic') obj = new DynamicTxtObj(staff);
        else if (type === 'Text') obj = new TextTxtObj(staff);
        else if (type === 'Ending') obj = new EndingTxtObj(staff);
        else if (type === 'Flow') obj = new FlowTxtObj(staff);
        
        if (obj) {
          obj.parse(fields);
          const opts = fields.find(f => f.startsWith('Opts:'));
          const lyric = opts && fieldValue(opts).split(',').find(o => o.startsWith('Lyric='));
          obj.lyricSyllable = lyric === 'Lyric=Always' ? 1 : lyric === 'Lyric=Never' ? 2 : 0;
          for (const child of obj.children) child.lyricSyllable = obj.lyricSyllable;
          staff.objects.push(obj);
        }
      }
    }
  }

  for (const s of file.staffs) {
    resolveTies(s.objects, s.getDivisions());
    resolveSlurs(s.objects);
  }

  return file;
}

// NWCTXT Dur:Slur marks an outgoing connection, not a complete start/end
// state. Mark the receiving note too, so it shares the previous syllable.
// Chord children must carry the same state because the viewer adapts them.
function resolveSlurs(objects) {
  let pendingSlur = false;
  for (const obj of objects) {
    if (obj.type === ObjType.Rest) {
      pendingSlur = false;
      continue;
    }
    if (obj.type !== ObjType.Note && obj.type !== ObjType.NoteCM && obj.type !== ObjType.RestCM) continue;
    const outgoing = !!(obj.getAttributes() & NoteAttr.SlurBeg);
    const state = pendingSlur
      ? (outgoing ? NoteAttr.SlurMid : NoteAttr.SlurEnd)
      : (outgoing ? NoteAttr.SlurBeg : 0);
    obj.attr = (obj.attr & ~NoteAttr.SlurMask) | state;
    for (const child of obj.children) child.attr = (child.attr & ~NoteAttr.SlurMask) | state;
    pendingSlur = outgoing;
  }
}

// Match receiving notes by staff position, keeping independent chord voices.
function resolveTies(objects, divisions) {
  const pending = new Map();
  let time = 0, offset = 34, keyAlter = new Array(7).fill(0);
  const running = new Map();
  for (const obj of objects) {
    if (obj.type === ObjType.Clef) {
      offset = [34, 22, 28, 26, 22][obj.clefType] ?? 34;
      offset += obj.octaveShift === 1 ? 7 : obj.octaveShift === 2 ? -7 : 0;
    }
    if (obj.type === ObjType.KeySig) keyAlter = obj.getChromAlter();
    if (obj.type === ObjType.BarLine) running.clear();
    if (![ObjType.Note, ObjType.NoteCM, ObjType.RestCM].includes(obj.type)) {
      if (obj.getDurationTicks) time += obj.getDurationTicks(divisions);
      continue;
    }
    const notes = obj.type === ObjType.Note ? [obj] : obj.children;
    for (const note of notes) {
      const pitch = offset - note.pos;
      const previous = pending.get(pitch);
      const explicit = note.accidental !== Accidental.Normal;
      const letter = 'CDEFGAB'[((pitch % 7) + 7) % 7];
      let alter = explicit ? [1, -1, 0, 2, -2][note.accidental]
        : running.get(pitch) ?? keyAlter[letter.charCodeAt(0) - 65];
      if (previous && previous.until === time && (!explicit || previous.alter === alter)) {
        note.attr |= NoteAttr.TieEnd;
        if (!explicit) { alter = previous.alter; note.tiedAlter = alter; }
      }
      if (explicit) running.set(pitch, alter);
      pending.delete(pitch);
      if (note.attr & NoteAttr.TieBeg) pending.set(pitch, { alter, until: time + note.getDurationTicks(divisions) });
    }
    if (obj.type !== ObjType.Note) {
      obj.attr = (obj.attr & ~(NoteAttr.TieBeg | NoteAttr.TieEnd))
        | (notes.some(n => n.attr & NoteAttr.TieBeg) ? NoteAttr.TieBeg : 0)
        | (notes.some(n => n.attr & NoteAttr.TieEnd) ? NoteAttr.TieEnd : 0);
    }
    time += obj.getDurationTicks(divisions);
  }
}
