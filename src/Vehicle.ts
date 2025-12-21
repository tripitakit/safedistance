import * as THREE from 'three';

export interface VehicleConfig {
  mass: number; // kg
  maxAcceleration: number; // m/s²
  maxBrakingForce: number; // N
  dragCoefficient: number;
}

export class Vehicle {
  public mesh: THREE.Group;
  public velocity: number = 0; // m/s
  public position: number = 0; // meters along the road

  private config: VehicleConfig;
  private currentAcceleration: number = 0;
  private currentBraking: number = 0; // 0-1 (0-100%)

  constructor(config: VehicleConfig, color: number = 0xff0000) {
    this.config = config;
    this.mesh = this.createMesh(color);
  }

  private createMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    // Car body (shortened for player vehicle)
    const bodyLength = color === 0x0000ff ? 1.5 : 4; // Player car hood is much shorter
    const bodyWidth = color === 0x0000ff ? 1.4 : 2; // Player car hood is narrower
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, 1, bodyLength);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      // Make player car hood semi-transparent to see wheels through it
      transparent: color === 0x0000ff,
      opacity: color === 0x0000ff ? 0.4 : 1.0
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    // Don't shift player car body - keep it in normal position
    group.add(body);

    // Car cabin
    const cabinGeometry = new THREE.BoxGeometry(1.8, 0.8, 2);
    let cabinColor = 0x000080; // Default blue for player
    if (color === 0xffff00) {
      cabinColor = 0xcccc00; // Darker yellow for lead car cabin
    } else if (color === 0xff0000) {
      cabinColor = 0x8b0000; // Dark red (if ever used)
    }
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: cabinColor,
      transparent: color === 0x0000ff,
      opacity: color === 0x0000ff ? 0.3 : 1.0 // Semi-transparent for player to see through
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.y = 1.4;
    cabin.position.z = color === 0x0000ff ? 0 : -0.5;
    group.add(cabin);

    // Wheels with emissive material for brake/accel feedback
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);

    const wheelPositions = [
      [-0.9, 0.4, 1.2],
      [0.9, 0.4, 1.2],
      [-0.9, 0.4, -1.2],
      [0.9, 0.4, -1.2]
    ];

    wheelPositions.forEach(pos => {
      const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: 0x000000,
        emissiveIntensity: 1
      });
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.userData.isWheel = true; // Mark as wheel for feedback updates
      group.add(wheel);
    });

    // Add brake lights to LEAD vehicle only (yellow car)
    if (color === 0xffff00) {
      const brakeLightGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.15);
      const brakeLightMaterial = new THREE.MeshStandardMaterial({
        color: 0x330000,
        emissive: 0x000000,
        emissiveIntensity: 2
      });

      // Left brake light (at rear of car - positive Z)
      const leftBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
      leftBrakeLight.position.set(-0.8, 0.9, 2.1);
      leftBrakeLight.userData.isBrakeLight = true;
      group.add(leftBrakeLight);

      // Right brake light (at rear of car - positive Z)
      const rightBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
      rightBrakeLight.position.set(0.8, 0.9, 2.1);
      rightBrakeLight.userData.isBrakeLight = true;
      group.add(rightBrakeLight);
    }

    return group;
  }

  public setAcceleration(value: number): void {
    this.currentAcceleration = Math.max(0, Math.min(1, value));
    this.updateWheelFeedback();
  }

  public setBraking(value: number): void {
    this.currentBraking = Math.max(0, Math.min(1, value));
    this.updateWheelFeedback();
  }

  private updateWheelFeedback(): void {
    let wheelEmissiveColor = new THREE.Color(0x000000);
    let brakeLightEmissive = new THREE.Color(0x000000);

    // Priority: braking (red) overrides acceleration (blue)
    if (this.currentBraking > 0) {
      // Red glow for braking (intensity based on brake pressure)
      wheelEmissiveColor = new THREE.Color(0xff0000).multiplyScalar(this.currentBraking * 2);
      // Bright red for brake lights
      brakeLightEmissive = new THREE.Color(0xff0000).multiplyScalar(this.currentBraking * 3);
    } else if (this.currentAcceleration > 0) {
      // Blue glow for acceleration (only on wheels)
      wheelEmissiveColor = new THREE.Color(0x0088ff).multiplyScalar(this.currentAcceleration * 1.5);
    }

    // Update all wheels and brake lights
    this.mesh.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        if (child.userData.isWheel) {
          (child.material as THREE.MeshStandardMaterial).emissive = wheelEmissiveColor;
        } else if (child.userData.isBrakeLight) {
          (child.material as THREE.MeshStandardMaterial).emissive = brakeLightEmissive;
        }
      }
    });
  }

  public update(deltaTime: number): void {
    // Calculate forces
    let force = 0;

    // Acceleration force
    if (this.currentAcceleration > 0) {
      force += this.config.maxAcceleration * this.config.mass * this.currentAcceleration;
    }

    // Braking force (currentBraking already scaled from 0.1 to 1.0)
    if (this.currentBraking > 0) {
      force -= this.config.maxBrakingForce * this.currentBraking;
    }

    // Drag force (air resistance) - reduced for better speed maintenance
    const dragForce = -this.config.dragCoefficient * this.velocity * Math.abs(this.velocity) * 0.5;
    force += dragForce;

    // Rolling resistance (simplified) - reduced
    if (this.velocity > 0) {
      force -= this.config.mass * 9.81 * 0.003; // 0.3% of weight (reduced from 1%)
    }

    // Calculate acceleration (F = ma, so a = F/m)
    const acceleration = force / this.config.mass;

    // Update velocity
    this.velocity += acceleration * deltaTime;
    this.velocity = Math.max(0, this.velocity); // Can't go backwards

    // Limit to reasonable max speed (250 km/h = 69.4 m/s)
    this.velocity = Math.min(this.velocity, 69.4);

    // Update position
    this.position += this.velocity * deltaTime;

    // Update 3D position
    this.mesh.position.z = -this.position;
  }

  public getVelocityKmh(): number {
    return this.velocity * 3.6; // Convert m/s to km/h
  }

  public setVelocity(velocityKmh: number): void {
    this.velocity = velocityKmh / 3.6; // Convert km/h to m/s
  }

  public getBrakingPercent(): number {
    return Math.round(this.currentBraking * 100);
  }
}
