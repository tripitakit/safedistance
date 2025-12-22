import './style.css';
import * as THREE from 'three';
import { Vehicle, VehicleConfig } from './Vehicle';
import { LeadVehicleAI } from './LeadVehicleAI';
import { InputController } from './InputController';
import { HighScoreManager } from './HighScoreManager';
import { AudioEngine } from './AudioEngine';

class SafeDistanceSimulator {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private playerVehicle: Vehicle;
  private leadVehicle: Vehicle;
  private leadVehicleAI: LeadVehicleAI;
  private inputController: InputController;
  private road!: THREE.Group;
  private roadMarkings!: THREE.Group;
  private environment!: THREE.Group;
  private environment2!: THREE.Group;

  // Track bridge kilometer text sprites for dynamic updates
  private bridgeTexts: THREE.Sprite[] = [];

  private lastTime: number = 0;

  // HUD elements
  private warningTooCloseElement: HTMLElement;
  private warningSafeElement: HTMLElement;
  private scoreOverlayElement: HTMLElement;
  private gameStartOverlayElement!: HTMLElement;
  private speedometerCanvas: HTMLCanvasElement;
  private speedometerCtx: CanvasRenderingContext2D;

  // Warning state
  private warningTimeout: number | null = null;
  private lastWarningState: 'safe' | 'danger' | null = null;

  // Game start state
  private gameStarted: boolean = false;

  // Game stats
  private score: number = 0;

  // Game Over elements
  private gameOverElement: HTMLElement;
  private impactForceElement: HTMLElement;
  private speedDiffElement: HTMLElement;
  private crashYourSpeedElement: HTMLElement;
  private crashLeadSpeedElement: HTMLElement;
  private damageElement: HTMLElement;
  private finalKmElement: HTMLElement;
  private finalScoreElement: HTMLElement;
  private restartBtn: HTMLElement;
  private viewHighScoresBtn!: HTMLElement;
  private crashFlashElement: HTMLElement;

  // Health Report elements
  private gForceElement!: HTMLElement;
  private patientStatusElement!: HTMLElement;
  private injuriesListElement!: HTMLElement;
  private prognosisElement!: HTMLElement;

  // Lead Vehicle Health Report elements
  private leadHealthSectionElement!: HTMLElement;
  private leadOccupantsElement!: HTMLElement;
  private leadOccupantsListElement!: HTMLElement;

  // Rear Vehicle Health Report elements
  private rearHealthSectionElement!: HTMLElement;
  private rearOccupantsElement!: HTMLElement;
  private rearOccupantsListElement!: HTMLElement;

  // High score elements
  private highScoreNameInputElement!: HTMLElement;
  private newHighScoreElement!: HTMLElement;
  private playerNameInput!: HTMLInputElement;
  private submitNameBtn!: HTMLElement;
  private highScoresDisplayElement!: HTMLElement;
  private highScoresListElement!: HTMLElement;
  private closeHighScoresBtn!: HTMLElement;

  // High score manager
  private highScoreManager!: HighScoreManager;

  // Game state
  private isGameOver: boolean = false;
  private isCrashing: boolean = false; // During crash animation

  // Safety parameters
  private readonly SAFE_DISTANCE_FACTOR = 0.5; // seconds of reaction time
  private readonly MIN_SAFE_DISTANCE = 10; // meters

  // Rear car and mirror system
  private rearCar!: THREE.Group;
  private rearCamera!: THREE.PerspectiveCamera;
  private leftMirrorCamera!: THREE.PerspectiveCamera;
  private rightMirrorCamera!: THREE.PerspectiveCamera;
  private mirrorRenderTarget!: THREE.WebGLRenderTarget;
  private leftMirrorRenderTarget!: THREE.WebGLRenderTarget;
  private rightMirrorRenderTarget!: THREE.WebGLRenderTarget;
  private rearCarDistance: number = 12; // Base distance behind player
  private rearCarTargetDistance: number = 7; // Following distance (4-10m range) - aggressive
  private rearCarVelocity: number = 0; // m/s - rear car has its own velocity
  private rearCarPosition: number = 0; // Absolute position of rear car

  // Oncoming traffic system (left lane)
  private oncomingCars: THREE.Group[] = [];
  private oncomingCarPositions: number[] = []; // World positions (meters along road)
  private oncomingCarSpeeds: number[] = []; // m/s (positive = toward player)
  private readonly ONCOMING_LANE_X = -2.5;
  private readonly ONCOMING_SPAWN_AHEAD = 280; // Spawn just inside fog
  private readonly ONCOMING_DESPAWN_BEHIND = 30; // Remove after passing
  private readonly MIN_CAR_SPACING = 60; // Minimum gap between cars

