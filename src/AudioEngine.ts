/**
 * AudioEngine - FM Synthesis engine sound and crash audio
 * Uses Web Audio API for real-time sound generation
 */
export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Engine synth nodes
  private carrierOsc: OscillatorNode | null = null;
  private modulatorOsc: OscillatorNode | null = null;
  private modulatorGain: GainNode | null = null;
  private engineGain: GainNode | null = null;

  // State
  private isInitialized: boolean = false;
  private isEngineRunning: boolean = false;

  // Brake sound nodes
  private brakeNoiseSource: AudioBufferSourceNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;
  private brakeGain: GainNode | null = null;
  private isBrakeSoundPlaying: boolean = false;

  // Gear ratios for RPM calculation (simplified 5-speed)
  private readonly GEAR_RATIOS = [3.5, 2.2, 1.5, 1.0, 0.75];
  private readonly FINAL_DRIVE = 3.5;
  private readonly WHEEL_CIRCUMFERENCE = 2.0; // meters
  private readonly IDLE_RPM = 800;
  private readonly REDLINE_RPM = 6500;

  constructor() {
    // AudioContext created on init() due to browser autoplay policy
  }

  /**
   * Initialize audio context - must be called on user interaction
   */
  public init(): void {
    if (this.isInitialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Master gain for overall volume control
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.audioContext.destination);

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  /**
   * Start the engine sound
   */
  public startEngine(): void {
    if (!this.isInitialized || !this.audioContext || !this.masterGain) return;
    if (this.isEngineRunning) return;

    const now = this.audioContext.currentTime;

    // Create modulator oscillator (creates the harmonic richness)
    this.modulatorOsc = this.audioContext.createOscillator();
    this.modulatorOsc.type = 'sine';
    this.modulatorOsc.frequency.value = 80; // Will be updated

    // Modulator gain controls FM depth
    this.modulatorGain = this.audioContext.createGain();
    this.modulatorGain.gain.value = 50;

    // Create carrier oscillator (main engine tone)
    this.carrierOsc = this.audioContext.createOscillator();
    this.carrierOsc.type = 'sine';
    this.carrierOsc.frequency.value = 40; // Will be updated

    // Engine output gain
    this.engineGain = this.audioContext.createGain();
    this.engineGain.gain.value = 0;

    // FM synthesis routing: modulator -> modulatorGain -> carrier.frequency
    this.modulatorOsc.connect(this.modulatorGain);
    this.modulatorGain.connect(this.carrierOsc.frequency);

    // Carrier -> engine gain -> master
    this.carrierOsc.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    // Start oscillators
    this.modulatorOsc.start(now);
    this.carrierOsc.start(now);

    // Fade in engine sound
    this.engineGain.gain.setValueAtTime(0, now);
    this.engineGain.gain.linearRampToValueAtTime(0.15, now + 0.5);

    this.isEngineRunning = true;
  }

  /**
   * Stop the engine sound
   */
  public stopEngine(): void {
    if (!this.isEngineRunning || !this.audioContext) return;

    const now = this.audioContext.currentTime;

    // Fade out
    if (this.engineGain) {
      this.engineGain.gain.setValueAtTime(this.engineGain.gain.value, now);
      this.engineGain.gain.linearRampToValueAtTime(0, now + 0.5);
    }

    // Stop oscillators after fade
    setTimeout(() => {
      if (this.carrierOsc) {
        this.carrierOsc.stop();
        this.carrierOsc.disconnect();
        this.carrierOsc = null;
      }
      if (this.modulatorOsc) {
        this.modulatorOsc.stop();
        this.modulatorOsc.disconnect();
        this.modulatorOsc = null;
      }
      if (this.modulatorGain) {
        this.modulatorGain.disconnect();
        this.modulatorGain = null;
      }
      if (this.engineGain) {
        this.engineGain.disconnect();
        this.engineGain = null;
      }
    }, 600);

    this.isEngineRunning = false;
  }

  /**
   * Calculate RPM from speed using gear simulation
   */
  private calculateRPM(speedKmh: number): number {
    if (speedKmh <= 0) return this.IDLE_RPM;

    const speedMs = speedKmh / 3.6;
    const wheelRPM = (speedMs / this.WHEEL_CIRCUMFERENCE) * 60;

    // Find appropriate gear
    let bestRPM = this.IDLE_RPM;
    for (const gearRatio of this.GEAR_RATIOS) {
      const engineRPM = wheelRPM * gearRatio * this.FINAL_DRIVE;
      if (engineRPM >= this.IDLE_RPM && engineRPM <= this.REDLINE_RPM) {
        bestRPM = engineRPM;
        break;
      } else if (engineRPM > this.REDLINE_RPM) {
        // Would need to upshift, try next gear
        continue;
      } else {
        bestRPM = Math.max(engineRPM, this.IDLE_RPM);
      }
    }

    return Math.min(Math.max(bestRPM, this.IDLE_RPM), this.REDLINE_RPM);
  }

  /**
   * Update engine sound based on current speed and acceleration
   */
  public updateEngine(speedKmh: number, acceleration: number): void {
    if (!this.isEngineRunning || !this.audioContext) return;
    if (!this.carrierOsc || !this.modulatorOsc || !this.modulatorGain || !this.engineGain) return;

    const now = this.audioContext.currentTime;
    const rpm = this.calculateRPM(speedKmh);
    const rpmNormalized = (rpm - this.IDLE_RPM) / (this.REDLINE_RPM - this.IDLE_RPM);

    // Carrier frequency: 40Hz at idle, up to 200Hz at redline
    const carrierFreq = 40 + rpmNormalized * 160;

    // Modulator frequency: 2x carrier for aggressive V8-like sound
    const modFreq = carrierFreq * 2;

    // Modulation index: higher under acceleration for more aggressive sound
    const baseModIndex = 30 + rpmNormalized * 40;
    const loadModIndex = acceleration * 80;
    const modIndex = baseModIndex + loadModIndex;

    // Add slight random variation for realism
    const wobble = Math.sin(now * 15) * 2;

    // Smooth transitions
    const transitionTime = 0.08;
    this.carrierOsc.frequency.setTargetAtTime(carrierFreq + wobble, now, transitionTime);
    this.modulatorOsc.frequency.setTargetAtTime(modFreq, now, transitionTime);
    this.modulatorGain.gain.setTargetAtTime(modIndex, now, transitionTime);

    // Volume: louder at higher RPM, extra loud under acceleration
    const baseVolume = 0.08 + rpmNormalized * 0.12;
    const loadVolume = acceleration * 0.05;
    const volume = baseVolume + loadVolume;
    this.engineGain.gain.setTargetAtTime(volume, now, transitionTime);
  }

  /**
   * Start or update brake screech sound
   * @param intensity - braking power 0-1
   * @param speedKmh - current vehicle speed
   */
  public updateBrakeSound(intensity: number, speedKmh: number): void {
    if (!this.isInitialized || !this.audioContext || !this.masterGain) return;

    // Only play brake sound when braking hard (>30%) and moving
    const shouldPlay = intensity > 0.3 && speedKmh > 10;

    if (shouldPlay && !this.isBrakeSoundPlaying) {
      this.startBrakeSound();
    } else if (!shouldPlay && this.isBrakeSoundPlaying) {
      this.stopBrakeSound();
    }

    // Update brake sound parameters
    if (this.isBrakeSoundPlaying && this.brakeGain && this.brakeFilter) {
      const now = this.audioContext.currentTime;

      // Volume based on intensity and speed
      const speedFactor = Math.min(1, speedKmh / 100);
      const volume = (intensity - 0.3) * 0.7 * speedFactor * 0.15;
      this.brakeGain.gain.setTargetAtTime(volume, now, 0.05);

      // Higher pitch at higher speeds
      const baseFreq = 800 + speedKmh * 10;
      this.brakeFilter.frequency.setTargetAtTime(baseFreq, now, 0.05);
    }
  }

  private startBrakeSound(): void {
    if (!this.audioContext || !this.masterGain || this.isBrakeSoundPlaying) return;

    const now = this.audioContext.currentTime;

    // Create long noise buffer for continuous sound
    const noiseBuffer = this.createNoiseBuffer(10);
    this.brakeNoiseSource = this.audioContext.createBufferSource();
    this.brakeNoiseSource.buffer = noiseBuffer;
    this.brakeNoiseSource.loop = true;

    // Band-pass filter for tire screech character
    this.brakeFilter = this.audioContext.createBiquadFilter();
    this.brakeFilter.type = 'bandpass';
    this.brakeFilter.frequency.value = 1500;
    this.brakeFilter.Q.value = 3;

    // Gain control
    this.brakeGain = this.audioContext.createGain();
    this.brakeGain.gain.setValueAtTime(0, now);

    // Connect: noise -> filter -> gain -> master
    this.brakeNoiseSource.connect(this.brakeFilter);
    this.brakeFilter.connect(this.brakeGain);
    this.brakeGain.connect(this.masterGain);

    this.brakeNoiseSource.start(now);
    this.isBrakeSoundPlaying = true;
  }

  private stopBrakeSound(): void {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;

    // Fade out
    if (this.brakeGain) {
      this.brakeGain.gain.setTargetAtTime(0, now, 0.05);
    }

    // Stop after fade
    setTimeout(() => {
      if (this.brakeNoiseSource) {
        this.brakeNoiseSource.stop();
        this.brakeNoiseSource.disconnect();
        this.brakeNoiseSource = null;
      }
      if (this.brakeFilter) {
        this.brakeFilter.disconnect();
        this.brakeFilter = null;
      }
      if (this.brakeGain) {
        this.brakeGain.disconnect();
        this.brakeGain = null;
      }
    }, 100);

    this.isBrakeSoundPlaying = false;
  }

  /**
   * Get crash severity level (0-4)
   */
  private getSeverity(impactForceKN: number, speedDiffKmh: number): number {
    if (impactForceKN > 150 || speedDiffKmh > 60) return 4; // CATASTROPHIC
    if (impactForceKN > 100 || speedDiffKmh > 40) return 3; // SEVERE
    if (impactForceKN > 50 || speedDiffKmh > 20) return 2;  // MAJOR
    if (impactForceKN > 20 || speedDiffKmh > 10) return 1;  // MODERATE
    return 0; // MINOR
  }

  /**
   * Create a buffer filled with white noise
   */
  private createNoiseBuffer(duration: number): AudioBuffer {
    if (!this.audioContext) throw new Error('AudioContext not initialized');

    const sampleRate = this.audioContext.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  /**
   * Play crash sound based on impact severity
   */
  public playCrashSound(impactForceKN: number, speedDiffKmh: number): void {
    if (!this.isInitialized || !this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;
    const severity = this.getSeverity(impactForceKN, speedDiffKmh);

    // Create noise source for impact body
    const noiseDuration = 0.5 + severity * 0.4;
    const noiseBuffer = this.createNoiseBuffer(noiseDuration);
    const noiseSource = this.audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Low-pass filter - lower cutoff for heavier crashes (more bass)
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3000 - severity * 500; // 3000Hz -> 500Hz
    filter.Q.value = 1 + severity * 1.5;

    // High-pass to remove sub-bass rumble
    const hipass = this.audioContext.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.value = 60;

    // Gain envelope
    const envelope = this.audioContext.createGain();
    const peakGain = 0.3 + severity * 0.15;
    envelope.gain.setValueAtTime(peakGain, now);
    envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.2 + severity * 0.6);

    // Connect chain
    noiseSource.connect(filter);
    filter.connect(hipass);
    hipass.connect(envelope);
    envelope.connect(this.masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + noiseDuration);

    // Add metallic clang for MAJOR+ crashes
    if (severity >= 2) {
      this.playMetalSound(severity);
    }

    // Add glass shatter for SEVERE+ crashes
    if (severity >= 3) {
      this.playGlassSound(severity);
    }
  }

  /**
   * Play metallic impact sound
   */
  private playMetalSound(severity: number): void {
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;

    // Create a short noise burst for initial transient
    const noiseBuffer = this.createNoiseBuffer(0.1);
    const noise = this.audioContext.createBufferSource();
    noise.buffer = noiseBuffer;

    // Band-pass for metallic resonance
    const bandpass = this.audioContext.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 800 + Math.random() * 400;
    bandpass.Q.value = 10;

    // Sharp envelope
    const envelope = this.audioContext.createGain();
    envelope.gain.setValueAtTime(0.15 + severity * 0.05, now);
    envelope.gain.exponentialRampToValueAtTime(0.01, now + 0.3 + severity * 0.2);

    noise.connect(bandpass);
    bandpass.connect(envelope);
    envelope.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.5);
  }

  /**
   * Play glass shattering sound
   */
  private playGlassSound(severity: number): void {
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;
    const delay = 0.05; // Slight delay after main impact

    // High-frequency noise for glass
    const noiseBuffer = this.createNoiseBuffer(0.4);
    const noise = this.audioContext.createBufferSource();
    noise.buffer = noiseBuffer;

    // High-pass for glassy brightness
    const hipass = this.audioContext.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.value = 2000;

    // Notch filter for tinkly quality
    const notch = this.audioContext.createBiquadFilter();
    notch.type = 'peaking';
    notch.frequency.value = 4000 + Math.random() * 2000;
    notch.Q.value = 5;
    notch.gain.value = 6;

    // Envelope
    const envelope = this.audioContext.createGain();
    envelope.gain.setValueAtTime(0, now + delay);
    envelope.gain.linearRampToValueAtTime(0.1 + severity * 0.03, now + delay + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.4);

    noise.connect(hipass);
    hipass.connect(notch);
    notch.connect(envelope);
    envelope.connect(this.masterGain);

    noise.start(now + delay);
    noise.stop(now + delay + 0.5);
  }

  /**
   * Clean up all audio resources
   */
  public dispose(): void {
    this.stopEngine();

    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isInitialized = false;
  }
}
