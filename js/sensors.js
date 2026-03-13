// ============================================================
// sensors.js — Rotation Math (v3.5)
// ============================================================

/**
 * Two-stage smoothing:
 * 1. targetRoll gets a strong low-pass filter on raw sensor data
 * 2. currentRoll lerps toward targetRoll each frame (in renderer.js)
 *
 * This eliminates the "shaky horizon" completely.
 */

let hasValidMotionData = false;

// Low-pass filter state
let filteredX = 0;
let filteredY = 0;
const SENSOR_LPF = 0.12; // Sensor smoothing (lower = smoother but more latency)

// Smoothed targetRoll (extra stage before lerp in renderer)
let smoothedRoll = 0;
const ROLL_LPF = 0.15;

function applyRoll(rawRoll) {
    // Unwrap to avoid 180° jumps
    let diff = rawRoll - smoothedRoll;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    smoothedRoll += diff * ROLL_LPF;
    window.state.targetRoll = smoothedRoll;
}

function handleMotion(event) {
    if (!event.accelerationIncludingGravity) return;

    const ax = event.accelerationIncludingGravity.x || 0;
    const ay = event.accelerationIncludingGravity.y || 0;

    // Ignore near-zero readings (sensor noise)
    if (Math.abs(ax) < 0.05 && Math.abs(ay) < 0.05) return;

    hasValidMotionData = true;

    // Low pass filter on accelerometer axes
    filteredX = filteredX * (1 - SENSOR_LPF) + ax * SENSOR_LPF;
    filteredY = filteredY * (1 - SENSOR_LPF) + ay * SENSOR_LPF;

    let roll = Math.atan2(filteredX, filteredY) * 180 / Math.PI;
    if (isNaN(roll)) return;

    // Correct for screen orientation
    let orientation = 0;
    if (screen.orientation?.angle !== undefined) {
        orientation = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
        orientation = window.orientation;
    }

    applyRoll(-roll + orientation);
}

function handleOrientation(event) {
    // Only use orientation if motion API gave nothing
    if (hasValidMotionData) return;
    if (event.beta === null || event.gamma === null) return;

    const b = (event.beta || 0) * Math.PI / 180;
    const g = (event.gamma || 0) * Math.PI / 180;

    const x = Math.sin(g) * Math.cos(b);
    const y = Math.sin(b);

    let roll = Math.atan2(x, y) * 180 / Math.PI;
    if (isNaN(roll)) return;

    let orientation = screen.orientation?.angle ?? window.orientation ?? 0;
    applyRoll(-roll + orientation);
}

/**
 * Smooth angle interpolation (handles 180° wrap-around).
 * Used by renderer each frame.
 */
function lerpAngle(start, end, amt) {
    let diff = end - start;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return start + diff * amt;
}
