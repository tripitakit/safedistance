import * as THREE from 'three';

export type WeatherState = 'clear' | 'foggy' | 'light_rain' | 'heavy_rain' | 'snow' | 'blizzard';

interface WeatherConfig {
  fogNear: number;
  fogFar: number;
  fogColor: number;
  rainIntensity: number;
  snowIntensity: number;
  traction: number;
  ambientReduction: number;
}

const WEATHER_CONFIGS: Record<WeatherState, WeatherConfig> = {
  clear: {
    fogNear: 38,
    fogFar: 225,
    fogColor: 0x87ceeb,
    rainIntensity: 0,
    snowIntensity: 0,
    traction: 1.0,
    ambientReduction: 0,
  },
  foggy: {
    fogNear: 10,
    fogFar: 60,
    fogColor: 0x999999, // Gray fog
    rainIntensity: 0,
    snowIntensity: 0,
    traction: 0.90, // Slightly reduced visibility affects driving
    ambientReduction: 0.3,
  },
  light_rain: {
    fogNear: 30,
    fogFar: 150,
    fogColor: 0x778899,
    rainIntensity: 0.3,
    snowIntensity: 0,
    traction: 0.85,
    ambientReduction: 0.3,
  },
  heavy_rain: {
    fogNear: 15,
    fogFar: 75,
    fogColor: 0x556677,
    rainIntensity: 1.0,
    snowIntensity: 0,
    traction: 0.70,
    ambientReduction: 0.5,
  },
  snow: {
    fogNear: 25,
    fogFar: 120,
    fogColor: 0xddeeff, // Bright white-blue
    rainIntensity: 0,
    snowIntensity: 0.5,
    traction: 0.60, // Snow is slippery
    ambientReduction: 0.2,
  },
  blizzard: {
    fogNear: 10,
    fogFar: 50,
    fogColor: 0xccddee, // White-out conditions
    rainIntensity: 0,
    snowIntensity: 1.0,
    traction: 0.40, // Very slippery!
    ambientReduction: 0.4,
  },
};

export class WeatherSystem {
  private scene: THREE.Scene;
  private fog: THREE.Fog;

  // Rain particles
  private rainParticles: THREE.Points | null = null;
  private rainGeometry: THREE.BufferGeometry | null = null;
  private rainPositions: Float32Array | null = null;
  private rainVelocities: Float32Array | null = null;
  private rainColors: Float32Array | null = null; // For headlight reflection effect
  private rainDrift: Float32Array | null = null; // Pre-cached horizontal drift per particle
  private lastRainActiveCount: number = 0; // Track for conditional buffer updates

  // Snow particles
  private snowParticles: THREE.Points | null = null;
  private snowGeometry: THREE.BufferGeometry | null = null;
  private snowPositions: Float32Array | null = null;
  private snowVelocities: Float32Array | null = null;
  private snowDrift: Float32Array | null = null; // Horizontal drift per particle
  private snowColors: Float32Array | null = null; // For headlight reflection effect
  private lastSnowActiveCount: number = 0; // Track for conditional buffer updates

  private currentWeather: WeatherState = 'clear';
  private targetWeather: WeatherState = 'clear';
  private transitionProgress: number = 1; // 0-1, 1 = fully transitioned
  private readonly TRANSITION_SPEED = 0.3; // Speed of weather transitions

  private readonly RAIN_COUNT = 3000;
  private readonly SNOW_COUNT = 2000;
  private readonly PARTICLE_AREA = 100; // Area around player
  private readonly PARTICLE_HEIGHT = 50;

  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private playerSpeed: number = 0; // m/s - used for particle rush effect

  // Distance-based weather transitions (progressive difficulty)
  private lastWeatherChangeDistance: number = 0;
  private readonly WEATHER_CHANGE_INTERVAL_KM = 2; // km between weather changes
  private weatherDirection: number = 1; // 1 = getting worse, -1 = getting better (ping-pong)

  // Store reference to ground for snow whitening
  private groundMeshes: THREE.Mesh[] = [];

  // Time-of-day darkness factor (0 = bright day, 1 = full night)
  private timeDarkness: number = 0;

  // Headlight state for rain/snow reflections (always on)
  private headlightsOn: boolean = true;

