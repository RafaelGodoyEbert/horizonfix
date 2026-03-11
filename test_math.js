// Script to test gyro deviceorientation to roll math
function computeRoll(beta, gamma) {
    const b = beta * Math.PI / 180;
    const g = gamma * Math.PI / 180;
    const x = Math.sin(g) * Math.cos(b);
    const y = Math.sin(b);
    return Math.atan2(x, y) * 180 / Math.PI;
}

// What if phone is held normally (tilted slightly back, e.g. beta = 70) 
// and we roll it by 45 degrees?
// Does beta stay 70 and gamma become 45?
// Actually, Euler angles are tricky. If you roll a pitched phone,
// BOTH beta and gamma change!
