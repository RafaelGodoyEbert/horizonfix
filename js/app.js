// ============================================================
// app.js — Global State & Initialization (v3.3)
// ============================================================

// --- SHARED STATE (Visible across all scripts) ---
window.state = {
    currentRoll: 0,
    targetRoll: 0,
    angularVelocity: 0, // deg/sec for adaptive filtering
    isHorizonLockActive: true,
    isOisLockActive: false,
    zoomFactor: 1.0,
    recAspectRatio: 16 / 9,
    isShutterManual: false,
    shutterValue: 120,
    isIsoManual: false,
    isoValue: 800,
    isRecording: false,
    cachedVideoW: 1920,
    cachedVideoH: 1080,
    lastValidVisual: null,
    videoDevices: [],
    currentDeviceId: null,
    currentStream: null
};

// --- DOM References ---
const video = document.getElementById('video-source');
const canvas = document.getElementById('viewfinder');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const recCanvas = document.createElement('canvas');
const recCtx = recCanvas.getContext('2d', { alpha: false, desynchronized: true });

const startOverlay = document.getElementById('start-overlay');
const btnStart = document.getElementById('btn-start');
const angleText = document.getElementById('angle-text');
const sensorDot = document.getElementById('sensor-dot');
const debugInfo = document.getElementById('debug-info');
const camDebugInfo = document.getElementById('cam-debug-info');
const zoomSlider = document.getElementById('zoom-slider');
const zoomVal = document.getElementById('zoom-val');
const horizonToggle = document.getElementById('horizon-toggle');
const btnFlipCamera = document.getElementById('btn-flip-camera');
const settingsToggle = document.getElementById('settings-toggle');
const controlsPanel = document.getElementById('controls-panel');
const shutterToggle = document.getElementById('shutter-toggle');
const shutterSlider = document.getElementById('shutter-slider');
const shutterVal = document.getElementById('shutter-val');
const isoToggle = document.getElementById('iso-toggle');
const isoSlider = document.getElementById('iso-slider');
const isoVal = document.getElementById('iso-val');

// Global animation ID
let animationId;
let recordingStartTime;
let recordingInterval;
let mediaRecorder;
let recordedChunks = [];
let wakeLock = null;

// FPS Counter
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsDisplay = 0;

// Sensor Debug
let sensorEventCount = 0;
let lastBeta = 0, lastGamma = 0;

// Initialize Web App
btnStart.addEventListener('click', async () => {
    // Permissions (Sensors)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch (e) {}
    }

    // Attach Sensor Listeners
    if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } else {
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
    window.addEventListener('devicemotion', handleMotion, true);

    // Initial state sync from UI
    window.state.isHorizonLockActive = horizonToggle.checked;
    window.state.zoomFactor = parseFloat(zoomSlider.value);

    // Start
    startOverlay.style.opacity = '0';
    setTimeout(() => { startOverlay.style.display = 'none'; }, 500);

    await getCameras();
    await startCamera();
    draw(); // Start loop
});

// Simple Viewport Fix
function fixViewport() {
    document.body.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', fixViewport);
fixViewport();
