'use strict';

const sensorHistory = [];
let sensorsAttached = false;
let orientationLastTime = -Infinity;
let motionLastTime = 0;
let filterLastTime = 0;
let rawRoll = 0;
let gimbalX = 0, gimbalY = 0, gimbalVX = 0, gimbalVY = 0;
let desiredX = 0, desiredY = 0;

const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;

async function requestSensors() {
    const types = [window.DeviceOrientationEvent, window.DeviceMotionEvent];
    const requests = types.map(type => {
        try { return typeof type?.requestPermission === 'function' ? type.requestPermission() : Promise.resolve('granted'); }
        catch (_) { return Promise.resolve('denied'); }
    });
    const results = await Promise.allSettled(requests);
    if (results.some(result => result.status === 'rejected' || result.value === 'denied')) {
        showToast('Sensores não autorizados. A câmera funciona; ative movimento e orientação nas permissões para nivelar.');
    }
    startSensors();
}

function startSensors() {
    if (sensorsAttached) return;
    sensorsAttached = true;
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);
    screen.orientation?.addEventListener('change', resetSensorFilter);
    window.addEventListener('orientationchange', resetSensorFilter);
}

function stopSensors() {
    sensorsAttached = false;
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('devicemotion', handleMotion);
    screen.orientation?.removeEventListener('change', resetSensorFilter);
    window.removeEventListener('orientationchange', resetSensorFilter);
    resetSensorFilter();
}

function resetSensorFilter() {
    sensorHistory.length = 0;
    motionLastTime = filterLastTime = 0;
    orientationLastTime = -Infinity;
    gimbalX = gimbalY = gimbalVX = gimbalVY = desiredX = desiredY = 0;
    window.state.offsetX = window.state.offsetY = 0;
}

function applyRoll(degrees, timestamp) {
    if (!Number.isFinite(degrees) || !Number.isFinite(timestamp)) return;
    const s = window.state;
    const previous = sensorHistory[sensorHistory.length - 1];
    if (previous && timestamp <= previous.t) return;
    rawRoll = degrees;
    if (previous) {
        const velocity = Math.abs(HorizonMath.angle(degrees - previous.r) / ((timestamp - previous.t) / 1000));
        s.angularVelocity += (velocity - s.angularVelocity) * 0.25;
    }
    sensorHistory.push({ t: timestamp, r: degrees });
    if (sensorHistory.length > 256) sensorHistory.shift();
    s.targetRoll = degrees;
    s.sensorLastTime = timestamp;
    s.sensorMessage = 'Horizonte ativo';
}

function handleOrientation(event) {
    if (window.state.demo) return;
    const now = performance.now();
    const roll = HorizonMath.orientationRoll(event.beta, event.gamma, screenAngle());
    if (roll === null) {
        window.state.sensorMessage = 'Aponte a câmera para frente';
        return;
    }
    orientationLastTime = now;
    applyRoll(roll, now);
}

function handleMotion(event) {
    const s = window.state;
    if (s.demo) return;
    const now = performance.now();
    const dt = motionLastTime ? (now - motionLastTime) / 1000 : 0;
    motionLastTime = now;
    // Prefer fused orientation; raw acceleration also contains hand movement.
    if (now - orientationLastTime > 500) {
        const g = event.accelerationIncludingGravity, a = event.acceleration;
        if (Number.isFinite(g?.x) && Number.isFinite(g?.y)) {
            const x = g.x - (Number.isFinite(a?.x) ? a.x : 0);
            const y = g.y - (Number.isFinite(a?.y) ? a.y : 0);
            if (Math.hypot(x, y) > 0.8) applyRoll(HorizonMath.angle(-Math.atan2(x, y) * 180 / Math.PI + screenAngle()), now);
        }
    }
    if (!s.steady || !dt || dt > 0.2) return;
    // MotionEvent rates are deg/s. Leaky integration prevents indefinite drift.
    const rate = event.rotationRate;
    const pitch = Number.isFinite(rate?.beta) ? rate.beta * Math.PI / 180 : 0;
    const yaw = Number.isFinite(rate?.gamma) ? rate.gamma * Math.PI / 180 : 0;
    const rad = (rawRoll - s.calibration) * Math.PI / 180;
    const c = Math.cos(rad), n = Math.sin(rad), decay = Math.exp(-dt / 0.25);
    desiredX = HorizonMath.clamp((desiredX + (yaw * c + pitch * n) * dt * 2) * decay, -1, 1);
    desiredY = HorizonMath.clamp((desiredY + (-pitch * c + yaw * n) * dt * 2) * decay, -1, 1);
}

function updateSensorFrame(now) {
    const s = window.state;
    const dt = filterLastTime ? Math.min(0.2, (now - filterLastTime) / 1000) : 1 / 30;
    filterLastTime = now;
    const target = s.demo ? -s.demoRoll : HorizonMath.sampleAt(sensorHistory, now - s.sensorDelay);
    const calibrated = HorizonMath.angle(target - s.calibration);
    const tau = 0.004 + (s.smoothing / 100 * 0.12) / (1 + s.angularVelocity / 100);
    if (!sensorHistory.length && !s.demo) s.currentRoll = 0;
    else s.currentRoll = HorizonMath.lerpAngle(s.currentRoll, calibrated, 1 - Math.exp(-dt / tau));
    [gimbalX, gimbalVX] = HorizonMath.spring(gimbalX, gimbalVX, desiredX, dt);
    [gimbalY, gimbalVY] = HorizonMath.spring(gimbalY, gimbalVY, desiredY, dt);
    s.offsetX = s.steady && s.isHorizonLockActive ? gimbalX : 0;
    s.offsetY = s.steady && s.isHorizonLockActive ? gimbalY : 0;
    if (!s.demo && now - s.sensorLastTime > 1500) s.sensorMessage = 'Sem sensores • câmera disponível';
}

function calibrateHorizon() {
    const s = window.state;
    if (!s.demo && performance.now() - s.sensorLastTime > 1500) {
        showToast('Nenhum sensor de orientação disponível para calibrar.');
        return;
    }
    s.calibration = s.demo ? -s.demoRoll : rawRoll;
    s.currentRoll = 0;
    resetSensorFilter();
    showToast('Horizonte centralizado. Esta posição agora é o nível de referência.');
}
