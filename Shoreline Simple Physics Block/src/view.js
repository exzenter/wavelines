/* view.js handles the frontend animation
 * Uses Web Worker + OffscreenCanvas for performance when available,
 * with fallback to main thread rendering for older browsers.
 */

// Check if OffscreenCanvas and Worker are supported
const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';

// Get the worker script URL (injected by PHP into window.shorelineWorkerUrl)
function getWorkerUrl() {
    // Primary: Use URL injected by WordPress PHP
    if (window.shorelineWorkerUrl) {
        return window.shorelineWorkerUrl;
    }

    // Fallback: Try to find from script tags
    const scripts = document.getElementsByTagName('script');
    for (let script of scripts) {
        if (script.src && script.src.includes('view.js')) {
            return script.src.replace('view.js', 'wave-worker.js');
        }
    }
    if (document.currentScript) {
        return document.currentScript.src.replace('view.js', 'wave-worker.js');
    }
    return null;
}

// ============================================================
// Web Worker Implementation (Modern Browsers)
// ============================================================
function initWithWorker(canvas, settings, container) {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
        console.warn('Shoreline: Could not find worker URL, falling back to main thread');
        return false;
    }

    try {
        const offscreen = canvas.transferControlToOffscreen();
        const worker = new Worker(workerUrl);

        // Send initial setup
        worker.postMessage({
            type: 'init',
            canvas: offscreen,
            settings: settings
        }, [offscreen]);

        // Store worker reference for cleanup
        canvas._shorelineWorker = worker;

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            const newWidth = container.clientWidth;
            let newHeight;

            if (settings.customAspectRatio) {
                const ratio = parseFloat(settings.customAspectRatio);
                newHeight = newWidth * ratio;
            } else {
                newHeight = container.clientHeight;
            }

            if (Math.abs(settings.width - newWidth) > 1 || Math.abs(settings.height - newHeight) > 1) {
                settings.width = newWidth;
                settings.height = newHeight;
                worker.postMessage({
                    type: 'resize',
                    width: newWidth,
                    height: newHeight
                });
            }
        });
        resizeObserver.observe(container);
        canvas._shorelineResizeObserver = resizeObserver;

        return true;
    } catch (e) {
        console.warn('Shoreline: Worker initialization failed, falling back to main thread', e);
        return false;
    }
}

