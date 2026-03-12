// ============================================================
// sensors.js — Device orientation handling and angle math (v2.8)
// ============================================================

let hasValidMotionData = false;

// Low-Pass Filter variables for accelerometer
let filteredX = 0;
let filteredY = 0;
const LPF_FACTOR = 0.15; // 0.15 = Heavy filtering, rock stable on tripod

/**
 * Process sensor data using DeviceMotion (Acceleration with Gravity)
 */
function handleMotion(event) {
    if (event.accelerationIncludingGravity) {
        const ax = event.accelerationIncludingGravity.x || 0;
        const ay = event.accelerationIncludingGravity.y || 0;
        
        hasValidMotionData = true;
        sensorEventCount++;
        
        // 1. Low Pass Filter raw data to kill electronic jitter
        filteredX = filteredX * (1 - LPF_FACTOR) + ax * LPF_FACTOR;
        filteredY = filteredY * (1 - LPF_FACTOR) + ay * LPF_FACTOR;

        // 2. Calculate Roll from filtered data
        const roll = Math.atan2(filteredX, filteredY) * 180 / Math.PI;

        // 3. UI Orientation compensation
        let orientation = 0;
        if (screen.orientation && typeof screen.orientation.angle === 'number') {
            orientation = screen.orientation.angle;
        } else if (typeof window.orientation === 'number') {
            orientation = window.orientation;
        }

        // Unified sign for stabilization
        targetRoll = -roll + orientation;
        
        lastBeta = filteredX;
        lastGamma = filteredY;
    }
}

/**
 * Fallback: Process sensor data using DeviceOrientation Euler angles
 */
function handleOrientation(event) {
    if (hasValidMotionData) return;
    
    if (event.beta === null || event.gamma === null) return;

    sensorEventCount++;
    const beta = Number(event.beta) || 0;
    const gamma = Number(event.gamma) || 0;

    const b = beta * Math.PI / 180;
    const g = gamma * Math.PI / 180;

    const x = Math.sin(g) * Math.cos(b);
    const y = Math.sin(b);

    let roll = Math.atan2(x, y) * 180 / Math.PI;
    if (isNaN(roll)) roll = 0;

    let orientation = screen.orientation && screen.orientation.angle !== undefined
        ? screen.orientation.angle
        : (window.orientation || 0);
    if (isNaN(orientation)) orientation = 0;

    targetRoll = -roll + orientation;
    
    lastBeta = beta;
    lastGamma = gamma;
}

/**
 * Handle 360 wrap around for smooth lerp
 */
function lerpAngle(start, end, amt) {
    let diff = end - start;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return start + diff * amt;
}
