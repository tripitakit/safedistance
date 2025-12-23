import * as THREE from 'three';

export type WeatherState = 'clear' | 'foggy' | 'light_rain' | 'heavy_rain';

interface WeatherConfig {
  fogNear: number;
  fogFar: number;
  fogColor: number;
  rainIntensity: number;
  traction: number;
  ambientReduction: number;
}

const WEATHER_CONFIGS: Record<WeatherState, WeatherConfig> = {
  clear: {
    fogNear: 50,
    fogFar: 300,
    fogColor: 0x87ceeb,
    rainIntensity: 0,
    traction: 1.0,
    ambientReduction: 0,
  },
  foggy: {
    fogNear: 20,
    fogFar: 100,
    fogColor: 0x9999aa,
    rainIntensity: 0,
    traction: 0.95,
    ambientReduction: 0.2,
  },
  light_rain: {
    fogNear: 40,
    fogFar: 200,
    fogColor: 0x778899,
    rainIntensity: 0.3,
    traction: 0.85,
    ambientReduction: 0.3,
  },
  heavy_rain: {
    fogNear: 20,
    fogFar: 100,
    fogColor: 0x556677,
    rainIntensity: 1.0,
    traction: 0.70,
    ambientReduction: 0.5,
  },
};

export class WeatherSystem {
  private scene: THREE.Scene;
  private fog: THREE.Fog;
  private rainParticles: THREE.Points | null = null;
  private rainGeometry: THREE.BufferGeometry | null = null;
  private rainPositions: Float32Array | null = null;
  private rainVelocities: Float32Array | null = null;

  private currentWeather: WeatherState = 'clear';
  private targetWeather: WeatherState = 'clear';
  private transitionProgress: number = 1; // 0-1, 1 = fully transitioned
  private readonly TRANSITION_SPEED = 0.3; // Speed of weather transitions

  private readonly RAIN_COUNT = 3000;
  private readonly RAIN_AREA = 100; // Area around player for rain
  private readonly RAIN_HEIGHT = 50;

  private playerPosition: THREE.Vector3 = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = scene.fog as THREE.Fog;

    this.createRainSystem();
  }

  private createRainSystem(): void {
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainPositions = new Float32Array(this.RAIN_COUNT * 3);
    this.rainVelocities = new Float32Array(this.RAIN_COUNT);

    // Initialize rain particles
    for (let i = 0; i < this.RAIN_COUNT; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * this.RAIN_AREA;
      this.rainPositions[i * 3 + 1] = Math.random() * this.RAIN_HEIGHT;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * this.RAIN_AREA;
      this.rainVelocities[i] = 15 + Math.random() * 10; // Fall speed
    }

    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));

    const rainMaterial = new THREE.PointsMaterial({
      color: 0xaaaacc,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.rainParticles = new THREE.Points(this.rainGeometry, rainMaterial);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  /**
   * Set the weather state (with smooth transition)
   */
  setWeather(weather: WeatherState): void {
    if (weather === this.targetWeather) return;

    this.targetWeather = weather;
    this.transitionProgress = 0;
  }

  /**
   * Update player position for rain centering
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Get current traction multiplier
   */
  getTraction(): number {
    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];

    return THREE.MathUtils.lerp(
      currentConfig.traction,
      targetConfig.traction,
      this.transitionProgress
    );
  }

  /**
   * Get current weather state
   */
  getCurrentWeather(): WeatherState {
    return this.currentWeather;
  }

  /**
   * Update weather system
   */
  update(deltaTime: number): void {
    // Update transition
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + this.TRANSITION_SPEED * deltaTime);

      if (this.transitionProgress >= 1) {
        this.currentWeather = this.targetWeather;
      }

      this.updateFog();
    }

    // Update rain
    this.updateRain(deltaTime);
  }

  private updateFog(): void {
    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];

    // Interpolate fog values
    const fogNear = THREE.MathUtils.lerp(currentConfig.fogNear, targetConfig.fogNear, this.transitionProgress);
    const fogFar = THREE.MathUtils.lerp(currentConfig.fogFar, targetConfig.fogFar, this.transitionProgress);

    // Interpolate fog color
    const currentColor = new THREE.Color(currentConfig.fogColor);
    const targetColor = new THREE.Color(targetConfig.fogColor);
    const fogColor = currentColor.lerp(targetColor, this.transitionProgress);

    // Apply to scene fog
    if (this.fog) {
      this.fog.near = fogNear;
      this.fog.far = fogFar;
      this.fog.color.copy(fogColor);

      // Also update background to match fog
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(fogColor);
      }
    }
  }

  private updateRain(deltaTime: number): void {
    if (!this.rainParticles || !this.rainPositions || !this.rainVelocities) return;

    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];
    const rainIntensity = THREE.MathUtils.lerp(
      currentConfig.rainIntensity,
      targetConfig.rainIntensity,
      this.transitionProgress
    );

    // Show/hide rain based on intensity
    this.rainParticles.visible = rainIntensity > 0;
    if (rainIntensity <= 0) return;

    // Update rain particle opacity based on intensity
    const material = this.rainParticles.material as THREE.PointsMaterial;
    material.opacity = 0.3 + rainIntensity * 0.4;

    // Center rain around player
    this.rainParticles.position.x = this.playerPosition.x;
    this.rainParticles.position.z = this.playerPosition.z;

    // Animate rain falling
    for (let i = 0; i < this.RAIN_COUNT; i++) {
      // Only animate a portion based on intensity
      if (i / this.RAIN_COUNT > rainIntensity) {
        this.rainPositions[i * 3 + 1] = -100; // Hide excess particles
        continue;
      }

      // Move rain down
      this.rainPositions[i * 3 + 1] -= this.rainVelocities[i] * deltaTime;

      // Add slight horizontal drift
      this.rainPositions[i * 3] += (Math.random() - 0.5) * 0.1;

      // Reset if below ground
      if (this.rainPositions[i * 3 + 1] < 0) {
        this.rainPositions[i * 3] = (Math.random() - 0.5) * this.RAIN_AREA;
        this.rainPositions[i * 3 + 1] = this.RAIN_HEIGHT;
        this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * this.RAIN_AREA;
      }
    }

    // Mark for GPU update
    this.rainGeometry!.attributes.position.needsUpdate = true;
  }

  /**
   * Cycle to next weather state
   */
  cycleWeather(): void {
    const states: WeatherState[] = ['clear', 'foggy', 'light_rain', 'heavy_rain'];
    const currentIndex = states.indexOf(this.targetWeather);
    const nextIndex = (currentIndex + 1) % states.length;
    this.setWeather(states[nextIndex]);
  }

  /**
   * Get weather display name
   */
  getWeatherName(): string {
    switch (this.targetWeather) {
      case 'clear': return 'Clear';
      case 'foggy': return 'Foggy';
      case 'light_rain': return 'Light Rain';
      case 'heavy_rain': return 'Heavy Rain';
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.rainParticles) {
      this.scene.remove(this.rainParticles);
      this.rainGeometry?.dispose();
      (this.rainParticles.material as THREE.Material).dispose();
    }
  }
}
