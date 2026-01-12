const canvas = document.getElementById('shorelineCanvas');
const ctx = canvas.getContext('2d');

// --- Perlin/Simplex Noise ---
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

// --- Logic ---

const settings = {
    // Canvas
    width: 1000,
    height: 1000,
    consistentStroke: false,
    resolutionStep: 10, // Performance setting

    strokeWidth: 2,
    waveSpeed: 0.5,
    waveDistance: 120,
    waveAmplitude: 120,
    bendSpeed: 0.1,
    direction: 0,
    // Detail (Small Waves)
    detailAmp: 15,
    detailSpeed: 0.2,
    detailSpread: 100, // Wavelength (1/freq)

    roughness: 0, // Default 0

    // Grouping
    groupMin: 3,
    groupMax: 6,
    groupSpread: 40,

    // Occlusion
    occlusionMode: true,
    occlusionReverse: false,
    occlusionStrength: 80,
    frontLineOpacity: 100, // Opacity of the "top" line



    // Sand
    sandDensity: 0,
    sandHeight: 300,
    sandPower: 3,
    sandColor: '#111111',

    isPlaying: true
};

function updateCanvasSize() {
    canvas.width = settings.width;
    canvas.height = settings.height;
    settings.diag = Math.hypot(settings.width, settings.height); // Diagonal size
    initWaves();
    initSand();
}

let time = 0;
let bendTime = 0; // Independent time for bend
let sandParticles = [];
let waveGroups = [];

class WaveGroup {
    constructor(baseY) {
        this.baseY = baseY;
        this.speed = 0.2 + Math.random() * 0.1;
        this.offset = Math.random() * 100;
        this.lines = [];
        this.regenerateLines();
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
        if (!settings.isPlaying) return;
        this.baseY += this.speed * settings.waveSpeed;
    }

    isOffScreen() {
        return this.baseY > settings.diag + 200;
    }
}

function initWaves() {
    waveGroups = [];
    const count = Math.ceil((settings.diag + 500) / settings.waveDistance);
    for (let i = 0; i < count; i++) {
        waveGroups.push(new WaveGroup(i * settings.waveDistance));
    }
}

function initSand() {
    sandParticles = [];

    for (let i = 0; i < settings.sandDensity; i++) {
        sandParticles.push({
            x: Math.random() * settings.diag,
            y: settings.diag - (Math.pow(Math.random(), settings.sandPower) * settings.sandHeight),
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
            g.regenerateLines();
        }
    });

    waveGroups.sort((a, b) => a.baseY - b.baseY);
}

function getLinePoints(group, lineIndex) {
    let lineObj = group.lines[lineIndex];
    let absY = group.baseY + lineObj.relY;

    let points = [];
    for (let x = -50; x <= settings.diag + 50; x += settings.resolutionStep) {
        // Use settings.waveAmplitude and bendTime
        const largeScale = noise(x * 0.002, bendTime + group.offset) * settings.waveAmplitude;
        const mediumScale = noise(x * (1 / settings.detailSpread) + lineObj.noiseOffset, time * settings.detailSpeed + group.offset) * settings.detailAmp;
        let y = absY + largeScale * lineObj.amplitudeMod + mediumScale;

        if (settings.roughness > 0) {
            y += (Math.random() - 0.5) * settings.roughness;
        }

        points.push({ x, y });
    }
    return points;
}