  // Audio engine
  private audioEngine: AudioEngine;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('canvas') as HTMLCanvasElement,
      antialias: true
    });

    // Get HUD elements
    this.warningTooCloseElement = document.getElementById('warningTooClose')!;
    this.warningSafeElement = document.getElementById('warningSafe')!;
    this.scoreOverlayElement = document.getElementById('scoreOverlay')!;
    this.gameStartOverlayElement = document.getElementById('gameStartOverlay')!;
    this.speedometerCanvas = document.getElementById('speedometer') as HTMLCanvasElement;
    this.speedometerCtx = this.speedometerCanvas.getContext('2d')!;

    // Get Game Over elements
    this.gameOverElement = document.getElementById('gameOver')!;
    this.impactForceElement = document.getElementById('impactForce')!;
    this.speedDiffElement = document.getElementById('speedDiff')!;
    this.crashYourSpeedElement = document.getElementById('crashYourSpeed')!;
    this.crashLeadSpeedElement = document.getElementById('crashLeadSpeed')!;
    this.damageElement = document.getElementById('damage')!;
    this.finalKmElement = document.getElementById('finalKm')!;
    this.finalScoreElement = document.getElementById('finalScore')!;
    this.restartBtn = document.getElementById('restartBtn')!;
    this.viewHighScoresBtn = document.getElementById('viewHighScoresBtn')!;
    this.crashFlashElement = document.getElementById('crashFlash')!;

    // Get Health Report elements
    this.gForceElement = document.getElementById('gForce')!;
    this.patientStatusElement = document.getElementById('patientStatus')!;
    this.injuriesListElement = document.getElementById('injuriesList')!;
    this.prognosisElement = document.getElementById('prognosis')!;

    // Get Lead Vehicle Health Report elements
    this.leadHealthSectionElement = document.getElementById('leadHealthSection')!;
    this.leadOccupantsElement = document.getElementById('leadOccupants')!;
    this.leadOccupantsListElement = document.getElementById('leadOccupantsList')!;

    // Get Rear Vehicle Health Report elements
    this.rearHealthSectionElement = document.getElementById('rearHealthSection')!;
    this.rearOccupantsElement = document.getElementById('rearOccupants')!;
    this.rearOccupantsListElement = document.getElementById('rearOccupantsList')!;

    // Get High Score elements
    this.highScoreNameInputElement = document.getElementById('highScoreNameInput')!;
    this.newHighScoreElement = document.getElementById('newHighScore')!;
    this.playerNameInput = document.getElementById('playerNameInput') as HTMLInputElement;
    this.submitNameBtn = document.getElementById('submitNameBtn')!;
    this.highScoresDisplayElement = document.getElementById('highScoresDisplay')!;
    this.highScoresListElement = document.getElementById('highScoresList')!;
    this.closeHighScoresBtn = document.getElementById('closeHighScoresBtn')!;

    // Initialize high score manager
    this.highScoreManager = new HighScoreManager();
    this.highScoreManager.initialize().catch(err => console.error('Failed to initialize high scores:', err));

    // Setup restart button
    this.restartBtn.addEventListener('click', () => this.restart());

    // Setup high score buttons
    this.viewHighScoresBtn.addEventListener('click', () => this.showHighScores());
    this.submitNameBtn.addEventListener('click', () => this.submitHighScore());
    this.closeHighScoresBtn.addEventListener('click', () => this.closeHighScores());

    // Allow Enter key to submit name
    this.playerNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.submitHighScore();
      }
    });

    this.setupScene();
    this.setupLighting();
    this.road = this.createRoad();
    this.scene.add(this.road);

    // Create two environment copies for seamless infinite scrolling
    this.environment = this.createEnvironment();
    this.scene.add(this.environment);
    this.environment2 = this.createEnvironment();
    this.scene.add(this.environment2);

    // Create vehicles with realistic parameters
    const vehicleConfig: VehicleConfig = {
      mass: 1500, // kg (average car)
      maxAcceleration: 3.5, // m/s² (0-100 km/h in ~8 seconds)
      maxBrakingForce: 12000, // N (provides strong braking)
      dragCoefficient: 0.4
    };

    // Create lead vehicle first and initialize AI
    this.leadVehicle = new Vehicle(vehicleConfig, 0xffff00); // Yellow car
    this.scene.add(this.leadVehicle.mesh);
    this.leadVehicleAI = new LeadVehicleAI(this.leadVehicle);

    // Calculate safe starting distance based on lead vehicle's initial speed
    const leadInitialSpeedMs = this.leadVehicle.velocity; // m/s (set by AI to 30 km/h)
    const safeStartDistance = Math.max(
      30, // Minimum 30 meters for visibility
      leadInitialSpeedMs * this.SAFE_DISTANCE_FACTOR + leadInitialSpeedMs * 0.5
    );

    // Position lead vehicle ahead at safe distance in right lane
    this.leadVehicle.position = safeStartDistance;
    this.leadVehicle.mesh.position.z = -safeStartDistance;
    this.leadVehicle.mesh.position.x = 2.5; // Right lane

    // Create player vehicle at origin, matching lead vehicle's initial speed
    this.playerVehicle = new Vehicle(vehicleConfig, 0x0000ff); // Blue car
    this.playerVehicle.setVelocity(this.leadVehicle.getVelocityKmh()); // Start at same speed
    this.playerVehicle.mesh.position.x = 2.5; // Right lane
    this.scene.add(this.playerVehicle.mesh);

    // Create rear car that tailgates the player
    this.createRearCar();
    this.setupMirrors();

    this.inputController = new InputController();

    this.setupCamera();
    this.setupWindowResize();

    // Hide loading screen after initialization
    this.hideLoadingScreen();

    // Initialize audio engine (will start on first user input)
    this.audioEngine = new AudioEngine();

    this.animate(0);
  }

  private hideLoadingScreen(): void {
    const loadingScreen = document.getElementById('loadingScreen');
    const app = document.getElementById('app');

    // Show the app (hidden by default in inline styles)
    if (app) {
      app.style.display = 'block';
    }

    if (loadingScreen) {
      // Small delay to ensure first frame renders
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        // Remove from DOM after fade out
        setTimeout(() => {
          loadingScreen.remove();
        }, 500);
      }, 100);
    }
  }

  private setupScene(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Sky gradient
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 300);

    // Add distant hills and mountains on the horizon
    this.createHorizon();
  }

  private createHorizon(): void {
    // Create a group for the horizon that moves with the camera (stays on horizon)
    const horizonGroup = new THREE.Group();

    // Mountain material - bluish-gray to blend with fog/sky
    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a6a7a,
      roughness: 0.9,
      flatShading: true
    });

    // Darker mountain material for closer peaks
    const mountainMaterialDark = new THREE.MeshStandardMaterial({
      color: 0x4a5a6a,
      roughness: 0.9,
      flatShading: true
    });

    // Hill material - slightly greener
    const hillMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a7a6a,
      roughness: 0.9,
      flatShading: true
    });

    // Create mountain chain on both sides of the road
    // Left side mountains (negative X)
    const leftMountains = this.createMountainChain(-200, mountainMaterial, mountainMaterialDark);
    horizonGroup.add(leftMountains);

    // Right side mountains (positive X)
    const rightMountains = this.createMountainChain(200, mountainMaterial, mountainMaterialDark);
    horizonGroup.add(rightMountains);

    // Add rolling hills in front of mountains (closer, lower)
    const leftHills = this.createHillChain(-120, hillMaterial);
    horizonGroup.add(leftHills);

    const rightHills = this.createHillChain(120, hillMaterial);
    horizonGroup.add(rightHills);

    // Store reference for camera-relative positioning
    (this as any).horizonGroup = horizonGroup;
    this.scene.add(horizonGroup);
  }

  private createMountainChain(xOffset: number, material: THREE.Material, materialDark: THREE.Material): THREE.Group {
    const chain = new THREE.Group();

    // Create a series of mountain peaks at varying heights and positions
    const mountainData = [
      { z: -250, height: 80, radius: 60 },
      { z: -180, height: 100, radius: 70 },
      { z: -120, height: 70, radius: 50 },
      { z: -50, height: 90, radius: 65 },
      { z: 20, height: 75, radius: 55 },
      { z: 100, height: 110, radius: 80 },
      { z: 180, height: 85, radius: 60 },
      { z: 260, height: 95, radius: 70 },
    ];

    mountainData.forEach((data, index) => {
      // Main peak
      const geometry = new THREE.ConeGeometry(data.radius, data.height, 6);
      const mat = index % 2 === 0 ? material : materialDark;
      const mountain = new THREE.Mesh(geometry, mat);
      mountain.position.set(
        xOffset + (Math.random() - 0.5) * 40,
        data.height / 2,
        data.z
      );
      chain.add(mountain);

      // Add a secondary smaller peak nearby for variety
      const smallRadius = data.radius * 0.6;
      const smallHeight = data.height * 0.7;
      const smallGeometry = new THREE.ConeGeometry(smallRadius, smallHeight, 5);
      const smallMountain = new THREE.Mesh(smallGeometry, mat);
      smallMountain.position.set(
        xOffset + (index % 2 === 0 ? 30 : -30) + (Math.random() - 0.5) * 20,
        smallHeight / 2,
        data.z + 30
      );
      chain.add(smallMountain);
    });

    return chain;
  }

  private createHillChain(xOffset: number, material: THREE.Material): THREE.Group {
    const chain = new THREE.Group();

    // Create rolling hills using flattened spheres
    const hillData = [
      { z: -220, height: 15, radius: 40 },
      { z: -150, height: 20, radius: 50 },
      { z: -80, height: 12, radius: 35 },
      { z: -10, height: 18, radius: 45 },
      { z: 60, height: 25, radius: 55 },
      { z: 140, height: 16, radius: 40 },
      { z: 220, height: 22, radius: 48 },
    ];

    hillData.forEach((data) => {
      const geometry = new THREE.SphereGeometry(data.radius, 8, 6);
      const hill = new THREE.Mesh(geometry, material);
      hill.scale.y = data.height / data.radius; // Flatten to hill shape
      hill.position.set(
        xOffset + (Math.random() - 0.5) * 30,
        -data.height * 0.5, // Sink to half height for domed appearance
        data.z
      );
      chain.add(hill);
    });

    return chain;
  }

  private createRearCar(): void {
    // Create a car that follows behind the player (visible in mirrors)
    this.rearCar = new THREE.Group();

    // Car body (red color for visibility) - REFLECTIVE
    // Raised so it sits on wheels (wheel center at y=0.4, radius 0.4)
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.2,
      metalness: 0.8
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.8; // Raised: bottom at 0.4, on top of wheels
    this.rearCar.add(body);

    // Cabin - REFLECTIVE
    const cabinGeometry = new THREE.BoxGeometry(1.8, 0.8, 2);
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0x220000,
      roughness: 0.3,
      metalness: 0.7
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.y = 1.6; // Raised to sit on body
    cabin.position.z = -0.5;
    this.rearCar.add(cabin);

    // Front windscreen (facing player - this is what we'll see in mirrors)
    const windscreenGeometry = new THREE.PlaneGeometry(1.6, 0.7);
    const windscreenMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.5,
      metalness: 0.9,
      roughness: 0.1,
      side: THREE.DoubleSide
    });
    const windscreen = new THREE.Mesh(windscreenGeometry, windscreenMaterial);
    windscreen.position.set(0, 1.6, -1.55); // Raised with body
    windscreen.rotation.x = -0.2; // Slight angle
    this.rearCar.add(windscreen);

    // HEADLIGHTS - Large white rectangular planes at front of car
    // Car is rotated 180°, so local +Z faces the player (visible in mirrors)
    // Headlights at local +Z will appear at the front after rotation
    const headlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, // Pure white, unlit - always bright
      side: THREE.DoubleSide
    });

    // Left headlight - large white rectangle (at local +Z, faces player after 180° rotation)
    const leftHeadlightGeom = new THREE.PlaneGeometry(0.5, 0.3);
    const leftHeadlight = new THREE.Mesh(leftHeadlightGeom, headlightMaterial);
    leftHeadlight.position.set(-0.65, 0.7, 2.01); // Raised with body
    // No rotation needed - plane faces +Z by default, which after car rotation faces player
    this.rearCar.add(leftHeadlight);

    // Right headlight - large white rectangle
    const rightHeadlightGeom = new THREE.PlaneGeometry(0.5, 0.3);
    const rightHeadlight = new THREE.Mesh(rightHeadlightGeom, headlightMaterial);
    rightHeadlight.position.set(0.65, 0.7, 2.01); // Raised with body
    this.rearCar.add(rightHeadlight);

    // Inner headlight pair (dual headlight look)
    const innerHeadlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffcc, // Slightly warm white
      side: THREE.DoubleSide
    });

    const leftInnerHeadlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.25),
      innerHeadlightMaterial
    );
    leftInnerHeadlight.position.set(-0.25, 0.7, 2.01); // Raised with body
    this.rearCar.add(leftInnerHeadlight);

    const rightInnerHeadlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.25),
      innerHeadlightMaterial
    );
    rightInnerHeadlight.position.set(0.25, 0.7, 2.01); // Raised with body
    this.rearCar.add(rightInnerHeadlight);

    // Point lights for headlight glow effect (at local +Z)
    const leftLight = new THREE.PointLight(0xffffee, 3, 25);
    leftLight.position.set(-0.5, 0.8, 2.5); // Raised with body
    this.rearCar.add(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 3, 25);
    rightLight.position.set(0.5, 0.8, 2.5); // Raised with body
    this.rearCar.add(rightLight);

    // Wheels with tire and rim
    const rearWheelPositions = [
      { pos: [-0.9, 0.4, 1.2], side: -1 },
      { pos: [0.9, 0.4, 1.2], side: 1 },
      { pos: [-0.9, 0.4, -1.2], side: -1 },
      { pos: [0.9, 0.4, -1.2], side: 1 }
    ];

    rearWheelPositions.forEach(({ pos, side }) => {
      // Tire (black cylinder)
      const tireGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9
      });
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      this.rearCar.add(tire);

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
      this.rearCar.add(rim);
    });

    // Grille
    const grilleGeometry = new THREE.PlaneGeometry(1.4, 0.4);
    const grilleMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.3
    });
    const grille = new THREE.Mesh(grilleGeometry, grilleMaterial);
    grille.position.set(0, 0.6, -2.01); // Raised with body
    this.rearCar.add(grille);

    // Position rear car behind player and rotate to face player
    this.rearCar.position.z = this.rearCarDistance;
    this.rearCar.position.x = 2.5; // Right lane
    this.rearCar.rotation.y = Math.PI; // Rotate 180° so front faces the player
    this.scene.add(this.rearCar);
  }

  private setupMirrors(): void {
    // Create render target for center rearview mirror (full rear view)
    this.mirrorRenderTarget = new THREE.WebGLRenderTarget(512, 256, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    // Create render targets for side mirrors (partial side views)
    this.leftMirrorRenderTarget = new THREE.WebGLRenderTarget(256, 128, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    this.rightMirrorRenderTarget = new THREE.WebGLRenderTarget(256, 128, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });

    // Create rear-facing camera for center mirror - narrow FOV for flat/telephoto look
    this.rearCamera = new THREE.PerspectiveCamera(25, 2, 0.1, 200);

    // Create side mirror cameras - wider FOV, angled to show sides
    this.leftMirrorCamera = new THREE.PerspectiveCamera(40, 2, 0.1, 150);
    this.rightMirrorCamera = new THREE.PerspectiveCamera(40, 2, 0.1, 150);

    // Find and update mirror surfaces with appropriate render textures
    this.playerVehicle.mesh.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.userData.isMirror) {
        const mirrorType = child.userData.mirrorType;
        let texture;

        if (mirrorType === 'left') {
          texture = this.leftMirrorRenderTarget.texture;
        } else if (mirrorType === 'right') {
          texture = this.rightMirrorRenderTarget.texture;
        } else {
          texture = this.mirrorRenderTarget.texture;
        }

        // Replace material with one that uses the appropriate render target
        // DoubleSide ensures visibility from driver's perspective
        child.material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide
        });
      }
    });
  }

  private updateRearCar(deltaTime: number): void {
    if (!this.rearCar || this.isGameOver || this.isCrashing) return;

    const playerSpeed = this.playerVehicle.getVelocityKmh();
    const playerSpeedMs = playerSpeed / 3.6; // Convert to m/s
    const playerPos = this.playerVehicle.position;

    // Initialize rear car position if needed
    if (this.rearCarPosition === 0) {
      this.rearCarPosition = playerPos - this.rearCarDistance;
      this.rearCarVelocity = playerSpeedMs;
    }

    // Aggressive tailgating - follows at 5-12m (close but not overlapping)
    if (Math.random() < 0.02) {
      const minDistance = Math.max(5, 7 - playerSpeed / 50); // Minimum 5m
      const maxDistance = Math.max(12, 16 - playerSpeed / 30);
      this.rearCarTargetDistance = minDistance + Math.random() * (maxDistance - minDistance);
    }

    // Calculate current distance
    const currentDistance = playerPos - this.rearCarPosition;

    // Rear car AI: accelerate/brake based on distance to player
    const distanceError = currentDistance - this.rearCarTargetDistance;
    const closingSpeed = this.rearCarVelocity - playerSpeedMs; // Positive = approaching

    // Aggressive driver - fast acceleration, but smarter braking at short distances
    let targetAcceleration = 0;

    // Emergency braking when getting too close
    if (currentDistance < 5 && closingSpeed > 0) {
      // Hard brake proportional to danger (close + fast approach = more braking)
      const urgency = (5 - currentDistance) / 5; // 0-1, higher when closer
      const speedFactor = Math.min(closingSpeed / 5, 1); // 0-1, higher when approaching faster
      targetAcceleration = -10 * (urgency + speedFactor); // Up to -20 m/s² emergency brake
    } else if (currentDistance < 4) {
      // Very close - always brake hard even if not approaching fast
      targetAcceleration = -12;
    } else if (distanceError > 2) {
      // Too far behind - accelerate aggressively to catch up
      targetAcceleration = Math.min(7, distanceError * 1.5); // m/s² - faster catch up
    } else if (distanceError < -0.3 || (closingSpeed > 2 && currentDistance < 6)) {
      // Getting too close OR approaching fast at medium distance - brake
      const distanceBrake = distanceError < 0 ? distanceError * 2.5 : 0;
      const closingBrake = closingSpeed > 0 ? -closingSpeed * 1.5 : 0;
      targetAcceleration = Math.max(-10, distanceBrake + closingBrake);
    } else {
      // Match player speed but tends to go slightly faster
      const speedDiff = playerSpeedMs - this.rearCarVelocity;
      targetAcceleration = speedDiff * 3 + 0.5; // Slight bias to speed up
    }

    // Update rear car velocity with physics
    this.rearCarVelocity += targetAcceleration * deltaTime;
    this.rearCarVelocity = Math.max(0, Math.min(this.rearCarVelocity, 60)); // Cap at 216 km/h

    // Update rear car position
    this.rearCarPosition += this.rearCarVelocity * deltaTime;

    // Calculate actual distance for collision detection
    this.rearCarDistance = playerPos - this.rearCarPosition;

    // COLLISION DETECTION - rear car crashes into player!
    const speedDifference = this.rearCarVelocity - playerSpeedMs;

    // Crash if: cars overlap OR very close while rear car is still approaching
    const carsOverlap = this.rearCarDistance <= 1.0; // Cars are touching/overlapping
    const imminentCrash = this.rearCarDistance < 2.0 && speedDifference > 3; // Very close and approaching fast

    if (carsOverlap || imminentCrash) {
      // Rear-end collision! Game over - player was hit from behind
      this.triggerRearCollision();
      return;
    }

    // Position rear car in 3D scene (right lane with slight weaving)
    const playerZ = this.playerVehicle.mesh.position.z;
    // Clamp visual distance to minimum 3.5m to prevent car models from overlapping
    const visualDistance = Math.max(3.5, this.rearCarDistance);
    this.rearCar.position.z = playerZ + visualDistance;
    this.rearCar.position.x = 2.5 + (Math.sin(Date.now() * 0.0015) * 0.3); // Right lane with slight weaving
  }

  private triggerRearCollision(): void {
    if (this.isGameOver || this.isCrashing) return;

    // Calculate impact data
    const playerSpeedKmh = this.playerVehicle.getVelocityKmh();
    const leadSpeedKmh = this.leadVehicle.getVelocityKmh();
    const rearCarSpeedKmh = this.rearCarVelocity * 3.6; // Convert to km/h

    // Check if player is tailgating the lead car - if so, they get sandwiched!
    const distanceToLead = this.getDistance();
    const tailgatingThreshold = 15; // If within 15m of lead car, player crashes into it too

    // Mark as crashing
    this.isCrashing = true;

    const titleEl = document.querySelector('.crash-report h1');

    if (distanceToLead < tailgatingThreshold) {
      // SANDWICH CRASH - rear-ended into the lead car!
      // Combined impact from both collisions
      const rearSpeedDiff = Math.abs(rearCarSpeedKmh - playerSpeedKmh);
      const frontSpeedDiff = Math.abs(playerSpeedKmh - leadSpeedKmh);
      const totalSpeedDiff = rearSpeedDiff + frontSpeedDiff;

      const mass = 1500;
      const collisionDuration = 0.1;
      const rearDeltaV = rearSpeedDiff / 3.6;
      const frontDeltaV = frontSpeedDiff / 3.6;
      const totalImpactForceKN = (mass * (rearDeltaV + frontDeltaV)) / collisionDuration / 1000;

      if (titleEl) titleEl.textContent = '💥 SANDWICH CRASH - GAME OVER';
      this.crashLeadSpeedElement.textContent = `${leadSpeedKmh.toFixed(1)} km/h`;

      // Play crash sound and stop engine
      this.audioEngine.playCrashSound(totalImpactForceKN, totalSpeedDiff);
      this.audioEngine.stopEngine();

      // Sandwich crash - show all 3 health reports
      this.showCrashReport(totalImpactForceKN, totalSpeedDiff, playerSpeedKmh, leadSpeedKmh, 'sandwich', rearSpeedDiff, frontSpeedDiff);
    } else {
      // Just rear-ended, not close enough to lead car
      const speedDiffKmh = Math.abs(rearCarSpeedKmh - playerSpeedKmh);
      const mass = 1500;
      const collisionDuration = 0.1;
      const deltaV = speedDiffKmh / 3.6;
      const impactForceKN = (mass * deltaV) / collisionDuration / 1000;

      if (titleEl) titleEl.textContent = '💥 REAR-ENDED - GAME OVER';
      this.crashLeadSpeedElement.textContent = `${rearCarSpeedKmh.toFixed(1)} km/h (REAR CAR)`;

      // Play crash sound and stop engine
      this.audioEngine.playCrashSound(impactForceKN, speedDiffKmh);
      this.audioEngine.stopEngine();

      // Rear-end only - show rear car health report, not lead
      this.showCrashReport(impactForceKN, speedDiffKmh, playerSpeedKmh, rearCarSpeedKmh, 'rear', speedDiffKmh, 0);
    }
  }

  private createOncomingCarModel(): THREE.Group {
    const car = new THREE.Group();

    // Random car colors (common car colors)
    const carColors = [0xffffff, 0xcccccc, 0x888888, 0x333333, 0x2244aa, 0x882222];
    const bodyColor = carColors[Math.floor(Math.random() * carColors.length)];

    // Car body
    // Body - raised to sit on wheels
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.3,
      metalness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.8; // Raised: bottom at 0.4, on top of wheels
    car.add(body);

    // Cabin
    const cabinGeometry = new THREE.BoxGeometry(1.8, 0.8, 2);
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
      metalness: 0.6
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.y = 1.6; // Raised to sit on body
    cabin.position.z = -0.5;
    car.add(cabin);

    // Front windscreen
    const windscreenGeometry = new THREE.PlaneGeometry(1.6, 0.7);
    const windscreenMaterial = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.5,
      metalness: 0.9,
      roughness: 0.1,
      side: THREE.DoubleSide
    });
    const windscreen = new THREE.Mesh(windscreenGeometry, windscreenMaterial);
    windscreen.position.set(0, 1.6, -1.55); // Raised with body
    windscreen.rotation.x = -0.2;
    car.add(windscreen);

    // Headlights at front (local -Z) - facing toward player
    const headlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });

    const leftHeadlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      headlightMaterial
    );
    leftHeadlight.position.set(-0.65, 0.7, -2.01); // Raised with body
    car.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      headlightMaterial
    );
    rightHeadlight.position.set(0.65, 0.7, -2.01); // Raised with body
    car.add(rightHeadlight);

    // Point lights for headlight glow
    const leftLight = new THREE.PointLight(0xffffee, 2, 20);
    leftLight.position.set(-0.5, 0.8, -2.5); // Raised with body
    car.add(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 2, 20);
    rightLight.position.set(0.5, 0.8, -2.5); // Raised with body
    car.add(rightLight);

    // Wheels with tire and rim
    const oncomingWheelPositions = [
      { pos: [-0.9, 0.4, 1.2], side: -1 },
      { pos: [0.9, 0.4, 1.2], side: 1 },
      { pos: [-0.9, 0.4, -1.2], side: -1 },
      { pos: [0.9, 0.4, -1.2], side: 1 }
    ];

    oncomingWheelPositions.forEach(({ pos, side }) => {
      // Tire (black cylinder)
      const tireGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9
      });
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      car.add(tire);

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
      car.add(rim);
    });

    // Position in left lane and rotate to face player (front toward positive Z)
    car.position.x = this.ONCOMING_LANE_X;
    car.rotation.y = Math.PI; // Rotate 180° so headlights face the player

    return car;
  }

  private spawnOncomingCar(): void {
    const playerPos = this.playerVehicle.position;

    // Check if we need to spawn (enough space from last car)
    if (this.oncomingCarPositions.length > 0) {
      const lastCarPos = this.oncomingCarPositions[this.oncomingCarPositions.length - 1];
      const distanceFromLast = Math.abs(lastCarPos - (playerPos + this.ONCOMING_SPAWN_AHEAD));
      if (distanceFromLast < this.MIN_CAR_SPACING) {
        return; // Too close to last spawned car
      }
    }

    // Create new car
    const car = this.createOncomingCarModel();

    // Position ahead of player (in negative Z world space)
    const spawnPosition = playerPos + this.ONCOMING_SPAWN_AHEAD;
    car.position.z = -spawnPosition;

    // Random speed between 80-130 km/h (22-36 m/s)
    const speed = 22 + Math.random() * 14;

    this.scene.add(car);
    this.oncomingCars.push(car);
    this.oncomingCarPositions.push(spawnPosition);
    this.oncomingCarSpeeds.push(speed);
  }

  private updateOncomingTraffic(deltaTime: number): void {
    if (this.isGameOver || this.isCrashing) return;

    const playerPos = this.playerVehicle.position;

    // Spawn new cars occasionally
    if (Math.random() < 0.02) { // ~2% chance per frame
      this.spawnOncomingCar();
    }

    // Update existing cars
    for (let i = this.oncomingCars.length - 1; i >= 0; i--) {
      // Oncoming cars move TOWARD player (decreasing world position)
      this.oncomingCarPositions[i] -= this.oncomingCarSpeeds[i] * deltaTime;

      // Update 3D position
      this.oncomingCars[i].position.z = -this.oncomingCarPositions[i];

      // Add slight random weave for realism
      this.oncomingCars[i].position.x = this.ONCOMING_LANE_X + Math.sin(Date.now() * 0.001 + i) * 0.2;

      // Remove if passed player
      if (this.oncomingCarPositions[i] < playerPos - this.ONCOMING_DESPAWN_BEHIND) {
        this.scene.remove(this.oncomingCars[i]);
        this.oncomingCars.splice(i, 1);
        this.oncomingCarPositions.splice(i, 1);
        this.oncomingCarSpeeds.splice(i, 1);
      }
    }
  }

  private updateMirrors(): void {
    if (!this.rearCamera || !this.mirrorRenderTarget) return;

    const playerPos = this.playerVehicle.mesh.position;

    // Hide player vehicle during mirror render
    this.playerVehicle.mesh.visible = false;

    // === CENTER REARVIEW MIRROR ===
    // Position rear camera - flat telephoto view for minimal perspective distortion
    this.rearCamera.position.set(
      playerPos.x,
      playerPos.y + 1.2,
      playerPos.z - 2 // Position slightly in front, looking back
    );

    // Look backward (toward the rear car) - flat angle
    this.rearCamera.lookAt(
      playerPos.x,
      playerPos.y + 1.2,
      playerPos.z + 100
    );

    // Render center mirror
    this.renderer.setRenderTarget(this.mirrorRenderTarget);
    this.renderer.render(this.scene, this.rearCamera);

    // === LEFT SIDE MIRROR ===
    // Position at left side of car, looking backward with slight left offset
    this.leftMirrorCamera.position.set(
      playerPos.x - 0.9, // Left side of car
      playerPos.y + 1.1,
      playerPos.z - 0.5
    );

    // Look backward (positive Z) with slight outward angle to the left
    this.leftMirrorCamera.lookAt(
      playerPos.x - 3, // Offset left to show left side of road behind
      playerPos.y + 0.9,
      playerPos.z + 100 // Look BEHIND (positive Z = behind the car)
    );

    // Render left mirror
    this.renderer.setRenderTarget(this.leftMirrorRenderTarget);
    this.renderer.render(this.scene, this.leftMirrorCamera);

    // === RIGHT SIDE MIRROR ===
    // Position at right side of car, looking backward with slight right offset
    this.rightMirrorCamera.position.set(
      playerPos.x + 0.9, // Right side of car
      playerPos.y + 1.1,
      playerPos.z - 0.5
    );

    // Look backward (positive Z) with slight outward angle to the right
    this.rightMirrorCamera.lookAt(
      playerPos.x + 3, // Offset right to show right side of road behind
      playerPos.y + 0.9,
      playerPos.z + 100 // Look BEHIND (positive Z = behind the car)
    );

    // Render right mirror
    this.renderer.setRenderTarget(this.rightMirrorRenderTarget);
    this.renderer.render(this.scene, this.rightMirrorCamera);

    // Reset render target
    this.renderer.setRenderTarget(null);

    // Show player vehicle again
    this.playerVehicle.mesh.visible = true;
  }

  private setupLighting(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }

  private createRoad(): THREE.Group {
    const roadGroup = new THREE.Group();

    // Road surface - extended for seamless infinite scrolling
    // 2600m covers 2000m chunk travel + 300m fog distance on each end
    const roadWidth = 10;
    const roadLength = 2600;
    const roadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8
    });
    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.receiveShadow = true;
    roadGroup.add(roadMesh);

    // Road markings - solid yellow center line (double line for two-lane road)
    this.roadMarkings = new THREE.Group();

    // Solid yellow center lines (double line - no passing zone)
    const centerLineGeometry = new THREE.PlaneGeometry(0.15, roadLength);
    const centerLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); // Yellow

    const leftCenterLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    leftCenterLine.rotation.x = -Math.PI / 2;
    leftCenterLine.position.set(-0.15, 0.01, 0);
    this.roadMarkings.add(leftCenterLine);

    const rightCenterLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    rightCenterLine.rotation.x = -Math.PI / 2;
    rightCenterLine.position.set(0.15, 0.01, 0);
    this.roadMarkings.add(rightCenterLine);

    roadGroup.add(this.roadMarkings);

    // No dash pattern needed for solid lines (but keep for compatibility)
    (this.roadMarkings as any).dashPattern = 5;

    // Side lines
    const sideLineGeometry = new THREE.PlaneGeometry(0.3, roadLength);
    const sideLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftLine = new THREE.Mesh(sideLineGeometry, sideLineMaterial);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-roadWidth / 2, 0.01, 0);
    roadGroup.add(leftLine);

    const rightLine = new THREE.Mesh(sideLineGeometry, sideLineMaterial);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.position.set(roadWidth / 2, 0.01, 0);
    roadGroup.add(rightLine);

    // Emergency lanes (shoulders) on each side
    const shoulderWidth = 2.5;
    const shoulderGeometry = new THREE.PlaneGeometry(shoulderWidth, roadLength);
    const shoulderMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444, // Slightly lighter than road
      roughness: 0.85
    });

    // Left emergency lane
    const leftShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-roadWidth / 2 - shoulderWidth / 2, 0.001, 0);
    leftShoulder.receiveShadow = true;
    roadGroup.add(leftShoulder);

    // Right emergency lane
    const rightShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial.clone());
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.position.set(roadWidth / 2 + shoulderWidth / 2, 0.001, 0);
    rightShoulder.receiveShadow = true;
    roadGroup.add(rightShoulder);

    // Guard rails on outer edge of emergency lanes
    const guardRailHeight = 0.8;
    const guardRailPostSpacing = 4; // meters between posts
    const guardRailX = roadWidth / 2 + shoulderWidth; // Position at outer edge of shoulder

    // Guard rail material
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      metalness: 0.7,
      roughness: 0.3
    });
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.5,
      roughness: 0.4
    });

    // Create continuous rail beams (W-beam style)
    const railBeamGeometry = new THREE.BoxGeometry(0.08, 0.3, roadLength);

    // Left guard rail beam
    const leftRailBeam = new THREE.Mesh(railBeamGeometry, railMaterial);
    leftRailBeam.position.set(-guardRailX - 0.1, guardRailHeight - 0.15, 0);
    roadGroup.add(leftRailBeam);

    // Right guard rail beam
    const rightRailBeam = new THREE.Mesh(railBeamGeometry.clone(), railMaterial.clone());
    rightRailBeam.position.set(guardRailX + 0.1, guardRailHeight - 0.15, 0);
    roadGroup.add(rightRailBeam);

    // Lower rail beam for double-rail look
    const lowerRailGeometry = new THREE.BoxGeometry(0.06, 0.2, roadLength);

    const leftLowerRail = new THREE.Mesh(lowerRailGeometry, railMaterial.clone());
    leftLowerRail.position.set(-guardRailX - 0.1, guardRailHeight - 0.45, 0);
    roadGroup.add(leftLowerRail);

    const rightLowerRail = new THREE.Mesh(lowerRailGeometry.clone(), railMaterial.clone());
    rightLowerRail.position.set(guardRailX + 0.1, guardRailHeight - 0.45, 0);
    roadGroup.add(rightLowerRail);

    // Guard rail posts
    const postGeometry = new THREE.BoxGeometry(0.1, guardRailHeight, 0.1);
    for (let z = -roadLength / 2; z < roadLength / 2; z += guardRailPostSpacing) {
      // Left post
      const leftPost = new THREE.Mesh(postGeometry, postMaterial);
      leftPost.position.set(-guardRailX - 0.1, guardRailHeight / 2, z);
      roadGroup.add(leftPost);

      // Right post
      const rightPost = new THREE.Mesh(postGeometry, postMaterial.clone());
      rightPost.position.set(guardRailX + 0.1, guardRailHeight / 2, z);
      roadGroup.add(rightPost);
    }

    // Reflector posts on guard rails (orange/red reflectors)
    const reflectorGeometry = new THREE.BoxGeometry(0.05, 0.12, 0.02);
    const leftReflectorMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 }); // Orange for right side of road
    const rightReflectorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red for left side

    for (let z = -roadLength / 2; z < roadLength / 2; z += guardRailPostSpacing * 2) {
      // Left reflector (red - facing traffic)
      const leftReflector = new THREE.Mesh(reflectorGeometry, rightReflectorMaterial);
      leftReflector.position.set(-guardRailX + 0.02, guardRailHeight - 0.15, z);
      roadGroup.add(leftReflector);

      // Right reflector (orange)
      const rightReflector = new THREE.Mesh(reflectorGeometry, leftReflectorMaterial);
      rightReflector.position.set(guardRailX - 0.02, guardRailHeight - 0.15, z);
      roadGroup.add(rightReflector);
    }

    // Grass on sides (adjusted position for guard rails)
    const grassGeometry = new THREE.PlaneGeometry(100, roadLength);
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.9
    });

    const leftGrass = new THREE.Mesh(grassGeometry, grassMaterial);
    leftGrass.rotation.x = -Math.PI / 2;
    leftGrass.position.set(-guardRailX - 50, -0.01, 0);
    leftGrass.receiveShadow = true;
    roadGroup.add(leftGrass);

    const rightGrass = new THREE.Mesh(grassGeometry, grassMaterial.clone());
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(guardRailX + 50, -0.01, 0);
    rightGrass.receiveShadow = true;
    roadGroup.add(rightGrass);

    // Store road length for infinite scrolling
    (roadGroup as any).roadLength = roadLength;

    return roadGroup;
  }

  private createTree(): THREE.Group {
    const tree = new THREE.Group();

    // Tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Tree foliage (3 spheres stacked for better tree shape)
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.7
    });

    const foliage1 = new THREE.Mesh(
      new THREE.SphereGeometry(2, 8, 8),
      foliageMaterial
    );
    foliage1.position.y = 5;
    foliage1.castShadow = true;
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 8),
      foliageMaterial
    );
    foliage2.position.y = 6.5;
    foliage2.castShadow = true;
    tree.add(foliage2);

    const foliage3 = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      foliageMaterial
    );
    foliage3.position.y = 7.5;
    foliage3.castShadow = true;
    tree.add(foliage3);

    return tree;
  }

  private createHouse(): THREE.Group {
    const house = new THREE.Group();

    // House walls
    const wallGeometry = new THREE.BoxGeometry(6, 4, 6);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2b48c,
      roughness: 0.8
    });
    const walls = new THREE.Mesh(wallGeometry, wallMaterial);
    walls.position.y = 2;
    walls.castShadow = true;
    house.add(walls);

    // Roof (pyramid shape)
    const roofGeometry = new THREE.ConeGeometry(4.5, 2.5, 4);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.6
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 5.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);

    // Door
    const doorGeometry = new THREE.BoxGeometry(1.2, 2, 0.1);
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 1, 3.05);
    house.add(door);

    // Windows
    const windowGeometry = new THREE.BoxGeometry(1, 1, 0.1);
    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x87ceeb });

    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(-1.8, 2.5, 3.05);
    house.add(window1);

    const window2 = new THREE.Mesh(windowGeometry, windowMaterial);
    window2.position.set(1.8, 2.5, 3.05);
    house.add(window2);

    return house;
  }

  private createBush(): THREE.Group {
    const bush = new THREE.Group();

    // Bush is a flattened sphere with multiple segments for organic look
    const bushGeometry = new THREE.SphereGeometry(1.2, 8, 6);
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5016,
      roughness: 0.9
    });
    const bushMesh = new THREE.Mesh(bushGeometry, bushMaterial);
    bushMesh.scale.y = 0.7; // Flatten slightly
    bushMesh.position.y = 0.8;
    bushMesh.castShadow = true;
    bush.add(bushMesh);

    // Add smaller sphere for variation
    const bush2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 6),
      bushMaterial
    );
    bush2.position.set(0.6, 0.6, 0.3);
    bush2.scale.y = 0.7;
    bush2.castShadow = true;
    bush.add(bush2);

    return bush;
  }

  private createKilometerText(kmNumber: number): THREE.Sprite {
    // Create canvas for text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 128;

    // Store canvas and context on sprite for updates
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4, 2, 1);

    // Store canvas and context for later updates
    (sprite as any).canvas = canvas;
    (sprite as any).context = context;
    (sprite as any).texture = texture;

    // Initial draw
    this.updateKilometerText(sprite, kmNumber);

    return sprite;
  }

  private updateKilometerText(sprite: THREE.Sprite, kmNumber: number): void {
    const canvas = (sprite as any).canvas;
    const context = (sprite as any).context;
    const texture = (sprite as any).texture;

    // Clear and redraw
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 60px Arial';
    context.fillStyle = '#ffff00';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${kmNumber} KM`, canvas.width / 2, canvas.height / 2);

    // Mark texture as needing update
    texture.needsUpdate = true;
  }

  private createKilometerBridge(kmNumber: number): THREE.Group {
    const bridge = new THREE.Group();

    // Iron tube material (dark metallic gray)
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.8,
      roughness: 0.3
    });

    const tubeRadius = 0.12;
    const tubeSegments = 16;

    // Bridge dimensions
    const bridgeWidth = 14; // Spans over road (10m) + extra
    const bridgeHeight = 6; // Height above ground
    const bridgeDepth = 3; // Depth in Z direction

    // Vertical support posts (left and right)
    const postHeight = bridgeHeight;
    const postGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, postHeight, tubeSegments);

    // Left posts
    const leftFrontPost = new THREE.Mesh(postGeometry, tubeMaterial);
    leftFrontPost.position.set(-bridgeWidth / 2, postHeight / 2, -bridgeDepth / 2);
    leftFrontPost.castShadow = true;
    bridge.add(leftFrontPost);

    const leftBackPost = new THREE.Mesh(postGeometry, tubeMaterial);
    leftBackPost.position.set(-bridgeWidth / 2, postHeight / 2, bridgeDepth / 2);
    leftBackPost.castShadow = true;
    bridge.add(leftBackPost);

    // Right posts
    const rightFrontPost = new THREE.Mesh(postGeometry, tubeMaterial);
    rightFrontPost.position.set(bridgeWidth / 2, postHeight / 2, -bridgeDepth / 2);
    rightFrontPost.castShadow = true;
    bridge.add(rightFrontPost);

    const rightBackPost = new THREE.Mesh(postGeometry, tubeMaterial);
    rightBackPost.position.set(bridgeWidth / 2, postHeight / 2, bridgeDepth / 2);
    rightBackPost.castShadow = true;
    bridge.add(rightBackPost);

    // Horizontal top beams
    const topBeamGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, bridgeWidth, tubeSegments);

    // Front top beam
    const frontTopBeam = new THREE.Mesh(topBeamGeometry, tubeMaterial);
    frontTopBeam.rotation.z = Math.PI / 2;
    frontTopBeam.position.set(0, bridgeHeight, -bridgeDepth / 2);
    frontTopBeam.castShadow = true;
    bridge.add(frontTopBeam);

    // Back top beam
    const backTopBeam = new THREE.Mesh(topBeamGeometry, tubeMaterial);
    backTopBeam.rotation.z = Math.PI / 2;
    backTopBeam.position.set(0, bridgeHeight, bridgeDepth / 2);
    backTopBeam.castShadow = true;
    bridge.add(backTopBeam);

    // Side beams connecting front and back
    const sideBeamGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, bridgeDepth, tubeSegments);

    // Left side beam
    const leftSideBeam = new THREE.Mesh(sideBeamGeometry, tubeMaterial);
    leftSideBeam.rotation.x = Math.PI / 2;
    leftSideBeam.position.set(-bridgeWidth / 2, bridgeHeight, 0);
    leftSideBeam.castShadow = true;
    bridge.add(leftSideBeam);

    // Right side beam
    const rightSideBeam = new THREE.Mesh(sideBeamGeometry, tubeMaterial);
    rightSideBeam.rotation.x = Math.PI / 2;
    rightSideBeam.position.set(bridgeWidth / 2, bridgeHeight, 0);
    rightSideBeam.castShadow = true;
    bridge.add(rightSideBeam);

    // Cross bracing for structural look
    const crossBeamLength = Math.sqrt(bridgeWidth * bridgeWidth + bridgeDepth * bridgeDepth);
    const crossBeamGeometry = new THREE.CylinderGeometry(tubeRadius * 0.8, tubeRadius * 0.8, crossBeamLength, tubeSegments);

    // Diagonal cross beam 1
    const crossBeam1 = new THREE.Mesh(crossBeamGeometry, tubeMaterial);
    const angleXZ = Math.atan2(bridgeDepth, bridgeWidth);
    crossBeam1.rotation.z = Math.PI / 2;
    crossBeam1.rotation.y = angleXZ;
    crossBeam1.position.set(0, bridgeHeight, 0);
    crossBeam1.castShadow = true;
    bridge.add(crossBeam1);

    // Diagonal cross beam 2
    const crossBeam2 = new THREE.Mesh(crossBeamGeometry, tubeMaterial);
    crossBeam2.rotation.z = Math.PI / 2;
    crossBeam2.rotation.y = -angleXZ;
    crossBeam2.position.set(0, bridgeHeight, 0);
    crossBeam2.castShadow = true;
    bridge.add(crossBeam2);

    // Add kilometer text on top
    const kmText = this.createKilometerText(kmNumber);
    kmText.position.set(0, bridgeHeight + 0.5, 0);
    bridge.add(kmText);

    // Store reference to text sprite on bridge for updates
    (bridge as any).kmText = kmText;

    return bridge;
  }

  private createEnvironment(): THREE.Group {
    const envGroup = new THREE.Group();
    const roadLength = 2000;
    const spacing = 30; // Distance between objects

    // Place kilometer bridges every 1000m within each 2000m environment chunk
    // Environment spans local z from -1000 to +1000 (centered at origin)
    // Bridges at local z = -1000 and z = 0 correspond to every 1000m on the road
    const bridges: THREE.Group[] = [];
    const bridgeLocalPositions = [-1000, 0]; // Every 1000m within the chunk
    for (const localZ of bridgeLocalPositions) {
      const bridge = this.createKilometerBridge(1); // Initial km, will be updated dynamically
      bridge.position.z = localZ;
      envGroup.add(bridge);
      bridges.push(bridge);

      // Track all bridge text sprites
      this.bridgeTexts.push((bridge as any).kmText);
    }

    // Store bridges on the environment group for later updates
    (envGroup as any).bridges = bridges;

    // Place objects along the road
    for (let z = -roadLength / 2; z < roadLength / 2; z += spacing) {
      // Randomize which objects appear and their exact position
      const random = Math.random();
      const offset = (Math.random() - 0.5) * 5; // Random offset for variety

      // Left side of road
      if (random < 0.3) {
        // Tree
        const tree = this.createTree();
        tree.position.set(-12 + offset, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(tree);
      } else if (random < 0.4) {
        // House (less frequent)
        const house = this.createHouse();
        house.position.set(-18 + offset, 0, z);
        house.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(house);
      } else if (random < 0.6) {
        // Bush
        const bush = this.createBush();
        bush.position.set(-11 + offset, 0, z);
        bush.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(bush);
      }

      // Right side of road (different random seed)
      const random2 = Math.random();
      const offset2 = (Math.random() - 0.5) * 5;

      if (random2 < 0.3) {
        // Tree
        const tree = this.createTree();
        tree.position.set(12 + offset2, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(tree);
      } else if (random2 < 0.4) {
        // House
        const house = this.createHouse();
        house.position.set(18 + offset2, 0, z);
        house.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(house);
      } else if (random2 < 0.6) {
        // Bush
        const bush = this.createBush();
        bush.position.set(11 + offset2, 0, z);
        bush.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(bush);
      }
    }

    return envGroup;
  }

  private setupCamera(): void {
    // First-person camera position (inside player's car)
    // Camera is at the driver's seat position
    this.camera.position.set(0, 1.2, 0.5); // Inside car, driver eye level
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private updateCamera(): void {
    // First-person camera: positioned inside the player vehicle
    // Camera moves exactly with the player, at driver's eye level
    this.camera.position.set(
      this.playerVehicle.mesh.position.x,
      this.playerVehicle.mesh.position.y + 1.2, // Driver eye height
      this.playerVehicle.mesh.position.z + 0.5  // Slightly forward in the car
    );

    // Look straight ahead down the road (negative Z is forward)
    this.camera.lookAt(
      this.playerVehicle.mesh.position.x,
      this.playerVehicle.mesh.position.y + 1.2,
      this.playerVehicle.mesh.position.z - 100 // Look far ahead
    );

    // Keep horizon (hills/mountains) at fixed distance from camera
    const horizonGroup = (this as any).horizonGroup;
    if (horizonGroup) {
      horizonGroup.position.z = this.playerVehicle.mesh.position.z;
    }
  }

  private updateRoad(): void {
    // Infinite road using chunk-based positioning
    // Road and environment stay at fixed world positions, only "teleport" when behind camera
    const roadLength = 2000;
    const playerPos = this.playerVehicle.position;

    // Which 2000m chunk is the camera currently in?
    const chunk = Math.floor(playerPos / roadLength);

    // Road: position to always cover camera's visible range
    // Road is 2600m long, position at center of 2000m chunk for full coverage
    this.road.position.z = -chunk * roadLength - roadLength / 2;

    // Animate road markings (dashed center line) to show velocity
    // Markings move in POSITIVE Z (toward camera) to create scrolling illusion
    const dashPattern = (this.roadMarkings as any).dashPattern || 5;
    const markingOffset = playerPos % dashPattern;
    this.roadMarkings.position.z = markingOffset;

    // Environment: two chunks positioned at fixed world coordinates
    // One chunk covers current camera area, one covers ahead
    // When camera moves to next chunk, they swap roles (invisible teleport behind camera)
    this.environment.position.z = -chunk * roadLength;
    this.environment2.position.z = -(chunk + 1) * roadLength;

    // Update kilometer bridge texts based on player position
    this.updateBridgeKilometers();
  }

  private updateBridgeKilometers(): void {
    // Get bridges from both environment copies
    const bridges1 = (this.environment as any).bridges || [];
    const bridges2 = (this.environment2 as any).bridges || [];

    // Update first environment's bridges
    bridges1.forEach((bridge: THREE.Group) => {
      // Calculate actual world position of this bridge
      const bridgeWorldZ = bridge.position.z + this.environment.position.z;
      // Convert world position to km (negative Z = forward = positive km)
      const kmToShow = Math.round(-bridgeWorldZ / 1000);

      // Show and update bridges with valid km values, hide invalid ones
      if (kmToShow > 0) {
        bridge.visible = true;
        this.updateKilometerText((bridge as any).kmText, kmToShow);
      } else {
        bridge.visible = false;
      }
    });

    // Update second environment's bridges
    bridges2.forEach((bridge: THREE.Group) => {
      // Calculate actual world position of this bridge
      const bridgeWorldZ = bridge.position.z + this.environment2.position.z;
      // Convert world position to km (negative Z = forward = positive km)
      const kmToShow = Math.round(-bridgeWorldZ / 1000);

      // Show and update bridges with valid km values, hide invalid ones
      if (kmToShow > 0) {
        bridge.visible = true;
        this.updateKilometerText((bridge as any).kmText, kmToShow);
      } else {
        bridge.visible = false;
      }
    });
  }

  private updateHUD(): void {
    const speed = Math.round(this.playerVehicle.getVelocityKmh());
    const distance = Math.round(this.getDistance());
    const safeDistance = Math.round(this.calculateSafeDistance());

    // Update score - only award points when driving below safe distance
    if (distance < safeDistance && distance > 0 && !this.isCrashing) {
      // Calculate proximity coefficient based on how close to lead car
      // Closer = higher multiplier (max 10x when very close, min 1x at safe distance)
      const proximityRatio = distance / safeDistance; // 0 to 1 (0 = very close, 1 = at safe distance)
      const proximityMultiplier = 1 + (1 - proximityRatio) * 9; // 1x to 10x

      // Calculate speed coefficient (faster = higher score)
      // At 30 km/h: ~1.6x, at 60 km/h: ~2.2x, at 100 km/h: ~3.0x, at 150 km/h: ~4.0x
      const speedCoefficient = 1 + (speed / 50); // Direct correlation with speed

      // Award points based on distance traveled, proximity, and speed
      const pointsPerFrame = (speed / 3600) * proximityMultiplier * speedCoefficient * 10;
      this.score += pointsPerFrame;
    }
    const roundedScore = Math.round(this.score).toString();
    this.scoreOverlayElement.textContent = roundedScore;

    // Update timed warnings based on distance state changes
    const currentState = distance < safeDistance && distance > 0 ? 'danger' : 'safe';

    // Only trigger warning if state changed
    if (currentState !== this.lastWarningState && !this.isCrashing) {
      // Clear any existing warning timer
      if (this.warningTimeout !== null) {
        clearTimeout(this.warningTimeout);
        this.warningTimeout = null;
      }

      // Hide both warnings first
      this.warningTooCloseElement.classList.add('hidden');
      this.warningSafeElement.classList.add('hidden');

      // Show the appropriate warning
      if (currentState === 'danger') {
        this.warningTooCloseElement.classList.remove('hidden');
      } else if (this.lastWarningState === 'danger') {
        // Only show "safe" message if we were previously in danger
        this.warningSafeElement.classList.remove('hidden');
      }

      // Set timer to hide warning after 3 seconds
      this.warningTimeout = window.setTimeout(() => {
        this.warningTooCloseElement.classList.add('hidden');
        this.warningSafeElement.classList.add('hidden');
        this.warningTimeout = null;
      }, 3000);

      this.lastWarningState = currentState;
    }

    // Update speedometer gauge
    this.drawSpeedometer(speed);
  }

  private drawSpeedometer(speed: number): void {
    const ctx = this.speedometerCtx;
    const canvas = this.speedometerCanvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw outer circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw speed markings (0 to 250 km/h)
    const maxSpeed = 250;
    const startAngle = -225 * (Math.PI / 180); // Start at bottom left
    const endAngle = 45 * (Math.PI / 180); // End at bottom right
    const angleRange = endAngle - startAngle;

    // Draw tick marks
    for (let i = 0; i <= 10; i++) {
      const speedValue = (i / 10) * maxSpeed;
      const angle = startAngle + (i / 10) * angleRange;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Major tick
      const innerRadius = radius - 10;
      const outerRadius = radius;
      ctx.beginPath();
      ctx.moveTo(centerX + innerRadius * cos, centerY + innerRadius * sin);
      ctx.lineTo(centerX + outerRadius * cos, centerY + outerRadius * sin);
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Speed numbers
      const textRadius = radius - 25;
      ctx.fillStyle = '#0f0';
      ctx.font = '12px "Courier New"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        Math.round(speedValue).toString(),
        centerX + textRadius * cos,
        centerY + textRadius * sin
      );
    }

    // Draw needle
    const needleAngle = startAngle + (Math.min(speed, maxSpeed) / maxSpeed) * angleRange;
    const needleLength = radius - 15;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + needleLength * Math.cos(needleAngle),
      centerY + needleLength * Math.sin(needleAngle)
    );
    ctx.strokeStyle = speed > 180 ? '#ff0000' : '#00ff00';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f0';
    ctx.fill();

    // Draw speed text in center
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 20px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(speed).toString(), centerX, centerY + 30);
    ctx.font = '10px "Courier New"';
    ctx.fillText('km/h', centerX, centerY + 45);
  }

  private getDistance(): number {
    return this.leadVehicle.position - this.playerVehicle.position;
  }

  private calculateSafeDistance(): number {
    // Safe distance = reaction time × speed + braking distance factor
    const speedMs = this.playerVehicle.velocity;
    const safeDistance = Math.max(
      this.MIN_SAFE_DISTANCE,
      speedMs * this.SAFE_DISTANCE_FACTOR + speedMs * 0.5
    );
    return safeDistance;
  }

  private checkCollision(): void {
    if (this.isGameOver || this.isCrashing) return;

    const distance = this.getDistance();
    const collisionThreshold = 4; // Car length is about 4 meters

    if (distance < collisionThreshold) {
      // Calculate relative velocity (closing speed)
      const relativeVelocity = this.playerVehicle.velocity - this.leadVehicle.velocity;

      // Only process collision if player is moving faster (catching up)
      if (relativeVelocity > 0.1) {
        // Conservation of momentum: m1*v1 + m2*v2 = m1*v1' + m2*v2'
        // Assuming equal masses and partially inelastic collision (coefficient of restitution = 0.2)
        const mass1 = 1500; // Player vehicle mass (kg)
        const mass2 = 1500; // Lead vehicle mass (kg)
        const e = 0.2; // Coefficient of restitution (0 = perfectly inelastic, 1 = perfectly elastic)

        const v1 = this.playerVehicle.velocity;
        const v2 = this.leadVehicle.velocity;

        // Calculate post-collision velocities using physics formulas
        const v1Final = ((mass1 - e * mass2) * v1 + mass2 * (1 + e) * v2) / (mass1 + mass2);
        const v2Final = ((mass2 - e * mass1) * v2 + mass1 * (1 + e) * v1) / (mass1 + mass2);

        // Apply post-collision velocities immediately
        this.playerVehicle.velocity = v1Final;
        this.leadVehicle.velocity = v2Final;

        // Calculate impact force (simplified): F = m * Δv / Δt
        // Assume collision duration of 0.1 seconds
        const collisionDuration = 0.1;
        const deltaV1 = Math.abs(v1Final - v1);
        const impactForce = (mass1 * deltaV1) / collisionDuration;

        // Mark as crashing (physics continues during flash)
        this.isCrashing = true;

        // Play crash sound and stop engine
        const impactForceKN = impactForce / 1000;
        const speedDiffKmh = relativeVelocity * 3.6;
        this.audioEngine.playCrashSound(impactForceKN, speedDiffKmh);
        this.audioEngine.stopEngine();

        // Show crash report with flash animation - front collision with lead car
        this.showCrashReport(
          impactForce / 1000, // Convert to kN
          relativeVelocity * 3.6, // Convert to km/h
          v1 * 3.6, // Your speed in km/h
          v2 * 3.6, // Lead speed in km/h
          'front',
          0, // No rear impact
          relativeVelocity * 3.6 // Front impact speed diff
        );
      }
    }
  }

  private showCrashReport(
    impactForceKN: number,
    speedDiffKmh: number,
    yourSpeedKmh: number,
    otherSpeedKmh: number,
    crashType: 'front' | 'rear' | 'sandwich' = 'front',
    rearSpeedDiffKmh: number = 0,
    frontSpeedDiffKmh: number = 0
  ): void {
    // Show crash flash overlay immediately
    this.crashFlashElement.classList.remove('hidden');

    // Calculate damage level based on impact force and speed difference
    let damageLevel = 'MINOR';
    let damageColor = '#ff9900'; // Yellow-orange for MINOR

    if (impactForceKN > 150 || speedDiffKmh > 60) {
      damageLevel = 'CATASTROPHIC';
      damageColor = '#000000'; // Black for CATASTROPHIC
    } else if (impactForceKN > 100 || speedDiffKmh > 40) {
      damageLevel = 'SEVERE';
      damageColor = '#ff3300';
    } else if (impactForceKN > 50 || speedDiffKmh > 20) {
      damageLevel = 'MAJOR';
      damageColor = '#ff6600';
    } else if (impactForceKN > 20 || speedDiffKmh > 10) {
      damageLevel = 'MODERATE';
      damageColor = '#ffaa00'; // Orange for MODERATE
    }

    // Apply visual damage to the lead vehicle (only in front or sandwich crashes)
    if (crashType === 'front' || crashType === 'sandwich') {
      this.leadVehicle.applyDamage(damageLevel);
    }

    // Update crash report UI
    this.impactForceElement.textContent = `${impactForceKN.toFixed(1)} kN`;
    this.speedDiffElement.textContent = `${speedDiffKmh.toFixed(1)} km/h`;
    this.crashYourSpeedElement.textContent = `${yourSpeedKmh.toFixed(1)} km/h`;
    this.crashLeadSpeedElement.textContent = `${otherSpeedKmh.toFixed(1)} km/h`;
    this.damageElement.textContent = damageLevel;
    this.damageElement.style.color = damageColor;

    // Update final stats
    const kmDriven = this.playerVehicle.position / 1000;
    this.finalKmElement.textContent = `${kmDriven.toFixed(2)} km`;
    this.finalScoreElement.textContent = `${Math.round(this.score)} pts`;

    // Calculate and display Health Report based on crash type
    this.updateHealthReport(speedDiffKmh, crashType, rearSpeedDiffKmh, frontSpeedDiffKmh);

    // Wait 2 seconds for crash animation, then show game over screen
    setTimeout(async () => {
      this.isGameOver = true;
      this.crashFlashElement.classList.add('hidden');
      this.gameOverElement.classList.remove('hidden');

      // Check if this is a high score
      await this.checkAndShowHighScoreInput();
    }, 2000);
  }

  /**
   * Calculate and display the First Aid Health Report based on G-forces
   * Based on real crash biomechanics research:
   * - ~18 g: Injuries begin (broken bones, internal bruising)
   * - 20-30 g: Typical belted 30mph crash, survivable but serious
   * - ≥50 g: Associated with traumatic brain injury (TBI)
   * - 70-100 g: Often fatal (Princess Diana's fatal crash was 70-100 g)
   * Sources: PubMed, IIHS, Physics Factbook
   */
  private updateHealthReport(
    speedDiffKmh: number,
    crashType: 'front' | 'rear' | 'sandwich' = 'front',
    rearSpeedDiffKmh: number = 0,
    frontSpeedDiffKmh: number = 0
  ): void {
    // Calculate G-force: G = (ΔV / Δt) / 9.81
    const deltaV = speedDiffKmh / 3.6; // Convert to m/s
    const collisionDuration = 0.1; // seconds (typical car crash deceleration)
    const acceleration = deltaV / collisionDuration;
    const gForce = acceleration / 9.81;

    // Update G-force display
    this.gForceElement.textContent = `${gForce.toFixed(1)} g`;

    // Determine patient status and prognosis based on G-force
    // Thresholds based on real crash research data
    let patientStatus: string;
    let statusClass: string;
    let prognosis: string;
    let prognosisClass: string;
    const injuries: { text: string; severity: string }[] = [];

    if (gForce < 5) {
      // Very minor impact - minimal injury risk
      patientStatus = 'STABLE';
      statusClass = 'stable';
      prognosis = 'Full recovery expected';
      prognosisClass = 'good';
      injuries.push({ text: 'Minor discomfort', severity: 'minor' });
      injuries.push({ text: 'Possible light bruising from seatbelt', severity: 'minor' });
    } else if (gForce < 10) {
      // Minor impact - whiplash begins
      patientStatus = 'STABLE';
      statusClass = 'stable';
      prognosis = 'Recovery with rest';
      prognosisClass = 'good';
      injuries.push({ text: 'Whiplash (cervical strain)', severity: 'moderate' });
      injuries.push({ text: 'Seatbelt bruising across chest', severity: 'minor' });
      injuries.push({ text: 'Muscle soreness', severity: 'minor' });
    } else if (gForce < 18) {
      // Moderate impact - injuries likely
      patientStatus = 'MODERATE';
      statusClass = 'critical';
      prognosis = 'Recovery with treatment';
      prognosisClass = 'guarded';
      injuries.push({ text: 'Significant whiplash injury', severity: 'moderate' });
      injuries.push({ text: 'Chest contusion from restraints', severity: 'moderate' });
      injuries.push({ text: 'Possible minor rib fractures', severity: 'serious' });
      injuries.push({ text: 'Mild concussion possible', severity: 'moderate' });
      injuries.push({ text: 'Soft tissue damage', severity: 'moderate' });
    } else if (gForce < 30) {
      // Serious impact - broken bones, significant injuries (18g is injury threshold)
      patientStatus = 'SERIOUS';
      statusClass = 'severe';
      prognosis = 'Hospitalization required';
      prognosisClass = 'poor';
      injuries.push({ text: 'Rib fractures (multiple)', severity: 'serious' });
      injuries.push({ text: 'Sternum fracture possible', severity: 'serious' });
      injuries.push({ text: 'Concussion', severity: 'serious' });
      injuries.push({ text: 'Internal organ bruising', severity: 'serious' });
      injuries.push({ text: 'Cervical spine strain', severity: 'serious' });
      injuries.push({ text: 'Pulmonary contusion', severity: 'serious' });
    } else if (gForce < 50) {
      // Critical impact - TBI risk, severe internal injuries
      patientStatus = 'CRITICAL';
      statusClass = 'severe';
      prognosis = 'Life-threatening - ICU required';
      prognosisClass = 'poor';
      injuries.push({ text: 'Multiple rib fractures with flail chest', severity: 'critical' });
      injuries.push({ text: 'Traumatic brain injury (TBI)', severity: 'critical' });
      injuries.push({ text: 'Internal hemorrhaging', severity: 'critical' });
      injuries.push({ text: 'Spleen/liver laceration', severity: 'critical' });
      injuries.push({ text: 'Cervical vertebrae damage', severity: 'critical' });
      injuries.push({ text: 'Cardiac contusion', severity: 'critical' });
      injuries.push({ text: 'Aortic stress injury', severity: 'critical' });
    } else if (gForce < 70) {
      // Life-threatening - survival uncertain (50g+ = TBI threshold)
      patientStatus = 'CRITICAL - UNRESPONSIVE';
      statusClass = 'fatal';
      prognosis = 'Survival uncertain - Emergency surgery';
      prognosisClass = 'critical';
      injuries.push({ text: 'Severe traumatic brain injury', severity: 'fatal' });
      injuries.push({ text: 'Diffuse axonal injury (DAI)', severity: 'fatal' });
      injuries.push({ text: 'Aortic dissection risk', severity: 'fatal' });
      injuries.push({ text: 'Multiple organ trauma', severity: 'fatal' });
      injuries.push({ text: 'Massive internal bleeding', severity: 'fatal' });
      injuries.push({ text: 'Cervical spine fracture', severity: 'fatal' });
      injuries.push({ text: 'Flail chest with respiratory failure', severity: 'fatal' });
    } else if (gForce < 100) {
      // Usually fatal range (Princess Diana's crash was 70-100g)
      patientStatus = 'DECEASED / DYING';
      statusClass = 'fatal';
      prognosis = 'Fatal - Non-survivable injuries';
      prognosisClass = 'fatal';
      injuries.push({ text: 'Aortic rupture/transection', severity: 'fatal' });
      injuries.push({ text: 'Fatal brain hemorrhage', severity: 'fatal' });
      injuries.push({ text: 'Complete cervical dissociation', severity: 'fatal' });
      injuries.push({ text: 'Cardiac rupture', severity: 'fatal' });
      injuries.push({ text: 'Multiple organ failure', severity: 'fatal' });
      injuries.push({ text: 'Massive polytrauma', severity: 'fatal' });
    } else {
      // Catastrophic - instant death (unbelted 30mph crash = 150g)
      patientStatus = 'DECEASED';
      statusClass = 'fatal';
      prognosis = 'Instant fatality';
      prognosisClass = 'fatal';
      injuries.push({ text: 'Catastrophic total body destruction', severity: 'fatal' });
      injuries.push({ text: 'Complete vascular disruption', severity: 'fatal' });
      injuries.push({ text: 'Unsurvivable head trauma', severity: 'fatal' });
      injuries.push({ text: 'Total skeletal failure', severity: 'fatal' });
    }

    // Update patient status
    this.patientStatusElement.textContent = patientStatus;
    this.patientStatusElement.className = `stat-value patient-status ${statusClass}`;

    // Update injuries list
    this.injuriesListElement.innerHTML = injuries
      .map(injury => `<li class="${injury.severity}">${injury.text}</li>`)
      .join('');

    // Update prognosis
    this.prognosisElement.textContent = prognosis;
    this.prognosisElement.className = `stat-value prognosis-value ${prognosisClass}`;

    // Color the G-force based on severity
    if (gForce < 5) {
      this.gForceElement.style.color = '#00ff00';
    } else if (gForce < 10) {
      this.gForceElement.style.color = '#88ff00';
    } else if (gForce < 18) {
      this.gForceElement.style.color = '#ffff00';
    } else if (gForce < 30) {
      this.gForceElement.style.color = '#ffaa00';
    } else if (gForce < 50) {
      this.gForceElement.style.color = '#ff6600';
    } else if (gForce < 70) {
      this.gForceElement.style.color = '#ff3300';
    } else {
      this.gForceElement.style.color = '#ff0000';
    }

    // Show/hide health sections based on crash type and update occupants
    if (crashType === 'front') {
      // Front collision - show lead vehicle injuries, rear vehicle not involved
      this.leadHealthSectionElement.classList.remove('hidden');
      this.rearHealthSectionElement.classList.remove('hidden');
      this.updateLeadVehicleOccupants(gForce);
      this.showNoDamageNotice('rear');
    } else if (crashType === 'rear') {
      // Rear-ended - show rear vehicle injuries, lead vehicle not involved
      this.leadHealthSectionElement.classList.remove('hidden');
      this.rearHealthSectionElement.classList.remove('hidden');
      this.showNoDamageNotice('lead');
      this.updateRearVehicleOccupants(gForce);
    } else if (crashType === 'sandwich') {
      // Sandwich crash - show both lead and rear vehicles with injuries
      this.leadHealthSectionElement.classList.remove('hidden');
      this.rearHealthSectionElement.classList.remove('hidden');
      // Calculate separate G-forces for front and rear impacts
      const frontGForce = (frontSpeedDiffKmh / 3.6) / 0.1 / 9.81;
      const rearGForce = (rearSpeedDiffKmh / 3.6) / 0.1 / 9.81;
      this.updateLeadVehicleOccupants(frontGForce);
      this.updateRearVehicleOccupants(rearGForce);
    }
  }

  /**
   * Show "no damage" notice for a vehicle that wasn't involved in the crash
   */
  private showNoDamageNotice(vehicle: 'lead' | 'rear'): void {
    const noDamageHtml = `
      <div class="no-damage-notice">
        <span class="check-icon">✓</span>
        <span class="notice-text">Not involved in collision - No injuries</span>
      </div>
    `;

    if (vehicle === 'lead') {
      this.leadOccupantsElement.textContent = 'Safe';
      this.leadOccupantsListElement.innerHTML = noDamageHtml;
    } else {
      this.rearOccupantsElement.textContent = 'Safe';
      this.rearOccupantsListElement.innerHTML = noDamageHtml;
    }
  }

  /**
   * Generate and display lead vehicle occupants health report
   * Lead vehicle experiences rear-end impact (different injury patterns)
   */
  private updateLeadVehicleOccupants(gForce: number): void {
    // Random number of occupants (1-4)
    const numOccupants = Math.floor(Math.random() * 4) + 1;
    const occupantRoles = ['Driver', 'Front Passenger', 'Rear Left Passenger', 'Rear Right Passenger'];

    this.leadOccupantsElement.textContent = `${numOccupants} ${numOccupants === 1 ? 'person' : 'people'}`;

    // Generate occupant cards
    let occupantsHtml = '';

    for (let i = 0; i < numOccupants; i++) {
      const role = occupantRoles[i];
      // Rear passengers typically experience slightly less G-force
      const isRearSeat = i >= 2;
      const occupantGForce = isRearSeat ? gForce * 0.85 : gForce;

      const { status, statusClass, injuries } = this.getOccupantInjuries(occupantGForce, isRearSeat);

      occupantsHtml += `
        <div class="occupant-card ${statusClass}">
          <div class="occupant-header">
            <span class="occupant-role">${role}</span>
            <span class="occupant-status ${statusClass}">${status}</span>
          </div>
          <ul class="occupant-injuries">
            ${injuries.map(inj => `<li>${inj}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    this.leadOccupantsListElement.innerHTML = occupantsHtml;
  }

  /**
   * Generate and display rear vehicle occupants health report
   * Rear vehicle experiences frontal impact (more severe injury patterns)
   */
  private updateRearVehicleOccupants(gForce: number): void {
    // Random number of occupants (1-4)
    const numOccupants = Math.floor(Math.random() * 4) + 1;
    const occupantRoles = ['Driver', 'Front Passenger', 'Rear Left Passenger', 'Rear Right Passenger'];

    this.rearOccupantsElement.textContent = `${numOccupants} ${numOccupants === 1 ? 'person' : 'people'}`;

    // Generate occupant cards
    let occupantsHtml = '';

    for (let i = 0; i < numOccupants; i++) {
      const role = occupantRoles[i];
      // Rear passengers typically experience slightly less G-force
      const isRearSeat = i >= 2;
      const occupantGForce = isRearSeat ? gForce * 0.85 : gForce;

      // Rear car experiences frontal impact - use frontal injury patterns
      const { status, statusClass, injuries } = this.getRearCarOccupantInjuries(occupantGForce, isRearSeat);

      occupantsHtml += `
        <div class="occupant-card ${statusClass}">
          <div class="occupant-header">
            <span class="occupant-role">${role}</span>
            <span class="occupant-status ${statusClass}">${status}</span>
          </div>
          <ul class="occupant-injuries">
            ${injuries.map(inj => `<li>${inj}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    this.rearOccupantsListElement.innerHTML = occupantsHtml;
  }

  /**
   * Get injuries for rear car occupant based on G-force
   * Frontal collision injuries: airbag deployment, steering wheel impact, dashboard contact
   * More severe than rear-end as driver hits steering wheel/airbag
   */
  private getRearCarOccupantInjuries(gForce: number, isRearSeat: boolean): {
    status: string;
    statusClass: string;
    injuries: string[];
  } {
    const injuries: string[] = [];
    let status: string;
    let statusClass: string;

    if (gForce < 5) {
      status = 'STABLE';
      statusClass = 'stable';
      injuries.push('Minor jolt from impact');
      injuries.push('Seatbelt tightening discomfort');
    } else if (gForce < 10) {
      status = 'STABLE';
      statusClass = 'stable';
      injuries.push('Airbag deployment burns (face/arms)');
      injuries.push('Seatbelt bruising');
      if (!isRearSeat) injuries.push('Steering wheel grip strain');
    } else if (gForce < 18) {
      status = 'MODERATE';
      statusClass = 'serious';
      injuries.push('Airbag facial abrasions');
      injuries.push('Chest contusion from seatbelt');
      injuries.push('Wrist/hand injuries from steering wheel');
      if (isRearSeat) injuries.push('Knee impact with front seat');
    } else if (gForce < 30) {
      status = 'SERIOUS';
      statusClass = 'serious';
      injuries.push('Facial fractures from airbag');
      injuries.push('Rib fractures from seatbelt');
      injuries.push('Concussion from rapid deceleration');
      injuries.push('Knee/femur fractures from dashboard');
      if (!isRearSeat) injuries.push('Wrist fractures from steering wheel');
    } else if (gForce < 50) {
      status = 'CRITICAL';
      statusClass = 'critical';
      injuries.push('Severe facial trauma');
      injuries.push('Multiple rib fractures');
      injuries.push('Traumatic brain injury');
      injuries.push('Internal organ damage');
      injuries.push('Femur fractures');
      if (!isRearSeat) injuries.push('Steering column chest impact');
    } else if (gForce < 70) {
      status = 'CRITICAL';
      statusClass = 'critical';
      injuries.push('Severe head trauma');
      injuries.push('Aortic injury');
      injuries.push('Spinal cord damage');
      injuries.push('Multiple organ trauma');
      injuries.push('Pelvic fractures');
    } else {
      status = 'FATAL';
      statusClass = 'fatal';
      injuries.push('Catastrophic head trauma');
      injuries.push('Aortic rupture');
      injuries.push('Complete spinal transection');
      injuries.push('Multiple organ failure');
      injuries.push('Non-survivable injuries');
    }

    return { status, statusClass, injuries };
  }

  /**
   * Get injuries for a lead vehicle occupant based on G-force
   * Rear-end collision injuries: whiplash from sudden forward acceleration
   * Generally less severe than frontal impacts but whiplash is the primary concern
   * Based on real biomechanics research
   */
  private getOccupantInjuries(gForce: number, isRearSeat: boolean): {
    status: string;
    statusClass: string;
    injuries: string[];
  } {
    const injuries: string[] = [];
    let status: string;
    let statusClass: string;

    if (gForce < 5) {
      // Very minor - discomfort only
      status = 'STABLE';
      statusClass = 'stable';
      injuries.push('Minor neck stiffness');
      injuries.push('Light muscle tension');
    } else if (gForce < 10) {
      // Minor - whiplash begins
      status = 'STABLE';
      statusClass = 'stable';
      injuries.push('Whiplash (cervical strain)');
      injuries.push('Neck muscle soreness');
      if (!isRearSeat) injuries.push('Headrest impact bruising');
    } else if (gForce < 18) {
      // Moderate - significant whiplash
      status = 'MODERATE';
      statusClass = 'serious';
      injuries.push('Significant whiplash injury');
      injuries.push('Cervical ligament strain');
      injuries.push('Headrest impact contusion');
      if (isRearSeat) {
        injuries.push('Seat belt chest bruising');
      }
    } else if (gForce < 30) {
      // Serious - structural damage begins (18g threshold)
      status = 'SERIOUS';
      statusClass = 'serious';
      injuries.push('Severe whiplash with nerve damage');
      injuries.push('Cervical disc bulging/herniation');
      injuries.push('Concussion from head snap');
      injuries.push('Thoracic spine strain');
      if (!isRearSeat) {
        injuries.push('Facial contusions from headrest');
      }
    } else if (gForce < 50) {
      // Critical - severe injuries
      status = 'CRITICAL';
      statusClass = 'critical';
      injuries.push('Cervical vertebrae fracture');
      injuries.push('Traumatic brain injury (TBI)');
      injuries.push('Spinal cord contusion');
      injuries.push('Internal organ bruising');
      injuries.push('Thoracic spine damage');
    } else if (gForce < 70) {
      // Life-threatening - 50g+ TBI threshold
      status = 'CRITICAL';
      statusClass = 'critical';
      injuries.push('Severe spinal cord injury');
      injuries.push('Diffuse axonal brain injury');
      injuries.push('Cervical spine fracture/dislocation');
      injuries.push('Internal hemorrhaging');
      injuries.push('Respiratory compromise');
    } else {
      // Fatal range (70g+)
      status = 'FATAL';
      statusClass = 'fatal';
      injuries.push('Atlanto-occipital dissociation');
      injuries.push('Fatal brainstem injury');
      injuries.push('Complete spinal cord transection');
      injuries.push('Internal decapitation');
    }

    return { status, statusClass, injuries };
  }

  private restart(): void {
    // Reload the page to restart the simulation
    window.location.reload();
  }

  private async checkAndShowHighScoreInput(): Promise<void> {
    const finalScore = Math.round(this.score);
    const isHighScore = await this.highScoreManager.isHighScore(finalScore);

    if (isHighScore) {
      // Show high score name input
      this.newHighScoreElement.textContent = finalScore.toString();
      this.highScoreNameInputElement.classList.remove('hidden');
      this.playerNameInput.value = '';
      this.playerNameInput.focus();
    }
  }

  private async submitHighScore(): Promise<void> {
    const playerName = this.playerNameInput.value.trim();

    if (playerName.length === 0) {
      alert('Please enter your name!');
      return;
    }

    const finalScore = Math.round(this.score);
    const kmDriven = this.playerVehicle.position / 1000;

    // Save to database
    await this.highScoreManager.addScore(playerName, finalScore, kmDriven);

    // Hide name input
    this.highScoreNameInputElement.classList.add('hidden');

    // Show high scores
    await this.showHighScores();
  }

  private async showHighScores(): Promise<void> {
    const topScores = await this.highScoreManager.getTopScores(10);

    // Clear existing list
    this.highScoresListElement.innerHTML = '';

    if (topScores.length === 0) {
      this.highScoresListElement.innerHTML = '<div class="empty-scores-message">No high scores yet. Be the first!</div>';
    } else {
      topScores.forEach((score, index) => {
        const rank = index + 1;
        const entry = document.createElement('div');
        entry.className = `score-entry rank-${rank}`;

        const rankElement = document.createElement('div');
        rankElement.className = 'score-rank';
        rankElement.textContent = `#${rank}`;

        const nameElement = document.createElement('div');
        nameElement.className = 'score-player-name';
        nameElement.textContent = score.playerName;

        const detailsElement = document.createElement('div');
        detailsElement.className = 'score-details';

        const pointsElement = document.createElement('div');
        pointsElement.className = 'score-points';
        pointsElement.textContent = `${score.score} pts`;

        const distanceElement = document.createElement('div');
        distanceElement.className = 'score-distance';
        distanceElement.textContent = `${score.distance.toFixed(2)} km`;

        detailsElement.appendChild(pointsElement);
        detailsElement.appendChild(distanceElement);

        entry.appendChild(rankElement);
        entry.appendChild(nameElement);
        entry.appendChild(detailsElement);

        this.highScoresListElement.appendChild(entry);
      });
    }

    // Show the display
    this.highScoresDisplayElement.classList.remove('hidden');
  }

  private closeHighScores(): void {
    this.highScoresDisplayElement.classList.add('hidden');
  }

  private animate(currentTime: number): void {
    requestAnimationFrame((time) => this.animate(time));

    const deltaTime = this.lastTime === 0 ? 0 : (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Cap delta time to prevent physics issues
    const clampedDelta = Math.min(deltaTime, 0.1);

    // Hide game start overlay when A or SPACE is pressed
    if (!this.gameStarted) {
      const acceleration = this.inputController.getAccelerationInput();
      const braking = this.inputController.getBrakingInput();

      if (acceleration > 0 || braking > 0) {
        this.gameStarted = true;
        this.gameStartOverlayElement.classList.add('hidden');

        // Start audio engine on first user input (required by browser policy)
        this.audioEngine.init();
        this.audioEngine.startEngine();
      }
    }

    // Update player vehicle based on input (unless crashing)
    if (!this.isCrashing) {
      const acceleration = this.inputController.getAccelerationInput();
      const braking = this.inputController.getBrakingInput();

      this.playerVehicle.setAcceleration(acceleration);
      this.playerVehicle.setBraking(braking);
    } else {
      // During crash, no input - just coast with drag
      this.playerVehicle.setAcceleration(0);
      this.playerVehicle.setBraking(0);
    }
    this.playerVehicle.update(clampedDelta);

    // Update engine sound based on speed and acceleration
    if (this.gameStarted && !this.isGameOver) {
      const speedKmh = this.playerVehicle.getVelocityKmh();
      const accelInput = this.inputController.getAccelerationInput();
      const brakeInput = this.inputController.getBrakingInput();
      this.audioEngine.updateEngine(speedKmh, accelInput);
      this.audioEngine.updateBrakeSound(brakeInput, speedKmh);
    }

    // Update lead vehicle AI (unless crashing)
    if (!this.isCrashing) {
      this.leadVehicleAI.update(clampedDelta);
    } else {
      // During crash, lead vehicle also just coasts
      this.leadVehicle.setAcceleration(0);
      this.leadVehicle.setBraking(0);
      this.leadVehicle.update(clampedDelta);
    }

    // Update camera and road
    this.updateCamera();
    this.updateRoad();

    // Update rear car, oncoming traffic, and mirrors
    this.updateRearCar(clampedDelta);
    this.updateOncomingTraffic(clampedDelta);
    this.updateMirrors();

    // Check for collision
    this.checkCollision();

    // Update HUD
    this.updateHUD();

    // Render
    this.renderer.render(this.scene, this.camera);
  }
}

// Start the simulation
new SafeDistanceSimulator();
