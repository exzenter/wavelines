# Wavelines

A generative shoreline animation built with HTML5 Canvas. This project simulates organic waves crashing onto a shore with a hand-drawn aesthetic.

## Features

### Generative Animation
- **Organic Movement**: Uses custom noise functions and sine-based jitter for natural wave motion.
- **Wave Grouping**: Waves move in coherent groups (3-6 lines) to simulate swells.
- **Occlusion**: Advanced occlusion logic fades out lines that are "behind" others, creating depth.

### Full Customization
The built-in Settings Panel offers complete control over:
- **Direction**: Free 360-degree rotation of the entire animation.
- **Wave Physics**: Control speed, distance between waves, and bend amplitude.
- **Detail & Roughness**: Fine-tune the small-scale "wiggle" (jitter) and line roughness.
- **Visuals**:
  - **Front Line Opacity**: Manually dampen the leading line of each group.
  - **Fade Strength**: Adjust the intensity of the occlusion effect.
  - **Sand**: Custom particle density, spread, and distribution.
- **Performance**: Adjust the **Resolution (Step)** to balance visual fidelity and CPU usage.

## Setup / Usage

1. Open `index.html` in any modern web browser.
2. Use the settings panel on the right to customize the animation.
3. Click "Pause" to freeze the animation at any time.

## Tech Stack
-   **HTML5 Canvas**: For high-performance 2D rendering.
-   **Vanilla JavaScript**: No external dependencies.
-   **CSS3**: For the glassmorphism UI.

## Variants

### Shoreline Simple Physics
Located in `/Shoreline Simple Physics`, this version introduces simplified physics where waves interact with each other. Faster waves will slow down to avoid overtaking slower waves ahead of them, preventing visual overlap artifacts.
