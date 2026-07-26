// Web Audio API Sound Synthesizer & Dubstep Music Engine for Saviour of Domania

class AudioEngineClass {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private soundVol: number = 0.8;
  private musicVol: number = 0.5;

  private isMusicPlaying: boolean = false;
  private musicInterval: number | null = null;
  private currentTempoBpm: number = 140;
  private beatStep: number = 0;
  private secretRhythmPattern: number[] = [1, 0, 1, 1, 0, 1, 0, 1]; // For Ultra-Doman dodge timing cues

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolumes(sound: number, music: number) {
    this.soundVol = Math.max(0, Math.min(1, sound));
    this.musicVol = Math.max(0, Math.min(1, music));
  }

  // --- SOUND EFFECTS ---

  public playPistolShot() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    // Metallic Mechanical Snap
    const snap = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snap.type = 'square';
    snap.frequency.setValueAtTime(1400, now);
    snap.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    snapGain.gain.setValueAtTime(0.5 * this.soundVol, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    snap.connect(snapGain);
    snapGain.connect(this.ctx.destination);
    snap.start(now);
    snap.stop(now + 0.04);

    // Main Gunshot Body
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
    gain.gain.setValueAtTime(0.6 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);

    // Explosive Noise Transient
    this.playNoiseBlast(0.06, 0.4);
  }

  public playCoinToss() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(2400, now + 0.15);

    gain.gain.setValueAtTime(0.3 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playIceShatter() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    // High crystalline glass/ice chime frequency sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2800, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.18);
    gain.gain.setValueAtTime(0.4 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);

    // Crunch noise blast
    this.playNoiseBlast(0.12, 0.3);
  }

  public playCoinRicochet() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(3200, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.2);

    gain.gain.setValueAtTime(0.2 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playRicochetImpact() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.06);

    gain.gain.setValueAtTime(0.035 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playShotgun() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    // Sub-bass Thump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
    gain.gain.setValueAtTime(0.95 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);

    // Dual Noise Blast
    this.playNoiseBlast(0.25, 0.8);
  }

  public playFlashbang(isBlinded: boolean = false) {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    // Sub-bass explosive blast
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(240, now);
    sub.frequency.exponentialRampToValueAtTime(25, now + 0.45);
    subGain.gain.setValueAtTime(0.95 * this.soundVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 0.45);

    // Sharp noise burst
    this.playNoiseBlast(0.22, 0.75);

    // High-frequency tinnitus ringing if player is blinded
    if (isBlinded) {
      const ring = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(4200, now);
      ring.frequency.exponentialRampToValueAtTime(3600, now + 2.8);

      ringGain.gain.setValueAtTime(0.35 * this.soundVol, now);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

      ring.connect(ringGain);
      ringGain.connect(this.ctx.destination);
      ring.start(now);
      ring.stop(now + 2.8);
    }
  }

  public playRifleShot(isBerserk: boolean = false) {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isBerserk ? 450 : 750, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);

    gain.gain.setValueAtTime((isBerserk ? 0.65 : 0.45) * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);

    this.playNoiseBlast(0.08, isBerserk ? 0.6 : 0.35);
  }

  public playDash() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);

    gain.gain.setValueAtTime(0.4 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  private lastChargeSoundTime: number = 0;

  public playPunchCharge(_ratio: number) {
    // Charge sound muted per user request
  }

  public playHvbPunch(chargeRatio: number = 1.0) {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const startFreq = 80 + chargeRatio * 180;
    const endFreq = 25;
    const duration = 0.25 + chargeRatio * 0.25;

    // Heavy sub-bass blast
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gain.gain.setValueAtTime((0.18 + chargeRatio * 0.1) * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);

    this.playNoiseBlast(0.1 + chargeRatio * 0.08, 0.12 + chargeRatio * 0.1);
  }

  public playGroundPoundSlam() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);

    gain.gain.setValueAtTime(0.9 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playGrappleHook() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.18);

    gain.gain.setValueAtTime(0.4 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playGrappleRetract() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.16);

    gain.gain.setValueAtTime(0.35 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playHealNanoFluid() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);

    gain.gain.setValueAtTime(0.4 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playRocketLaunch() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

    gain.gain.setValueAtTime(0.6 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);

    this.playNoiseBlast(0.25, 0.4);
  }

  public playExplosion() {
    if (!this.ctx || this.soundVol <= 0) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);

    gain.gain.setValueAtTime(0.9 * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);

    this.playNoiseBlast(0.4, 0.7);
  }

  private cachedNoiseBuffer: AudioBuffer | null = null;

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.cachedNoiseBuffer) {
      const bufferSize = Math.floor(this.ctx.sampleRate * 1.0); // 1 second buffer
      this.cachedNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.cachedNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.cachedNoiseBuffer;
  }

  private playNoiseBlast(duration: number, volume: number) {
    if (!this.ctx) return;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * this.soundVol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  // --- DUBSTEP / CYBERPUNK MUSIC ENGINE ---

  public startMusic(isBossLevel: boolean = false, isSecretLevel: boolean = false) {
    this.init();
    if (this.isMusicPlaying) this.stopMusic();

    this.isMusicPlaying = true;
    this.beatStep = 0;
    this.currentTempoBpm = isSecretLevel ? 150 : isBossLevel ? 145 : 138;

    const intervalMs = (60 / this.currentTempoBpm / 4) * 1000; // 16th notes

    this.musicInterval = window.setInterval(() => {
      this.tickMusicBeat(isBossLevel, isSecretLevel);
    }, intervalMs);
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  private tickMusicBeat(isBoss: boolean, isSecret: boolean) {
    if (!this.ctx || this.musicVol <= 0) return;
    const now = this.ctx.currentTime;
    const step = this.beatStep % 16;
    this.beatStep++;

    // Kick on steps 0, 8, 10
    if (step === 0 || step === 8 || (isBoss && step === 10)) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.1);
      gain.gain.setValueAtTime(0.6 * this.musicVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }

    // Snare on steps 4, 12
    if (step === 4 || step === 12) {
      this.playNoiseBlast(0.12, 0.4 * this.musicVol);
    }

    // Heavy Wobble Bass on step % 2 === 0
    if (step % 2 === 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      const notes = isSecret
        ? [55, 55, 62, 58] // A1
        : isBoss
        ? [41, 41, 46, 43] // F1
        : [50, 50, 53, 48]; // D1

      const note = notes[Math.floor(step / 4) % notes.length];
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(note, now);

      filter.type = 'lowpass';
      const cutoff = step % 4 === 0 ? 1800 : 600;
      filter.frequency.setValueAtTime(cutoff, now);
      filter.Q.setValueAtTime(5, now);

      gain.gain.setValueAtTime(0.3 * this.musicVol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    }
  }

  public getSecretBeatStatus(): boolean {
    return this.secretRhythmPattern[this.beatStep % this.secretRhythmPattern.length] === 1;
  }
}

export const AudioEngine = new AudioEngineClass();
