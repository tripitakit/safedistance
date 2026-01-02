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
  private traction: number = 1.0; // Weather-based traction multiplier (affects braking)


  constructor(config: VehicleConfig, color: number = 0xff0000) {
    this.config = config;
    this.mesh = this.createMesh(color);
  }

  private createMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    // Car body (shortened for player vehicle) - REFLECTIVE
    const isPlayerCar = color === 0x0000ff;
    const bodyLength = isPlayerCar ? 1.5 : 4; // Player car hood is much shorter
    const bodyWidth = isPlayerCar ? 1.4 : 2; // Player car hood is narrower
    const bodyHeight = isPlayerCar ? 1 : 0.8; // Lead car is thinner to sit on wheels
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      // Make player car hood semi-transparent to see wheels through it
      transparent: isPlayerCar,
      opacity: isPlayerCar ? 0.4 : 1.0,
      metalness: 0.8,
      roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    // Player car at y=0.5, lead car raised to sit on wheels
    body.position.y = isPlayerCar ? 0.5 : 0.8;
    group.add(body);

    // Car cabin - REFLECTIVE
    const cabinGeometry = new THREE.BoxGeometry(1.8, 0.8, 2);
    let cabinColor = 0x000080; // Default blue for player
    if (color === 0xffff00) {
      cabinColor = 0xcccc00; // Darker yellow for lead car cabin
    } else if (color === 0xff0000) {
      cabinColor = 0x8b0000; // Dark red (if ever used)
    }
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: cabinColor,
      transparent: isPlayerCar,
      opacity: isPlayerCar ? 0.3 : 1.0, // Semi-transparent for player to see through
      metalness: 0.7,
      roughness: 0.3
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    // Player cabin at y=1.4, lead car cabin raised to y=1.6
    cabin.position.y = isPlayerCar ? 1.4 : 1.6;
    cabin.position.z = isPlayerCar ? 0 : -0.5;
    group.add(cabin);

    // Wheels with emissive material for brake/accel feedback
    const wheelPositions = [
      { pos: [-0.9, 0.4, 1.2], side: -1 },
      { pos: [0.9, 0.4, 1.2], side: 1 },
      { pos: [-0.9, 0.4, -1.2], side: -1 },
      { pos: [0.9, 0.4, -1.2], side: 1 }
    ];

    wheelPositions.forEach(({ pos, side }) => {
      // Tire (black cylinder)
      const tireGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        emissive: 0x000000,
        emissiveIntensity: 1,
        roughness: 0.9
      });
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      // Only mark player car wheels for feedback (not lead car)
      if (isPlayerCar) {
        tire.userData.isWheel = true;
      }
      group.add(tire);

      // Silver rim (visible hubcap)
      const rimGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 16);
      const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        roughness: 0.3,
        metalness: 0.8
      });
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos[0] + side * 0.02, pos[1], pos[2]);
      group.add(rim);
    });

    // Add mirrors to PLAYER vehicle only (blue car)
    if (color === 0x0000ff) {
      // Mirror frame material
      const mirrorFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.3,
        metalness: 0.8
      });

      // LEFT SIDE MIRROR - slim depth
      const leftMirrorFrame = new THREE.BoxGeometry(0.40, 0.14, 0.02);
      const leftMirror = new THREE.Mesh(leftMirrorFrame, mirrorFrameMaterial);
      leftMirror.position.set(-0.86, 1.05, -0.25);
      group.add(leftMirror);

      // Left mirror surface with UV offset for center-magnify effect
      const leftMirrorGeom = new THREE.PlaneGeometry(0.36, 0.11);
      // Modify UVs to show center portion of texture (magnify center/road area)
      const leftUVs = leftMirrorGeom.attributes.uv;
      for (let i = 0; i < leftUVs.count; i++) {
        const u = leftUVs.getX(i);
        // Compress U range to center portion (0.25-0.75 instead of 0-1)
        leftUVs.setX(i, 0.25 + u * 0.5);
      }
      const leftMirrorSurface = new THREE.Mesh(
        leftMirrorGeom,
        new THREE.MeshBasicMaterial({ color: 0x333344, side: THREE.DoubleSide })
      );
      leftMirrorSurface.position.set(-0.86, 1.05, -0.23);
      leftMirrorSurface.rotation.y = Math.PI; // Face straight backward
      leftMirrorSurface.userData.isMirror = true;
      leftMirrorSurface.userData.mirrorType = 'left';
      group.add(leftMirrorSurface);

      // RIGHT SIDE MIRROR - slender horizontal, moved 25% toward center
      const rightMirror = new THREE.Mesh(leftMirrorFrame.clone(), mirrorFrameMaterial);
      rightMirror.position.set(0.86, 1.05, -0.25);
      group.add(rightMirror);

      // Right mirror surface with UV offset for center-magnify effect
      const rightMirrorGeom = new THREE.PlaneGeometry(0.36, 0.11);
      // Modify UVs to show center portion of texture (magnify center/road area)
      const rightUVs = rightMirrorGeom.attributes.uv;
      for (let i = 0; i < rightUVs.count; i++) {
        const u = rightUVs.getX(i);
        // Compress U range to center portion (0.25-0.75 instead of 0-1)
        rightUVs.setX(i, 0.25 + u * 0.5);
      }
      const rightMirrorSurface = new THREE.Mesh(
        rightMirrorGeom,
        new THREE.MeshBasicMaterial({ color: 0x333344, side: THREE.DoubleSide })
      );
      rightMirrorSurface.position.set(0.86, 1.05, -0.23);
      rightMirrorSurface.rotation.y = Math.PI; // Face straight backward
      rightMirrorSurface.userData.isMirror = true;
      rightMirrorSurface.userData.mirrorType = 'right';
      group.add(rightMirrorSurface);

      // CENTER REARVIEW MIRROR - slim depth
      const centerMirrorFrame = new THREE.BoxGeometry(0.7, 0.25, 0.02);
      const centerMirror = new THREE.Mesh(centerMirrorFrame, mirrorFrameMaterial);
      centerMirror.position.set(0, 1.5, -0.4);
      group.add(centerMirror);

      // Center mirror surface - facing backward
      const centerMirrorSurface = new THREE.Mesh(
        new THREE.PlaneGeometry(0.65, 0.20),
        new THREE.MeshBasicMaterial({ color: 0x333344, side: THREE.DoubleSide })
      );
      centerMirrorSurface.position.set(0, 1.5, -0.38);
      centerMirrorSurface.rotation.y = Math.PI;
      centerMirrorSurface.userData.isMirror = true;
      centerMirrorSurface.userData.mirrorType = 'center';
      group.add(centerMirrorSurface);

      // PLAYER CAR HEADLIGHTS - lights only, no visible box meshes
      // Point lights for headlight glow
      const leftLight = new THREE.PointLight(0xffffee, 2, 20);
      leftLight.position.set(-0.5, 0.6, -1.2);
      group.add(leftLight);

      const rightLight = new THREE.PointLight(0xffffee, 2, 20);
      rightLight.position.set(0.5, 0.6, -1.2);
      group.add(rightLight);

      // Spotlights for visible beam effect - stronger
      const leftSpot = new THREE.SpotLight(0xffffdd, 8, 60, Math.PI / 6, 0.3);
      leftSpot.position.set(-0.5, 0.6, -0.9);
      leftSpot.target.position.set(-1, -0.5, -25);
      group.add(leftSpot);
      group.add(leftSpot.target);

      const rightSpot = new THREE.SpotLight(0xffffdd, 8, 60, Math.PI / 6, 0.3);
      rightSpot.position.set(0.5, 0.6, -0.9);
      rightSpot.target.position.set(1, -0.5, -25);
      group.add(rightSpot);
      group.add(rightSpot.target);

      // VISIBLE LIGHT BEAM CONES - mesh-based for clear visibility
      const beamLength = 25;
      const beamEndRadius = 4;

      // Create cone geometry for light beam (pointing forward in -Z)
      const beamGeometry = new THREE.ConeGeometry(beamEndRadius, beamLength, 16, 1, true);
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffcc,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      // Left beam cone
      const leftBeam = new THREE.Mesh(beamGeometry, beamMaterial);
      leftBeam.position.set(-0.5, 0.5, -beamLength / 2 - 1);
      leftBeam.rotation.x = Math.PI / 2; // Point forward
      leftBeam.rotation.z = Math.PI; // Flip so wide end is forward
      group.add(leftBeam);

      // Right beam cone
      const rightBeam = new THREE.Mesh(beamGeometry.clone(), beamMaterial.clone());
      rightBeam.position.set(0.5, 0.5, -beamLength / 2 - 1);
      rightBeam.rotation.x = Math.PI / 2;
      rightBeam.rotation.z = Math.PI;
      group.add(rightBeam);

      // GROUND LIGHT PATCHES - bright spots on the road where beams hit
      const groundLightGeometry = new THREE.PlaneGeometry(6, 12);
      const groundLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffdd,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      // Left ground light patch
      const leftGroundLight = new THREE.Mesh(groundLightGeometry, groundLightMaterial);
      leftGroundLight.position.set(-1.5, 0.02, -18); // Just above road surface
      leftGroundLight.rotation.x = -Math.PI / 2; // Flat on ground
      group.add(leftGroundLight);

      // Right ground light patch
      const rightGroundLight = new THREE.Mesh(groundLightGeometry.clone(), groundLightMaterial.clone());
      rightGroundLight.position.set(1.5, 0.02, -18);
      rightGroundLight.rotation.x = -Math.PI / 2;
      group.add(rightGroundLight);

      // Center overlap light (brighter where beams merge)
      const centerLightGeometry = new THREE.PlaneGeometry(4, 8);
      const centerLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffee,
        transparent: true,
        opacity: 0.20,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const centerGroundLight = new THREE.Mesh(centerLightGeometry, centerLightMaterial);
      centerGroundLight.position.set(0, 0.03, -14);
      centerGroundLight.rotation.x = -Math.PI / 2;
      group.add(centerGroundLight);
    }

    // Add tail lights, brake lights, rear windscreen, and license plate to LEAD vehicle only (yellow car)
    if (color === 0xffff00) {
      // TAIL LIGHTS (always on, dim red)
      const tailLightGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.15);
      const tailLightMaterial = new THREE.MeshStandardMaterial({
        color: 0x660000,
        emissive: 0x440000, // Always slightly glowing
        emissiveIntensity: 1.0
      });

      // Left tail light (at rear of car - positive Z) - raised with body
      const leftTailLight = new THREE.Mesh(tailLightGeometry, tailLightMaterial.clone());
      leftTailLight.position.set(-0.8, 1.0, 2.1);
      leftTailLight.userData.isBrakeLight = true;
      leftTailLight.userData.isTailLight = true;
      group.add(leftTailLight);

      // Right tail light (at rear of car - positive Z) - raised with body
      const rightTailLight = new THREE.Mesh(tailLightGeometry, tailLightMaterial.clone());
      rightTailLight.position.set(0.8, 1.0, 2.1);
      rightTailLight.userData.isBrakeLight = true;
      rightTailLight.userData.isTailLight = true;
      group.add(rightTailLight);

      // CENTER HIGH-MOUNT BRAKE LIGHT (third brake light above rear window)
      const centerBrakeLightGeometry = new THREE.BoxGeometry(0.6, 0.12, 0.08);
      const centerBrakeLightMaterial = new THREE.MeshStandardMaterial({
        color: 0x660000,
        emissive: 0x330000, // Dim when not braking
        emissiveIntensity: 0.8
      });
      const centerBrakeLight = new THREE.Mesh(centerBrakeLightGeometry, centerBrakeLightMaterial);
      centerBrakeLight.position.set(0, 2.05, 0.6); // Above rear window
      centerBrakeLight.userData.isBrakeLight = true;
      centerBrakeLight.userData.isCenterBrakeLight = true;
      group.add(centerBrakeLight);

      // Point lights for tail light glow (always on, dim)
      const leftTailGlow = new THREE.PointLight(0xff2200, 0.5, 8);
      leftTailGlow.position.set(-0.8, 1.0, 2.3);
      leftTailGlow.userData.isTailGlow = true;
      group.add(leftTailGlow);

      const rightTailGlow = new THREE.PointLight(0xff2200, 0.5, 8);
      rightTailGlow.position.set(0.8, 1.0, 2.3);
      rightTailGlow.userData.isTailGlow = true;
      group.add(rightTailGlow);

      // Rear windscreen (back window) - angled glass panel - raised with cabin
      const rearWindowGeometry = new THREE.PlaneGeometry(1.6, 0.7);
      const rearWindowMaterial = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.4,
        metalness: 0.9,
        roughness: 0.1,
        side: THREE.DoubleSide
      });
      const rearWindow = new THREE.Mesh(rearWindowGeometry, rearWindowMaterial);
      rearWindow.position.set(0, 1.6, 1.05); // Raised to match cabin
      group.add(rearWindow);

      // License plate - white background with border - raised with body
      const plateGeometry = new THREE.PlaneGeometry(0.8, 0.25);
      const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3
      });
      const plate = new THREE.Mesh(plateGeometry, plateMaterial);
      plate.position.set(0, 0.6, 2.08);
      group.add(plate);

      // License plate border - raised with body
      const plateBorderGeometry = new THREE.PlaneGeometry(0.85, 0.3);
      const plateBorderMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.5
      });
      const plateBorder = new THREE.Mesh(plateBorderGeometry, plateBorderMaterial);
      plateBorder.position.set(0, 0.6, 2.07);
      group.add(plateBorder);

      // License plate text (simple dark rectangles to simulate characters) - raised with body
      const charGeometry = new THREE.PlaneGeometry(0.08, 0.12);
      const charMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.5
      });
      // Add 6 character blocks to simulate plate number
      const charPositions = [-0.28, -0.17, -0.06, 0.06, 0.17, 0.28];
      charPositions.forEach(xPos => {
        const char = new THREE.Mesh(charGeometry, charMaterial);
        char.position.set(xPos, 0.6, 2.09);
        group.add(char);
      });
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

    // Tail lights base emissive (always on)
    const tailLightBaseEmissive = new THREE.Color(0x440000);
    // Brake light emissive (when braking - much brighter)
    const brakingEmissive = new THREE.Color(0xff0000);

    // Priority: braking (red) overrides acceleration (blue)
    if (this.currentBraking > 0) {
      // Red glow for braking (intensity based on brake pressure)
      wheelEmissiveColor = new THREE.Color(0xff0000).multiplyScalar(this.currentBraking * 2);
    } else if (this.currentAcceleration > 0) {
      // Blue glow for acceleration (only on wheels)
      wheelEmissiveColor = new THREE.Color(0x0088ff).multiplyScalar(this.currentAcceleration * 1.5);
    }

    // Calculate brake light intensity
    const brakeIntensity = this.currentBraking;
    const tailGlowIntensity = brakeIntensity > 0 ? 2.0 + brakeIntensity * 3.0 : 0.5; // 0.5 base, up to 5.0 when braking

    // Update all wheels, brake lights, and tail glow lights
    this.mesh.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        if (child.userData.isWheel) {
          (child.material as THREE.MeshStandardMaterial).emissive = wheelEmissiveColor;
        } else if (child.userData.isBrakeLight) {
          const material = child.material as THREE.MeshStandardMaterial;
          if (brakeIntensity > 0) {
            // Braking: bright red, intensity based on brake pressure
            material.emissive = brakingEmissive.clone().multiplyScalar(brakeIntensity * 2);
            material.emissiveIntensity = 2 + brakeIntensity * 3;
          } else {
            // Not braking: tail lights stay on at base level
            if (child.userData.isTailLight) {
              material.emissive = tailLightBaseEmissive;
              material.emissiveIntensity = 1.0;
            } else if (child.userData.isCenterBrakeLight) {
              // Center brake light is dimmer when not braking
              material.emissive = new THREE.Color(0x330000);
              material.emissiveIntensity = 0.8;
            }
          }
        }
      } else if (child instanceof THREE.PointLight && child.userData.isTailGlow) {
        // Update tail glow point lights intensity
        child.intensity = tailGlowIntensity;
      } else if (child instanceof THREE.Group && child.userData.isWheelGroup) {
        // Traverse into wheel groups to find the rim with isWheel marker
        child.children.forEach(wheelPart => {
          if (wheelPart instanceof THREE.Mesh && wheelPart.userData.isWheel) {
            (wheelPart.material as THREE.MeshStandardMaterial).emissive = wheelEmissiveColor;
          }
        });
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
      // Braking force reduced by traction (wet/rainy conditions reduce braking effectiveness)
      force -= this.config.maxBrakingForce * this.currentBraking * this.traction;
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

    // Update weight transfer (visual pitch)
    this.updateWeightTransfer(acceleration, deltaTime);
  }

  private updateWeightTransfer(_acceleration: number, _deltaTime: number): void {
    // Car pitching disabled - keep vehicle level at all times
    this.mesh.rotation.x = 0;
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

  public setTraction(traction: number): void {
    this.traction = Math.max(0.1, Math.min(1.0, traction)); // Clamp between 0.1 and 1.0
  }

  public getTraction(): number {
    return this.traction;
  }

  /**
   * Apply visual damage to the vehicle based on damage level
   * @param damageLevel - 'MINOR' | 'MODERATE' | 'MAJOR' | 'SEVERE' | 'CATASTROPHIC'
   */
  public applyDamage(damageLevel: string): void {
    // Damage intensity from 0 to 1
    let intensity = 0;
    switch (damageLevel) {
      case 'MINOR': intensity = 0.2; break;
      case 'MODERATE': intensity = 0.4; break;
      case 'MAJOR': intensity = 0.6; break;
      case 'SEVERE': intensity = 0.8; break;
      case 'CATASTROPHIC': intensity = 1.0; break;
    }

    // Apply damage effects to all mesh children
    this.mesh.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;

        // Skip wheels - they don't show body damage
        if (child.userData.isWheel) return;

        // Darken and add burnt/damaged look to materials
        const damageColor = new THREE.Color(0x1a1a1a); // Dark burnt color
        material.color.lerp(damageColor, intensity * 0.6);

        // Add roughness (scratched/damaged surface)
        material.roughness = Math.min(1, material.roughness + intensity * 0.5);

        // Reduce metalness (damaged paint)
        material.metalness = Math.max(0, (material.metalness || 0) - intensity * 0.3);

        // Apply deformation based on position and damage level
        // Rear of car (positive Z) gets most damage from rear-end collision
        const zPos = child.position.z;

        if (zPos > 0) {
          // Rear section - most damage
          const deformFactor = intensity * 0.3;

          // Crush the rear (scale Z smaller, shift forward)
          child.scale.z = Math.max(0.5, 1 - deformFactor);
          child.position.z -= deformFactor * 0.5;

          // Slight vertical crush
          child.scale.y = Math.max(0.7, 1 - deformFactor * 0.5);

          // Add slight random rotation for crumpled look
          if (intensity > 0.5) {
            child.rotation.x += (Math.random() - 0.5) * intensity * 0.1;
            child.rotation.y += (Math.random() - 0.5) * intensity * 0.05;
          }
        }

        // Add emissive for fire/heat effect on severe damage
        if (intensity >= 0.8) {
          material.emissive = new THREE.Color(0xff2200);
          material.emissiveIntensity = (intensity - 0.7) * 0.5;
        }
      }
    });

    // Add smoke/dust particles for major damage
    if (intensity >= 0.4) {
      this.addDamageEffects(intensity);
    }
  }

  private addDamageEffects(intensity: number): void {
    // Add smoke wisps using small semi-transparent boxes
    const smokeCount = Math.floor(intensity * 5);
    const smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.4
    });

    for (let i = 0; i < smokeCount; i++) {
      const size = 0.3 + Math.random() * 0.4;
      const smokeGeometry = new THREE.BoxGeometry(size, size * 2, size);
      const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial.clone());

      // Position at rear of car with some randomness
      smoke.position.set(
        (Math.random() - 0.5) * 1.5,
        1 + Math.random() * 1.5,
        1.5 + Math.random() * 0.5
      );

      smoke.userData.isSmoke = true;
      smoke.userData.riseSpeed = 0.5 + Math.random() * 0.5;
      this.mesh.add(smoke);
    }

    // Add sparks/debris for severe damage
    if (intensity >= 0.7) {
      const debrisMaterial = new THREE.MeshBasicMaterial({
        color: 0x333333
      });

      for (let i = 0; i < 8; i++) {
        const debrisGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);

        debris.position.set(
          (Math.random() - 0.5) * 2,
          0.1 + Math.random() * 0.3,
          1.8 + Math.random() * 0.5
        );

        debris.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

        this.mesh.add(debris);
      }
    }
  }
}
