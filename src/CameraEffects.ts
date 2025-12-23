import * as THREE from 'three';

export interface CameraEffectsConfig {
  baseFOV: number;
  maxFOVIncrease: number;
  maxSpeed: number;
  shakeDecay: number;
  headBobFrequency: number;
  headBobAmplitude: number;
}

const DEFAULT_CONFIG: CameraEffectsConfig = {
  baseFOV: 75,
  maxFOVIncrease: 15,        // FOV goes from 75 to 90 at max speed
  maxSpeed: 250,              // km/h for max FOV
  shakeDecay: 5,              // How fast shake decays per second
  headBobFrequency: 3,        // Hz
  headBobAmplitude: 0.008,    // Meters of vertical movement
};

export class CameraEffects {
  private camera: THREE.PerspectiveCamera;
  private config: CameraEffectsConfig;

  // Shake state
  private shakeIntensity: number = 0;
  private shakeOffset: THREE.Vector3 = new THREE.Vector3();

  // Head bob state
  private headBobPhase: number = 0;
  private headBobOffset: number = 0;

  // FOV state
  private currentFOV: number;
  private targetFOV: number;

  // Braking shake
  private brakeShakeIntensity: number = 0;

  constructor(camera: THREE.PerspectiveCamera, config: Partial<CameraEffectsConfig> = {}) {
    this.camera = camera;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentFOV = this.config.baseFOV;
    this.targetFOV = this.config.baseFOV;
  }

  /**
   * Trigger impact shake (collision, hard brake)
   */
  triggerShake(intensity: number): void {
    this.shakeIntensity = Math.min(this.shakeIntensity + intensity, 0.15);
  }

  /**
   * Update all camera effects
   * @param deltaTime - Time since last frame in seconds
   * @param speed - Current speed in km/h
   * @param brakeIntensity - Brake intensity 0-1
   * @param isAccelerating - Whether accelerating
   */
  update(deltaTime: number, speed: number, brakeIntensity: number, _isAccelerating: boolean): void {
    // Update FOV based on speed
    this.updateFOV(deltaTime, speed);

    // Update head bob
    this.updateHeadBob(deltaTime, speed);

    // Update brake shake
    this.updateBrakeShake(deltaTime, brakeIntensity, speed);

    // Update and decay impact shake
    this.updateShake(deltaTime);
  }

  private updateFOV(deltaTime: number, speed: number): void {
    // Target FOV increases with speed
    const speedRatio = Math.min(speed / this.config.maxSpeed, 1);
    this.targetFOV = this.config.baseFOV + speedRatio * this.config.maxFOVIncrease;

    // Smooth interpolation
    const lerpSpeed = 3;
    this.currentFOV += (this.targetFOV - this.currentFOV) * lerpSpeed * deltaTime;

    this.camera.fov = this.currentFOV;
    this.camera.updateProjectionMatrix();
  }

  private updateHeadBob(deltaTime: number, speed: number): void {
    // Head bob only when moving
    if (speed < 5) {
      this.headBobOffset *= 0.9; // Fade out
      return;
    }

    // Increase frequency slightly with speed
    const frequency = this.config.headBobFrequency + (speed / 200);
    this.headBobPhase += deltaTime * frequency * Math.PI * 2;

    // Amplitude scales with speed (subtle at low speed, more at high speed)
    const speedFactor = Math.min(speed / 150, 1);
    const amplitude = this.config.headBobAmplitude * speedFactor;

    this.headBobOffset = Math.sin(this.headBobPhase) * amplitude;
  }

  private updateBrakeShake(deltaTime: number, brakeIntensity: number, speed: number): void {
    // Hard braking at speed causes camera shake
    if (brakeIntensity > 0.5 && speed > 30) {
      const intensity = (brakeIntensity - 0.5) * 2 * (speed / 150) * 0.015;
      this.brakeShakeIntensity = Math.min(this.brakeShakeIntensity + intensity * deltaTime * 10, 0.03);
    } else {
      this.brakeShakeIntensity *= 0.9;
    }
  }

  private updateShake(deltaTime: number): void {
    // Combine impact shake and brake shake
    const totalShake = this.shakeIntensity + this.brakeShakeIntensity;

    if (totalShake > 0.001) {
      // Random offset based on intensity
      this.shakeOffset.set(
        (Math.random() - 0.5) * 2 * totalShake,
        (Math.random() - 0.5) * 2 * totalShake,
        (Math.random() - 0.5) * 2 * totalShake * 0.5
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // Decay impact shake
    this.shakeIntensity = Math.max(0, this.shakeIntensity - this.config.shakeDecay * deltaTime);
  }

  /**
   * Get the combined offset to apply to camera position
   */
  getPositionOffset(): THREE.Vector3 {
    return new THREE.Vector3(
      this.shakeOffset.x,
      this.shakeOffset.y + this.headBobOffset,
      this.shakeOffset.z
    );
  }

  /**
   * Get current FOV
   */
  getFOV(): number {
    return this.currentFOV;
  }

  /**
   * Reset all effects (e.g., on game restart)
   */
  reset(): void {
    this.shakeIntensity = 0;
    this.brakeShakeIntensity = 0;
    this.headBobPhase = 0;
    this.headBobOffset = 0;
    this.shakeOffset.set(0, 0, 0);
    this.currentFOV = this.config.baseFOV;
    this.targetFOV = this.config.baseFOV;
    this.camera.fov = this.config.baseFOV;
    this.camera.updateProjectionMatrix();
  }
}
