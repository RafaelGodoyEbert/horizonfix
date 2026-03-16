// ============================================================
// sensors.js — Rotation Math (v4.0)
// ============================================================

/**
 * ARCHITECTURE v4.0:
 * 1. Circular Buffer: Stores last 100 sensor readings with hardware timestamps.
 * 2. Interpolation: Precise angle lookup for camera frame timestamps (No Lag).
 * 3. Angular Velocity: Tracks rotation speed for adaptive filtering.
 */

let hasValidMotionData = false;

// Circular Buffer (100 samples ~ 0.5s at 200Hz)
const SENSOR_HISTORY_SIZE = 100;
const sensorHistory = [];
let historyIdx = 0;

// Low-pass filter state
let filteredX = 0;
let filteredY = 0;
const SENSOR_LPF = 0.12;

// Adaptative state
let lastRawRoll = 0;
let lastTimestamp = 0;
window.state.angularVelocity = 0; // Degrees per second

function applyRoll(rawRoll, timestamp) {
    // ── 1. Update Angular Velocity (for adaptive filter)
    if (lastTimestamp > 0) {
        const dt = (timestamp - lastTimestamp) / 1000;
        if (dt > 0) {
            let diff = rawRoll - lastRawRoll;
            while (diff < -180) diff += 360;
            while (diff > 180) diff -= 360;
            const velocity = Math.abs(diff / dt);
            // Smooth velocity a bit
            window.state.angularVelocity = window.state.angularVelocity * 0.8 + velocity * 0.2;
        }
    }
    lastRawRoll = rawRoll;
    lastTimestamp = timestamp;

    // ── 2. Push to Circular Buffer
    const entry = { t: timestamp, r: rawRoll };
    if (sensorHistory.length < SENSOR_HISTORY_SIZE) {
        sensorHistory.push(entry);
    } else {
        sensorHistory[historyIdx] = entry;
        historyIdx = (historyIdx + 1) % SENSOR_HISTORY_SIZE;
    }

    // Set targetRoll to latest for fallback
    window.state.targetRoll = rawRoll;
}

/**
 * Finds the exact interpolated angle for a given timestamp.
 * "The Secret": Traveling back in time to match the camera frame.
 */
function getInterpolatedRoll(targetT) {
    if (sensorHistory.length < 2) return window.state.targetRoll;

    // Find the two samples that bracket targetT
    // (Search backwards from newest)
    let newer = null;
    let older = null;

    for (let i = 0; i < sensorHistory.length; i++) {
        let idx = (historyIdx - 1 - i + SENSOR_HISTORY_SIZE) % SENSOR_HISTORY_SIZE;
        let entry = sensorHistory[idx];
        if (!entry) continue;

        if (entry.t >= targetT) {
            newer = entry;
        } else {
            older = entry;
            break;
        }
    }

    if (!newer) return sensorHistory[(historyIdx - 1 + SENSOR_HISTORY_SIZE) % SENSOR_HISTORY_SIZE].r;
    if (!older) return newer.r;

    // Linear Interpolation
    const tDiff = newer.t - older.t;
    if (tDiff <= 0) return newer.r;

    const alpha = (targetT - older.t) / tDiff;
    
    // Lerp angle correctly (unwrap)
    let diff = newer.r - older.r;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;

    return older.r + diff * alpha;
}

function handleMotion(event) {
    if (!event.accelerationIncludingGravity) return;

    const ax = event.accelerationIncludingGravity.x || 0;
    const ay = event.accelerationIncludingGravity.y || 0;

    if (Math.abs(ax) < 0.05 && Math.abs(ay) < 0.05) return;

    hasValidMotionData = true;

    filteredX = filteredX * (1 - SENSOR_LPF) + ax * SENSOR_LPF;
    filteredY = filteredY * (1 - SENSOR_LPF) + ay * SENSOR_LPF;

    let roll = Math.atan2(filteredX, filteredY) * 180 / Math.PI;
    if (isNaN(roll)) return;

    let orientation = screen.orientation?.angle ?? window.orientation ?? 0;
    const timestamp = event.timeStamp || performance.now();
    
    applyRoll(-roll + orientation, timestamp);
}

function handleOrientation(event) {
    if (hasValidMotionData) return;
    if (event.beta === null || event.gamma === null) return;

    const b = (event.beta || 0) * Math.PI / 180;
    const g = (event.gamma || 0) * Math.PI / 180;

    const x = Math.sin(g) * Math.cos(b);
    const y = Math.sin(b);

    let roll = Math.atan2(x, y) * 180 / Math.PI;
    if (isNaN(roll)) return;

    let orientation = screen.orientation?.angle ?? window.orientation ?? 0;
    const timestamp = event.timeStamp || performance.now();

    applyRoll(-roll + orientation, timestamp);
}

function lerpAngle(start, end, amt) {
    let diff = end - start;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return start + diff * amt;
}
