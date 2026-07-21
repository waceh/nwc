import { BaseBackend } from './base.js';

/**
 * WavetablePiano backend - built-in piano using PeriodicWave synthesis.
 *
 * Zero dependencies, no WASM, no soundfont files needed. Ready to play
 * immediately. Uses wavetable data from Google Web Audio samples with
 * frequency-dependent harmonic attenuation, detuned stereo oscillators,
 * lowpass filtering, ADSR envelopes, and dynamics compression.
 *
 * Ideal as a lightweight fallback when no soundfont is loaded, or for
 * quick prototyping without external assets.
 *
 * Limitations:
 * - Piano timbre only (programChange is a no-op) — every channel plays the
 *   same piano sound, though voices are still tracked per channel so unison
 *   pitches across channels don't steal each other's note (see _noteKey())
 * - No controlChange or pitchBend support
 */
export class WavetablePianoBackend extends BaseBackend {
  constructor(options = {}) {
    super(options);
    this._activeNotes = new Map();
    this._waves = null;
    this._masterGain = null;
    this._compressor = null;

    // Piano wavetable coefficients (from Google Web Audio / musical.js)
    this._pianoReal = [
      0, 0, -0.203569, 0.5, -0.401676, 0.137128, -0.104117, 0.115965,
      -0.004413, 0.067884, -0.00888, 0.0793, -0.038756, 0.011882, -0.030883, 0.027608,
      -0.013429, 0.00393, -0.014029, 0.00972, -0.007653, 0.007866, -0.032029, 0.046127,
      -0.024155, 0.023095, -0.005522, 0.004511, -0.003593, 0.011248, -0.004919, 0.008505,
    ];
    this._pianoImag = [
      0, 0.147621, 0, 0.000007, -0.00001, 0.000005, -0.000006, 0.000009,
      0, 0.000008, -0.000001, 0.000014, -0.000008, 0.000003, -0.000009, 0.000009,
      -0.000005, 0.000002, -0.000007, 0.000005, -0.000005, 0.000005, -0.000023, 0.000037,
      -0.000021, 0.000022, -0.000006, 0.000005, -0.000004, 0.000014, -0.000007, 0.000012,
    ];

    // Harmonic attenuation multipliers for higher frequency ranges
    this._mult = [1, 1, 0.18, 0.016, 0.01, 0.01, 0.01, 0.004, 0.014, 0.02, 0.014, 0.004, 0.002, 0.00001];
    this._freqThresholds = [65, 80, 100, 135, 180, 240, 620, 1360];
  }

  get capabilities() {
    return { sf3: false, controlChange: false, pitchBend: false };
  }

  async _doInit() {
    const ctx = this.audioContext;

    // Build signal chain: masterGain -> compressor -> destination
    this._compressor = ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -10;
    this._compressor.ratio.value = 4;
    this._compressor.connect(ctx.destination);

    this._masterGain = ctx.createGain();
    this._masterGain.gain.value = 0.6;
    this._masterGain.connect(this._compressor);

    // Pre-build PeriodicWave variants for different frequency ranges
    this._waves = this._createWavetables(ctx);

    // Ready immediately - no soundfont needed. Other backends flip `ready`
    // and flush queued commands (see _flushPending()) from loadSoundFont()'s
    // success path; the wavetable backend never calls loadSoundFont(), so it
    // has to flush here instead or anything queued before this point (e.g.
    // setMasterVolume() called right after a soundfont-load failure swaps
    // the engine onto this backend) would sit in _pending forever.
    this.ready = true;
    this._flushPending();
  }

  async _doLoadSoundFont(_path, _data) {
    // No-op: wavetable piano doesn't use soundfonts.
    // Silently succeed so engine.loadSoundFont() doesn't throw.
  }

  _doNoteOn(midi, velocity, channel) {
    // Stop an already-sounding instance of this exact pitch on this exact
    // channel (a same-key re-strike). Keying only by `midi` (as this used
    // to) meant two different staves/channels hitting the same pitch at the
    // same time would steal-and-restart each other's voice every time —
    // audible as a stutter/click on unison chords or doubled octaves that
    // happen to share a pitch.
    const key = this._noteKey(midi, channel);
    if (this._activeNotes.has(key)) {
      this._doNoteOff(midi, channel);
    }

    const ctx = this.audioContext;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const t = ctx.currentTime;
    const wave = this._getWaveForFreq(freq);

    // ADSR parameters scaled by frequency
    const attack = 0.002;
    const decay = 0.25 * Math.pow(440 / freq, 0.7);
    const sustain = 0.03;
    const release = 0.15;
    const gain = velocity * 0.5;

    // Primary oscillator
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = freq;

    // Detuned second oscillator for stereo richness
    const osc2 = ctx.createOscillator();
    osc2.setPeriodicWave(wave);
    osc2.frequency.value = freq * 0.9994;

    // Lowpass filter, scaled proportionally to the fundamental so it never
    // cuts into the note itself — the previous `800 + freq * 0.1` was nearly
    // flat across the keyboard, so anything above ~A5 (freq > ~890Hz) had its
    // own fundamental sitting above the cutoff, leaving only a thin sliver of
    // the tone past the filter's rolloff. A gentler Q (~0.7, Butterworth-ish)
    // avoids a resonant peak at the cutoff, which reads as a metallic/bell
    // ring rather than a smooth string tone.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 4 + 400;
    filter.Q.value = 0.7;

    // Gain envelope
    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, t);
    noteGain.gain.linearRampToValueAtTime(gain, t + attack);
    noteGain.gain.setTargetAtTime(gain * sustain, t + attack, decay);

