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

  constructor(vehicle: Vehicle) {
    this.vehicle = vehicle;
    this.targetSpeed = this.CRUISE_SPEED;
    this.vehicle.setVelocity(this.MIN_SPEED);
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

    // Random events: decide to brake or speed up
    if (this.stateTimer > 5 + Math.random() * 10) { // Every 5-15 seconds
      if (Math.random() > 0.5) {
        // Start braking
        this.state = AIState.BRAKING;
        // Random braking intensity in steps of 10%
        this.brakingIntensity = Math.floor(Math.random() * 10 + 1) / 10; // 0.1 to 1.0
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
