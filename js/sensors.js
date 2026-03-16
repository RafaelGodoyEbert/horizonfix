// ============================================================
// sensors.js — Device orientation handling and angle math
// ============================================================

let hasValidMotionData = false;

// Process sensor data using DeviceMotion (Acceleration with Gravity)
// This avoids the Gimbal Lock that occurs at beta=90 with Euler angles.
function handleMotion(event) {
    if (event.accelerationIncludingGravity) {
        const ax = event.accelerationIncludingGravity.x;
        const ay = event.accelerationIncludingGravity.y;
        
        if (ax !== null && ay !== null) {
            hasValidMotionData = true;
            sensorEventCount++;
            lastBeta = ax; // Reusing debug variables to show raw G force
            lastGamma = ay;

            // Compute roll directly from gravity vector components on the screen plane
            // atan2(ax, ay) is the gold standard for roll in landscape/portrait
            let roll = Math.atan2(ax, ay) * 180 / Math.PI;
            if (isNaN(roll)) roll = 0;

            // Normalize roll to 0-360
            if (roll < 0) roll += 360;

            let orientation = screen.orientation && screen.orientation.angle !== undefined
                ? screen.orientation.angle
                : (window.orientation || 0);
            
            // Adjust for device orientation offset
            targetRoll = -(roll - orientation);
        }
    }
}

// Fallback: Process sensor data using DeviceOrientation Euler angles
// atan2(sin(g)*cos(b), sin(b)) extracts the exact roll angle
// from deviceorientation beta/gamma values at any phone position.
function handleOrientation(event) {
    if (hasValidMotionData) return; // Prioritize devicemotion!
    
    if (event.beta === null || event.gamma === null) return;

    sensorEventCount++;
    const beta = Number(event.beta) || 0;
    const gamma = Number(event.gamma) || 0;
    lastBeta = beta;
    lastGamma = gamma;

    const b = beta * Math.PI / 180;
    const g = gamma * Math.PI / 180;

    // Gravity vector projected onto screen plane
    const x = Math.sin(g) * Math.cos(b);
    const y = Math.sin(b);

    let roll = Math.atan2(x, y) * 180 / Math.PI;
    if (isNaN(roll)) roll = 0;

    let orientation = screen.orientation && screen.orientation.angle !== undefined
        ? screen.orientation.angle
        : (window.orientation || 0);
    if (isNaN(orientation)) orientation = 0;

    targetRoll = -(roll - orientation);
}

// Handle 360 wrap around for smooth lerp so it doesn't spin wildly
function lerpAngle(start, end, amt) {
    // Find shortest angular distance!
    let diff = end - start;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return start + diff * amt;
}