function draw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, settings.width, settings.height);

    let currentStrokeWidth = settings.strokeWidth;

    if (settings.consistentStroke) {
        let clientW = canvas.clientWidth || settings.width;
        let scale = clientW / settings.width;
        if (scale === 0) scale = 1;
        currentStrokeWidth = settings.strokeWidth / scale;
    }

    // Sand
    // Apply Rotation
    ctx.save();
    ctx.translate(settings.width / 2, settings.height / 2);
    ctx.rotate(settings.direction * Math.PI / 180);
    ctx.translate(-settings.diag / 2, -settings.diag / 2);

    ctx.fillStyle = settings.sandColor;
    sandParticles.forEach(p => {
        ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    manageWaves();

    waveGroups.forEach(group => {
        let loopStart, loopEnd, loopStep;

        if (settings.occlusionReverse) {
            loopStart = group.lines.length - 1;
            loopEnd = -1;
            loopStep = -1;
        } else {
            loopStart = 0;
            loopEnd = group.lines.length;
            loopStep = 1;
        }

        let allPoints = group.lines.map((_, i) => getLinePoints(group, i));

        for (let i = loopStart; i !== loopEnd; i += loopStep) {
            let points = allPoints[i];

            if (settings.occlusionMode) {
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

            // Check if this is the "Front" line (Last Drawn)
            // If i == loopEnd - loopStep? 
            // loopEnd is exclusive. Last i was loopEnd - loopStep.
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

    if (settings.isPlaying) {
        time += 0.05;
        bendTime += 0.05 * settings.bendSpeed;
        waveGroups.forEach(g => g.update());
    }

    ctx.restore(); // Restore rotation
    requestAnimationFrame(draw);
}

function bind(id, key, type = 'float', callback = null) {
    const el = document.getElementById(id);
    if (!el) return;

    // Bind logic
    const update = (e) => {
        let val;
        if (type === 'checkbox') val = e.target.checked;
        else if (type === 'int') val = parseInt(e.target.value);
        else if (type === 'color') val = e.target.value;
        else val = parseFloat(e.target.value);

        settings[key] = val;

        // Update value span if processing numeric input
        if (type !== 'checkbox' && type !== 'color') {
            const span = document.getElementById(id + '-val');
            if (span) {
                // If it's a percentage (occlusion), append %? 
                // Currently code assumes simple number, but check HTML text content
                // Actually spans are populated with initial values like "80%".
                // If we just overwrite with number, we lose %. 
                // Let's check keys.
                if (key === 'occlusionStrength') span.textContent = val + '%';
                else span.textContent = val;
            }
        }

        if (callback) callback();
    };

    el.addEventListener(type === 'checkbox' ? 'change' : 'input', update);
}

// Canvas
bind('canvas-width', 'width', 'int', updateCanvasSize);
bind('canvas-height', 'height', 'int', updateCanvasSize);
bind('consistent-stroke', 'consistentStroke', 'checkbox');
bind('resolution-step', 'resolutionStep', 'int');

// Wave Grouping
bind('group-min', 'groupMin', 'int', () => waveGroups.forEach(g => g.regenerateLines()));
bind('group-max', 'groupMax', 'int', () => waveGroups.forEach(g => g.regenerateLines()));
bind('group-spread', 'groupSpread', 'int', () => waveGroups.forEach(g => g.regenerateLines()));

// Occlusion
bind('occlusion-mode', 'occlusionMode', 'checkbox');
bind('occlusion-reverse', 'occlusionReverse', 'checkbox');
bind('occlusion-strength', 'occlusionStrength', 'int');
bind('front-line-opacity', 'frontLineOpacity', 'int');

// Movement
bind('wave-speed', 'waveSpeed');
bind('wave-distance', 'waveDistance', 'int', initWaves);
bind('roughness', 'roughness');
bind('wave-amplitude', 'waveAmplitude');
bind('bend-speed', 'bendSpeed');
bind('direction', 'direction', 'int');
bind('detail-amp', 'detailAmp');
bind('detail-speed', 'detailSpeed');
bind('detail-spread', 'detailSpread');

// Sand
bind('sand-density', 'sandDensity', 'int', initSand);
bind('sand-height', 'sandHeight', 'int', initSand);
bind('sand-power', 'sandPower', 'float', initSand);
bind('sand-color', 'sandColor', 'color');
bind('stroke-width', 'strokeWidth'); // Moved here for logic consistency

document.getElementById('toggle-play').addEventListener('click', (e) => {
    settings.isPlaying = !settings.isPlaying;
    e.target.textContent = settings.isPlaying ? 'Pause' : 'Play';
});

updateCanvasSize();
draw();
