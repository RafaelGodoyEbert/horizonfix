// ============================================================
// app.js — Global variables, DOM references, and initialization
// This file must be loaded LAST (depends on all other modules)
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
const horizonLine = document.getElementById('horizon-line');
const leveler = document.getElementById('leveler');

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

// Legacy/Debug state
let sensorEventCount = 0;
let lastBeta = 0, lastGamma = 0;

// Fix viewport height for mobile browsers that messes up CSS
function fixViewportHeight() {
    document.body.style.height = window.innerHeight + 'px';
    document.documentElement.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', fixViewportHeight);
fixViewportHeight();

// Initialize Web App
btnStart.addEventListener('click', async () => {
    // Request permissions for Sensors (crucial for iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceOrientationEvent.requestPermission();
            if (permissionState !== 'granted') {
                alert("Permissão de sensor negada. O Horizonte Fixo precisa do giroscópio para funcionar.");
                return;
            }
        } catch (error) {
            console.error("Erro ao pedir permissão de sensor", error);
        }

        // Also try for DeviceMotionEvent
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                await DeviceMotionEvent.requestPermission();
            } catch (error) {
                console.error("Erro ao pedir permissão de devicemotion", error);
            }
        }
    }

    // Request sensor permissions for Chrome Android (Permissions API)
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const accel = await navigator.permissions.query({ name: 'accelerometer' }).catch(() => null);
            const gyro = await navigator.permissions.query({ name: 'gyroscope' }).catch(() => null);
        }
    } catch (e) { /* Some browsers don't support these permission names */ }

    // Listen to BOTH events as fallback - some Chrome versions only fire one or the other
    window.addEventListener('deviceorientation', handleOrientation, true);
    if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }
    window.addEventListener('devicemotion', handleMotion, true);

    // Hide overlay
    startOverlay.style.opacity = '0';
    setTimeout(() => {
        startOverlay.style.display = 'none';
        leveler.style.display = isHorizonLockActive ? 'flex' : 'none';
    }, 500);

    // Fetch cameras and start
    await getCameras();
    await startCamera();

    // Start render loop
    draw();
});
