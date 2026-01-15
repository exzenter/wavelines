import { __ } from '@wordpress/i18n';
import { useBlockProps, InnerBlocks, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, RangeControl, ToggleControl, ColorPalette, BaseControl, TextControl, SelectControl, __experimentalUnitControl as UnitControl } from '@wordpress/components';
import { useEffect, useRef, useState } from '@wordpress/element';

// Import the physics logic for the editor preview 
// Note: In a real build, we might share code. For now, we will duplicate 
// or implement a lightweight version. Or, we can just load the view script?
// Best practice: The editor component should run the logic if we want a live preview.
// We will implement the physics logic inside a useEffect.

export default function Edit({ attributes, setAttributes }) {
    const rawRatio = attributes.customAspectRatio;
    const hasRatio = rawRatio && rawRatio.trim() !== "";
    const ratio = hasRatio ? parseFloat(rawRatio) : 0;

    const blockProps = useBlockProps({
        className: 'shoreline-physics-block-container',
        style: {
            width: '100%',
            position: 'relative',
            aspectRatio: hasRatio && ratio > 0 ? `${1 / ratio}` : undefined,
            overflow: 'hidden'
        }
    });

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const [containerWidth, setContainerWidth] = useState(1000);

    // settings object to mirror the one in script.js, but driven by attributes
    // We bind this in the effect.

    // Direct DOM measurement: poll container width every 200ms
    useEffect(() => {
        const measureWidth = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                if (width > 0 && width !== containerWidth) {
                    setContainerWidth(width);
                }
            }
        };

        measureWidth(); // Initial measurement
        const interval = setInterval(measureWidth, 200);
        return () => clearInterval(interval);
    }, [containerWidth]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // --- Perlin/Simplex Noise (Scoped) ---
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
            let X = Math.floor(x) & 255;
            let Y = Math.floor(y) & 255;
            x -= Math.floor(x);
            y -= Math.floor(y);
            let u = fade(x);
            let v = fade(y);
            let n00 = gradP[X + perm[Y]].x * x + gradP[X + perm[Y]].y * y;
            let n01 = gradP[X + perm[Y + 1]].x * x + gradP[X + perm[Y + 1]].y * (y - 1);
            let n10 = gradP[X + 1 + perm[Y]].x * (x - 1) + gradP[X + 1 + perm[Y]].y * y;
            let n11 = gradP[X + 1 + perm[Y + 1]].x * (x - 1) + gradP[X + 1 + perm[Y + 1]].y * (y - 1);
            return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
        }

        // --- Logic Variables ---
        let time = 0;
        let bendTime = 0;
        let sandParticles = [];
        let waveGroups = [];
        let diag = 0;

        // Use containerWidth state (measured via polling) for canvas dimensions
        const canvasW = containerWidth || 1000;
        // If hasRatio, calculate height. Else use container height (or fallback).
        let canvasH;
        if (ratio > 0) {
            canvasH = Math.round(canvasW * ratio);
        } else {
            // Auto mode: use container height if available
            canvasH = containerRef.current ? containerRef.current.clientHeight : (canvasW * 0.5625);
        }

        // Set canvas internal resolution
        if (canvas.width !== canvasW || canvas.height !== canvasH) {
            canvas.width = canvasW;
            canvas.height = canvasH;
        }

        const settings = {
            ...attributes,
            width: canvas.width,
            height: canvas.height
        };

        // Helper function to generate random HSL color
        function getRandomColor() {
            const hue = Math.floor(Math.random() * 360);
            const saturation = 60 + Math.floor(Math.random() * 20); // 60-80%
            const lightness = 45 + Math.floor(Math.random() * 15); // 45-60%
            return { h: hue, s: saturation, l: lightness };
        }

        // Helper: Parse color to object {r,g,b} or {h,s,l}
        function parseToRgbOrHsl(color) {
            if (color && typeof color === 'object' && 'h' in color) return color;

            let hex = null;
            if (typeof color === 'string' && color.startsWith('#')) {
                hex = color;
            } else {
                // Try canvas parsing for named colors
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
            return { r: 52, g: 152, b: 219 }; // fallback
        }

        // Helper: Generate CSS color string with opacity or white-mix
        function resolveColor(cObj, opacity, gradientType) {
            // gradientType: 'transparent', 'solid_white', 'solid_black'

            // For blending with white/black, we interpolate RGB/HSL values.
            // Opacity 1 = Full Color, Opacity 0 = Target Background (White/Black)

            // Helper to mix
            const mix = (val, target, t) => val + (target - val) * t;
            // t = 1 - opacity (0=no mix, 1=full target)
            const t = 1 - opacity;

            if ('h' in cObj) {
                // HSL
                if (gradientType === 'solid_white') {
                    // Mix with White: Saturation -> 0, Lightness -> 100
                    const s_mixed = mix(cObj.s, 0, t);
                    const l = mix(cObj.l, 100, t);
                    return `hsl(${cObj.h}, ${s_mixed}%, ${l}%)`;
                } else if (gradientType === 'solid_black') {
                    // Mix with Black: Lightness -> 0
                    const l = mix(cObj.l, 0, t);
                    return `hsl(${cObj.h}, ${cObj.s}%, ${l}%)`;
                } else {
                    return `hsla(${cObj.h}, ${cObj.s}%, ${cObj.l}%, ${opacity})`;
                }
            } else {
                // RGB
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

        // Classes
        class WaveGroup {
            constructor(baseY) {
                this.baseY = baseY;
                this.speed = 0.2 + Math.random() * 0.1;
                this.offset = Math.random() * 100;
                this.lines = [];
                // Assign fill color determined by mode
                this.updateColor();
                this.regenerateLines();
            }
            updateColor() {
                let rawColor;
                if (settings.fillColorMode === 'rainbow') {
                    // Rainbow based on Y position (baseY) relative to diag
                    const yNorm = Math.min(1, Math.max(0, this.baseY / diag));
                    const hue = Math.floor(yNorm * 360);
                    rawColor = { h: hue, s: 70, l: 50 };
                } else if (settings.fillColorMode === 'random' || settings.fillRandomMode /* legacy */) {
                    if (!this.fixedRandomColor) { // Keep same random color for this wave instance unless explicitly reset? 
                        // Actually for recycling, we probably want a NEW random color?
                        // Let's generate a new one to keep it fresh.
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
            for (let i = 0; i < settings.sandDensity; i++) {
                sandParticles.push({
                    x: Math.random() * diag,
                    y: diag - (Math.pow(Math.random(), settings.sandPower) * settings.sandHeight),
                    size: Math.random() < 0.5 ? 0.8 : 1.2
                });
            }
        }

        function manageWaves() {
            let minBaseY = 99999;
            waveGroups.forEach(g => minBaseY = Math.min(minBaseY, g.baseY));
            waveGroups.forEach(g => {
                if (g.isOffScreen()) {
                    g.baseY = minBaseY - settings.waveDistance;
                    g.fixedRandomColor = null; // Reset random color so we get a new one
                    g.updateColor(); // Update color (important for Rainbow)
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
            ctx.fillStyle = '#ffffff'; // Or transparent? The user might want a colored background from Group block
            // Actually, usually users want the canvas to separate. Let's stick to white for now as per original app.
            // But wait, if it's a Group block, users might set a background color.
            // If settings.consistentStroke is true, logic... 

            // Clear canvas
            ctx.clearRect(0, 0, settings.width, settings.height);
            // We use clearRect instead of fillRect white so that if they set a background color on the group, it shows through?
            // "renders our Shoreline app as background".
            // The Shoreline app has a white background hardcoded in draw().
            // I'll keep the white fill for now to match the "App", but maybe allow transparency if I had a setting.
            // I'll leave it white.

            ctx.fillStyle = '#ffffff';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, settings.width, settings.height);

            let currentStrokeWidth = settings.strokeWidth;
            if (settings.consistentStroke) {
                // In editor, clientWidth might be weird.
                let clientW = settings.width;
                let scale = clientW / 1000; // Base scale on 1000px width reference
                if (scale === 0) scale = 1;
                currentStrokeWidth = settings.strokeWidth / scale;
            }

            ctx.save();
            ctx.translate(settings.canvasWidth / 2, settings.canvasHeight / 2);
            ctx.rotate(settings.direction * Math.PI / 180);
            ctx.scale(settings.waveScale, settings.waveScale);
            ctx.translate(-diag / 2, -diag / 2);

            ctx.fillStyle = settings.sandColor;
            sandParticles.forEach(p => {
                ctx.fillRect(p.x, p.y, p.size, p.size);
            });

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

                    // Fill between this line and the next line in the group
                    if (settings.fillEnabled && nextIdx >= 0 && nextIdx < group.lines.length) {
                        let nextPoints = allPoints[nextIdx];
                        ctx.beginPath();
                        ctx.moveTo(points[0].x, points[0].y);
                        for (let p of points) ctx.lineTo(p.x, p.y);
                        for (let k = nextPoints.length - 1; k >= 0; k--) ctx.lineTo(nextPoints[k].x, nextPoints[k].y);
                        ctx.closePath();
                        // Calculate opacity - solid mode uses 1.0, otherwise use decay
                        /* 
                           New logic: 
                           Start with base opacity (from slider).
                           Apply decay per line.
                           Resolve based on Gradient Type.
                        */
                        const baseOpacity = (settings.fillOpacity !== undefined ? settings.fillOpacity : 80) / 100;
                        const lineIndex = settings.occlusionReverse ? (group.lines.length - 1 - i) : i;
                        const decay = (settings.fillOpacityDecay / 100) * lineIndex;

                        let effectiveOpacity = Math.max(0, baseOpacity - decay);

                        // Legacy support for fillSolid check
                        let gType = settings.fillGradientType || 'transparent';
                        if (settings.fillSolid && gType === 'transparent') gType = 'solid_white';

                        ctx.fillStyle = resolveColor(group.fillColorObj, effectiveOpacity, gType);
                        ctx.fill();
                    }

                    // Only apply occlusion if NOT ignoring it for fill colors
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

            time += 0.05;
            bendTime += 0.05 * settings.bendSpeed;
            waveGroups.forEach(g => g.update());
            enforceConstraints();

            ctx.restore();
            requestRef.current = requestAnimationFrame(draw);
        }

        // Initialize
        canvas.width = canvas.clientWidth || 1000;
        canvas.height = canvas.clientHeight || 500;
        settings.width = canvas.width;
        settings.height = canvas.height;
        // Adjust diag for scale - when scaling up, we need fewer waves to cover the area
        // When scaling down, we need more waves to fill the canvas
        const waveScale = settings.waveScale || 1;
        diag = Math.hypot(canvas.width, canvas.height) / waveScale;
        initWaves();
        initSand();

        requestRef.current = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(requestRef.current);
        }
    }, [
        // Option B: Include ALL attributes for real-time updates
        // Option C: Use containerWidth instead of sizes
        containerWidth, ratio,
        attributes.sandDensity, attributes.customAspectRatio,
        attributes.groupMin, attributes.groupMax, attributes.groupSpread,
        attributes.waveDistance, attributes.sandHeight, attributes.sandPower,
        attributes.waveSpeed, attributes.strokeWidth, attributes.direction,
        attributes.bendSpeed, attributes.detailAmp, attributes.detailSpeed,
        attributes.detailSpread, attributes.roughness, attributes.waveAmplitude,
        attributes.occlusionMode, attributes.occlusionStrength, attributes.occlusionReverse,
        attributes.frontLineOpacity, attributes.sandColor, attributes.consistentStroke,
        attributes.resolutionStep, attributes.waveScale,
        attributes.fillEnabled, attributes.fillColor, attributes.fillRandomMode,
        attributes.fillOpacity, attributes.fillOpacityDecay, attributes.fillIgnoreOcclusion,
        attributes.fillSolid, attributes.fillColorMode, attributes.fillGradientType
    ]);

    // Inspector Controls
    return (
        <>
            <InspectorControls>
                <PanelBody title="Canvas Settings">
                    <TextControl
                        label="Aspect Ratio (Decimal)"
                        value={attributes.customAspectRatio}
                        onChange={(v) => setAttributes({ customAspectRatio: v })}
                        help="e.g. 0.5625 for 9:16, 1 for Square"
                    />
                    <ToggleControl label="Consistent Stroke" checked={attributes.consistentStroke} onChange={(v) => setAttributes({ consistentStroke: v })} />
                    <RangeControl label="Resolution (Step)" value={attributes.resolutionStep} onChange={(v) => setAttributes({ resolutionStep: v })} min={5} max={50} />
                    <RangeControl label="Wave Scale" value={attributes.waveScale} onChange={(v) => setAttributes({ waveScale: v })} min={0.5} max={3} step={0.1} />
                </PanelBody>

                <PanelBody title="Wave Grouping" initialOpen={false}>
                    <RangeControl label="Min Lines" value={attributes.groupMin} onChange={(v) => setAttributes({ groupMin: v })} min={1} max={10} />
                    <RangeControl label="Max Lines" value={attributes.groupMax} onChange={(v) => setAttributes({ groupMax: v })} min={1} max={10} />
                    <RangeControl label="Group Spread" value={attributes.groupSpread} onChange={(v) => setAttributes({ groupSpread: v })} min={10} max={300} />
                </PanelBody>

                <PanelBody title="Occlusion" initialOpen={false}>
                    <ToggleControl label="Enable Fade" checked={attributes.occlusionMode} onChange={(v) => setAttributes({ occlusionMode: v })} />
                    <ToggleControl label="Reverse Fade" checked={attributes.occlusionReverse} onChange={(v) => setAttributes({ occlusionReverse: v })} />
                    <RangeControl label="Fade Strength" value={attributes.occlusionStrength} onChange={(v) => setAttributes({ occlusionStrength: v })} min={0} max={100} />
                    <RangeControl label="Front Line Opacity" value={attributes.frontLineOpacity} onChange={(v) => setAttributes({ frontLineOpacity: v })} min={0} max={100} />
                </PanelBody>

                <PanelBody title="Movement & Shape" initialOpen={false}>
                    <RangeControl label="Wave Speed" value={attributes.waveSpeed} onChange={(v) => setAttributes({ waveSpeed: v })} min={0} max={3} step={0.1} />
                    <RangeControl label="Distance" value={attributes.waveDistance} onChange={(v) => setAttributes({ waveDistance: v })} min={50} max={300} step={10} />
                    <RangeControl label="Roughness" value={attributes.roughness} onChange={(v) => setAttributes({ roughness: v })} min={0} max={5} step={0.1} />
                    <RangeControl label="Bend Amplitude" value={attributes.waveAmplitude} onChange={(v) => setAttributes({ waveAmplitude: v })} min={0} max={300} step={5} />
                    <RangeControl label="Bend Speed" value={attributes.bendSpeed} onChange={(v) => setAttributes({ bendSpeed: v })} min={0} max={1} step={0.01} />
                    <RangeControl label="Direction" value={attributes.direction} onChange={(v) => setAttributes({ direction: v })} min={0} max={360} />
                </PanelBody>

                <PanelBody title="Small Waves (Detail)" initialOpen={false}>
                    <RangeControl label="Amplitude" value={attributes.detailAmp} onChange={(v) => setAttributes({ detailAmp: v })} min={0} max={50} />
                    <RangeControl label="Speed" value={attributes.detailSpeed} onChange={(v) => setAttributes({ detailSpeed: v })} min={0} max={2} step={0.01} />
                    <RangeControl label="Spread" value={attributes.detailSpread} onChange={(v) => setAttributes({ detailSpread: v })} min={20} max={300} step={5} />
                </PanelBody>

                <PanelBody title="Sand" initialOpen={false}>
                    <RangeControl label="Density" value={attributes.sandDensity} onChange={(v) => setAttributes({ sandDensity: v })} min={0} max={5000} step={100} />
                    <RangeControl label="Height" value={attributes.sandHeight} onChange={(v) => setAttributes({ sandHeight: v })} min={50} max={800} step={10} />
                    <RangeControl label="Distribution" value={attributes.sandPower} onChange={(v) => setAttributes({ sandPower: v })} min={1} max={10} step={0.5} />
                    <BaseControl label="Color">
                        <ColorPalette value={attributes.sandColor} onChange={(v) => setAttributes({ sandColor: v })} />
                    </BaseControl>
                </PanelBody>

                <PanelBody title="Style">
                    <RangeControl label="Stroke Width" value={attributes.strokeWidth} onChange={(v) => setAttributes({ strokeWidth: v })} min={0.5} max={5} step={0.1} />
                </PanelBody>

                <PanelBody title="Fill Color" initialOpen={false}>
                    <ToggleControl label="Enable Fill" checked={attributes.fillEnabled} onChange={(v) => setAttributes({ fillEnabled: v })} />

                    <SelectControl
                        label="Color Mode"
                        value={attributes.fillColorMode || (attributes.fillRandomMode ? 'random' : 'single')}
                        options={[
                            { label: 'Single Color', value: 'single' },
                            { label: 'Random Colors', value: 'random' },
                            { label: 'Rainbow', value: 'rainbow' },
                        ]}
                        onChange={(v) => {
                            setAttributes({
                                fillColorMode: v,
                                fillRandomMode: (v === 'random') // Keep legacy sync
                            });
                        }}
                    />

                    {attributes.fillColorMode === 'single' && (
                        <BaseControl label="Fill Color">
                            <ColorPalette value={attributes.fillColor} onChange={(v) => setAttributes({ fillColor: v })} />
                        </BaseControl>
                    )}

                    <SelectControl
                        label="Gradient Type"
                        value={attributes.fillGradientType || (attributes.fillSolid ? 'solid_white' : 'transparent')}
                        options={[
                            { label: 'Transparent (Standard)', value: 'transparent' },
                            { label: 'Fade to White (Solid)', value: 'solid_white' },
                            { label: 'Fade to Black (Solid)', value: 'solid_black' },
                        ]}
                        onChange={(v) => {
                            setAttributes({
                                fillGradientType: v,
                                fillSolid: (v === 'solid_white' || v === 'solid_black') // Keep legacy sync for now
                            });
                        }}
                        help="Controls how the opacity decay renders."
                    />

                    <RangeControl label="Base Opacity" value={attributes.fillOpacity} onChange={(v) => setAttributes({ fillOpacity: v })} min={0} max={100} />
                    <RangeControl label="Opacity Decay" value={attributes.fillOpacityDecay} onChange={(v) => setAttributes({ fillOpacityDecay: v })} min={0} max={50} help="Step size for fading out" />

                    <ToggleControl label="Ignore Occlusion Fade" checked={attributes.fillIgnoreOcclusion} onChange={(v) => setAttributes({ fillIgnoreOcclusion: v })} help="Disable white fade overlay on fill colors" />
                </PanelBody>
            </InspectorControls>

            <div {...blockProps} ref={containerRef} style={{ ...blockProps.style, position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    className="shoreline-background-canvas"
                    style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 0,
                        pointerEvents: 'none',
                        objectFit: 'cover'
                    }}
                />
                <div className="shoreline-content-wrapper" style={{
                    position: hasRatio ? 'absolute' : 'relative',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 1,
                    pointerEvents: 'auto',
                    cursor: 'text',
                    minHeight: '50px'
                }}>
                    <InnerBlocks />
                </div>
            </div>
        </>
    );
}
