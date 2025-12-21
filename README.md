# Safe Distance Simulator

A 3D web-based driving simulator that demonstrates minimum safe distances between vehicles by simulating differential braking power at various speeds.

## Overview

This educational simulator helps visualize how braking distance and reaction time affect vehicle safety. Players control a vehicle following a lead car that randomly changes speed and applies different braking intensities (10% to 100%), demonstrating the importance of maintaining safe following distances.

## Features

- **Realistic Physics**: Simulates vehicle mass, acceleration, braking force, drag, and rolling resistance
- **First-Person View**: Immersive 3D perspective from inside the player's vehicle
- **Dynamic Lead Vehicle**: AI-controlled car that accelerates to 130-180 km/h and applies variable braking
- **Progressive Brake Control**: Hold Space bar longer for increased braking power (10-100% over 1 second)
- **Real-time HUD**: Displays current speed, distance to lead vehicle, and brake pressure
- **Safety Warnings**: Visual alerts when following distance becomes unsafe
- **Collision Detection**: Realistic response when vehicles get too close

## Controls

- **A** - Accelerate
- **SPACE** - Brake (hold for progressive braking power: 10-100% over 1 second)

## Technical Stack

- **Three.js** - 3D rendering
- **TypeScript** - Type-safe game logic
- **Vite** - Fast development and building

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The simulator will open in your default browser at `http://localhost:3000`

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
- **Max Braking Force**: 12,000 N
- **Drag Coefficient**: 0.4
- **Rolling Resistance**: 1% of vehicle weight

### Braking System
- **Minimum**: 10% braking force
- **Maximum**: 100% braking force
- **Input Method**: Progressive based on Space bar hold time (0-1000ms)

### Lead Vehicle AI Behavior
- Accelerates gradually to target speeds (130-180 km/h)
- Cruises at target speed with minor adjustments
- Randomly applies braking (10-100% in 10% steps)
- Brakes for 2-4 seconds before accelerating again
- Sometimes exceeds the 130 km/h speed limit

### Safe Distance Calculation
The simulator calculates safe following distance based on:
- Reaction time (0.5 seconds)
- Current speed
- Braking distance factor
- Minimum safe distance: 10 meters

## Project Structure

```
src/
├── main.ts              # Main application and game loop
├── Vehicle.ts           # Vehicle class with physics simulation
├── LeadVehicleAI.ts     # AI controller for lead vehicle
├── InputController.ts   # Keyboard input handling
└── style.css           # UI and HUD styling
```

## License

MIT
