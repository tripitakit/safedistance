import * as THREE from 'three';

export type TimeState = 'dawn' | 'noon' | 'sunset' | 'night';

interface TimeConfig {
  sunColor: number;
  sunIntensity: number;
  ambientIntensity: number;
  skyColor: number;
  fogColor: number;
  sunAngle: number; // Degrees from horizon
  darkness: number; // 0 = bright day, 1 = full night darkness
}

const TIME_CONFIGS: Record<TimeState, TimeConfig> = {
  dawn: {
    sunColor: 0xffccaa,
    sunIntensity: 0.5,
    ambientIntensity: 0.35,
    skyColor: 0xffaa77,
    fogColor: 0xddb088,
    sunAngle: 15,
    darkness: 0.3, // Early morning, slightly dim
  },
  noon: {
    sunColor: 0xffffff,
    sunIntensity: 0.8,
    ambientIntensity: 0.6,
    skyColor: 0x87ceeb,
    fogColor: 0x87ceeb,
    sunAngle: 70,
    darkness: 0, // Bright daylight
  },
  sunset: {
    sunColor: 0xff8844,
    sunIntensity: 0.5,
    ambientIntensity: 0.4,
    skyColor: 0xff6633,
    fogColor: 0xcc7755,
    sunAngle: 10,
    darkness: 0.4, // Getting darker
  },
  night: {
    sunColor: 0x4466aa,
    sunIntensity: 0.15,
    ambientIntensity: 0.15,
    skyColor: 0x112244,
    fogColor: 0x223355,
    sunAngle: -20,
    darkness: 0.85, // Very dark
  },
};

export class TimeOfDay {
  private scene: THREE.Scene;
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private fog: THREE.Fog;

  private currentTime: TimeState = 'dawn';
  private targetTime: TimeState = 'dawn';
  private transitionProgress: number = 1;
  private readonly TRANSITION_SPEED = 0.2;

  // Auto-cycling
  private autoCycleEnabled: boolean = true;
  private autoCycleTimer: number = 0;
  private readonly AUTO_CYCLE_INTERVAL = 120; // seconds between time changes

  constructor(scene: THREE.Scene, sunLight: THREE.DirectionalLight, ambientLight: THREE.AmbientLight) {
    this.scene = scene;
    this.sunLight = sunLight;
    this.ambientLight = ambientLight;
    this.fog = scene.fog as THREE.Fog;
  }

  /**
   * Set the time of day (with smooth transition)
   */
  setTime(time: TimeState): void {
    if (time === this.targetTime) return;

    this.targetTime = time;
    this.transitionProgress = 0;
  }

  /**
   * Get current time state
   */
  getCurrentTime(): TimeState {
    return this.currentTime;
  }

  /**
   * Update time of day system
   */
  update(deltaTime: number): void {
    // Auto-cycle time independently
    if (this.autoCycleEnabled && this.transitionProgress >= 1) {
      this.autoCycleTimer += deltaTime;
      if (this.autoCycleTimer >= this.AUTO_CYCLE_INTERVAL) {
        this.autoCycleTimer = 0;
        this.cycleTime();
      }
    }

    if (this.transitionProgress >= 1) return;

    this.transitionProgress = Math.min(1, this.transitionProgress + this.TRANSITION_SPEED * deltaTime);

    if (this.transitionProgress >= 1) {
      this.currentTime = this.targetTime;
    }

    this.updateLighting();
  }

  private updateLighting(): void {
    const currentConfig = TIME_CONFIGS[this.currentTime];
    const targetConfig = TIME_CONFIGS[this.targetTime];
    const t = this.transitionProgress;

    // Interpolate sun color and intensity
    const currentSunColor = new THREE.Color(currentConfig.sunColor);
    const targetSunColor = new THREE.Color(targetConfig.sunColor);
    this.sunLight.color.copy(currentSunColor.lerp(targetSunColor, t));
    this.sunLight.intensity = THREE.MathUtils.lerp(currentConfig.sunIntensity, targetConfig.sunIntensity, t);

    // Interpolate ambient light
    this.ambientLight.intensity = THREE.MathUtils.lerp(currentConfig.ambientIntensity, targetConfig.ambientIntensity, t);

    // Interpolate sun position (angle)
    const sunAngle = THREE.MathUtils.lerp(currentConfig.sunAngle, targetConfig.sunAngle, t);
    const sunAngleRad = sunAngle * Math.PI / 180;
    const sunDistance = 100;
    this.sunLight.position.set(
      sunDistance * 0.3, // Slight X offset
      sunDistance * Math.sin(sunAngleRad),
      -sunDistance * Math.cos(sunAngleRad)
    );

    // Interpolate sky color
    const currentSkyColor = new THREE.Color(currentConfig.skyColor);
    const targetSkyColor = new THREE.Color(targetConfig.skyColor);
    const skyColor = currentSkyColor.lerp(targetSkyColor, t);

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(skyColor);
    }

    // Interpolate fog color (if not overridden by weather)
    const currentFogColor = new THREE.Color(currentConfig.fogColor);
    const targetFogColor = new THREE.Color(targetConfig.fogColor);
    const fogColor = currentFogColor.lerp(targetFogColor, t);

    if (this.fog) {
      this.fog.color.copy(fogColor);
    }
  }

  /**
   * Cycle to next time of day
   */
  cycleTime(): void {
    const states: TimeState[] = ['dawn', 'noon', 'sunset', 'night'];
    const currentIndex = states.indexOf(this.targetTime);
    const nextIndex = (currentIndex + 1) % states.length;
    this.setTime(states[nextIndex]);
  }

  /**
   * Get time display name
   */
  getTimeName(): string {
    switch (this.targetTime) {
      case 'dawn': return 'Dawn';
      case 'noon': return 'Noon';
      case 'sunset': return 'Sunset';
      case 'night': return 'Night';
    }
  }

  /**
   * Check if it's night time (for headlight visibility)
   */
  isNight(): boolean {
    return this.currentTime === 'night' || this.targetTime === 'night';
  }

  /**
   * Get current darkness factor (0 = bright day, 1 = full night)
   * Used by weather system to darken fog at night
   */
  getDarkness(): number {
    const currentConfig = TIME_CONFIGS[this.currentTime];
    const targetConfig = TIME_CONFIGS[this.targetTime];

    return THREE.MathUtils.lerp(
      currentConfig.darkness,
      targetConfig.darkness,
      this.transitionProgress
    );
  }

  /**
   * Get the time-of-day fog color for blending with weather
   */
  getFogColor(): THREE.Color {
    const currentConfig = TIME_CONFIGS[this.currentTime];
    const targetConfig = TIME_CONFIGS[this.targetTime];

    const currentFogColor = new THREE.Color(currentConfig.fogColor);
    const targetFogColor = new THREE.Color(targetConfig.fogColor);

    return currentFogColor.lerp(targetFogColor, this.transitionProgress);
  }
}
