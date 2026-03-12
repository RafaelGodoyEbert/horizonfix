// ============================================================
// sensors.js — Rotation Math (v3.3)
// ============================================================

let hasValidMotionData = false;
let filteredX = 0;
let filteredY = 0;
const LPF_FACTOR = 0.15; 

function handleMotion(event) {
    if (event.accelerationIncludingGravity) {
        const ax = event.accelerationIncludingGravity.x || 0;
        const ay = event.accelerationIncludingGravity.y || 0;
        
        hasValidMotionData = true;
        
        // Low Pass Filter
        filteredX = filteredX * (1 - LPF_FACTOR) + ax * LPF_FACTOR;
        filteredY = filteredY * (1 - LPF_FACTOR) + ay * LPF_FACTOR;

        const roll = Math.atan2(filteredX, filteredY) * 180 / Math.PI;

        let orientation = 0;
        if (screen.orientation && typeof screen.orientation.angle === 'number') {
            orientation = screen.orientation.angle;
        } else if (typeof window.orientation === 'number') {
            orientation = window.orientation;
        }

        window.state.targetRoll = -roll + orientation;
    }
}

function handleOrientation(event) {
    if (hasValidMotionData) return;
    if (event.beta === null || event.gamma === null) return;

    const b = (event.beta || 0) * Math.PI / 180;
    const g = (event.gamma || 0) * Math.PI / 180;

    const x = Math.sin(g) * Math.cos(b);
    const y = Math.sin(b);

    let roll = Math.atan2(x, y) * 180 / Math.PI;
    if (isNaN(roll)) roll = 0;

    let orientation = screen.orientation && screen.orientation.angle !== undefined
        ? screen.orientation.angle
        : (window.orientation || 0);

    window.state.targetRoll = -roll + orientation;
}

function lerpAngle(start, end, amt) {
    let diff = end - start;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return start + diff * amt;
}
