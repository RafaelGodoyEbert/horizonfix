// ============================================================
// sensors.js — Device orientation handling and angle math
// ============================================================

let hasValidMotionData = false;
let hasQuaternionData = false;

// Process high-quality sensor data using AbsoluteOrientationSensor and Quaternions
function handleSensor(quaternion) {
    if (!quaternion) return;
    hasQuaternionData = true;
    sensorEventCount++;

    const [qx, qy, qz, qw] = quaternion;

    // Calculate the gravity vector from the quaternion
    // Standard formula to get the 'DOWN' vector (0,0,-1) rotated by the device quaternion
    // On Android Web, the coordinate system is:
    // X points right
    // Y points top
    // Z points towards user
    const gx = 2 * (qx * qz - qw * qy);
    const gy = 2 * (qy * qz + qw * qx);
    const gz = qw * qw - qx * qx - qy * qy + qz * qz;

    lastBeta = gx * 10; // Multiply for debug visibility
    lastGamma = gy * 10;

    // The screen roll is defined by projecting the gravity vector
    // onto the (X, Y) plane of the screen, which perfectly avoids Gimbal Lock!
    let roll = Math.atan2(gx, gy) * 180 / Math.PI;
    if (isNaN(roll)) roll = 0;

    let orientation = screen.orientation && screen.orientation.angle !== undefined
        ? screen.orientation.angle
        : (window.orientation || 0);
    if (isNaN(orientation)) orientation = 0;

    targetRoll = -(roll - orientation);
}

// Process sensor data using DeviceMotion (Acceleration with Gravity)
// This avoids the Gimbal Lock that occurs at beta=90 with Euler angles.
function handleMotion(event) {
    if (hasQuaternionData) return; // Prioritize Quaternions!

    if (event.accelerationIncludingGravity) {
        const ax = event.accelerationIncludingGravity.x;
        const ay = event.accelerationIncludingGravity.y;
        
        if (ax !== null && ay !== null) {
            hasValidMotionData = true;
            sensorEventCount++;
            lastBeta = ax; // Reusing debug variables to show raw G force
            lastGamma = ay;

            // Compute roll directly from gravity vector components on the screen plane
            // Since we want standard roll, we use atan2.
            // Depending on the device, X and Y might need swapping or negating to match the previous Euler calculation.
            // In Android Chrome: X is right, Y is top.
            let roll = Math.atan2(ax, ay) * 180 / Math.PI;
            if (isNaN(roll)) roll = 0;

            let orientation = screen.orientation && screen.orientation.angle !== undefined
                ? screen.orientation.angle
                : (window.orientation || 0);
            if (isNaN(orientation)) orientation = 0;

            targetRoll = -(roll - orientation);
        }
    }
}

// Fallback: Process sensor data using DeviceOrientation Euler angles
// atan2(sin(g)*cos(b), sin(b)) extracts the exact roll angle
// from deviceorientation beta/gamma values at any phone position.
function handleOrientation(event) {
    if (hasQuaternionData || hasValidMotionData) return; // Prioritize Quaternions / devicemotion!
    
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