  // Reusable Color objects to avoid GC allocations in update loop
  private readonly tempCurrentColor = new THREE.Color();
  private readonly tempTargetColor = new THREE.Color();
  private readonly tempNightColor = new THREE.Color(0x111122);
  private readonly tempSnowColor = new THREE.Color(0xeeeeff);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = scene.fog as THREE.Fog;

    this.createRainSystem();
    this.createSnowSystem();
    this.findGroundMeshes();
  }

  private findGroundMeshes(): void {
    // Find ground/road meshes to apply snow whitening
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isGround) {
        this.groundMeshes.push(child);
      }
    });
  }

  private createRainSystem(): void {
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainPositions = new Float32Array(this.RAIN_COUNT * 3);
    this.rainVelocities = new Float32Array(this.RAIN_COUNT);
    this.rainColors = new Float32Array(this.RAIN_COUNT * 3); // RGB per particle
    this.rainDrift = new Float32Array(this.RAIN_COUNT); // Pre-cached drift values

    // Initialize rain particles
    for (let i = 0; i < this.RAIN_COUNT; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * this.PARTICLE_AREA;
      this.rainPositions[i * 3 + 1] = Math.random() * this.PARTICLE_HEIGHT;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * this.PARTICLE_AREA;
      this.rainVelocities[i] = 15 + Math.random() * 10; // Fall speed
      this.rainDrift[i] = (Math.random() - 0.5) * 0.1; // Pre-cached horizontal drift

      // Default rain color (light blue-gray)
      this.rainColors[i * 3] = 0.67;     // R
      this.rainColors[i * 3 + 1] = 0.67; // G
      this.rainColors[i * 3 + 2] = 0.8;  // B
    }

    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainGeometry.setAttribute('color', new THREE.BufferAttribute(this.rainColors, 3));

    const rainMaterial = new THREE.PointsMaterial({
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
      vertexColors: true, // Enable per-particle colors for headlight reflections
    });

    this.rainParticles = new THREE.Points(this.rainGeometry, rainMaterial);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  private createSnowSystem(): void {
    this.snowGeometry = new THREE.BufferGeometry();
    this.snowPositions = new Float32Array(this.SNOW_COUNT * 3);
    this.snowVelocities = new Float32Array(this.SNOW_COUNT);
    this.snowDrift = new Float32Array(this.SNOW_COUNT * 2); // X and Z drift per particle
    this.snowColors = new Float32Array(this.SNOW_COUNT * 3); // RGB per particle

    // Initialize snow particles
    for (let i = 0; i < this.SNOW_COUNT; i++) {
      this.snowPositions[i * 3] = (Math.random() - 0.5) * this.PARTICLE_AREA;
      this.snowPositions[i * 3 + 1] = Math.random() * this.PARTICLE_HEIGHT;
      this.snowPositions[i * 3 + 2] = (Math.random() - 0.5) * this.PARTICLE_AREA;
      this.snowVelocities[i] = 2 + Math.random() * 3; // Slower fall speed than rain
      // Random drift direction per snowflake
      this.snowDrift[i * 2] = (Math.random() - 0.5) * 2; // X drift
      this.snowDrift[i * 2 + 1] = (Math.random() - 0.5) * 2; // Z drift

      // Default snow color (white)
      this.snowColors[i * 3] = 0.9;     // R
      this.snowColors[i * 3 + 1] = 0.9; // G
      this.snowColors[i * 3 + 2] = 1.0; // B (slightly blue-white)
    }

    this.snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    this.snowGeometry.setAttribute('color', new THREE.BufferAttribute(this.snowColors, 3));

    const snowMaterial = new THREE.PointsMaterial({
      size: 0.25, // Larger than rain
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
      vertexColors: true, // Enable per-particle colors for headlight reflections
    });

    this.snowParticles = new THREE.Points(this.snowGeometry, snowMaterial);
    this.snowParticles.visible = false;
    this.scene.add(this.snowParticles);
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
   * Update player position for rain centering and distance-based weather
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);

    // Check for distance-based weather transition
    const currentDistanceKm = Math.abs(position.z) / 1000;
    if (currentDistanceKm - this.lastWeatherChangeDistance >= this.WEATHER_CHANGE_INTERVAL_KM) {
      this.lastWeatherChangeDistance = currentDistanceKm;
      this.transitionToNextWeather();
    }
  }

  /**
   * Set player speed for particle rush effect (m/s)
   */
  setPlayerSpeed(speed: number): void {
    this.playerSpeed = speed;
  }

  /**
   * Transition to next weather state - progressive difficulty with ping-pong cycle
   * Clear → Foggy → Light Rain → Heavy Rain → Snow → Blizzard → Snow → ... → Clear
   */
  private transitionToNextWeather(): void {
    // Weather progression order (increasing difficulty)
    const weatherProgression: WeatherState[] = ['clear', 'foggy', 'light_rain', 'heavy_rain', 'snow', 'blizzard'];
    const currentIndex = weatherProgression.indexOf(this.targetWeather);

    // Calculate next index based on direction
    let nextIndex = currentIndex + this.weatherDirection;

    // Ping-pong: reverse direction at the ends
    if (nextIndex >= weatherProgression.length) {
      // Reached blizzard, reverse direction
      this.weatherDirection = -1;
      nextIndex = weatherProgression.length - 2; // Go to snow
    } else if (nextIndex < 0) {
      // Reached clear, reverse direction
      this.weatherDirection = 1;
      nextIndex = 1; // Go to foggy
    }

    const nextWeather = weatherProgression[nextIndex];
    if (nextWeather !== this.targetWeather) {
      this.setWeather(nextWeather);
    }
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
   * Check if currently snowing
   */
  isSnowing(): boolean {
    const current = this.currentWeather;
    const target = this.targetWeather;
    return current === 'snow' || current === 'blizzard' || target === 'snow' || target === 'blizzard';
  }

  /**
   * Get current rain intensity (0-1) for audio
   */
  getRainIntensity(): number {
    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];

    return THREE.MathUtils.lerp(
      currentConfig.rainIntensity,
      targetConfig.rainIntensity,
      this.transitionProgress
    );
  }

  /**
   * Get current snow intensity (0-1) for audio
   */
  getSnowIntensity(): number {
    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];

    return THREE.MathUtils.lerp(
      currentConfig.snowIntensity,
      targetConfig.snowIntensity,
      this.transitionProgress
    );
  }

  /**
   * Set time-of-day darkness factor (called from main with TimeOfDay.getDarkness())
   */
  setTimeDarkness(darkness: number): void {
    this.timeDarkness = darkness;
  }

  /**
   * Set headlights state for rain reflection effect
   */
  setHeadlights(on: boolean): void {
    this.headlightsOn = on;
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

      this.updateEnvironmentWhitening();
    }

    // Always update fog (responds to time-of-day darkness changes too)
    this.updateFog();

    // Update precipitation
    this.updateRain(deltaTime);
    this.updateSnow(deltaTime);
  }

  private updateFog(): void {
    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];

    // Interpolate fog values
    let fogNear = THREE.MathUtils.lerp(currentConfig.fogNear, targetConfig.fogNear, this.transitionProgress);
    let fogFar = THREE.MathUtils.lerp(currentConfig.fogFar, targetConfig.fogFar, this.transitionProgress);

    // At night in clear weather, push fog much further so stars are visible
    // Stars are at 500 units, so fog far needs to be well beyond that
    const isClearWeather = this.currentWeather === 'clear' && this.targetWeather === 'clear';
    if (isClearWeather && this.timeDarkness > 0.5) {
      // Gradually push fog further as it gets darker (from 0.5 to 1.0 darkness)
      const nightFactor = Math.min(1, (this.timeDarkness - 0.5) * 2);
      fogNear = THREE.MathUtils.lerp(fogNear, 500, nightFactor);
      fogFar = THREE.MathUtils.lerp(fogFar, 2000, nightFactor);
    }

    // Interpolate weather fog color (reuse Color objects to avoid GC)
    this.tempCurrentColor.setHex(currentConfig.fogColor);
    this.tempTargetColor.setHex(targetConfig.fogColor);
    this.tempCurrentColor.lerp(this.tempTargetColor, this.transitionProgress);

    // Apply time-of-day darkness to fog color
    // At night (darkness=0.85), fog becomes very dark
    this.tempCurrentColor.lerp(this.tempNightColor, this.timeDarkness);

    // Apply to scene fog
    if (this.fog) {
      this.fog.near = fogNear;
      this.fog.far = fogFar;
      this.fog.color.copy(this.tempCurrentColor);

      // Also update background to match fog
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.copy(this.tempCurrentColor);
      }
    }
  }

  private updateEnvironmentWhitening(): void {
    // Calculate snow intensity for whitening effect
    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];
    const snowIntensity = THREE.MathUtils.lerp(
      currentConfig.snowIntensity,
      targetConfig.snowIntensity,
      this.transitionProgress
    );

    // Apply whitening to ground meshes based on snow intensity
    for (const mesh of this.groundMeshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material && material.color) {
        // Interpolate toward white based on snow intensity
        const originalColor = mesh.userData.originalColor || material.color.clone();
        if (!mesh.userData.originalColor) {
          mesh.userData.originalColor = originalColor.clone();
        }

        material.color.copy(originalColor).lerp(this.tempSnowColor, snowIntensity * 0.7);
      }
    }
  }

  private updateRain(deltaTime: number): void {
    if (!this.rainParticles || !this.rainPositions || !this.rainVelocities || !this.rainColors || !this.rainDrift) return;

    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];
    const rainIntensity = THREE.MathUtils.lerp(
      currentConfig.rainIntensity,
      targetConfig.rainIntensity,
      this.transitionProgress
    );

    // Show/hide rain based on intensity
    this.rainParticles.visible = rainIntensity > 0;
    if (rainIntensity <= 0) {
      this.lastRainActiveCount = 0;
      return;
    }

    // Calculate active particle count once
    const activeCount = Math.floor(this.RAIN_COUNT * rainIntensity);

    // Update rain particle opacity based on intensity
    const material = this.rainParticles.material as THREE.PointsMaterial;
    material.opacity = 0.3 + rainIntensity * 0.4;

    // Center rain around player
    this.rainParticles.position.x = this.playerPosition.x;
    this.rainParticles.position.z = this.playerPosition.z;

    // Calculate rush effect based on player speed
    // Particles appear to rush toward the player (positive Z in local space)
    const speedRushFactor = this.playerSpeed * 0.8; // Scale speed effect for rain

    // Headlight beam parameters (in local particle space)
    // Beam is in front of player (-Z), low (Y < 5), and within ~8m width (X)
    const beamMaxZ = 5;     // How far behind player beam is still visible
    const beamMinZ = -35;   // How far ahead of player beam reaches
    const beamMaxX = 8;     // Width of beam
    const beamMaxY = 6;     // Height of beam

    // Animate only active rain particles
    for (let i = 0; i < activeCount; i++) {
      const x = this.rainPositions[i * 3];
      const y = this.rainPositions[i * 3 + 1];
      const z = this.rainPositions[i * 3 + 2];

      // Move rain down
      this.rainPositions[i * 3 + 1] -= this.rainVelocities[i] * deltaTime;

      // Add pre-cached horizontal drift (no Math.random() per frame)
      this.rainPositions[i * 3] += this.rainDrift[i];

      // Rush toward player based on car speed (particles move in +Z direction)
      this.rainPositions[i * 3 + 2] += speedRushFactor * deltaTime;

      // Headlight reflection effect
      let inBeam = false;
      if (this.headlightsOn) {
        // Check if particle is in headlight beam area
        const inBeamZ = z > beamMinZ && z < beamMaxZ;
        const inBeamX = Math.abs(x) < beamMaxX;
        const inBeamY = y > 0 && y < beamMaxY;
        inBeam = inBeamZ && inBeamX && inBeamY;

        if (inBeam) {
          // Calculate intensity based on position in beam (brighter near center)
          const zFactor = 1 - Math.abs(z - beamMinZ / 2) / (-beamMinZ);
          const xFactor = 1 - Math.abs(x) / beamMaxX;
          const yFactor = 1 - y / beamMaxY;
          const beamIntensity = zFactor * xFactor * yFactor;

          // Bright white/yellow in headlight beam
          this.rainColors[i * 3] = 0.67 + beamIntensity * 0.33;     // R (up to 1.0)
          this.rainColors[i * 3 + 1] = 0.67 + beamIntensity * 0.33; // G (up to 1.0)
          this.rainColors[i * 3 + 2] = 0.8 + beamIntensity * 0.2;   // B (up to 1.0)
        }
      }
      if (!inBeam) {
        // Default rain color outside beam or headlights off
        this.rainColors[i * 3] = 0.67;
        this.rainColors[i * 3 + 1] = 0.67;
        this.rainColors[i * 3 + 2] = 0.8;
      }

      // Reset if below ground OR if rushed past player (behind camera)
      if (this.rainPositions[i * 3 + 1] < 0 || this.rainPositions[i * 3 + 2] > this.PARTICLE_AREA / 2) {
        this.rainPositions[i * 3] = (Math.random() - 0.5) * this.PARTICLE_AREA;
        this.rainPositions[i * 3 + 1] = Math.random() * this.PARTICLE_HEIGHT;
        // Spawn ahead of player (negative Z) so they rush toward us
        this.rainPositions[i * 3 + 2] = -this.PARTICLE_AREA / 2 + (Math.random() - 0.5) * 20;
        // New random drift for respawned particle
        this.rainDrift[i] = (Math.random() - 0.5) * 0.1;
      }
    }

    // Hide excess particles only when active count changes
    if (activeCount < this.lastRainActiveCount) {
      for (let i = activeCount; i < this.lastRainActiveCount; i++) {
        this.rainPositions[i * 3 + 1] = -100;
      }
    }
    this.lastRainActiveCount = activeCount;

    // Mark for GPU update
    this.rainGeometry!.attributes.position.needsUpdate = true;
    this.rainGeometry!.attributes.color.needsUpdate = true;
  }

  private updateSnow(deltaTime: number): void {
    if (!this.snowParticles || !this.snowPositions || !this.snowVelocities || !this.snowDrift || !this.snowColors) return;

    const currentConfig = WEATHER_CONFIGS[this.currentWeather];
    const targetConfig = WEATHER_CONFIGS[this.targetWeather];
    const snowIntensity = THREE.MathUtils.lerp(
      currentConfig.snowIntensity,
      targetConfig.snowIntensity,
      this.transitionProgress
    );

    // Show/hide snow based on intensity
    this.snowParticles.visible = snowIntensity > 0;
    if (snowIntensity <= 0) {
      this.lastSnowActiveCount = 0;
      return;
    }

    // Calculate active particle count once
    const activeCount = Math.floor(this.SNOW_COUNT * snowIntensity);

    // Update snow particle opacity based on intensity
    const material = this.snowParticles.material as THREE.PointsMaterial;
    material.opacity = 0.5 + snowIntensity * 0.4;
    material.size = 0.2 + snowIntensity * 0.15; // Larger flakes in blizzard

    // Center snow around player
    this.snowParticles.position.x = this.playerPosition.x;
    this.snowParticles.position.z = this.playerPosition.z;

    // Calculate rush effect based on player speed
    // Snow is lighter so it rushes slightly faster than rain appears to
    const speedRushFactor = this.playerSpeed * 0.9;

    // Headlight beam parameters (in local particle space)
    const beamMaxZ = 5;     // How far behind player beam is still visible
    const beamMinZ = -35;   // How far ahead of player beam reaches
    const beamMaxX = 8;     // Width of beam
    const beamMaxY = 6;     // Height of beam

    // Animate only active snow particles
    for (let i = 0; i < activeCount; i++) {
      const x = this.snowPositions[i * 3];
      const y = this.snowPositions[i * 3 + 1];
      const z = this.snowPositions[i * 3 + 2];

      // Move snow down (slower than rain)
      this.snowPositions[i * 3 + 1] -= this.snowVelocities[i] * deltaTime;

      // Add gentle swaying/drifting motion (use pre-cached drift, no Math.random per frame)
      const driftX = this.snowDrift[i * 2];
      this.snowPositions[i * 3] += driftX * deltaTime;

      // Rush toward player based on car speed (particles move in +Z direction)
      // Combined with natural drift for more chaotic blizzard feel
      const driftZ = this.snowDrift[i * 2 + 1];
      this.snowPositions[i * 3 + 2] += speedRushFactor * deltaTime + driftZ * deltaTime;

      // Headlight reflection effect
      let inBeam = false;
      if (this.headlightsOn) {
        // Check if particle is in headlight beam area
        const inBeamZ = z > beamMinZ && z < beamMaxZ;
        const inBeamX = Math.abs(x) < beamMaxX;
        const inBeamY = y > 0 && y < beamMaxY;
        inBeam = inBeamZ && inBeamX && inBeamY;

        if (inBeam) {
          // Calculate intensity based on position in beam (brighter near center)
          const zFactor = 1 - Math.abs(z - beamMinZ / 2) / (-beamMinZ);
          const xFactor = 1 - Math.abs(x) / beamMaxX;
          const yFactor = 1 - y / beamMaxY;
          const beamIntensity = zFactor * xFactor * yFactor;

          // Bright white/yellow in headlight beam (snow is already white, so boost it more)
          this.snowColors[i * 3] = 0.9 + beamIntensity * 0.1;     // R (up to 1.0)
          this.snowColors[i * 3 + 1] = 0.9 + beamIntensity * 0.1; // G (up to 1.0)
          this.snowColors[i * 3 + 2] = 1.0;                        // B (stays bright)
        }
      }
      if (!inBeam) {
        // Default snow color outside beam or headlights off
        this.snowColors[i * 3] = 0.9;
        this.snowColors[i * 3 + 1] = 0.9;
        this.snowColors[i * 3 + 2] = 1.0;
      }

      // Reset if below ground OR if rushed past player (behind camera)
      if (this.snowPositions[i * 3 + 1] < 0 || this.snowPositions[i * 3 + 2] > this.PARTICLE_AREA / 2) {
        this.snowPositions[i * 3] = (Math.random() - 0.5) * this.PARTICLE_AREA;
        this.snowPositions[i * 3 + 1] = Math.random() * this.PARTICLE_HEIGHT;
        // Spawn ahead of player (negative Z) so they rush toward us
        this.snowPositions[i * 3 + 2] = -this.PARTICLE_AREA / 2 + (Math.random() - 0.5) * 20;
        // New random drift for respawned particle
        this.snowDrift[i * 2] = (Math.random() - 0.5) * 2;
        this.snowDrift[i * 2 + 1] = (Math.random() - 0.5) * 2;
      }
    }

    // Hide excess particles only when active count changes
    if (activeCount < this.lastSnowActiveCount) {
      for (let i = activeCount; i < this.lastSnowActiveCount; i++) {
        this.snowPositions[i * 3 + 1] = -100;
      }
    }
    this.lastSnowActiveCount = activeCount;

    // Mark for GPU update
    this.snowGeometry!.attributes.position.needsUpdate = true;
    this.snowGeometry!.attributes.color.needsUpdate = true;
  }

  /**
   * Pre-warm particle systems to force shader compilation.
   * Makes rain and snow particles visible briefly then hides them.
   */
  preWarmParticles(): void {
    // Make rain particles visible briefly to compile their shaders
    if (this.rainParticles) {
      this.rainParticles.visible = true;
    }
    // Make snow particles visible briefly to compile their shaders
    if (this.snowParticles) {
      this.snowParticles.visible = true;
    }

    // Note: Caller should render once, then call hidePreWarmParticles()
  }

  /**
   * Hide particles after pre-warming render pass
   */
  hidePreWarmParticles(): void {
    if (this.rainParticles) {
      this.rainParticles.visible = false;
    }
    if (this.snowParticles) {
      this.snowParticles.visible = false;
    }
  }

  /**
   * Cycle to next weather state
   */
  cycleWeather(): void {
    const states: WeatherState[] = ['clear', 'foggy', 'light_rain', 'heavy_rain', 'snow', 'blizzard'];
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
      case 'snow': return 'Snow';
      case 'blizzard': return 'Blizzard';
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
    if (this.snowParticles) {
      this.scene.remove(this.snowParticles);
      this.snowGeometry?.dispose();
      (this.snowParticles.material as THREE.Material).dispose();
    }
  }
}
