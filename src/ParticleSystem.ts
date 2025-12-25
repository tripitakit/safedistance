import * as THREE from 'three';

export type ParticleType = 'dust' | 'spray' | 'sparks' | 'debris' | 'smoke';

interface Particle {
  active: boolean;
  type: ParticleType;
  life: number;
  maxLife: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  color: THREE.Color;
  alpha: number;
}

interface ParticleConfig {
  type: ParticleType;
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  count?: number;
}

const PARTICLE_CONFIGS: Record<ParticleType, {
  color: number;
  size: [number, number];
  life: [number, number];
  gravity: number;
  drag: number;
  fadeOut: boolean;
}> = {
  dust: {
    color: 0x8b7355,
    size: [0.15, 0.4],
    life: [1.5, 3],
    gravity: 0.5,
    drag: 0.98,
    fadeOut: true,
  },
  spray: {
    color: 0x666666,
    size: [0.1, 0.25],
    life: [0.8, 1.5],
    gravity: 0.3,
    drag: 0.95,
    fadeOut: true,
  },
  sparks: {
    color: 0xff6600,
    size: [0.05, 0.15],
    life: [0.2, 0.5],
    gravity: 2,
    drag: 0.99,
    fadeOut: true,
  },
  debris: {
    color: 0x333333,
    size: [0.1, 0.3],
    life: [1, 3],
    gravity: 9.8,
    drag: 0.98,
    fadeOut: false,
  },
  smoke: {
    color: 0x222222,
    size: [0.2, 0.8],
    life: [2, 4],
    gravity: -0.5, // Rises
    drag: 0.96,
    fadeOut: true,
  },
};

export class ParticleSystem {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private poolSize: number;

  // Reusable temp vector to avoid GC allocations in update loop
  private static readonly tempVelocity = new THREE.Vector3();

  constructor(scene: THREE.Scene, poolSize: number = 500) {
    this.scene = scene;
    this.poolSize = poolSize;

    // Initialize particle pool
    for (let i = 0; i < poolSize; i++) {
      this.particles.push({
        active: false,
        type: 'dust',
        life: 0,
        maxLife: 1,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: 1,
        color: new THREE.Color(1, 1, 1),
        alpha: 1,
      });
    }

    // Create geometry with buffer attributes
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(poolSize * 3);
    this.colors = new Float32Array(poolSize * 3);
    this.sizes = new Float32Array(poolSize);
    this.alphas = new Float32Array(poolSize);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    // Create material with custom shader for size and alpha
    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /**
   * Emit particles of a specific type
   */
  emit(config: ParticleConfig): void {
    const count = config.count || 1;
    const typeConfig = PARTICLE_CONFIGS[config.type];

    for (let i = 0; i < count; i++) {
      const particle = this.getInactiveParticle();
      if (!particle) return; // Pool exhausted

      particle.active = true;
      particle.type = config.type;
      particle.position.copy(config.position);

      // Randomize velocity
      if (config.velocity) {
        particle.velocity.copy(config.velocity);
      } else {
        particle.velocity.set(
          (Math.random() - 0.5) * 2,
          Math.random() * 2,
          (Math.random() - 0.5) * 2
        );
      }

      // Add random spread
      particle.velocity.x += (Math.random() - 0.5) * 1;
      particle.velocity.y += (Math.random() - 0.5) * 1;
      particle.velocity.z += (Math.random() - 0.5) * 1;

      // Randomize life and size
      const [minLife, maxLife] = typeConfig.life;
      particle.maxLife = minLife + Math.random() * (maxLife - minLife);
      particle.life = particle.maxLife;

      const [minSize, maxSize] = typeConfig.size;
      particle.size = minSize + Math.random() * (maxSize - minSize);

      particle.color.setHex(typeConfig.color);
      particle.alpha = 1;
    }
  }

  /**
   * Emit dust particles from wheel positions
   */
  emitDust(position: THREE.Vector3, speed: number): void {
    if (speed < 80) return; // Only at high speed

    const intensity = Math.min((speed - 80) / 100, 1);
    if (Math.random() > intensity * 0.3) return;

    this.emit({
      type: 'dust',
      position: position.clone().add(new THREE.Vector3(0, 0.1, 0)),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        speed * 0.01 + Math.random() * 0.5
      ),
      count: 1 + Math.floor(Math.random() * 2),
    });
  }

  /**
   * Emit brake spray particles
   */
  emitBrakeSpray(position: THREE.Vector3, intensity: number): void {
    if (intensity < 0.3) return;

    if (Math.random() > intensity * 0.5) return;

    this.emit({
      type: 'spray',
      position: position.clone().add(new THREE.Vector3(0, 0.2, 0)),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1,
        Math.random() * 0.5,
        Math.random() * 2
      ),
      count: 1 + Math.floor(intensity * 3),
    });
  }

  /**
   * Emit sparks on collision
   */
  emitSparks(position: THREE.Vector3, intensity: number): void {
    this.emit({
      type: 'sparks',
      position: position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 5
      ),
      count: Math.floor(10 + intensity * 30),
    });
  }

  /**
   * Emit debris on major collision
   */
  emitDebris(position: THREE.Vector3, intensity: number): void {
    this.emit({
      type: 'debris',
      position: position.clone(),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 8
      ),
      count: Math.floor(5 + intensity * 15),
    });
  }

  /**
   * Emit smoke from damaged vehicle
   */
  emitSmoke(position: THREE.Vector3): void {
    if (Math.random() > 0.3) return;

    this.emit({
      type: 'smoke',
      position: position.clone().add(new THREE.Vector3(0, 0.5, 0)),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.5 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.5
      ),
      count: 1,
    });
  }

  /**
   * Update all active particles
   */
  update(deltaTime: number): void {
    for (let i = 0; i < this.poolSize; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        // Hide inactive particles
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -1000; // Below ground
        this.positions[i * 3 + 2] = 0;
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        continue;
      }

      const config = PARTICLE_CONFIGS[particle.type];

      // Update life
      particle.life -= deltaTime;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }

      // Apply physics
      particle.velocity.y -= config.gravity * deltaTime;
      particle.velocity.multiplyScalar(config.drag);
      // Use static temp vector to avoid GC allocations
      ParticleSystem.tempVelocity.copy(particle.velocity).multiplyScalar(deltaTime);
      particle.position.add(ParticleSystem.tempVelocity);

      // Update alpha based on life
      if (config.fadeOut) {
        particle.alpha = particle.life / particle.maxLife;
      }

      // Ground collision for debris
      if (particle.type === 'debris' && particle.position.y < 0.1) {
        particle.position.y = 0.1;
        particle.velocity.y = -particle.velocity.y * 0.3;
        particle.velocity.x *= 0.8;
        particle.velocity.z *= 0.8;
      }

      // Update buffer attributes
      this.positions[i * 3] = particle.position.x;
      this.positions[i * 3 + 1] = particle.position.y;
      this.positions[i * 3 + 2] = particle.position.z;

      this.colors[i * 3] = particle.color.r;
      this.colors[i * 3 + 1] = particle.color.g;
      this.colors[i * 3 + 2] = particle.color.b;

      this.sizes[i] = particle.size * (0.5 + particle.alpha * 0.5);
      this.alphas[i] = particle.alpha;
    }

    // Mark attributes as needing update
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  private getInactiveParticle(): Particle | null {
    for (const particle of this.particles) {
      if (!particle.active) {
        return particle;
      }
    }
    return null;
  }

  /**
   * Clear all particles
   */
  clear(): void {
    for (const particle of this.particles) {
      particle.active = false;
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
