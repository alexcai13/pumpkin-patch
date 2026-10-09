/**
 * SOUND: chiptune music + sound effects, all synthesized with the Web Audio
 * API (no audio files). If you add real audio files later, this is the one
 * place to change.
 *
 * Browsers only allow audio after the player clicks or presses a key, so the
 * audio engine starts on the first input (see `unlock`).
 *
 * Usage anywhere:  Sound.play("pickup")
 */
export type SfxName =
  | "pickup" | "drop" | "ticket" | "pop" | "toast" | "beep" | "go" | "win"
  | "roll" | "pins" | "whoosh" | "splash" | "shutter" | "caw" | "coin" | "click";

const STORAGE_KEY = "pumpkin-patch-muted";

/** Notes as frequencies (Hz). */
const N: Record<string, number> = {};
["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].forEach((name, i) => {
  for (let octave = 2; octave <= 6; octave++) N[`${name}${octave}`] = 440 * Math.pow(2, (i - 9) / 12 + (octave - 4));
});

/**
 * The background tune: a calm, folksy loop in C major.
 * Each bar = one chord; the arpeggio, bass and melody follow it.
 * Edit `MELODY` (one note per beat, "-" = rest) to change the tune.
 */
const BPM = 88;
const CHORDS = [["C3", "E3", "G3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"], ["G2", "B2", "D3"],
                ["C3", "E3", "G3"], ["F2", "A2", "C3"], ["G2", "B2", "D3"], ["C3", "E3", "G3"]];
const MELODY = [
  "E5", "-", "G5", "E5", "D5", "-", "C5", "-",
  "C5", "-", "E5", "-", "A4", "-", "-", "-",
  "F4", "A4", "C5", "-", "A4", "-", "G4", "-",
  "G4", "-", "B4", "D5", "-", "-", "-", "-",
  "E5", "-", "G5", "-", "C6", "-", "G5", "-",
  "F5", "-", "E5", "D5", "C5", "-", "A4", "-",
  "B4", "-", "D5", "-", "G4", "-", "B4", "-",
  "C5", "-", "-", "-", "-", "-", "-", "-",
];

class SoundManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private sfx?: GainNode;
  private noise?: AudioBuffer;
  private nextBeatTime = 0;
  private beat = 0;
  muted: boolean;

  constructor() {
    let muted = false;
    try { muted = localStorage.getItem(STORAGE_KEY) === "1"; } catch { /* storage blocked */ }
    this.muted = muted;
    // Start audio on the very first click / key press anywhere.
    const unlock = () => this.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  /** Create the audio engine (must happen after a user gesture). */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.55;
    this.sfx.connect(this.master);
    // One second of white noise, reused for hats, splashes, shutters...
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try { localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  toggleMute() { this.setMuted(!this.muted); }

  // ---------------------------------------------------------------- building blocks

  /** One synth note with a soft attack and decay. */
  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, out: AudioNode, slideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** A burst of filtered noise (shakers, splashes, clicks). */
  private noiseBurst(start: number, dur: number, vol: number, filterFreq: number, out: AudioNode, type: BiquadFilterType = "highpass") {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(gain).connect(out);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  // ---------------------------------------------------------------- music

  /**
   * A tiny sequencer: every 50 ms, schedule any eighth-notes due in the next
   * 0.2 s. Scheduling slightly ahead keeps the rhythm steady even if the
   * game stutters.
   */
  private startMusic() {
    const ctx = this.ctx!;
    this.nextBeatTime = ctx.currentTime + 0.1;
    const eighth = 60 / BPM / 2;
    window.setInterval(() => {
      while (this.nextBeatTime < ctx.currentTime + 0.2) {
        this.playBeat(this.beat, this.nextBeatTime, eighth);
        this.beat = (this.beat + 1) % (CHORDS.length * 8);
        this.nextBeatTime += eighth;
      }
    }, 50);
  }

  private playBeat(beat: number, t: number, eighth: number) {
    const out = this.music!;
    const chord = CHORDS[Math.floor(beat / 8)];
    const step = beat % 8;
    // Soft arpeggio (triangle) on every eighth note
    this.tone(N[chord[step % 3]] * 2, t, eighth * 0.9, "triangle", 0.05, out);
    // Bass on beats 1 and 3
    if (step % 4 === 0) this.tone(N[chord[0]], t, eighth * 3.5, "triangle", 0.12, out);
    // Melody (square, quiet) on the beat
    const note = MELODY[beat];
    if (note && note !== "-") this.tone(N[note], t, eighth * 1.6, "square", 0.035, out);
    // Gentle shaker on the off-beats
    if (step % 2 === 1) this.noiseBurst(t, 0.04, 0.025, 7000, out);
  }

  // ---------------------------------------------------------------- effects

  play(name: SfxName) {
    if (!this.ctx || !this.sfx || this.muted) return;
    const t = this.ctx.currentTime, out = this.sfx;
    switch (name) {
      case "pickup": this.tone(440, t, 0.12, "square", 0.12, out, 880); break;
      case "drop": this.tone(660, t, 0.07, "triangle", 0.18, out); this.tone(990, t + 0.07, 0.1, "triangle", 0.18, out); break;
      case "ticket": [1047, 1319, 1568].forEach((f, i) => this.tone(f, t + i * 0.06, 0.12, "sine", 0.14, out)); break;
      case "coin": this.tone(988, t, 0.06, "square", 0.1, out); this.tone(1319, t + 0.06, 0.18, "square", 0.1, out); break;
      case "pop": this.tone(600, t, 0.07, "sine", 0.15, out, 950); break;
      case "toast": this.tone(523, t, 0.08, "triangle", 0.07, out); break;
      case "click": this.tone(800, t, 0.03, "square", 0.06, out); break;
      case "beep": this.tone(660, t, 0.12, "square", 0.1, out); break;
      case "go": this.tone(990, t, 0.3, "square", 0.12, out); break;
      case "win": [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.1, 0.16, "square", 0.08, out)); break;
      case "roll": this.noiseBurst(t, 1.2, 0.08, 400, out, "lowpass"); break;
      case "pins": for (let i = 0; i < 5; i++) this.noiseBurst(t + i * 0.05 + Math.random() * 0.03, 0.08, 0.15, 1500, out, "bandpass"); break;
      case "whoosh": this.noiseBurst(t, 0.5, 0.1, 900, out, "bandpass"); break;
      case "splash": this.noiseBurst(t, 0.35, 0.18, 1200, out, "lowpass"); this.tone(300, t, 0.15, "sine", 0.08, out, 120); break;
      case "shutter": this.noiseBurst(t, 0.04, 0.25, 3000, out); this.noiseBurst(t + 0.08, 0.05, 0.2, 2000, out); break;
      case "caw": [0, 0.3].forEach((d) => this.tone(820, t + d, 0.22, "sawtooth", 0.06, out, 420)); break;
    }
  }
}

export const Sound = new SoundManager();
