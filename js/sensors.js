// ============================================================
// sensors.js — Device orientation handling and angle math
// ============================================================

// Process sensor data — gravity projection for screen roll
// atan2(sin(g)*cos(b), sin(b)) extracts the exact roll angle
// from deviceorientation beta/gamma values at any phone position.
function handleOrientation(event) {
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
