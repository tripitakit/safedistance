export class InputController {
  private keyStates: Map<string, boolean> = new Map();
  private spaceKeyDownTime: number = 0;
  private spaceKeyPressed: boolean = false;

  // Touch controls state
  private touchAccelPressed: boolean = false;
  private touchBrakePressed: boolean = false;
  private touchBrakeDownTime: number = 0;
  private isMobileDevice: boolean = false;

  private readonly MAX_BRAKE_HOLD_TIME = 1000; // 1000ms for 100% braking

  constructor() {
    this.detectMobileDevice();
    this.setupEventListeners();
    this.setupMobileUI();
  }

  private detectMobileDevice(): void {
    // Detect touch capability or mobile user agent
    this.isMobileDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  }

  private setupMobileUI(): void {
    if (this.isMobileDevice) {
      // Show mobile controls
      const mobileControls = document.getElementById('mobileControls');
      if (mobileControls) {
        mobileControls.classList.remove('hidden');
      }

      // Switch to mobile instructions
      document.body.classList.add('mobile-mode');
      const desktopInstructions = document.querySelector('.desktop-instructions');
      const mobileInstructions = document.querySelector('.mobile-instructions');
      if (desktopInstructions) desktopInstructions.classList.add('hidden');
      if (mobileInstructions) mobileInstructions.classList.remove('hidden');
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));

    // Setup touch controls
    this.setupTouchControls();
  }

  private setupTouchControls(): void {
    const accelBtn = document.getElementById('accelBtn');
    const brakeBtn = document.getElementById('brakeBtn');

    if (accelBtn) {
      accelBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchAccelPressed = true;
        accelBtn.classList.add('active');
      }, { passive: false });

      accelBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchAccelPressed = false;
        accelBtn.classList.remove('active');
      }, { passive: false });

      accelBtn.addEventListener('touchcancel', () => {
        this.touchAccelPressed = false;
        accelBtn.classList.remove('active');
      });
    }

    if (brakeBtn) {
      brakeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchBrakePressed = true;
        this.touchBrakeDownTime = Date.now();
        brakeBtn.classList.add('active');
      }, { passive: false });

      brakeBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchBrakePressed = false;
        this.touchBrakeDownTime = 0;
        brakeBtn.classList.remove('active');
      }, { passive: false });

      brakeBtn.addEventListener('touchcancel', () => {
        this.touchBrakePressed = false;
        this.touchBrakeDownTime = 0;
        brakeBtn.classList.remove('active');
      });
    }
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
    // Check both keyboard and touch input
    return (this.isKeyPressed('enter') || this.touchAccelPressed) ? 1 : 0;
  }

  /**
   * Get braking input (0-1) based on space bar or touch hold time
   * 0ms = 0% (no braking)
   * 1000ms = 100% (full braking)
   * Scales from 10% to 100%
   */
  public getBrakingInput(): number {
    // Check keyboard braking
    if (this.spaceKeyPressed) {
      const holdTime = Date.now() - this.spaceKeyDownTime;
      const normalizedTime = Math.min(holdTime, this.MAX_BRAKE_HOLD_TIME) / this.MAX_BRAKE_HOLD_TIME;
      return 0.1 + (normalizedTime * 0.9);
    }

    // Check touch braking
    if (this.touchBrakePressed) {
      const holdTime = Date.now() - this.touchBrakeDownTime;
      const normalizedTime = Math.min(holdTime, this.MAX_BRAKE_HOLD_TIME) / this.MAX_BRAKE_HOLD_TIME;
      return 0.1 + (normalizedTime * 0.9);
    }

    return 0;
  }

  /**
   * Check if running on mobile device
   */
  public isMobile(): boolean {
    return this.isMobileDevice;
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