// ============================================================
// Fallback: Main Thread Implementation (Legacy Browsers)
// ============================================================
function initOnMainThread(canvas, settings, container) {
    const ctx = canvas.getContext('2d');

    // --- Perlin Noise - Runtime calculation (no LUT for continuous noise without periodic jumps) ---
    const perm = [];
    let gradP = [];
    while (perm.length < 256) {
        let val = Math.floor(Math.random() * 256);
        while (perm.includes(val)) val = Math.floor(Math.random() * 256);
        perm.push(val);
    }
    for (let i = 0; i < 256; i++) {
        perm[256 + i] = perm[i];
        let angle = (perm[i] % 16) * Math.PI * 2 / 16;
        gradP[i] = { x: Math.cos(angle), y: Math.sin(angle) };
        gradP[256 + i] = gradP[i];
    }

    function lerp(a, b, t) { return a + t * (b - a); }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    function noise(x, y) {
        // Wrap to 0-256 range BEFORE flooring for seamless tiling
        x = ((x % 256) + 256) % 256;
        y = ((y % 256) + 256) % 256;

        let X = Math.floor(x);
        let Y = Math.floor(y);

        // Get fractional part for interpolation
        x -= X;
        y -= Y;

        // Wrap neighbor indices for seamless tiling
        let X1 = (X + 1) % 256;
        let Y1 = (Y + 1) % 256;

        let u = fade(x);
        let v = fade(y);

        let n00 = gradP[X + perm[Y]].x * x + gradP[X + perm[Y]].y * y;
        let n01 = gradP[X + perm[Y1]].x * x + gradP[X + perm[Y1]].y * (y - 1);
        let n10 = gradP[X1 + perm[Y]].x * (x - 1) + gradP[X1 + perm[Y]].y * y;
        let n11 = gradP[X1 + perm[Y1]].x * (x - 1) + gradP[X1 + perm[Y1]].y * (y - 1);
        return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
    }

    // --- Logic ---
    let time = 0;
    let bendTime = 0;
    let sandParticles = [];
    let sandPath = null;
    let waveGroups = [];
    const waveScale = settings.waveScale || 1;
    let diag = Math.hypot(settings.width, settings.height) / waveScale;

    function getRandomColor() {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 60 + Math.floor(Math.random() * 20);
        const lightness = 45 + Math.floor(Math.random() * 15);
        return { h: hue, s: saturation, l: lightness };
    }

    function parseToRgbOrHsl(color) {
        if (color && typeof color === 'object' && 'h' in color) return color;
        let hex = null;
        if (typeof color === 'string' && color.startsWith('#')) {
            hex = color;
        } else {
            try {
                const tempCtx = document.createElement('canvas').getContext('2d');
                tempCtx.fillStyle = color || '#3498db';
                const p = tempCtx.fillStyle;
                if (p && p.startsWith('#')) hex = p;
            } catch (e) { }
        }
        if (hex) {
            hex = hex.slice(1);
            if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            const val = parseInt(hex, 16);
            return { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255 };
        }
        return { r: 52, g: 152, b: 219 };
    }

    function resolveColor(cObj, opacity, gradientType) {
        const mix = (val, target, t) => val + (target - val) * t;
        const t = 1 - opacity;

        if ('h' in cObj) {
            if (gradientType === 'solid_white') {
                const l = mix(cObj.l, 100, t);
                const s_mixed = mix(cObj.s, 0, t);
                return `hsl(${cObj.h}, ${s_mixed}%, ${l}%)`;
            } else if (gradientType === 'solid_black') {
                const l = mix(cObj.l, 0, t);
                return `hsl(${cObj.h}, ${cObj.s}%, ${l}%)`;
            } else {
                return `hsla(${cObj.h}, ${cObj.s}%, ${cObj.l}%, ${opacity})`;
            }
        } else {
            let targetR, targetG, targetB;
            if (gradientType === 'solid_white') { targetR = 255; targetG = 255; targetB = 255; }
            else if (gradientType === 'solid_black') { targetR = 0; targetG = 0; targetB = 0; }
            else {
                return `rgba(${cObj.r}, ${cObj.g}, ${cObj.b}, ${opacity})`;
            }
            const r = mix(cObj.r, targetR, t);
            const g = mix(cObj.g, targetG, t);
            const b = mix(cObj.b, targetB, t);
            return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        }
    }

    class WaveGroup {
        constructor(baseY) {
            this.baseY = baseY;
            this.speed = 0.2 + Math.random() * 0.1;
            this.offset = Math.random() * 50;
            this.lines = [];
            this.updateColor();
            this.regenerateLines();
        }
        updateColor() {
            let rawColor;
            if (settings.fillColorMode === 'rainbow') {
                const yNorm = Math.min(1, Math.max(0, this.baseY / diag));
                const hue = Math.floor(yNorm * 360);
                rawColor = { h: hue, s: 70, l: 50 };
            } else if (settings.fillColorMode === 'random' || settings.fillRandomMode) {
                if (!this.fixedRandomColor) {
                    this.fixedRandomColor = getRandomColor();
                }
                rawColor = this.fixedRandomColor;
            } else {
                rawColor = settings.fillColor || '#3498db';
            }
            this.fillColorObj = parseToRgbOrHsl(rawColor);
        }
        regenerateLines() {
            this.lines = [];
            const count = Math.floor(settings.groupMin + Math.random() * (settings.groupMax - settings.groupMin + 1));
            for (let i = 0; i < count; i++) {
                let relY = (count > 1) ? (i / (count - 1)) * settings.groupSpread : 0;
                relY += (Math.random() - 0.5) * 5;
                this.lines.push({
                    relY: relY,
                    noiseOffset: Math.random() * 10,
                    amplitudeMod: 0.8 + Math.random() * 0.4
                });
            }
        }
        update() {
            this.baseY += this.speed * settings.waveSpeed;
        }
        isOffScreen() {
            return this.baseY > diag + 200;
        }
    }

    function initWaves() {
        waveGroups = [];
        const count = Math.ceil((diag + 500) / settings.waveDistance);
        for (let i = 0; i < count; i++) {
            waveGroups.push(new WaveGroup(i * settings.waveDistance));
        }
    }

    function initSand() {
        sandParticles = [];
        sandPath = new Path2D();
        for (let i = 0; i < settings.sandDensity; i++) {
            const x = Math.random() * diag;
            const y = diag - (Math.pow(Math.random(), settings.sandPower) * settings.sandHeight);
            const size = Math.random() < 0.5 ? 0.8 : 1.2;
            sandParticles.push({ x, y, size });
            sandPath.rect(x, y, size, size);
        }
    }

    function manageWaves() {
        let minBaseY = 99999;
        waveGroups.forEach(g => minBaseY = Math.min(minBaseY, g.baseY));
        waveGroups.forEach(g => {
            if (g.isOffScreen()) {
                g.baseY = minBaseY - settings.waveDistance;
                g.fixedRandomColor = null;
                g.updateColor();
                g.regenerateLines();
            }
        });
        waveGroups.sort((a, b) => a.baseY - b.baseY);
    }

    function enforceConstraints() {
        const MIN_DIST = 20;
        for (let i = waveGroups.length - 2; i >= 0; i--) {
            let current = waveGroups[i];
            let next = waveGroups[i + 1];
            let limit = next.baseY - MIN_DIST;
            if (current.baseY > limit) {
                current.baseY = limit;
            }
        }
    }

    function getLinePoints(group, lineIndex) {
        let lineObj = group.lines[lineIndex];
        let absY = group.baseY + lineObj.relY;
        let points = [];
        for (let x = -50; x <= diag + 50; x += settings.resolutionStep) {
            const largeScale = noise(x * 0.002, bendTime + group.offset) * settings.waveAmplitude;
            const mediumScale = noise(x * (1 / settings.detailSpread) + lineObj.noiseOffset, time * settings.detailSpeed + group.offset) * settings.detailAmp;
            let y = absY + largeScale * lineObj.amplitudeMod + mediumScale;
            if (settings.roughness > 0) y += (Math.random() - 0.5) * settings.roughness;
            points.push({ x, y });
        }
        return points;
    }

    function draw() {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, settings.width, settings.height);

        let currentStrokeWidth = settings.strokeWidth;
        if (settings.consistentStroke) {
            let clientW = settings.width;
            let scale = clientW / 1000;
            if (scale === 0) scale = 1;
            currentStrokeWidth = settings.strokeWidth / scale;
        }

        ctx.save();
        ctx.translate(settings.width / 2, settings.height / 2);
        ctx.rotate(settings.direction * Math.PI / 180);
        ctx.scale(settings.waveScale || 1, settings.waveScale || 1);
        ctx.translate(-diag / 2, -diag / 2);

        if (sandPath && settings.sandDensity > 0) {
            ctx.fillStyle = settings.sandColor;
            ctx.fill(sandPath);
        }

        manageWaves();

        waveGroups.forEach(group => {
            let loopStart, loopEnd, loopStep;
            if (settings.occlusionReverse) {
                loopStart = group.lines.length - 1; loopEnd = -1; loopStep = -1;
            } else {
                loopStart = 0; loopEnd = group.lines.length; loopStep = 1;
            }

            let allPoints = group.lines.map((_, i) => getLinePoints(group, i));

            for (let i = loopStart; i !== loopEnd; i += loopStep) {
                let points = allPoints[i];
                let nextIdx = i + loopStep;

                if (settings.fillEnabled && nextIdx >= 0 && nextIdx < group.lines.length) {
                    let nextPoints = allPoints[nextIdx];
                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let p of points) ctx.lineTo(p.x, p.y);
                    for (let k = nextPoints.length - 1; k >= 0; k--) ctx.lineTo(nextPoints[k].x, nextPoints[k].y);
                    ctx.closePath();

                    const baseOpacity = (settings.fillOpacity !== undefined ? settings.fillOpacity : 80) / 100;
                    const lineIndex = settings.occlusionReverse ? (group.lines.length - 1 - i) : i;
                    const decay = ((settings.fillOpacityDecay !== undefined ? settings.fillOpacityDecay : 15) / 100) * lineIndex;
                    let effectiveOpacity = Math.max(0, baseOpacity - decay);
                    let gType = settings.fillGradientType || 'transparent';
                    if (settings.fillSolid && gType === 'transparent') gType = 'solid_white';

                    ctx.fillStyle = resolveColor(group.fillColorObj, effectiveOpacity, gType);
                    ctx.fill();
                }

                const shouldApplyOcclusion = settings.occlusionMode &&
                    !(settings.fillEnabled && settings.fillIgnoreOcclusion);

                if (shouldApplyOcclusion) {
                    let prevIdx = i - loopStep;
                    if (prevIdx >= 0 && prevIdx < group.lines.length) {
                        let prevPoints = allPoints[prevIdx];
                        ctx.beginPath();
                        ctx.moveTo(points[0].x, points[0].y);
                        for (let p of points) ctx.lineTo(p.x, p.y);
                        for (let k = prevPoints.length - 1; k >= 0; k--) ctx.lineTo(prevPoints[k].x, prevPoints[k].y);
                        ctx.closePath();
                        let opacity = settings.occlusionStrength / 100;
                        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                        ctx.fill();
                    }
                }

                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let p of points) ctx.lineTo(p.x, p.y);
                ctx.lineWidth = currentStrokeWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                let isLastDrawn = (i === (loopEnd - loopStep));
                if (isLastDrawn) {
                    let alpha = settings.frontLineOpacity / 100;
                    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                } else {
                    ctx.strokeStyle = '#000000';
                }
                ctx.stroke();
            }
        });

        time = (time + 0.05) % 256;
        bendTime = (bendTime + 0.05 * settings.bendSpeed) % 256;
        waveGroups.forEach(g => g.update());
        enforceConstraints();

        ctx.restore();
        requestAnimationFrame(draw);
    }

    initWaves();
    initSand();
    draw();

    // Handle Resize
    const resizeObserver = new ResizeObserver(() => {
        const newWidth = container.clientWidth;
        let newHeight;

        if (settings.customAspectRatio) {
            const ratio = parseFloat(settings.customAspectRatio);
            newHeight = newWidth * ratio;
        } else {
            newHeight = container.clientHeight;
        }

        if (Math.abs(canvas.width - newWidth) > 1 || Math.abs(canvas.height - newHeight) > 1) {
            canvas.width = newWidth;
            canvas.height = newHeight;
            settings.width = canvas.width;
            settings.height = canvas.height;
            diag = Math.hypot(settings.width, settings.height) / waveScale;
            initWaves();
            initSand();
        }
    });
    resizeObserver.observe(container);
}

