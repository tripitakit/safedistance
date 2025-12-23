import { Vehicle } from './Vehicle';

enum AIState {
  ACCELERATING,
  CRUISING,
  BRAKING
}

export class LeadVehicleAI {
  private vehicle: Vehicle;
  private state: AIState = AIState.ACCELERATING;
  private targetSpeed: number = 0; // km/h
  private stateTimer: number = 0;
  private brakingIntensity: number = 0.1; // 10% to 100%

  // Speed limits and patterns
  private readonly MIN_SPEED = 30; // km/h
  private readonly CRUISE_SPEED = 130; // km/h

  // Weather-based visibility/traction (affects braking behavior)
  private traction: number = 1.0;

  constructor(vehicle: Vehicle) {
    this.vehicle = vehicle;
    this.targetSpeed = this.CRUISE_SPEED;
    this.vehicle.setVelocity(this.MIN_SPEED);
  }

  /**
   * Set weather traction - affects braking behavior
   * In bad weather, lead vehicle brakes more suddenly and harder
   */
  public setTraction(traction: number): void {
    this.traction = traction;
  }

  public update(deltaTime: number): void {
    this.stateTimer += deltaTime;

    switch (this.state) {
      case AIState.ACCELERATING:
        this.updateAccelerating(deltaTime);
        break;
      case AIState.CRUISING:
        this.updateCruising(deltaTime);
        break;
      case AIState.BRAKING:
        this.updateBraking(deltaTime);
        break;
    }

    this.vehicle.update(deltaTime);
  }

  private updateAccelerating(_deltaTime: number): void {
    const currentSpeed = this.vehicle.getVelocityKmh();

    if (currentSpeed < this.targetSpeed) {
      // Gradual acceleration (0.3 to 0.6 intensity)
      this.vehicle.setAcceleration(0.5);
      this.vehicle.setBraking(0);
    } else {
      // Reached target speed, switch to cruising
      this.state = AIState.CRUISING;
      this.stateTimer = 0;
    }
  }

  private updateCruising(_deltaTime: number): void {
    const currentSpeed = this.vehicle.getVelocityKmh();

    // Maintain speed
    if (currentSpeed < this.targetSpeed - 5) {
      this.vehicle.setAcceleration(0.3);
      this.vehicle.setBraking(0);
    } else if (currentSpeed > this.targetSpeed + 5) {
      this.vehicle.setAcceleration(0);
      this.vehicle.setBraking(0.2);
    } else {
      this.vehicle.setAcceleration(0);
      this.vehicle.setBraking(0);
    }

    // In bad weather, lead vehicle brakes more frequently and more suddenly
    // (simulates reduced visibility - they see hazards later)
    const weatherFactor = 1.0 - (1.0 - this.traction) * 1.5; // 1.0 in clear, down to 0.4 in blizzard
    const minCruiseTime = 3 * weatherFactor; // Less cruise time in bad weather (3-5s vs 5s)
    const cruiseTimeRange = 8 * weatherFactor; // Less variation in bad weather

    // Random events: decide to brake or speed up
    if (this.stateTimer > minCruiseTime + Math.random() * cruiseTimeRange) {
      // In bad weather, more likely to brake (sees hazards suddenly)
      const brakeChance = 0.5 + (1.0 - this.traction) * 0.3; // 50% to 80% brake chance

      if (Math.random() < brakeChance) {
        // Start braking - harder braking in bad weather (panic braking)
        this.state = AIState.BRAKING;
        // Random braking intensity - higher base in bad weather
        const minIntensity = 0.1 + (1.0 - this.traction) * 0.3; // 0.1 to 0.4 base
        this.brakingIntensity = minIntensity + Math.random() * (1.0 - minIntensity);
        this.stateTimer = 0;
      } else {
        // Change target speed (sometimes exceed speed limit)
        if (Math.random() > 0.7) {
          this.targetSpeed = this.CRUISE_SPEED + Math.random() * 50; // 130-180 km/h
        } else {
          this.targetSpeed = this.CRUISE_SPEED;
        }
        this.state = AIState.ACCELERATING;
        this.stateTimer = 0;
      }
    }
  }

  private updateBraking(_deltaTime: number): void {
    const currentSpeed = this.vehicle.getVelocityKmh();

    // Apply braking
    this.vehicle.setAcceleration(0);
    this.vehicle.setBraking(this.brakingIntensity);

    // Brake for 2-4 seconds
    const brakingDuration = 2 + Math.random() * 2;

    if (this.stateTimer > brakingDuration || currentSpeed < this.MIN_SPEED) {
      // Stop braking, start accelerating again
      this.state = AIState.ACCELERATING;
      this.targetSpeed = this.CRUISE_SPEED + Math.random() * (Math.random() > 0.7 ? 50 : 0);
      this.stateTimer = 0;
      this.vehicle.setBraking(0);
    }
  }

  public getState(): string {
    return AIState[this.state];
  }
}
