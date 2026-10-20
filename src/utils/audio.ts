// Web Audio API tactical radar sound synthesizer
class RadarAudioEngine {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private lastPingTime: number = 0;

  constructor() {
    // Sound enabled by default, audio context will initialize on first user gesture
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Play target detected ping
   * Frequency pitch scales based on how close the obstacle is
   */
  public playDetectionPing(distanceCm: number, thresholdCm: number) {
    if (!this.soundEnabled) return;

    // Rate-limit pings to prevent audio stutter (at least 200ms apart)
    const now = Date.now();
    if (now - this.lastPingTime < 220) return;
    this.lastPingTime = now;

    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch is higher when obstacle is closer (urgent)
      // distance 5cm -> ~1800Hz, distance 40cm -> ~880Hz
      const proximityFactor = Math.max(0, Math.min(1, 1 - (distanceCm / Math.max(thresholdCm, 10))));
      const baseFreq = 880 + proximityFactor * 1000;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      // Frequency drop off (characteristic radar sonar chirp)
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, this.ctx.currentTime + 0.12);

      // Attack and rapid decay
      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.16);
    } catch {
      // AudioContext autoplay restrictions or device audio muted
    }
  }

  /**
   * Play command acknowledgement click
   */
  public playCommandAck() {
    if (!this.soundEnabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
      osc.frequency.setValueAtTime(2200, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.09);
    } catch {
      // Ignore audio failure
    }
  }
}

export const radarAudio = new RadarAudioEngine();
