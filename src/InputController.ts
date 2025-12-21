export class InputController {
  private keyStates: Map<string, boolean> = new Map();
  private spaceKeyDownTime: number = 0;
  private spaceKeyPressed: boolean = false;

  private readonly MAX_BRAKE_HOLD_TIME = 1000; // 1000ms for 100% braking

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    // Prevent default for space to avoid page scrolling
    if (key === ' ') {
      event.preventDefault();

      if (!this.spaceKeyPressed) {
        this.spaceKeyPressed = true;
        this.spaceKeyDownTime = Date.now();
      }
    }

    this.keyStates.set(key, true);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (key === ' ') {
      event.preventDefault();
      this.spaceKeyPressed = false;
      this.spaceKeyDownTime = 0;
    }

    this.keyStates.set(key, false);
  }

  public isKeyPressed(key: string): boolean {
    return this.keyStates.get(key.toLowerCase()) || false;
  }

  /**
   * Get acceleration input (0-1)
   */
  public getAccelerationInput(): number {
    return this.isKeyPressed('enter') ? 1 : 0;
  }

  /**
   * Get braking input (0-1) based on space bar hold time
   * 0ms = 0% (no braking)
   * 1000ms = 100% (full braking)
   * Scales from 10% to 100%
   */
  public getBrakingInput(): number {
    if (!this.spaceKeyPressed) {
      return 0;
    }

    const holdTime = Date.now() - this.spaceKeyDownTime;
    const normalizedTime = Math.min(holdTime, this.MAX_BRAKE_HOLD_TIME) / this.MAX_BRAKE_HOLD_TIME;

    // Scale from 10% to 100%
    return 0.1 + (normalizedTime * 0.9);
  }

  /**
   * Get the visual brake percentage for HUD display
   */
  public getBrakePercentage(): number {
    return Math.round(this.getBrakingInput() * 100);
  }

  /**
   * Get debug info about key states
   */
  public getDebugInfo(): string {
    const enterPressed = this.isKeyPressed('enter') ? 'YES' : 'NO';
    const spacePressed = this.spaceKeyPressed ? 'YES' : 'NO';
    const holdTime = this.spaceKeyPressed ? Date.now() - this.spaceKeyDownTime : 0;
    return `Enter: ${enterPressed} | Space: ${spacePressed} (${holdTime}ms)`;
  }
}
