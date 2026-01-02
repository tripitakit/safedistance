import './style.css';
import * as THREE from 'three';
import { Vehicle, VehicleConfig } from './Vehicle';
import { LeadVehicleAI } from './LeadVehicleAI';
import { InputController } from './InputController';
import { HighScoreManager } from './HighScoreManager';
import { AudioEngine } from './AudioEngine';
import { CameraEffects } from './CameraEffects';
import { ParticleSystem } from './ParticleSystem';
import { WeatherSystem } from './WeatherSystem';
import { TimeOfDay } from './TimeOfDay';

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

  // Streetlight system - only 4 dynamic lights that follow the player
  private streetlightBulbs: THREE.Mesh[] = [];  // Visual bulbs on poles
  private dynamicStreetlights: THREE.PointLight[] = [];  // Only 4 active lights near player
  private readonly DYNAMIC_LIGHT_COUNT = 4;
  private lastBulbColor: number = 0;  // Cache to avoid updating bulbs every frame

  private lastTime: number = 0;
  private frameCount: number = 0; // For mirror render optimization (every 2nd frame)

  // HUD elements
  private warningTooCloseElement: HTMLElement;
  private warningSafeElement: HTMLElement;
  private scoreOverlayElement: HTMLElement;
  private gameStartOverlayElement!: HTMLElement;
  private speedometerCanvas: HTMLCanvasElement;
  private speedometerCtx: CanvasRenderingContext2D;
  private speedometerBackground: ImageData | null = null;

  // Visual effect overlay elements
  private vignetteOverlay!: HTMLElement;
  private tensionOverlay!: HTMLElement;
  private speedLinesOverlay!: HTMLElement;

  // Warning state
  private warningTimeout: number | null = null;
  private lastWarningState: 'safe' | 'danger' | null = null;

  // Game start state
  private gameStarted: boolean = false;

  // Game stats
  private score: number = 0;
  private lastDisplayedScore: number = -1; // Cache to avoid string allocations

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

  // Phone distraction system
  private phoneElement!: HTMLElement;
  private phoneNotificationElement!: HTMLElement;
  private notificationTitleElement!: HTMLElement;
  private notificationBodyElement!: HTMLElement;
  private phoneClockElement!: HTMLElement;
  private phoneTimeElement!: Element | null;  // Cached status bar time element
  private phoneNotificationTimer: number = 0;
  private phoneNotificationActive: boolean = false;
  private readonly PHONE_MIN_INTERVAL = 25; // Minimum seconds between notifications
  private readonly PHONE_MAX_INTERVAL = 50; // Maximum seconds between notifications
  private phoneNextNotificationTime: number = 0;

  // Notification messages pool
  private readonly phoneMessages = [
    { title: 'WhatsApp', body: 'Mom: Call me when you can 💕', icon: '💬' },
    { title: 'Instagram', body: 'liked your photo 📸', icon: '📷' },
    { title: 'Messages', body: 'Where are you? Running late?', icon: '💬' },
    { title: 'Email', body: 'Your order has shipped! 📦', icon: '✉️' },
    { title: 'Twitter', body: 'You have 5 new notifications', icon: '🐦' },
    { title: 'Calendar', body: 'Meeting in 30 minutes', icon: '📅' },
    { title: 'News', body: 'Breaking: Major traffic jam ahead', icon: '📰' },
    { title: 'Spotify', body: 'Your Daily Mix is ready 🎵', icon: '🎵' },
    { title: 'Banking', body: 'Payment received: €150.00', icon: '🏦' },
    { title: 'Weather', body: 'Rain expected in 2 hours ☔', icon: '🌧️' },
    { title: 'Messenger', body: 'Hey! Are you driving? 🚗', icon: '💬' },
    { title: 'TikTok', body: 'Your video is trending! 🔥', icon: '🎬' },
  ];

  // Phone notification audio
  private phoneAudioContext: AudioContext | null = null;

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

  // Rear car headlight flashing (aggressive tailgating)
  private rearCarHeadlights: THREE.Mesh[] = [];
  private rearCarPointLights: THREE.PointLight[] = [];
  private rearCarFlashState: number = 0; // 0 = not flashing, 1-6 = flash sequence
  private rearCarFlashTimer: number = 0;
  private rearCarNextFlashTime: number = 0; // When to potentially start next flash sequence

  // Mirror meshes for brightness adjustment during high beam flashes
  private mirrorMeshes: THREE.Mesh[] = [];

  // Oncoming traffic system (left lane) with object pooling
  private oncomingCars: THREE.Group[] = [];  // Active cars in scene
  private oncomingCarPool: THREE.Group[] = [];  // Inactive cars ready for reuse
  private oncomingCarPositions: number[] = []; // World positions (meters along road)
  private oncomingCarSpeeds: number[] = []; // m/s (positive = toward player)
  private readonly ONCOMING_LANE_X = -2.5;
  private readonly ONCOMING_SPAWN_AHEAD = 280; // Spawn just inside fog
  private readonly ONCOMING_DESPAWN_BEHIND = 30; // Remove after passing
  private readonly MIN_CAR_SPACING = 60; // Minimum gap between cars
  private readonly ONCOMING_POOL_SIZE = 15; // Pre-allocated cars (increased to prevent fallback)

  // Shared geometries and materials for oncoming cars (avoid GC)
  private sharedCarGeometries: {
    body: THREE.BoxGeometry;
    cabin: THREE.BoxGeometry;
    windscreen: THREE.PlaneGeometry;
    headlight: THREE.PlaneGeometry;
    tire: THREE.CylinderGeometry;
    rim: THREE.CylinderGeometry;
  } | null = null;
  private sharedCarMaterials: {
    bodyColors: THREE.MeshStandardMaterial[];
    cabin: THREE.MeshStandardMaterial;
    windscreen: THREE.MeshStandardMaterial;
    headlight: THREE.MeshBasicMaterial;
    tire: THREE.MeshStandardMaterial;
    rim: THREE.MeshStandardMaterial;
  } | null = null;

  // Vehicle pools for commercial vehicles (increased sizes to prevent fallback)
  private oncomingVanPool: THREE.Group[] = [];
  private oncomingTruckPool: THREE.Group[] = [];
  private oncomingSemiPool: THREE.Group[] = [];
  private readonly VAN_POOL_SIZE = 6;
  private readonly TRUCK_POOL_SIZE = 4;
  private readonly SEMI_POOL_SIZE = 3;

  // Shared geometries and materials for vans
  private sharedVanGeometries: {
    body: THREE.BoxGeometry;
    cabin: THREE.BoxGeometry;
    windscreen: THREE.PlaneGeometry;
    headlight: THREE.PlaneGeometry;
    wheel: THREE.CylinderGeometry;
    rim: THREE.CylinderGeometry;
  } | null = null;
  private sharedVanMaterials: {
    bodyColors: THREE.MeshStandardMaterial[];
    tire: THREE.MeshStandardMaterial;
    rim: THREE.MeshStandardMaterial;
  } | null = null;

  // Shared geometries and materials for trucks
  private sharedTruckGeometries: {
    cabin: THREE.BoxGeometry;
    cargo: THREE.BoxGeometry;
    windscreen: THREE.PlaneGeometry;
    headlight: THREE.PlaneGeometry;
    wheel: THREE.CylinderGeometry;
    rim: THREE.CylinderGeometry;
  } | null = null;
  private sharedTruckMaterials: {
    cabinColors: THREE.MeshStandardMaterial[];
    cargo: THREE.MeshStandardMaterial;
    tire: THREE.MeshStandardMaterial;
    rim: THREE.MeshStandardMaterial;
  } | null = null;

  // Shared geometries and materials for semi-trucks
  private sharedSemiGeometries: {
    cabin: THREE.BoxGeometry;
    sleeper: THREE.BoxGeometry;
    trailer: THREE.BoxGeometry;
    windscreen: THREE.PlaneGeometry;
    headlight: THREE.PlaneGeometry;
    wheel: THREE.CylinderGeometry;
    rim: THREE.CylinderGeometry;
  } | null = null;
  private sharedSemiMaterials: {
    cabinColors: THREE.MeshStandardMaterial[];
    trailerColors: THREE.MeshStandardMaterial[];
    chrome: THREE.MeshStandardMaterial;
    tire: THREE.MeshStandardMaterial;
    rim: THREE.MeshStandardMaterial;
  } | null = null;

  // Pre-cached speed limit sign textures
  private speedLimitTextures: Map<number, THREE.CanvasTexture> = new Map();

  // Shared geometries and materials for environment objects
  private sharedEnvGeometries: {
    // Trees
    treeTrunk: THREE.CylinderGeometry;
    treeFoliage1: THREE.SphereGeometry;
    treeFoliage2: THREE.SphereGeometry;
    treeFoliage3: THREE.SphereGeometry;
    // Residential house
    houseWall: THREE.BoxGeometry;
    houseRoof: THREE.ConeGeometry;
    houseDoor: THREE.BoxGeometry;
    houseWindow: THREE.BoxGeometry;
    // Commercial buildings
    shopBody: THREE.BoxGeometry;
    shopAwning: THREE.BoxGeometry;
    shopWindow: THREE.BoxGeometry;
    warehouseBody: THREE.BoxGeometry;
    warehouseRoof: THREE.BoxGeometry;
    warehouseDoor: THREE.BoxGeometry;
    // Industrial buildings
    factoryBody: THREE.BoxGeometry;
    factoryChimney: THREE.CylinderGeometry;
    factoryDoor: THREE.BoxGeometry;
    siloBody: THREE.CylinderGeometry;
    siloTop: THREE.ConeGeometry;
    // Bushes
    bushMain: THREE.SphereGeometry;
    bushSmall: THREE.SphereGeometry;
  } | null = null;
  private sharedEnvMaterials: {
    treeTrunk: THREE.MeshStandardMaterial;
    treeFoliage: THREE.MeshStandardMaterial;
    houseWall: THREE.MeshStandardMaterial;
    houseRoof: THREE.MeshStandardMaterial;
    houseDoor: THREE.MeshStandardMaterial;
    houseWindow: THREE.MeshStandardMaterial;
    // Commercial
    shopWallColors: THREE.MeshStandardMaterial[];
    shopAwningColors: THREE.MeshStandardMaterial[];
    warehouseMetal: THREE.MeshStandardMaterial;
    warehouseDoor: THREE.MeshStandardMaterial;
    // Industrial
    factoryWall: THREE.MeshStandardMaterial;
    factoryChimney: THREE.MeshStandardMaterial;
    siloMetal: THREE.MeshStandardMaterial;
    bush: THREE.MeshStandardMaterial;
  } | null = null;

  // Shared geometries and materials for streetlights
  private sharedStreetlightGeometries: {
    pole: THREE.CylinderGeometry;
    arm: THREE.CylinderGeometry;
    housing: THREE.BoxGeometry;
    bulb: THREE.SphereGeometry;
  } | null = null;
  private sharedStreetlightMaterials: {
    pole: THREE.MeshStandardMaterial;
    housing: THREE.MeshStandardMaterial;
  } | null = null;

  // Shared geometries and materials for speed limit signs
  private sharedSignGeometries: {
    pole: THREE.CylinderGeometry;
    face: THREE.PlaneGeometry;
    back: THREE.CircleGeometry;
  } | null = null;
  private sharedSignMaterials: {
    pole: THREE.MeshStandardMaterial;
    back: THREE.MeshStandardMaterial;
  } | null = null;

  // Audio engine
  private audioEngine: AudioEngine;

  // Camera effects
  private cameraEffects!: CameraEffects;

  // Particle system
  private particleSystem!: ParticleSystem;

  // Weather and time systems
  private weatherSystem!: WeatherSystem;
  private timeOfDay!: TimeOfDay;

  // Lighting references (for TimeOfDay control)
  private sunLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

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
    // Optimize for high-DPI displays (cap at 2 to prevent GPU waste on 4K+ screens)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Get HUD elements
    this.warningTooCloseElement = document.getElementById('warningTooClose')!;
    this.warningSafeElement = document.getElementById('warningSafe')!;
    this.scoreOverlayElement = document.getElementById('scoreOverlay')!;
    this.gameStartOverlayElement = document.getElementById('gameStartOverlay')!;
    this.speedometerCanvas = document.getElementById('speedometer') as HTMLCanvasElement;
    this.speedometerCtx = this.speedometerCanvas.getContext('2d')!;

    // Get visual effect overlay elements
    this.vignetteOverlay = document.getElementById('vignetteOverlay')!;
    this.tensionOverlay = document.getElementById('tensionOverlay')!;
    this.speedLinesOverlay = document.getElementById('speedLines')!;

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

    // Initialize phone distraction elements
    this.phoneElement = document.getElementById('phoneDistraction')!;
    this.phoneNotificationElement = document.getElementById('phoneNotification')!;
    this.notificationTitleElement = document.getElementById('notificationTitle')!;
    this.notificationBodyElement = document.getElementById('notificationBody')!;
    this.phoneClockElement = document.getElementById('phoneClock')!;
    this.phoneTimeElement = document.querySelector('.phone-time');  // Cache status bar element
    this.initPhoneSystem();

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
    // Pre-allocate all shared geometries and textures to avoid runtime stutters
    this.initEnvironmentGeometries();
    this.initSpeedLimitTextures();
    this.initVehiclePools();

    this.environment = this.createEnvironment();
    this.scene.add(this.environment);
    this.environment2 = this.createEnvironment();
    this.scene.add(this.environment2);

    // Initialize dynamic streetlights (only 4 PointLights that follow player)
    this.initDynamicStreetlights();

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

    // Initialize camera effects
    this.cameraEffects = new CameraEffects(this.camera);

    // Initialize particle system
    this.particleSystem = new ParticleSystem(this.scene, 500);

    // Initialize weather and time of day systems
    this.weatherSystem = new WeatherSystem(this.scene);
    this.timeOfDay = new TimeOfDay(this.scene, this.sunLight, this.ambientLight);

    // Add keyboard controls for weather/time cycling (W and T keys)
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'w' && !this.isGameOver) {
        this.weatherSystem.cycleWeather();
      }
      if (e.key.toLowerCase() === 't' && !this.isGameOver) {
        this.timeOfDay.cycleTime();
      }
    });

    // Pre-warm renderer to compile all shaders before gameplay
    // This prevents stuttering in the first 2km
    this.preWarmRenderer();

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

  /**
   * Pre-warm the renderer by compiling all shaders before gameplay starts.
   * This prevents stuttering during the first 2km when objects are first rendered.
   */
  private preWarmRenderer(): void {
    // 1. Compile all shaders for objects currently in the scene
    this.renderer.compile(this.scene, this.camera);

    // 2. Pre-warm vehicle pools by temporarily adding them to scene and rendering
    const tempPosition = new THREE.Vector3(0, -100, -500); // Off-screen position
    const allPooledVehicles: THREE.Group[] = [
      ...this.oncomingCarPool,
      ...this.oncomingVanPool,
      ...this.oncomingTruckPool,
      ...this.oncomingSemiPool
    ];

    // Add all pooled vehicles to scene temporarily
    for (const vehicle of allPooledVehicles) {
      vehicle.position.copy(tempPosition);
      vehicle.visible = true;
      this.scene.add(vehicle);
    }

    // 3. Pre-warm weather particles by making them visible briefly
    // This forces shader compilation for rain and snow materials
    this.weatherSystem.preWarmParticles();

    // 4. Pre-warm particle system by emitting test particles
    this.particleSystem.emit({
      type: 'dust',
      position: tempPosition,
      count: 5
    });
    this.particleSystem.emit({
      type: 'sparks',
      position: tempPosition,
      count: 5
    });

    // Render once to compile all shaders
    this.renderer.render(this.scene, this.camera);

    // Clean up: remove pooled vehicles and clear test particles
    for (const vehicle of allPooledVehicles) {
      this.scene.remove(vehicle);
      vehicle.visible = false;
    }
    this.particleSystem.clear();
    this.weatherSystem.hidePreWarmParticles();

    // 5. Final shader compilation pass
    this.renderer.compile(this.scene, this.camera);
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
    this.rearCarHeadlights = []; // Reset array
    this.rearCarPointLights = []; // Reset array

    const headlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, // Pure white, unlit - always bright
      side: THREE.DoubleSide
    });

    // Left headlight - large white rectangle (at local +Z, faces player after 180° rotation)
    const leftHeadlightGeom = new THREE.PlaneGeometry(0.5, 0.3);
    const leftHeadlight = new THREE.Mesh(leftHeadlightGeom, headlightMaterial.clone());
    leftHeadlight.position.set(-0.65, 0.7, 2.01); // Raised with body
    this.rearCar.add(leftHeadlight);
    this.rearCarHeadlights.push(leftHeadlight);

    // Right headlight - large white rectangle
    const rightHeadlightGeom = new THREE.PlaneGeometry(0.5, 0.3);
    const rightHeadlight = new THREE.Mesh(rightHeadlightGeom, headlightMaterial.clone());
    rightHeadlight.position.set(0.65, 0.7, 2.01); // Raised with body
    this.rearCar.add(rightHeadlight);
    this.rearCarHeadlights.push(rightHeadlight);

    // Inner headlight pair (dual headlight look)
    const innerHeadlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffcc, // Slightly warm white
      side: THREE.DoubleSide
    });

    const leftInnerHeadlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.25),
      innerHeadlightMaterial.clone()
    );
    leftInnerHeadlight.position.set(-0.25, 0.7, 2.01); // Raised with body
    this.rearCar.add(leftInnerHeadlight);
    this.rearCarHeadlights.push(leftInnerHeadlight);

    const rightInnerHeadlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.25),
      innerHeadlightMaterial.clone()
    );
    rightInnerHeadlight.position.set(0.25, 0.7, 2.01); // Raised with body
    this.rearCar.add(rightInnerHeadlight);
    this.rearCarHeadlights.push(rightInnerHeadlight);

    // Point lights for headlight glow effect (at local +Z)
    const leftLight = new THREE.PointLight(0xffffee, 3, 25);
    leftLight.position.set(-0.5, 0.8, 2.5); // Raised with body
    this.rearCar.add(leftLight);
    this.rearCarPointLights.push(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 3, 25);
    rightLight.position.set(0.5, 0.8, 2.5); // Raised with body
    this.rearCar.add(rightLight);
    this.rearCarPointLights.push(rightLight);

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
    this.mirrorMeshes = [];
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

        // Store reference for brightness adjustment during high beam flashes
        this.mirrorMeshes.push(child);
      }
    });
  }

  private updateRearCar(deltaTime: number, currentTime: number): void {
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
    // In bad weather, visibility is reduced so tailgater follows even CLOSER (more dangerous!)
    if (Math.random() < 0.02) {
      const traction = this.weatherSystem.getTraction();
      // Visibility factor: 1.0 in clear weather, down to 0.6 in blizzard
      // Lower visibility = tailgater follows closer (dangerous!)
      const visibilityFactor = 0.6 + traction * 0.4;

      const baseMinDistance = Math.max(5, 7 - playerSpeed / 50);
      const baseMaxDistance = Math.max(12, 16 - playerSpeed / 30);

      // Reduce following distance in bad weather (simulates reduced visibility awareness)
      const minDistance = baseMinDistance * visibilityFactor;
      const maxDistance = baseMaxDistance * visibilityFactor;
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

    // Apply weather traction to braking (negative acceleration is less effective in rain)
    const traction = this.weatherSystem.getTraction();
    if (targetAcceleration < 0) {
      targetAcceleration *= traction; // Braking reduced in wet conditions
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
    this.rearCar.position.x = 2.5 + (Math.sin(currentTime * 0.0015) * 0.3); // Right lane with slight weaving

    // Aggressive headlight flashing when tailgating close
    this.updateRearCarHeadlightFlash(deltaTime, currentDistance);
  }

  private updateRearCarHeadlightFlash(deltaTime: number, distance: number): void {
    const isAggressivelyClose = distance < 8 && distance > 3.5;

    // Update flash timer
    this.rearCarFlashTimer += deltaTime;

    // If currently flashing, animate the flash sequence
    if (this.rearCarFlashState > 0) {
      const flashDuration = 0.08; // 80ms per flash state
      if (this.rearCarFlashTimer >= flashDuration) {
        this.rearCarFlashTimer = 0;
        this.rearCarFlashState++;

        // Flash sequence: on-off-on-off-on-off (6 states for 3 flashes)
        if (this.rearCarFlashState > 6) {
          this.rearCarFlashState = 0;
          // Set next potential flash time (2-5 seconds)
          this.rearCarNextFlashTime = 2 + Math.random() * 3;
        }
      }

      // Apply flash state (odd = bright/on, even = dim/off)
      const isFlashOn = this.rearCarFlashState % 2 === 1;
      this.setRearCarHighBeams(isFlashOn);
    } else {
      // Not flashing - check if we should start a flash sequence
      if (isAggressivelyClose && this.rearCarFlashTimer >= this.rearCarNextFlashTime) {
        // 50% chance to flash when conditions are met
        if (Math.random() < 0.5) {
          this.rearCarFlashState = 1;
          this.rearCarFlashTimer = 0;
        } else {
          // Didn't flash, wait another 1-3 seconds
          this.rearCarNextFlashTime = this.rearCarFlashTimer + 1 + Math.random() * 2;
        }
      }

      // Ensure headlights are at normal brightness when not flashing
      this.setRearCarHighBeams(false);
    }
  }

  private setRearCarHighBeams(highBeamsOn: boolean): void {
    const brightness = highBeamsOn ? 2.5 : 1.0;
    const lightIntensity = highBeamsOn ? 8 : 3;

    // Update headlight mesh colors
    for (const headlight of this.rearCarHeadlights) {
      const material = headlight.material as THREE.MeshBasicMaterial;
      if (highBeamsOn) {
        material.color.setHex(0xffffee);
      } else {
        // Original colors - outer white, inner warm white
        const isInner = Math.abs(headlight.position.x) < 0.5;
        material.color.setHex(isInner ? 0xffffcc : 0xffffff);
      }
      // Scale brightness by adjusting the mesh scale slightly for visual effect
      headlight.scale.setScalar(brightness);
    }

    // Update point light intensities
    for (const light of this.rearCarPointLights) {
      light.intensity = lightIntensity;
    }

    // Brighten mirrors when high beams flash (simulates being blinded)
    for (const mirror of this.mirrorMeshes) {
      const material = mirror.material as THREE.MeshBasicMaterial;
      if (highBeamsOn) {
        // Bright wash-out effect - simulate eye being flashed
        material.color.setRGB(2.5, 2.5, 2.2);
      } else {
        // Normal mirror - neutral white
        material.color.setRGB(1, 1, 1);
      }
    }
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

      // Trigger camera shake - sandwich is extra intense
      this.cameraEffects.triggerShake(0.15);

      // Emit collision particles - both front and rear
      const frontPos = this.playerVehicle.mesh.position.clone().add(new THREE.Vector3(0, 0.5, -2));
      const rearPos = this.playerVehicle.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 2));
      this.particleSystem.emitSparks(frontPos, 1);
      this.particleSystem.emitSparks(rearPos, 1);
      this.particleSystem.emitDebris(frontPos, 1);
      this.particleSystem.emitDebris(rearPos, 1);

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

      // Trigger camera shake based on impact severity
      const shakeIntensity = Math.min(0.1 + impactForceKN * 0.002, 0.15);
      this.cameraEffects.triggerShake(shakeIntensity);

      // Emit collision particles - rear impact
      const rearPos = this.playerVehicle.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 2));
      this.particleSystem.emitSparks(rearPos, impactForceKN / 50);
      if (impactForceKN > 30) {
        this.particleSystem.emitDebris(rearPos, impactForceKN / 100);
      }

      // Rear-end only - show rear car health report, not lead
      this.showCrashReport(impactForceKN, speedDiffKmh, playerSpeedKmh, rearCarSpeedKmh, 'rear', speedDiffKmh, 0);
    }
  }

  // Pre-cached truck decoration textures
  private truckDecorationTextures: {
    tir: THREE.CanvasTexture;
    logos: THREE.CanvasTexture[];
  } | null = null;

  // Store canvas elements to prevent garbage collection
  private speedLimitCanvases: Map<number, HTMLCanvasElement> = new Map();

  /**
   * Pre-generate speed limit sign textures to avoid runtime canvas/GPU uploads
   */
  private initSpeedLimitTextures(): void {
    const speedLimits = [70, 90, 110, 130];

    speedLimits.forEach(limit => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = 256;
      canvas.height = 256;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = 120;

      // Clear with transparency
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw white circle background
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();

      // Draw red border ring
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.lineWidth = 20;
      context.strokeStyle = '#cc0000';
      context.stroke();

      // Draw black number centered
      // Use heavier font weight and slight offset for better visual centering
      context.font = '900 110px Arial Black, Arial';
      context.fillStyle = '#000000';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      // Add small vertical offset (+8px) to visually center the text
      context.fillText(limit.toString(), cx, cy + 8);

      // Store canvas to prevent garbage collection
      this.speedLimitCanvases.set(limit, canvas);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      // Flip horizontally to compensate for sign rotation facing player
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = -1;
      texture.offset.x = 1;
      texture.needsUpdate = true;

      this.speedLimitTextures.set(limit, texture);
    });

    // Pre-generate truck decoration textures
    this.initTruckDecorationTextures();
  }

  // Store truck decoration canvases to prevent garbage collection
  private truckDecorationCanvases: HTMLCanvasElement[] = [];

  /**
   * Pre-generate fake company logos and TIR plates for semi-trucks
   */
  private initTruckDecorationTextures(): void {
    // TIR plate (blue background, white text)
    const tirCanvas = document.createElement('canvas');
    const tirCtx = tirCanvas.getContext('2d')!;
    tirCanvas.width = 128;
    tirCanvas.height = 64;
    tirCtx.fillStyle = '#003399';
    tirCtx.fillRect(0, 0, 128, 64);
    tirCtx.strokeStyle = '#ffffff';
    tirCtx.lineWidth = 3;
    tirCtx.strokeRect(3, 3, 122, 58);
    tirCtx.font = 'bold 40px Arial';
    tirCtx.fillStyle = '#ffffff';
    tirCtx.textAlign = 'center';
    tirCtx.textBaseline = 'middle';
    tirCtx.fillText('TIR', 64, 32);
    this.truckDecorationCanvases.push(tirCanvas);
    const tirTexture = new THREE.CanvasTexture(tirCanvas);
    tirTexture.minFilter = THREE.LinearFilter;
    tirTexture.needsUpdate = true;

    // Fake company logos
    const logos: THREE.CanvasTexture[] = [];
    const companyNames = ['EUROMAX', 'TRANSCARGO', 'SPEEDLINE', 'LOGISTICA', 'TRANSEUROPA'];
    const logoColors = ['#cc2222', '#2255aa', '#22aa55', '#dd6600', '#8844aa'];

    companyNames.forEach((name, i) => {
      const logoCanvas = document.createElement('canvas');
      const logoCtx = logoCanvas.getContext('2d')!;
      logoCanvas.width = 256;
      logoCanvas.height = 64;

      // Background stripe
      logoCtx.fillStyle = logoColors[i];
      logoCtx.fillRect(0, 10, 256, 44);

      // Company name
      logoCtx.font = 'bold 32px Arial';
      logoCtx.fillStyle = '#ffffff';
      logoCtx.textAlign = 'center';
      logoCtx.textBaseline = 'middle';
      logoCtx.fillText(name, 128, 32);

      this.truckDecorationCanvases.push(logoCanvas);
      const logoTexture = new THREE.CanvasTexture(logoCanvas);
      logoTexture.minFilter = THREE.LinearFilter;
      logoTexture.needsUpdate = true;
      logos.push(logoTexture);
    });

    this.truckDecorationTextures = { tir: tirTexture, logos };
  }

  /**
   * Pre-create shared geometries and materials for environment objects
   * This eliminates per-object geometry allocation during gameplay
   */
  private initEnvironmentGeometries(): void {
    // All environment geometries
    this.sharedEnvGeometries = {
      // Trees
      treeTrunk: new THREE.CylinderGeometry(0.3, 0.4, 4, 8),
      treeFoliage1: new THREE.SphereGeometry(2, 8, 8),
      treeFoliage2: new THREE.SphereGeometry(1.5, 8, 8),
      treeFoliage3: new THREE.SphereGeometry(1, 8, 8),
      // Residential house
      houseWall: new THREE.BoxGeometry(6, 4, 6),
      houseRoof: new THREE.ConeGeometry(4.5, 2.5, 4),
      houseDoor: new THREE.BoxGeometry(1.2, 2, 0.1),
      houseWindow: new THREE.BoxGeometry(1, 1, 0.1),
      // Commercial - Shop
      shopBody: new THREE.BoxGeometry(8, 3.5, 5),
      shopAwning: new THREE.BoxGeometry(8.5, 0.3, 1.5),
      shopWindow: new THREE.BoxGeometry(2.5, 2, 0.1),
      // Commercial - Warehouse
      warehouseBody: new THREE.BoxGeometry(12, 5, 8),
      warehouseRoof: new THREE.BoxGeometry(12.5, 0.5, 9),
      warehouseDoor: new THREE.BoxGeometry(3, 4, 0.1),
      // Industrial - Factory
      factoryBody: new THREE.BoxGeometry(10, 6, 8),
      factoryChimney: new THREE.CylinderGeometry(0.4, 0.5, 4, 8),
      factoryDoor: new THREE.BoxGeometry(2.5, 2.5, 0.1), // Shorter door to not overlap windows
      // Industrial - Silo
      siloBody: new THREE.CylinderGeometry(2, 2, 8, 12),
      siloTop: new THREE.ConeGeometry(2.2, 1.5, 12),
      // Bushes
      bushMain: new THREE.SphereGeometry(1.2, 8, 6),
      bushSmall: new THREE.SphereGeometry(0.8, 8, 6)
    };

    // All environment materials
    this.sharedEnvMaterials = {
      // Trees
      treeTrunk: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 }),
      treeFoliage: new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.7 }),
      // Residential
      houseWall: new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.8 }),
      houseRoof: new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.6 }),
      houseDoor: new THREE.MeshStandardMaterial({ color: 0x654321 }),
      houseWindow: new THREE.MeshStandardMaterial({ color: 0x87ceeb }),
      // Commercial - varied colors for shops
      shopWallColors: [
        new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.7 }), // Beige
        new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 }), // Light gray
        new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.7 }), // Cream
        new THREE.MeshStandardMaterial({ color: 0xf0e68c, roughness: 0.7 })  // Khaki
      ],
      shopAwningColors: [
        new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6 }), // Red
        new THREE.MeshStandardMaterial({ color: 0x006600, roughness: 0.6 }), // Green
        new THREE.MeshStandardMaterial({ color: 0x000066, roughness: 0.6 }), // Blue
        new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 })  // Orange
      ],
      warehouseMetal: new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.4, metalness: 0.3 }),
      warehouseDoor: new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.4 }),
      // Industrial
      factoryWall: new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.8 }),
      factoryChimney: new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.7 }),
      siloMetal: new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.6 }),
      // Bushes
      bush: new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.9 })
    };

    // Streetlight geometries
    this.sharedStreetlightGeometries = {
      pole: new THREE.CylinderGeometry(0.08, 0.1, 6, 8),
      arm: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8),
      housing: new THREE.BoxGeometry(0.4, 0.15, 0.6),
      bulb: new THREE.SphereGeometry(0.15, 8, 8)
    };

    // Streetlight materials
    this.sharedStreetlightMaterials = {
      pole: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 }),
      housing: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.7 })
    };

    // Speed limit sign geometries
    const signRadius = 1.0;
    this.sharedSignGeometries = {
      pole: new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8),
      face: new THREE.PlaneGeometry(signRadius * 2.2, signRadius * 2.2),
      back: new THREE.CircleGeometry(signRadius, 32)
    };

    // Speed limit sign materials
    this.sharedSignMaterials = {
      pole: new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 }),
      back: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7, side: THREE.DoubleSide })
    };
  }

  /**
   * Initialize phone distraction system
   */
  private initPhoneSystem(): void {
    // Schedule first notification
    this.phoneNextNotificationTime = this.PHONE_MIN_INTERVAL + Math.random() * (this.PHONE_MAX_INTERVAL - this.PHONE_MIN_INTERVAL);

    // Update phone clock every second
    this.updatePhoneClock();
    setInterval(() => this.updatePhoneClock(), 1000);
  }

  /**
   * Update phone clock display
   */
  private updatePhoneClock(): void {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    if (this.phoneClockElement) {
      this.phoneClockElement.textContent = timeStr;
    }
    // Use cached status bar element (avoid querySelector every second)
    if (this.phoneTimeElement) {
      this.phoneTimeElement.textContent = timeStr;
    }
  }

  /**
   * Update phone distraction system (called every frame)
   */
  private updatePhone(deltaTime: number): void {
    if (this.isGameOver || !this.gameStarted) return;

    this.phoneNotificationTimer += deltaTime;

    // Check if it's time for a notification
    if (!this.phoneNotificationActive && this.phoneNotificationTimer >= this.phoneNextNotificationTime) {
      this.showPhoneNotification();
    }
  }

  /**
   * Show a random phone notification
   */
  private showPhoneNotification(): void {
    // Pick a random message
    const message = this.phoneMessages[Math.floor(Math.random() * this.phoneMessages.length)];

    // Update notification content
    this.notificationTitleElement.textContent = message.title;
    this.notificationBodyElement.textContent = message.body;

    // Update app icon
    const iconElement = this.phoneNotificationElement.querySelector('.notification-app-icon');
    if (iconElement) {
      iconElement.textContent = message.icon;
    }

    // Show notification with animation
    this.phoneNotificationElement.classList.remove('hidden');
    this.phoneNotificationElement.classList.add('visible');
    this.phoneElement.classList.add('notification-active');
    this.phoneNotificationActive = true;

    // Play notification sound
    this.playNotificationSound();

    // Hide notification after 4 seconds
    setTimeout(() => {
      this.hidePhoneNotification();
    }, 4000);

    // Schedule next notification
    this.phoneNotificationTimer = 0;
    this.phoneNextNotificationTime = this.PHONE_MIN_INTERVAL + Math.random() * (this.PHONE_MAX_INTERVAL - this.PHONE_MIN_INTERVAL);
  }

  /**
   * Hide phone notification
   */
  private hidePhoneNotification(): void {
    this.phoneNotificationElement.classList.remove('visible');
    this.phoneNotificationElement.classList.add('hidden');
    this.phoneElement.classList.remove('notification-active');
    this.phoneNotificationActive = false;
  }

  /**
   * Play notification sound using Web Audio API
   */
  private playNotificationSound(): void {
    try {
      // Create or reuse audio context
      if (!this.phoneAudioContext) {
        this.phoneAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = this.phoneAudioContext;

      // Create a pleasant notification sound (two-tone chime)
      const now = ctx.currentTime;

      // First tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.value = 880; // A5
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Second tone (slightly delayed, higher pitch)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.value = 1320; // E6
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.25);

    } catch (e) {
      // Audio not supported, silently ignore
    }
  }

  /**
   * Initialize shared geometries, materials, and pre-allocate all vehicle pools
   * Called once at startup to avoid runtime allocations
   */
  private initVehiclePools(): void {
    // ========== CAR shared geometries and materials ==========
    this.sharedCarGeometries = {
      body: new THREE.BoxGeometry(2, 0.8, 4),
      cabin: new THREE.BoxGeometry(1.8, 0.8, 2),
      windscreen: new THREE.PlaneGeometry(1.6, 0.7),
      headlight: new THREE.PlaneGeometry(0.5, 0.3),
      tire: new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16),
      rim: new THREE.CylinderGeometry(0.22, 0.22, 0.32, 16)
    };

    // Colors that contrast with white headlights (no white/black)
    const carColors = [0x4466aa, 0x882222, 0x228844, 0x886622, 0x666688, 0x884488];
    this.sharedCarMaterials = {
      bodyColors: carColors.map(color => new THREE.MeshStandardMaterial({
        color, roughness: 0.3, metalness: 0.7
      })),
      cabin: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.6 }),
      windscreen: new THREE.MeshStandardMaterial({
        color: 0x88ccff, transparent: true, opacity: 0.5,
        metalness: 0.9, roughness: 0.1, side: THREE.DoubleSide
      }),
      headlight: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 })
    };

    // ========== VAN shared geometries and materials ==========
    this.sharedVanGeometries = {
      body: new THREE.BoxGeometry(2.2, 2.2, 5.5),
      cabin: new THREE.BoxGeometry(2.2, 1.6, 1.8),
      windscreen: new THREE.PlaneGeometry(1.8, 1.0),
      headlight: new THREE.PlaneGeometry(0.4, 0.3),
      wheel: new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16),
      rim: new THREE.CylinderGeometry(0.25, 0.25, 0.36, 16)
    };

    // Van colors - contrast with headlights (no white/black)
    const vanColors = [0x4466aa, 0xcc8833, 0x668866, 0x996666];
    this.sharedVanMaterials = {
      bodyColors: vanColors.map(color => new THREE.MeshStandardMaterial({
        color, roughness: 0.4, metalness: 0.5
      })),
      tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 })
    };

    // ========== TRUCK shared geometries and materials ==========
    this.sharedTruckGeometries = {
      cabin: new THREE.BoxGeometry(2.4, 2.0, 2.2),
      cargo: new THREE.BoxGeometry(2.5, 2.8, 6),
      windscreen: new THREE.PlaneGeometry(2.0, 1.2),
      headlight: new THREE.PlaneGeometry(0.5, 0.4),
      wheel: new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16),
      rim: new THREE.CylinderGeometry(0.28, 0.28, 0.42, 16)
    };

    const truckCabinColors = [0x2255aa, 0xcc2222, 0x228833, 0xff8800];
    this.sharedTruckMaterials = {
      cabinColors: truckCabinColors.map(color => new THREE.MeshStandardMaterial({
        color, roughness: 0.4, metalness: 0.6
      })),
      cargo: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7, metalness: 0.3 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 })
    };

    // ========== SEMI-TRUCK shared geometries and materials ==========
    this.sharedSemiGeometries = {
      cabin: new THREE.BoxGeometry(2.6, 2.8, 3.0),
      sleeper: new THREE.BoxGeometry(2.4, 1.2, 1.5), // Hood/engine section
      trailer: new THREE.BoxGeometry(2.6, 3.2, 12),
      windscreen: new THREE.PlaneGeometry(2.2, 1.4),
      headlight: new THREE.PlaneGeometry(0.6, 0.5),
      wheel: new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16),
      rim: new THREE.CylinderGeometry(0.32, 0.32, 0.47, 16)
    };

    // Semi-truck colors - contrast with headlights (no white/black)
    const semiCabinColors = [0x1144aa, 0xcc1111, 0x117722, 0xdd6600, 0x445566];
    const semiTrailerColors = [0x667788, 0x886644, 0x446688, 0x668844, 0x884466];
    this.sharedSemiMaterials = {
      cabinColors: semiCabinColors.map(color => new THREE.MeshStandardMaterial({
        color, roughness: 0.3, metalness: 0.7
      })),
      trailerColors: semiTrailerColors.map(color => new THREE.MeshStandardMaterial({
        color, roughness: 0.5, metalness: 0.3
      })),
      chrome: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.95 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 })
    };

    // ========== Pre-allocate all vehicle pools ==========
    // Cars
    for (let i = 0; i < this.ONCOMING_POOL_SIZE; i++) {
      const car = this.createOncomingCarModel();
      car.visible = false;
      this.oncomingCarPool.push(car);
    }

    // Vans
    for (let i = 0; i < this.VAN_POOL_SIZE; i++) {
      const van = this.createOncomingVanModel();
      van.visible = false;
      this.oncomingVanPool.push(van);
    }

    // Trucks
    for (let i = 0; i < this.TRUCK_POOL_SIZE; i++) {
      const truck = this.createOncomingTruckModel();
      truck.visible = false;
      this.oncomingTruckPool.push(truck);
    }

    // Semi-trucks
    for (let i = 0; i < this.SEMI_POOL_SIZE; i++) {
      const semi = this.createOncomingSemiTruckModel();
      semi.visible = false;
      this.oncomingSemiPool.push(semi);
    }
  }

  private createOncomingCarModel(): THREE.Group {
    const car = new THREE.Group();
    const geom = this.sharedCarGeometries!;
    const mat = this.sharedCarMaterials!;

    // Random body color from pre-created materials
    const bodyMaterial = mat.bodyColors[Math.floor(Math.random() * mat.bodyColors.length)];

    // Car body
    const body = new THREE.Mesh(geom.body, bodyMaterial);
    body.position.y = 0.8;
    car.add(body);

    // Cabin
    const cabin = new THREE.Mesh(geom.cabin, mat.cabin);
    cabin.position.y = 1.6;
    cabin.position.z = -0.5;
    car.add(cabin);

    // Front windscreen
    const windscreen = new THREE.Mesh(geom.windscreen, mat.windscreen);
    windscreen.position.set(0, 1.6, -1.55);
    windscreen.rotation.x = -0.2;
    car.add(windscreen);

    // Headlights
    const leftHeadlight = new THREE.Mesh(geom.headlight, mat.headlight);
    leftHeadlight.position.set(-0.65, 0.7, -2.01);
    car.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(geom.headlight, mat.headlight);
    rightHeadlight.position.set(0.65, 0.7, -2.01);
    car.add(rightHeadlight);

    // Point lights for headlight glow
    const leftLight = new THREE.PointLight(0xffffee, 2, 20);
    leftLight.position.set(-0.5, 0.8, -2.5);
    car.add(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 2, 20);
    rightLight.position.set(0.5, 0.8, -2.5);
    car.add(rightLight);

    // Wheels
    const wheelPositions = [
      { pos: [-0.9, 0.4, 1.2], side: -1 },
      { pos: [0.9, 0.4, 1.2], side: 1 },
      { pos: [-0.9, 0.4, -1.2], side: -1 },
      { pos: [0.9, 0.4, -1.2], side: 1 }
    ];

    wheelPositions.forEach(({ pos, side }) => {
      const tire = new THREE.Mesh(geom.tire, mat.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      car.add(tire);

      const rim = new THREE.Mesh(geom.rim, mat.rim);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos[0] + side * 0.02, pos[1], pos[2]);
      car.add(rim);
    });

    car.position.x = this.ONCOMING_LANE_X;
    car.rotation.y = Math.PI;

    // Mark as regular car for pool recycling
    car.userData.vehicleType = 'car';

    return car;
  }

  private createOncomingVanModel(): THREE.Group {
    const van = new THREE.Group();
    const geom = this.sharedVanGeometries!;
    const mat = this.sharedVanMaterials!;
    const carMat = this.sharedCarMaterials!;

    // Random body color from pre-created materials
    const bodyMaterial = mat.bodyColors[Math.floor(Math.random() * mat.bodyColors.length)];

    // Van body (larger box)
    const body = new THREE.Mesh(geom.body, bodyMaterial);
    body.position.y = 1.5;
    body.position.z = 0.5;
    van.add(body);

    // Cabin (front part, slightly lower)
    const cabin = new THREE.Mesh(geom.cabin, bodyMaterial);
    cabin.position.set(0, 1.2, -2.2);
    van.add(cabin);

    // Windscreen
    const windscreen = new THREE.Mesh(geom.windscreen, carMat.windscreen);
    windscreen.position.set(0, 1.8, -3.1);
    windscreen.rotation.x = -0.15;
    van.add(windscreen);

    // Headlights
    const leftHeadlight = new THREE.Mesh(geom.headlight, carMat.headlight);
    leftHeadlight.position.set(-0.7, 0.9, -3.15);
    van.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(geom.headlight, carMat.headlight);
    rightHeadlight.position.set(0.7, 0.9, -3.15);
    van.add(rightHeadlight);

    // Point lights
    const leftLight = new THREE.PointLight(0xffffee, 2, 20);
    leftLight.position.set(-0.5, 0.9, -3.5);
    van.add(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 2, 20);
    rightLight.position.set(0.5, 0.9, -3.5);
    van.add(rightLight);

    // Wheels (4x, larger)
    const wheelPositions = [
      { pos: [-1.0, 0.45, -1.8], side: -1 },
      { pos: [1.0, 0.45, -1.8], side: 1 },
      { pos: [-1.0, 0.45, 2.0], side: -1 },
      { pos: [1.0, 0.45, 2.0], side: 1 }
    ];

    wheelPositions.forEach(({ pos, side }) => {
      const tire = new THREE.Mesh(geom.wheel, mat.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      van.add(tire);

      const rim = new THREE.Mesh(geom.rim, mat.rim);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos[0] + side * 0.02, pos[1], pos[2]);
      van.add(rim);
    });

    van.position.x = this.ONCOMING_LANE_X;
    van.rotation.y = Math.PI;

    // Mark as van (not recyclable to car pool)
    van.userData.vehicleType = 'van';

    return van;
  }

  private createOncomingTruckModel(): THREE.Group {
    const truck = new THREE.Group();
    const geom = this.sharedTruckGeometries!;
    const mat = this.sharedTruckMaterials!;
    const carMat = this.sharedCarMaterials!;

    // Random cabin color from pre-created materials
    const cabinMaterial = mat.cabinColors[Math.floor(Math.random() * mat.cabinColors.length)];

    // Cabin
    const cabin = new THREE.Mesh(geom.cabin, cabinMaterial);
    cabin.position.set(0, 1.8, -2.5);
    truck.add(cabin);

    // Cargo area (gray box)
    const cargo = new THREE.Mesh(geom.cargo, mat.cargo);
    cargo.position.set(0, 2.0, 1.5);
    truck.add(cargo);

    // Windscreen
    const windscreen = new THREE.Mesh(geom.windscreen, carMat.windscreen);
    windscreen.position.set(0, 2.4, -3.6);
    windscreen.rotation.x = -0.1;
    truck.add(windscreen);

    // Headlights
    const leftHeadlight = new THREE.Mesh(geom.headlight, carMat.headlight);
    leftHeadlight.position.set(-0.8, 1.2, -3.65);
    truck.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(geom.headlight, carMat.headlight);
    rightHeadlight.position.set(0.8, 1.2, -3.65);
    truck.add(rightHeadlight);

    // Point lights
    const leftLight = new THREE.PointLight(0xffffee, 2.5, 25);
    leftLight.position.set(-0.6, 1.2, -4);
    truck.add(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 2.5, 25);
    rightLight.position.set(0.6, 1.2, -4);
    truck.add(rightLight);

    // Wheels (6x - 2 front, 4 rear dual)
    const frontWheelPositions = [
      { pos: [-1.1, 0.5, -2.0], side: -1 },
      { pos: [1.1, 0.5, -2.0], side: 1 }
    ];
    const rearWheelPositions = [
      { pos: [-1.1, 0.5, 2.5], side: -1 },
      { pos: [1.1, 0.5, 2.5], side: 1 },
      { pos: [-1.1, 0.5, 3.5], side: -1 },
      { pos: [1.1, 0.5, 3.5], side: 1 }
    ];

    [...frontWheelPositions, ...rearWheelPositions].forEach(({ pos, side }) => {
      const tire = new THREE.Mesh(geom.wheel, mat.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      truck.add(tire);

      const rim = new THREE.Mesh(geom.rim, mat.rim);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos[0] + side * 0.02, pos[1], pos[2]);
      truck.add(rim);
    });

    truck.position.x = this.ONCOMING_LANE_X;
    truck.rotation.y = Math.PI;

    // Mark as truck (not recyclable to car pool)
    truck.userData.vehicleType = 'truck';

    return truck;
  }

  private createOncomingSemiTruckModel(): THREE.Group {
    const semi = new THREE.Group();
    const geom = this.sharedSemiGeometries!;
    const mat = this.sharedSemiMaterials!;
    const carMat = this.sharedCarMaterials!;

    // Random cabin color from pre-created materials
    const cabinMaterial = mat.cabinColors[Math.floor(Math.random() * mat.cabinColors.length)];

    // Large cabin with sleeper
    const cabin = new THREE.Mesh(geom.cabin, cabinMaterial);
    cabin.position.set(0, 2.0, -4.5);
    semi.add(cabin);

    // Hood (front engine section)
    const hood = new THREE.Mesh(geom.sleeper, cabinMaterial);
    hood.position.set(0, 1.2, -6.5);
    semi.add(hood);

    // Large trailer - random color from pre-created materials
    const trailerMaterial = mat.trailerColors[Math.floor(Math.random() * mat.trailerColors.length)];
    const trailer = new THREE.Mesh(geom.trailer, trailerMaterial);
    trailer.position.set(0, 2.2, 3);
    semi.add(trailer);

    // Windscreen
    const windscreen = new THREE.Mesh(geom.windscreen, carMat.windscreen);
    windscreen.position.set(0, 2.8, -6.0);
    windscreen.rotation.x = -0.15;
    semi.add(windscreen);

    // Large headlights
    const leftHeadlight = new THREE.Mesh(geom.headlight, carMat.headlight);
    leftHeadlight.position.set(-0.9, 1.0, -7.3);
    semi.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(geom.headlight, carMat.headlight);
    rightHeadlight.position.set(0.9, 1.0, -7.3);
    semi.add(rightHeadlight);

    // Powerful point lights
    const leftLight = new THREE.PointLight(0xffffee, 3, 30);
    leftLight.position.set(-0.7, 1.0, -7.8);
    semi.add(leftLight);

    const rightLight = new THREE.PointLight(0xffffee, 3, 30);
    rightLight.position.set(0.7, 1.0, -7.8);
    semi.add(rightLight);

    // Wheels (10x - 2 steering, 4 drive, 4 trailer)
    const wheelPositions = [
      // Steering axle
      { pos: [-1.2, 0.55, -5.5], side: -1 },
      { pos: [1.2, 0.55, -5.5], side: 1 },
      // Drive axles (dual)
      { pos: [-1.2, 0.55, -2.5], side: -1 },
      { pos: [1.2, 0.55, -2.5], side: 1 },
      { pos: [-1.2, 0.55, -1.5], side: -1 },
      { pos: [1.2, 0.55, -1.5], side: 1 },
      // Trailer axles
      { pos: [-1.2, 0.55, 6.0], side: -1 },
      { pos: [1.2, 0.55, 6.0], side: 1 },
      { pos: [-1.2, 0.55, 7.5], side: -1 },
      { pos: [1.2, 0.55, 7.5], side: 1 }
    ];

    wheelPositions.forEach(({ pos, side }) => {
      const tire = new THREE.Mesh(geom.wheel, mat.tire);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos[0], pos[1], pos[2]);
      semi.add(tire);

      const rim = new THREE.Mesh(geom.rim, mat.rim);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos[0] + side * 0.02, pos[1], pos[2]);
      semi.add(rim);
    });

    // Add TIR plate and company logo decorations
    if (this.truckDecorationTextures) {
      // TIR plate on the back of the trailer (facing the player)
      const tirMaterial = new THREE.SpriteMaterial({
        map: this.truckDecorationTextures.tir,
        transparent: false
      });
      const tirSprite = new THREE.Sprite(tirMaterial);
      tirSprite.scale.set(0.8, 0.4, 1);
      tirSprite.position.set(0, 1.0, 9.05); // Back of trailer
      semi.add(tirSprite);

      // Random company logo on the side of the trailer
      const logoIndex = Math.floor(Math.random() * this.truckDecorationTextures.logos.length);
      const logoTexture = this.truckDecorationTextures.logos[logoIndex];

      // Logo on left side of trailer (facing left, readable from outside)
      const logoGeometry = new THREE.PlaneGeometry(3.5, 0.8);
      const logoMaterialLeft = new THREE.MeshBasicMaterial({
        map: logoTexture,
        transparent: true,
        side: THREE.FrontSide
      });
      const logoLeft = new THREE.Mesh(logoGeometry, logoMaterialLeft);
      logoLeft.position.set(-1.32, 2.8, 2);
      logoLeft.rotation.y = -Math.PI / 2; // Face outward (left side)
      semi.add(logoLeft);

      // Logo on right side of trailer (facing right, readable from outside)
      const logoMaterialRight = new THREE.MeshBasicMaterial({
        map: logoTexture,
        transparent: true,
        side: THREE.FrontSide
      });
      const logoRight = new THREE.Mesh(logoGeometry, logoMaterialRight);
      logoRight.position.set(1.32, 2.8, 2);
      logoRight.rotation.y = Math.PI / 2; // Face outward (right side)
      semi.add(logoRight);

      // Marker lights on top of cabin (orange)
      const markerGeometry = new THREE.SphereGeometry(0.08, 8, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff8800 });
      for (let x = -1.0; x <= 1.0; x += 0.5) {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(x, 3.5, -4.5);
        semi.add(marker);
      }

      // Marker lights on top of trailer (orange)
      for (let x = -1.0; x <= 1.0; x += 0.5) {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(x, 3.85, 3);
        semi.add(marker);
      }
    }

    semi.position.x = this.ONCOMING_LANE_X;
    semi.rotation.y = Math.PI;

    // Mark as semi-truck (not recyclable to car pool)
    semi.userData.vehicleType = 'semi';

    return semi;
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

    // Randomly select vehicle type:
    // 60% car, 20% van, 12% truck, 8% semi-truck (TIR)
    const vehicleRoll = Math.random();
    let vehicle: THREE.Group;
    let speed: number;

    if (vehicleRoll < 0.60) {
      // Regular car (60%)
      if (this.oncomingCarPool.length > 0) {
        vehicle = this.oncomingCarPool.pop()!;
        vehicle.visible = true;
      } else {
        vehicle = this.createOncomingCarModel();
      }
      // Cars: 80-130 km/h (22-36 m/s)
      speed = 22 + Math.random() * 14;
    } else if (vehicleRoll < 0.80) {
      // Van (20%)
      if (this.oncomingVanPool.length > 0) {
        vehicle = this.oncomingVanPool.pop()!;
        vehicle.visible = true;
      } else {
        vehicle = this.createOncomingVanModel();
      }
      // Vans: 70-110 km/h (19-31 m/s)
      speed = 19 + Math.random() * 12;
    } else if (vehicleRoll < 0.92) {
      // Truck (12%)
      if (this.oncomingTruckPool.length > 0) {
        vehicle = this.oncomingTruckPool.pop()!;
        vehicle.visible = true;
      } else {
        vehicle = this.createOncomingTruckModel();
      }
      // Trucks: 60-90 km/h (17-25 m/s)
      speed = 17 + Math.random() * 8;
    } else {
      // Semi-truck / TIR (8%)
      if (this.oncomingSemiPool.length > 0) {
        vehicle = this.oncomingSemiPool.pop()!;
        vehicle.visible = true;
      } else {
        vehicle = this.createOncomingSemiTruckModel();
      }
      // Semi-trucks: 50-80 km/h (14-22 m/s)
      speed = 14 + Math.random() * 8;
    }

    // Position ahead of player (in negative Z world space)
    const spawnPosition = playerPos + this.ONCOMING_SPAWN_AHEAD;
    vehicle.position.z = -spawnPosition;
    vehicle.position.x = this.ONCOMING_LANE_X;

    this.scene.add(vehicle);
    this.oncomingCars.push(vehicle);
    this.oncomingCarPositions.push(spawnPosition);
    this.oncomingCarSpeeds.push(speed);
  }

  private updateOncomingTraffic(deltaTime: number, currentTime: number): void {
    if (this.isGameOver || this.isCrashing) return;

    const playerPos = this.playerVehicle.position;

    // Spawn new cars occasionally
    if (Math.random() < 0.02) { // ~2% chance per frame
      this.spawnOncomingCar();
    }

    // Update existing cars - using swap-and-pop for O(1) removal instead of O(n) splice
    let i = 0;
    while (i < this.oncomingCars.length) {
      // Oncoming cars move TOWARD player (decreasing world position)
      this.oncomingCarPositions[i] -= this.oncomingCarSpeeds[i] * deltaTime;

      // Update 3D position
      this.oncomingCars[i].position.z = -this.oncomingCarPositions[i];

      // Add slight random weave for realism (use cached currentTime instead of Date.now() per car)
      this.oncomingCars[i].position.x = this.ONCOMING_LANE_X + Math.sin(currentTime * 0.001 + i) * 0.2;

      // Return to pool if passed player - swap with last element and pop (O(1) instead of O(n))
      if (this.oncomingCarPositions[i] < playerPos - this.ONCOMING_DESPAWN_BEHIND) {
        const vehicleToRecycle = this.oncomingCars[i];
        this.scene.remove(vehicleToRecycle);
        vehicleToRecycle.visible = false;

        // Recycle vehicles to their correct pools
        const vehicleType = vehicleToRecycle.userData.vehicleType;
        if (vehicleType === 'car') {
          this.oncomingCarPool.push(vehicleToRecycle);
        } else if (vehicleType === 'van') {
          this.oncomingVanPool.push(vehicleToRecycle);
        } else if (vehicleType === 'truck') {
          this.oncomingTruckPool.push(vehicleToRecycle);
        } else if (vehicleType === 'semi') {
          this.oncomingSemiPool.push(vehicleToRecycle);
        }

        const lastIdx = this.oncomingCars.length - 1;
        if (i !== lastIdx) {
          // Swap with last element
          this.oncomingCars[i] = this.oncomingCars[lastIdx];
          this.oncomingCarPositions[i] = this.oncomingCarPositions[lastIdx];
          this.oncomingCarSpeeds[i] = this.oncomingCarSpeeds[lastIdx];
        }
        // Pop the last element (O(1))
        this.oncomingCars.pop();
        this.oncomingCarPositions.pop();
        this.oncomingCarSpeeds.pop();
        // Don't increment i - need to process swapped element
      } else {
        i++;
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
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);

    // Directional light (sun)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.sunLight.position.set(50, 50, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.scene.add(this.sunLight);
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
    roadMesh.userData.isGround = true; // For snow whitening effect
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
    leftShoulder.userData.isGround = true; // For snow whitening effect
    roadGroup.add(leftShoulder);

    // Right emergency lane
    const rightShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.position.set(roadWidth / 2 + shoulderWidth / 2, 0.001, 0);
    rightShoulder.receiveShadow = true;
    rightShoulder.userData.isGround = true; // For snow whitening effect
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
    const rightRailBeam = new THREE.Mesh(railBeamGeometry, railMaterial);
    rightRailBeam.position.set(guardRailX + 0.1, guardRailHeight - 0.15, 0);
    roadGroup.add(rightRailBeam);

    // Lower rail beam for double-rail look
    const lowerRailGeometry = new THREE.BoxGeometry(0.06, 0.2, roadLength);

    const leftLowerRail = new THREE.Mesh(lowerRailGeometry, railMaterial);
    leftLowerRail.position.set(-guardRailX - 0.1, guardRailHeight - 0.45, 0);
    roadGroup.add(leftLowerRail);

    const rightLowerRail = new THREE.Mesh(lowerRailGeometry, railMaterial);
    rightLowerRail.position.set(guardRailX + 0.1, guardRailHeight - 0.45, 0);
    roadGroup.add(rightLowerRail);

    // Guard rail posts - using InstancedMesh for better performance
    const postGeometry = new THREE.BoxGeometry(0.1, guardRailHeight, 0.1);
    const postCount = Math.ceil(roadLength / guardRailPostSpacing);

    // Create instanced meshes for left and right posts (single draw call each)
    const leftPostsInstanced = new THREE.InstancedMesh(postGeometry, postMaterial, postCount);
    const rightPostsInstanced = new THREE.InstancedMesh(postGeometry, postMaterial, postCount);

    const dummy = new THREE.Object3D();
    let instanceIndex = 0;
    for (let z = -roadLength / 2; z < roadLength / 2; z += guardRailPostSpacing) {
      // Left post
      dummy.position.set(-guardRailX - 0.1, guardRailHeight / 2, z);
      dummy.updateMatrix();
      leftPostsInstanced.setMatrixAt(instanceIndex, dummy.matrix);

      // Right post
      dummy.position.set(guardRailX + 0.1, guardRailHeight / 2, z);
      dummy.updateMatrix();
      rightPostsInstanced.setMatrixAt(instanceIndex, dummy.matrix);

      instanceIndex++;
    }
    leftPostsInstanced.instanceMatrix.needsUpdate = true;
    rightPostsInstanced.instanceMatrix.needsUpdate = true;
    roadGroup.add(leftPostsInstanced);
    roadGroup.add(rightPostsInstanced);

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
    leftGrass.userData.isGround = true; // For snow whitening effect
    roadGroup.add(leftGrass);

    const rightGrass = new THREE.Mesh(grassGeometry, grassMaterial);
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(guardRailX + 50, -0.01, 0);
    rightGrass.receiveShadow = true;
    rightGrass.userData.isGround = true; // For snow whitening effect
    roadGroup.add(rightGrass);

    // Store road length for infinite scrolling
    (roadGroup as any).roadLength = roadLength;

    return roadGroup;
  }

  private createTree(): THREE.Group {
    const tree = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // Tree trunk (reuse shared geometry and material)
    const trunk = new THREE.Mesh(geom.treeTrunk, mat.treeTrunk);
    trunk.position.y = 2;
    trunk.castShadow = true;
    tree.add(trunk);

    // Tree foliage (3 spheres stacked for better tree shape)
    const foliage1 = new THREE.Mesh(geom.treeFoliage1, mat.treeFoliage);
    foliage1.position.y = 5;
    foliage1.castShadow = true;
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(geom.treeFoliage2, mat.treeFoliage);
    foliage2.position.y = 6.5;
    foliage2.castShadow = true;
    tree.add(foliage2);

    const foliage3 = new THREE.Mesh(geom.treeFoliage3, mat.treeFoliage);
    foliage3.position.y = 7.5;
    foliage3.castShadow = true;
    tree.add(foliage3);

    return tree;
  }

  private createHouse(): THREE.Group {
    const house = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // House walls (reuse shared geometry and material)
    const walls = new THREE.Mesh(geom.houseWall, mat.houseWall);
    walls.position.y = 2;
    walls.castShadow = true;
    house.add(walls);

    // Roof (pyramid shape)
    const roof = new THREE.Mesh(geom.houseRoof, mat.houseRoof);
    roof.position.y = 5.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);

    // Door
    const door = new THREE.Mesh(geom.houseDoor, mat.houseDoor);
    door.position.set(0, 1, 3.05);
    house.add(door);

    // Windows
    const window1 = new THREE.Mesh(geom.houseWindow, mat.houseWindow);
    window1.position.set(-1.8, 2.5, 3.05);
    house.add(window1);

    const window2 = new THREE.Mesh(geom.houseWindow, mat.houseWindow);
    window2.position.set(1.8, 2.5, 3.05);
    house.add(window2);

    return house;
  }

  private createShop(): THREE.Group {
    const shop = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // Pick random colors for this shop
    const wallMat = mat.shopWallColors[Math.floor(Math.random() * mat.shopWallColors.length)];
    const awningMat = mat.shopAwningColors[Math.floor(Math.random() * mat.shopAwningColors.length)];

    // Shop body
    const body = new THREE.Mesh(geom.shopBody, wallMat);
    body.position.y = 1.75;
    body.castShadow = true;
    shop.add(body);

    // Awning over front
    const awning = new THREE.Mesh(geom.shopAwning, awningMat);
    awning.position.set(0, 3.2, 3);
    awning.rotation.x = -0.1; // Slight angle
    shop.add(awning);

    // Large shop windows
    const window1 = new THREE.Mesh(geom.shopWindow, mat.houseWindow);
    window1.position.set(-2, 1.5, 2.55);
    shop.add(window1);

    const window2 = new THREE.Mesh(geom.shopWindow, mat.houseWindow);
    window2.position.set(2, 1.5, 2.55);
    shop.add(window2);

    // Door
    const door = new THREE.Mesh(geom.houseDoor, mat.houseDoor);
    door.position.set(0, 1, 2.55);
    shop.add(door);

    return shop;
  }

  private createWarehouse(): THREE.Group {
    const warehouse = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // Main warehouse body
    const body = new THREE.Mesh(geom.warehouseBody, mat.warehouseMetal);
    body.position.y = 2.5;
    body.castShadow = true;
    warehouse.add(body);

    // Flat roof (slightly larger)
    const roof = new THREE.Mesh(geom.warehouseRoof, mat.warehouseMetal);
    roof.position.y = 5.25;
    warehouse.add(roof);

    // Large loading door
    const door = new THREE.Mesh(geom.warehouseDoor, mat.warehouseDoor);
    door.position.set(0, 2, 4.05);
    warehouse.add(door);

    return warehouse;
  }

  private createFactory(): THREE.Group {
    const factory = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // Main factory building
    const body = new THREE.Mesh(geom.factoryBody, mat.factoryWall);
    body.position.y = 3;
    body.castShadow = true;
    factory.add(body);

    // Chimneys
    const chimney1 = new THREE.Mesh(geom.factoryChimney, mat.factoryChimney);
    chimney1.position.set(-3, 8, 0);
    chimney1.castShadow = true;
    factory.add(chimney1);

    const chimney2 = new THREE.Mesh(geom.factoryChimney, mat.factoryChimney);
    chimney2.position.set(3, 8, 0);
    chimney2.castShadow = true;
    factory.add(chimney2);

    // Windows row
    for (let i = -3; i <= 3; i += 2) {
      const window = new THREE.Mesh(geom.houseWindow, mat.houseWindow);
      window.position.set(i, 4, 4.05);
      factory.add(window);
    }

    // Factory door (smaller, doesn't overlap windows)
    const door = new THREE.Mesh(geom.factoryDoor, mat.warehouseDoor);
    door.position.set(0, 1.25, 4.05); // Positioned lower to avoid window overlap
    factory.add(door);

    return factory;
  }

  private createSilo(): THREE.Group {
    const silo = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // Main silo body
    const body = new THREE.Mesh(geom.siloBody, mat.siloMetal);
    body.position.y = 4;
    body.castShadow = true;
    silo.add(body);

    // Conical top
    const top = new THREE.Mesh(geom.siloTop, mat.siloMetal);
    top.position.y = 8.75;
    top.castShadow = true;
    silo.add(top);

    return silo;
  }

  private createBush(): THREE.Group {
    const bush = new THREE.Group();
    const geom = this.sharedEnvGeometries!;
    const mat = this.sharedEnvMaterials!;

    // Bush is a flattened sphere (reuse shared geometry and material)
    const bushMesh = new THREE.Mesh(geom.bushMain, mat.bush);
    bushMesh.scale.y = 0.7; // Flatten slightly
    bushMesh.position.y = 0.8;
    bushMesh.castShadow = true;
    bush.add(bushMesh);

    // Add smaller sphere for variation
    const bush2 = new THREE.Mesh(geom.bushSmall, mat.bush);
    bush2.position.set(0.6, 0.6, 0.3);
    bush2.scale.y = 0.7;
    bush2.castShadow = true;
    bush.add(bush2);

    return bush;
  }

  private createStreetlight(side: 'left' | 'right'): THREE.Group {
    const light = new THREE.Group();
    const xPos = side === 'left' ? -7.7 : 7.7; // Just outside guardrail (guardrail is at ±7.5)
    const geom = this.sharedStreetlightGeometries!;
    const mat = this.sharedStreetlightMaterials!;

    // Pole (reuse shared geometry and material)
    const pole = new THREE.Mesh(geom.pole, mat.pole);
    pole.position.set(xPos, 3, 0);
    light.add(pole);

    // Arm extending over road
    const armLength = side === 'left' ? 2 : -2;
    const arm = new THREE.Mesh(geom.arm, mat.pole);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(xPos + armLength / 2, 5.8, 0);
    light.add(arm);

    // Lamp housing
    const housing = new THREE.Mesh(geom.housing, mat.housing);
    housing.position.set(xPos + armLength, 5.7, 0);
    light.add(housing);

    // Light bulb - per-instance material (color changes dynamically)
    const bulbMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000  // Will be set based on darkness
    });
    const bulb = new THREE.Mesh(geom.bulb, bulbMaterial);
    bulb.position.set(xPos + armLength, 5.55, 0);
    light.add(bulb);

    // Store bulb reference and its X offset for dynamic light positioning
    (bulb as any).lightXOffset = xPos + armLength;
    this.streetlightBulbs.push(bulb);

    return light;
  }

  private initDynamicStreetlights(): void {
    // Create only 4 PointLights that will move with the player
    for (let i = 0; i < this.DYNAMIC_LIGHT_COUNT; i++) {
      // Warm orange color, larger range, lower decay for better road coverage
      const light = new THREE.PointLight(0xffaa44, 0, 60, 1.2);
      light.position.set(0, 4, 0); // Lower height for better road illumination
      this.scene.add(light);
      this.dynamicStreetlights.push(light);
    }
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
    // Skip update if km number hasn't changed (avoids GPU texture uploads)
    if ((sprite as any).lastKmNumber === kmNumber) {
      return;
    }
    (sprite as any).lastKmNumber = kmNumber;

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

  // Speed limit signs tracking
  private speedLimitSigns: THREE.Group[] = [];
  private currentSpeedLimit: number = 70; // Default speed limit in km/h (matches starting limit)
  private lastGeneratedSpeedLimit: number = 70; // Track last generated limit for progressive changes (start low)

  private createSpeedLimitSign(speedLimit: number): THREE.Group {
    const sign = new THREE.Group();
    const geom = this.sharedSignGeometries!;
    const mat = this.sharedSignMaterials!;

    // Sign dimensions
    const signRadius = 1.0;
    const signCenterHeight = 2.5;
    const poleHeight = signCenterHeight - signRadius;

    // Pole (reuse shared geometry and material)
    const pole = new THREE.Mesh(geom.pole, mat.pole);
    pole.position.y = poleHeight / 2;
    pole.castShadow = true;
    sign.add(pole);

    const signHeight = signCenterHeight;

    // Sign face with complete texture (per-instance material for different textures)
    const texture = this.speedLimitTextures.get(speedLimit);
    if (texture) {
      const signMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });
      const signFace = new THREE.Mesh(geom.face, signMaterial);
      signFace.position.set(0, signHeight, 0.03);
      signFace.rotation.y = Math.PI; // Face toward approaching player (-Z direction)
      sign.add(signFace);
    }

    // Back of sign (reuse shared geometry and material)
    const signBack = new THREE.Mesh(geom.back, mat.back);
    signBack.position.set(0, signHeight, -0.02);
    signBack.rotation.y = Math.PI;
    sign.add(signBack);

    // Store speed limit value on the sign
    (sign as any).speedLimit = speedLimit;

    return sign;
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

    // Place speed limit signs at half-distance between bridges (always placed)
    // Bridges are at -1000 and 0, so signs would be at -500 and +500
    // Speed limits change progressively: 30% chance to change, 70% stays the same
    const speedLimitSteps = [70, 90, 110, 130];
    const signLocalPositions = [-500, 500]; // Halfway between bridges
    const signs: THREE.Group[] = [];
    for (const localZ of signLocalPositions) {
      // Find current index in speed limit steps
      const currentIndex = speedLimitSteps.indexOf(this.lastGeneratedSpeedLimit);

      let speedLimit = this.lastGeneratedSpeedLimit;

      // 50% chance to change the speed limit
      if (Math.random() < 0.5) {
        // Determine possible next limits (only ±1 step, progressive change)
        const possibleNextLimits: number[] = [];
        if (currentIndex > 0) {
          possibleNextLimits.push(speedLimitSteps[currentIndex - 1]); // Can go down
        }
        if (currentIndex < speedLimitSteps.length - 1) {
          possibleNextLimits.push(speedLimitSteps[currentIndex + 1]); // Can go up
        }

        // Pick one of the possible limits (exclude staying the same)
        if (possibleNextLimits.length > 0) {
          speedLimit = possibleNextLimits[Math.floor(Math.random() * possibleNextLimits.length)];
          this.lastGeneratedSpeedLimit = speedLimit;
        }
      }

      const sign = this.createSpeedLimitSign(speedLimit);
      sign.position.set(7.7, 0, localZ); // Right side of road, just outside guardrail
      // Sign faces the player (perpendicular to road direction)
      // No rotation needed - sign face already points toward +Z (toward approaching player)
      envGroup.add(sign);
      signs.push(sign);
      this.speedLimitSigns.push(sign);
    }
    (envGroup as any).speedLimitSigns = signs;

    // Place streetlights every 50m along both sides of road
    const streetlightSpacing = 50;
    for (let z = -roadLength / 2; z < roadLength / 2; z += streetlightSpacing) {
      // Alternate sides for staggered look
      const side = (z / streetlightSpacing) % 2 === 0 ? 'left' : 'right';
      const streetlight = this.createStreetlight(side as 'left' | 'right');
      streetlight.position.z = z;
      envGroup.add(streetlight);
    }

    // Place objects along the road
    for (let z = -roadLength / 2; z < roadLength / 2; z += spacing) {
      // Randomize which objects appear and their exact position
      const random = Math.random();
      const offset = (Math.random() - 0.5) * 5; // Random offset for variety

      // Left side of road
      if (random < 0.25) {
        // Tree
        const tree = this.createTree();
        tree.position.set(-12 + offset, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(tree);
      } else if (random < 0.35) {
        // Residential house
        const house = this.createHouse();
        house.position.set(-18 + offset, 0, z);
        house.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.3; // Face road
        envGroup.add(house);
      } else if (random < 0.42) {
        // Commercial - Shop
        const shop = this.createShop();
        shop.position.set(-16 + offset, 0, z);
        shop.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        envGroup.add(shop);
      } else if (random < 0.48) {
        // Commercial - Warehouse
        const warehouse = this.createWarehouse();
        warehouse.position.set(-22 + offset, 0, z);
        warehouse.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        envGroup.add(warehouse);
      } else if (random < 0.52) {
        // Industrial - Factory
        const factory = this.createFactory();
        factory.position.set(-24 + offset, 0, z);
        factory.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        envGroup.add(factory);
      } else if (random < 0.56) {
        // Industrial - Silo
        const silo = this.createSilo();
        silo.position.set(-14 + offset, 0, z);
        envGroup.add(silo);
      } else if (random < 0.65) {
        // Bush
        const bush = this.createBush();
        bush.position.set(-11 + offset, 0, z);
        bush.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(bush);
      }

      // Right side of road (different random seed)
      const random2 = Math.random();
      const offset2 = (Math.random() - 0.5) * 5;

      if (random2 < 0.25) {
        // Tree
        const tree = this.createTree();
        tree.position.set(12 + offset2, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        envGroup.add(tree);
      } else if (random2 < 0.35) {
        // Residential house
        const house = this.createHouse();
        house.position.set(18 + offset2, 0, z);
        house.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.3; // Face road
        envGroup.add(house);
      } else if (random2 < 0.42) {
        // Commercial - Shop
        const shop = this.createShop();
        shop.position.set(16 + offset2, 0, z);
        shop.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        envGroup.add(shop);
      } else if (random2 < 0.48) {
        // Commercial - Warehouse
        const warehouse = this.createWarehouse();
        warehouse.position.set(22 + offset2, 0, z);
        warehouse.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        envGroup.add(warehouse);
      } else if (random2 < 0.52) {
        // Industrial - Factory
        const factory = this.createFactory();
        factory.position.set(24 + offset2, 0, z);
        factory.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        envGroup.add(factory);
      } else if (random2 < 0.56) {
        // Industrial - Silo
        const silo = this.createSilo();
        silo.position.set(14 + offset2, 0, z);
        envGroup.add(silo);
      } else if (random2 < 0.65) {
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

  private updateCamera(deltaTime: number = 0.016): void {
    // Update camera effects (FOV, shake, head bob)
    const speed = this.playerVehicle.getVelocityKmh();
    const brakeIntensity = this.inputController.getBrakeIntensity();
    const isAccelerating = this.inputController.isAccelerating();
    this.cameraEffects.update(deltaTime, speed, brakeIntensity, isAccelerating);

    // Get camera effect offsets
    const effectOffset = this.cameraEffects.getPositionOffset();

    // First-person camera: positioned inside the player vehicle
    // Camera moves exactly with the player, at driver's eye level
    this.camera.position.set(
      this.playerVehicle.mesh.position.x + effectOffset.x,
      this.playerVehicle.mesh.position.y + 1.2 + effectOffset.y, // Driver eye height + effects
      this.playerVehicle.mesh.position.z + 0.5 + effectOffset.z  // Slightly forward in the car
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

    // Update first environment's bridges (for loop avoids closure allocation)
    for (let i = 0; i < bridges1.length; i++) {
      const bridge = bridges1[i];
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
    }

    // Update second environment's bridges (for loop avoids closure allocation)
    for (let i = 0; i < bridges2.length; i++) {
      const bridge = bridges2[i];
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
    }
  }

  private updateSpeedLimits(): void {
    const playerPos = this.playerVehicle.position;

    // Check speed limit signs from both environments
    const signs1 = (this.environment as any).speedLimitSigns || [];
    const signs2 = (this.environment2 as any).speedLimitSigns || [];

    // Check all signs - when player passes a sign, update the current speed limit
    const checkSigns = (signs: THREE.Group[], envOffset: number) => {
      for (const sign of signs) {
        const signWorldZ = sign.position.z + envOffset;
        const signWorldPos = -signWorldZ; // Convert to player coordinate system

        // Check if player just passed this sign (within last 5 meters)
        if (signWorldPos > 0 && signWorldPos < playerPos && signWorldPos > playerPos - 5) {
          const newLimit = (sign as any).speedLimit;
          if (newLimit && newLimit !== this.currentSpeedLimit) {
            this.currentSpeedLimit = newLimit;
            // Update lead vehicle AI with new speed limit (allowing 20% over)
            this.leadVehicleAI.setSpeedLimit(newLimit);
          }
        }
      }
    };

    checkSigns(signs1, this.environment.position.z);
    checkSigns(signs2, this.environment2.position.z);
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
    // Only update DOM when score actually changes (avoids string allocation every frame)
    const roundedScore = Math.round(this.score);
    if (roundedScore !== this.lastDisplayedScore) {
      this.lastDisplayedScore = roundedScore;
      this.scoreOverlayElement.textContent = roundedScore.toString();
    }

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

    // Update visual effects
    this.updateVisualEffects(speed, distance, safeDistance);
  }

  private updateParticles(deltaTime: number): void {
    // Update particle physics (dust/smoke emissions removed for cleaner visuals)
    this.particleSystem.update(deltaTime);
  }

  private updateVisualEffects(speed: number, distance: number, safeDistance: number): void {
    // Vignette effect - intensifies with speed
    if (speed > 60) {
      this.vignetteOverlay.classList.add('active');
    } else {
      this.vignetteOverlay.classList.remove('active');
    }

    // Speed lines - visible at high speed
    if (speed > 100) {
      this.speedLinesOverlay.classList.add('active');
    } else {
      this.speedLinesOverlay.classList.remove('active');
    }

    // Tension overlay - based on proximity danger
    this.tensionOverlay.classList.remove('danger-low', 'danger-medium', 'danger-high');

    if (distance > 0 && distance < safeDistance && !this.isCrashing) {
      const dangerRatio = 1 - (distance / safeDistance); // 0 = safe, 1 = very close

      if (dangerRatio > 0.7) {
        this.tensionOverlay.classList.add('danger-high');
      } else if (dangerRatio > 0.4) {
        this.tensionOverlay.classList.add('danger-medium');
      } else if (dangerRatio > 0.1) {
        this.tensionOverlay.classList.add('danger-low');
      }
    }
  }

  private drawSpeedometer(speed: number): void {
    const ctx = this.speedometerCtx;
    const canvas = this.speedometerCanvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;

    const maxSpeed = 250;
    const startAngle = -225 * (Math.PI / 180); // Start at bottom left
    const endAngle = 45 * (Math.PI / 180); // End at bottom right
    const angleRange = endAngle - startAngle;

    // Cache static background elements (drawn once, reused every frame)
    if (!this.speedometerBackground) {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw outer circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 3;
      ctx.stroke();

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

      // Cache the static background
      this.speedometerBackground = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      // Restore cached background (much faster than redrawing)
      ctx.putImageData(this.speedometerBackground, 0, 0);
    }

    // Draw dynamic elements (needle and speed text) on top of cached background

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
    // Braking distance increases when traction is reduced (rain, snow, ice)
    const speedMs = this.playerVehicle.velocity;
    const traction = this.weatherSystem.getTraction();

    // Braking distance is inversely proportional to traction
    // traction = 1.0 (dry): normal braking
    // traction = 0.5 (wet): 2x braking distance
    // traction = 0.4 (icy): 2.5x braking distance
    const brakingDistanceFactor = 0.5 / traction;

    const safeDistance = Math.max(
      this.MIN_SAFE_DISTANCE,
      speedMs * this.SAFE_DISTANCE_FACTOR + speedMs * brakingDistanceFactor
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

        // Trigger camera shake based on impact severity
        const shakeIntensity = Math.min(0.1 + impactForceKN * 0.002, 0.15);
        this.cameraEffects.triggerShake(shakeIntensity);

        // Emit collision particles
        const collisionPos = this.playerVehicle.mesh.position.clone().add(new THREE.Vector3(0, 0.5, -2));
        this.particleSystem.emitSparks(collisionPos, impactForceKN / 50);
        if (impactForceKN > 30) {
          this.particleSystem.emitDebris(collisionPos, impactForceKN / 100);
        }

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

      // Stop all audio (engine, weather, brake sounds)
      this.audioEngine.stopAllSounds();

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

      // Update weather sounds (rain, wind)
      const rainIntensity = this.weatherSystem.getRainIntensity();
      const snowIntensity = this.weatherSystem.getSnowIntensity();
      this.audioEngine.updateWeatherSound(rainIntensity, snowIntensity, speedKmh);
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
    this.updateSpeedLimits();

    // Update rear car, oncoming traffic, and mirrors
    this.updateRearCar(clampedDelta, currentTime);
    this.updateOncomingTraffic(clampedDelta, currentTime);

    // Update particles
    this.updateParticles(clampedDelta);

    // Update phone distraction
    this.updatePhone(clampedDelta);

    // Update time of day first (controls lighting and darkness)
    // Pass player Z position so starfield follows camera
    const playerZ = -this.playerVehicle.position;
    this.timeOfDay.update(clampedDelta, playerZ);

    // Stars only visible in clear weather
    const currentWeather = this.weatherSystem.getCurrentWeather();
    this.timeOfDay.setWeatherClear(currentWeather === 'clear');

    // Update weather with time-of-day darkness (fog at night should be very dark)
    this.weatherSystem.setTimeDarkness(this.timeOfDay.getDarkness());
    this.weatherSystem.setPlayerPosition(this.playerVehicle.mesh.position);
    this.weatherSystem.setPlayerSpeed(this.playerVehicle.velocity); // For rain/snow rush effect
    // Headlights on when it's dark enough (for rain reflection effect)
    const darkness = this.timeOfDay.getDarkness();
    this.weatherSystem.setHeadlights(darkness > 0.2);
    this.weatherSystem.update(clampedDelta);

    // Update streetlights based on darkness
    const streetlightIntensity = Math.max(0, (darkness - 0.3) * 3); // Start at darkness 0.3, full at 0.6
    const bulbColor = streetlightIntensity > 0 ? 0xffaa44 : 0x333333; // Warm orange when lit

    // Only update bulb colors when color actually changes (avoid loop every frame)
    if (bulbColor !== this.lastBulbColor) {
      this.lastBulbColor = bulbColor;
      for (const bulb of this.streetlightBulbs) {
        (bulb.material as THREE.MeshBasicMaterial).color.setHex(bulbColor);
      }
    }

    // Position dynamic lights near player (only 4 lights for performance)
    // playerZ already defined above for timeOfDay.update
    const lightSpacing = 25; // Space between dynamic lights
    for (let i = 0; i < this.dynamicStreetlights.length; i++) {
      const light = this.dynamicStreetlights[i];
      light.intensity = streetlightIntensity * 2.5; // Strong warm glow
      // Alternate left/right, spread around player
      const xPos = (i % 2 === 0) ? -4 : 4;
      const zOffset = (i - 1.5) * lightSpacing;
      light.position.set(xPos, 4, playerZ + zOffset); // Lower for road illumination
    }

    // Apply weather traction to all vehicles (affects braking in rain/wet conditions)
    const weatherTraction = this.weatherSystem.getTraction();
    this.playerVehicle.setTraction(weatherTraction);
    this.leadVehicle.setTraction(weatherTraction);
    this.leadVehicleAI.setTraction(weatherTraction); // AI brakes more suddenly in bad weather

    // Render mirrors every 2nd frame for better performance (3 extra scene renders)
    this.frameCount++;
    if (this.frameCount % 2 === 0) {
      this.updateMirrors();
    }

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
