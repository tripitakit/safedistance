import './style.css';
import * as THREE from 'three';
import { Vehicle, VehicleConfig } from './Vehicle';
import { LeadVehicleAI } from './LeadVehicleAI';
import { InputController } from './InputController';
import { HighScoreManager } from './HighScoreManager';

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

    // Position lead vehicle ahead at safe distance
    this.leadVehicle.position = safeStartDistance;
    this.leadVehicle.mesh.position.z = -safeStartDistance;

    // Create player vehicle at origin, matching lead vehicle's initial speed
    this.playerVehicle = new Vehicle(vehicleConfig, 0x0000ff); // Blue car
    this.playerVehicle.setVelocity(this.leadVehicle.getVelocityKmh()); // Start at same speed
    this.scene.add(this.playerVehicle.mesh);

    this.inputController = new InputController();

    this.setupCamera();
    this.setupWindowResize();

    this.animate(0);
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

    // Road markings (dashed center line) - store separately for animation
    this.roadMarkings = new THREE.Group();
    const dashLength = 3;
    const dashGap = 2;
    const dashCount = Math.floor(roadLength / (dashLength + dashGap));

    for (let i = 0; i < dashCount; i++) {
      const dashGeometry = new THREE.PlaneGeometry(0.2, dashLength);
      const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const dash = new THREE.Mesh(dashGeometry, dashMaterial);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.01, -roadLength / 2 + i * (dashLength + dashGap));
      this.roadMarkings.add(dash);
    }
    roadGroup.add(this.roadMarkings);

    // Store dash pattern info for animation
    (this.roadMarkings as any).dashPattern = dashLength + dashGap;

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

    // Grass on sides
    const grassGeometry = new THREE.PlaneGeometry(100, roadLength);
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.9
    });

    const leftGrass = new THREE.Mesh(grassGeometry, grassMaterial);
    leftGrass.rotation.x = -Math.PI / 2;
    leftGrass.position.set(-55, -0.01, 0);
    leftGrass.receiveShadow = true;
    roadGroup.add(leftGrass);

    const rightGrass = new THREE.Mesh(grassGeometry, grassMaterial);
    rightGrass.rotation.x = -Math.PI / 2;
    rightGrass.position.set(55, -0.01, 0);
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

        // Show crash report with flash animation
        this.showCrashReport(
          impactForce / 1000, // Convert to kN
          relativeVelocity * 3.6, // Convert to km/h
          v1 * 3.6, // Your speed in km/h
          v2 * 3.6  // Lead speed in km/h
        );
      }
    }
  }

  private showCrashReport(impactForceKN: number, speedDiffKmh: number, yourSpeedKmh: number, leadSpeedKmh: number): void {
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

    // Update crash report UI
    this.impactForceElement.textContent = `${impactForceKN.toFixed(1)} kN`;
    this.speedDiffElement.textContent = `${speedDiffKmh.toFixed(1)} km/h`;
    this.crashYourSpeedElement.textContent = `${yourSpeedKmh.toFixed(1)} km/h`;
    this.crashLeadSpeedElement.textContent = `${leadSpeedKmh.toFixed(1)} km/h`;
    this.damageElement.textContent = damageLevel;
    this.damageElement.style.color = damageColor;

    // Update final stats
    const kmDriven = this.playerVehicle.position / 1000;
    this.finalKmElement.textContent = `${kmDriven.toFixed(2)} km`;
    this.finalScoreElement.textContent = `${Math.round(this.score)} pts`;

    // Wait 2 seconds for crash animation, then show game over screen
    setTimeout(async () => {
      this.isGameOver = true;
      this.crashFlashElement.classList.add('hidden');
      this.gameOverElement.classList.remove('hidden');

      // Check if this is a high score
      await this.checkAndShowHighScoreInput();
    }, 2000);
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