    // Connect: oscs -> filter -> noteGain -> masterGain
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this._masterGain);

    osc.start(t);
    osc2.start(t);

    this._activeNotes.set(key, { osc, osc2, noteGain, filter, release });
  }

  _doNoteOff(midi, channel) {
    const key = this._noteKey(midi, channel);
    const note = this._activeNotes.get(key);
    if (!note) return;

    const ctx = this.audioContext;
    const t = ctx.currentTime;

    // Release envelope
    note.noteGain.gain.cancelScheduledValues(t);
    note.noteGain.gain.setValueAtTime(note.noteGain.gain.value, t);
    note.noteGain.gain.linearRampToValueAtTime(0, t + note.release);

    note.osc.stop(t + note.release + 0.01);
    note.osc2.stop(t + note.release + 0.01);

    // Cleanup nodes after release
    setTimeout(() => {
      try {
        note.osc.disconnect();
        note.osc2.disconnect();
        note.filter.disconnect();
        note.noteGain.disconnect();
      } catch (_) { /* already disconnected */ }
    }, (note.release + 0.05) * 1000);

    this._activeNotes.delete(key);
  }

  _doProgramChange(_channel, _program) {
    // No-op: only piano timbre available
  }

  _doSetMasterVolume(value) {
    // Precise gain control, unlike the base class's CC7-per-channel default
    // (this backend has no per-channel controlChange support anyway).
    if (this._masterGain) this._masterGain.gain.value = value;
  }

  // Composite key so the same pitch sounding on two different channels
  // (e.g. two staves in unison) gets independent voices instead of one
  // stealing the other's.
  _noteKey(midi, channel) {
    return `${channel ?? 0}:${midi}`;
  }

  _doAllNotesOff(channel) {
    for (const key of this._activeNotes.keys()) {
      const [ch, midi] = key.split(':');
      if (channel !== undefined && +ch !== channel) continue;
      this._doNoteOff(+midi, +ch);
    }
  }

  _doAllSoundOff() {
    // Immediate silence: disconnect all notes without release
    for (const [, note] of this._activeNotes) {
      try {
        note.osc.stop();
        note.osc2.stop();
        note.osc.disconnect();
        note.osc2.disconnect();
        note.filter.disconnect();
        note.noteGain.disconnect();
      } catch (_) { /* already stopped */ }
    }
    this._activeNotes.clear();
  }

  _doDispose() {
    this._doAllSoundOff();
    if (this._masterGain) {
      this._masterGain.disconnect();
      this._masterGain = null;
    }
    if (this._compressor) {
      this._compressor.disconnect();
      this._compressor = null;
    }
    this._waves = null;
  }

  // --- Wavetable generation ---

  _createWavetables(ctx) {
    // Base wavetable from raw coefficients
    const waves = [
      ctx.createPeriodicWave(
        new Float32Array(this._pianoReal),
        new Float32Array(this._pianoImag),
      ),
    ];

    // Attenuated variants for higher frequency ranges
    for (let i = 0; i < this._freqThresholds.length; i++) {
      const amt = (i + 1) / this._freqThresholds.length;
      const real = new Float32Array(this._pianoReal.length);
      const imag = new Float32Array(this._pianoImag.length);

      for (let j = 0; j < this._pianoReal.length; j++) {
        const m = Math.log(this._mult[Math.min(j, this._mult.length - 1)]);
        real[j] = this._pianoReal[j] * Math.exp(amt * m);
        imag[j] = this._pianoImag[j] * Math.exp(amt * m);
      }
      waves.push(ctx.createPeriodicWave(real, imag));
    }

    return waves;
  }

  _getWaveForFreq(freq) {
    for (let i = 0; i < this._freqThresholds.length; i++) {
      if (freq < this._freqThresholds[i]) return this._waves[i];
    }
    return this._waves[this._waves.length - 1];
  }
}
