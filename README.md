# Safe Distance Simulator

A 3D web-based driving simulator that demonstrates minimum safe distances between vehicles by simulating differential braking power at various speeds under dynamic weather and lighting conditions.

## Overview

This educational simulator helps visualize how braking distance, reaction time, and environmental conditions affect vehicle safety. Players control a vehicle following a lead car that randomly changes speed and applies different braking intensities, while also watching for a tailgating rear car. The game features dynamic weather systems, day/night cycles, and realistic audio to create an immersive driving experience.

## Features

### Core Gameplay
- **Realistic Physics**: Simulates vehicle mass, acceleration, braking force, drag, and rolling resistance
- **First-Person View**: Immersive 3D perspective from inside the player's vehicle with visible headlight beams
- **Dynamic Lead Vehicle**: AI-controlled car that accelerates to 130-180 km/h and applies variable braking
- **Tailgating Rear Car**: An aggressive driver behind you that can rear-end your vehicle
- **Oncoming Traffic**: Random vehicles in the opposite lane add to the atmosphere
- **Progressive Brake Control**: Hold brake key for increased braking power (10-100% over 1 second)
- **Safety Warnings**: Visual overlay alerts when following distance becomes unsafe (TOO CLOSE / SAFE DISTANCE)
- **Collision Detection**: Realistic crash response with detailed damage assessment

### Weather System
- **6 Weather States**: Clear, Foggy, Light Rain, Heavy Rain, Snow, and Blizzard
- **Progressive Weather**: Weather changes every 2km driven, cycling through conditions
- **Weather Effects on Driving**:
  - Reduced traction in rain/snow (affects braking distance)
  - Safe distance calculations adjust for weather conditions
  - Lead vehicle brakes more suddenly in bad weather (reduced visibility simulation)
  - Rear car follows closer in poor visibility
- **Visual Precipitation**: Rain drops and snowflakes rush toward the player based on car speed
- **Headlight Reflections**: Rain and snow particles illuminate in the headlight beams
- **Fog Density**: Visibility reduces significantly in fog and blizzard conditions

### Time of Day
- **4 Time States**: Dawn, Noon, Sunset, and Night
- **Auto-Cycling**: Time changes every 2 minutes
- **Dynamic Lighting**: Sun position, color, and intensity change with time
- **Headlights**: Always-on headlights with visible beam cones and ground light patches

### Audio System
- **Procedural Engine Sound**: FM synthesis engine with realistic RPM-based pitch
- **Brake Sounds**: Squealing brakes when braking hard at speed
- **Crash Sounds**: Multi-layered crash audio based on impact severity
- **Weather Audio**: Rain sounds and wind noise that scale with intensity and speed

### Visual Effects
- **Camera Effects**: Speed-based FOV increase, subtle head bob, and collision shake
- **Particle System**: Dust, sparks, debris, and smoke effects
- **Crash Flash**: Visual feedback on collision
- **Tension Overlay**: Screen effects when following too closely

### Crash Report & Scoring
- **Detailed Crash Analysis**: Impact force (kN), speed differential, damage assessment
- **Health Report**: G-force calculation with realistic injury simulation based on crash biomechanics
- **High Score System**: Persistent leaderboard with top 10 scores
- **Distance Tracking**: Score based on distance driven safely

## Controls

### Desktop
- **A** or **Arrow Up** - Accelerate
- **SPACE** or **Arrow Down** - Brake (hold for progressive braking: 10-100%)
- **W** - Cycle weather (debug)
- **T** - Cycle time of day (debug)

### Mobile
- Touch controls with on-screen BRAKE and GO buttons

## Technical Stack

- **Three.js** - 3D rendering
- **TypeScript** - Type-safe game logic
- **Vite** - Fast development and building
- **Web Audio API** - Procedural audio synthesis
- **sql.js** - High score persistence

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The simulator will open in your default browser at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Physics Model

### Vehicle Parameters
- **Mass**: 1500 kg (average car)
- **Max Acceleration**: 3.5 m/s² (0-100 km/h in ~8 seconds)
- **Max Braking Force**: 12,000 N (affected by weather traction)
- **Drag Coefficient**: 0.4
- **Rolling Resistance**: 1% of vehicle weight

### Weather Traction Multipliers
- **Clear**: 100% braking effectiveness
- **Foggy**: 90%
- **Light Rain**: 85%
- **Heavy Rain**: 70%
- **Snow**: 60%
- **Blizzard**: 40%

### Safe Distance Calculation
The simulator calculates safe following distance based on:
- Reaction time (0.5 seconds)
- Current speed
- Weather-adjusted braking distance factor
- Minimum safe distance: 10 meters

### Lead Vehicle AI Behavior
- Accelerates gradually to target speeds (130-180 km/h)
- Cruises at target speed with minor adjustments
- Randomly applies braking (10-100% intensity)
- **Weather-aware**: Brakes more frequently and harder in poor conditions
- Brakes for 2-4 seconds before accelerating again

### Rear Vehicle AI Behavior
- Maintains close following distance (simulates aggressive tailgater)
- Follows closer in bad weather (reduced visibility)
- Can rear-end player if they brake suddenly

## Project Structure

```
src/
├── main.ts              # Main application and game loop
├── Vehicle.ts           # Vehicle class with physics and headlights
├── LeadVehicleAI.ts     # AI controller for lead vehicle
├── InputController.ts   # Keyboard and touch input handling
├── WeatherSystem.ts     # Weather states, precipitation, and fog
├── TimeOfDay.ts         # Day/night cycle and lighting
├── AudioEngine.ts       # Procedural audio (engine, brakes, crashes, weather)
├── CameraEffects.ts     # FOV, shake, and head bob effects
├── ParticleSystem.ts    # Dust, sparks, debris, and smoke
├── HighScoreManager.ts  # Persistent high score leaderboard
└── style.css            # UI and HUD styling
```

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, or improvements to the physics model, feel free to get involved.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Repository**: https://github.com/tripitakit/safedistance.git

## License

MIT
