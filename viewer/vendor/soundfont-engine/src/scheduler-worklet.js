/**
 * AudioWorklet processor for background-tab-safe MIDI scheduling.
 *
 * Runs on the audio thread at audio-rate priority. Tracks playback position
 * using sample-accurate frame counting and posts noteOn, cc, and time
 * messages back to the main thread.
 *
 * This file must be loaded via audioContext.audioWorklet.addModule().
 */
class MidiClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.notes = [];
    this.ccEvents = [];
    this.playing = false;
    this.startFrame = 0;
    this.lapseFrames = 0;
    this.speed = 1;
    this.lastNoteIdx = -1;
    this.lastCCIdx = -1;
    this.activeNoteIndices = new Set();
    this.noteOffs = [];
    this.lastOffIdx = -1;

    this.port.onmessage = (e) => {
      const { type, data } = e.data;
      switch (type) {
        case 'load':
          this.playing = false;
          this.notes = data.notes;
          this.noteOffs = data.notes.map((note, index) => ({ index, time: note.time + (note.duration || 0), note })).sort((a, b) => a.time - b.time);
          this.lastOffIdx = -1;
          this.activeNoteIndices.clear();
          this.ccEvents = data.cc || [];
          this.lastNoteIdx = -1;
          this.lastCCIdx = -1;
          this.lapseFrames = 0;
          break;
        case 'play':
          if (this.playing) break;
          for (const index of this.activeNoteIndices) {
            this.port.postMessage({ type: 'noteOn', note: this.notes[index] });
          }
          this.playing = true;
          this.startFrame = currentFrame - this.lapseFrames / this.speed;
          break;
        case 'pause':
          this.playing = false;
          break;
        case 'seek':
          this.activeNoteIndices.clear();
          this.lapseFrames = data.time * sampleRate;
          this.startFrame = currentFrame - this.lapseFrames / this.speed;
          const nextNote = this.notes.findIndex(n => n.time >= data.time);
          const nextCC = this.ccEvents.findIndex(c => c.time >= data.time);
          const nextOff = this.noteOffs.findIndex(n => n.time >= data.time);
          this.lastNoteIdx = nextNote < 0 ? this.notes.length - 1 : nextNote - 1;
          this.lastCCIdx = nextCC < 0 ? this.ccEvents.length - 1 : nextCC - 1;
          this.lastOffIdx = nextOff < 0 ? this.noteOffs.length - 1 : nextOff - 1;
          break;
        case 'speed':
          this.speed = data.speed;
          this.startFrame = currentFrame - this.lapseFrames / this.speed;
          break;
      }
    };
  }

  process() {
    if (!this.playing || !this.notes.length) return true;

    this.lapseFrames = (currentFrame - this.startFrame) * this.speed;
    const lapse = this.lapseFrames / sampleRate;

    // Release notes using the same audio clock as note starts (including speed changes).
    for (let i = this.lastOffIdx + 1; i < this.noteOffs.length; i++) {
      const off = this.noteOffs[i];
      if (off.time > lapse) break;
      if (this.activeNoteIndices.delete(off.index)) {
        this.port.postMessage({ type: 'noteOff', note: off.note });
      }
      this.lastOffIdx = i;
    }

    // Dispatch only when due: the target plays immediately on receipt.
    for (let i = this.lastNoteIdx + 1; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (!note) break;
      if (note.time > lapse) break;
      if (note.time >= lapse - 0.02 && note.time + (note.duration || 0) > lapse) {
        this.activeNoteIndices.add(i);
        this.port.postMessage({ type: 'noteOn', note });
      }
      this.lastNoteIdx = i;
    }

    // Dispatch control changes when due.
    for (let i = this.lastCCIdx + 1; i < this.ccEvents.length; i++) {
      const cc = this.ccEvents[i];
      if (!cc) break;
      if (cc.time > lapse) break;
      if (cc.time >= lapse - 0.02) {
        this.port.postMessage({ type: 'cc', cc });
      }
      this.lastCCIdx = i;
    }

    // Post time update every ~50ms (2048 samples at 44.1kHz)
    if (currentFrame % 2048 < 128) {
      this.port.postMessage({ type: 'time', lapse });
    }

    return true;
  }
}

registerProcessor('midi-clock', MidiClockProcessor);