// ============================================================
// Main Initialization
// ============================================================
function initShorelineSimulation() {
    const canvases = document.querySelectorAll('.shoreline-background-canvas-view');

    canvases.forEach(canvas => {
        // Prevent double initialization
        if (canvas.dataset.initialized) return;
        canvas.dataset.initialized = "true";

        let settings = JSON.parse(canvas.dataset.settings);
        const container = canvas.parentElement;

        // Calculate dimensions
        const containerWidth = container.clientWidth || 1000;
        let containerHeight;
        if (settings.customAspectRatio) {
            const ratio = parseFloat(settings.customAspectRatio) || 0.5625;
            containerHeight = containerWidth * ratio;
        } else {
            containerHeight = container.clientHeight || (containerWidth * 0.5625);
        }

        // Set canvas dimensions
        canvas.width = containerWidth;
        canvas.height = containerHeight;
        settings.width = canvas.width;
        settings.height = canvas.height;

        // Try Web Worker first, fallback to main thread
        if (supportsOffscreenCanvas) {
            const success = initWithWorker(canvas, settings, container);
            if (success) {
                console.log('Shoreline: Using Web Worker + OffscreenCanvas');
                return;
            }
        }

        // Fallback to main thread
        console.log('Shoreline: Using main thread rendering');
        initOnMainThread(canvas, settings, container);
    });
}

// 1. Expose for WP Logo Explode
window.initializeOnPageCanvasAfterTransition = initShorelineSimulation;

// 2. Handle Normal Page Loads
window.addEventListener('load', () => {
    // Only start if NOT currently in a transition (overlay present)
    if (!document.querySelector('.transition-overlay')) {
        initShorelineSimulation();
    }
});
