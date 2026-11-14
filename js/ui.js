'use strict';

const element = id => document.getElementById(id);

function updateUI() {
    const s = window.state, locked = s.isRecording || s.recordingBusy || s.cameraBusy;
    document.querySelectorAll('[data-lock-recording]').forEach(control => { control.disabled = locked; });
    element('btn-record').disabled = s.recordingBusy || s.cameraBusy || !s.started || (!s.demo && s.currentStream?.getVideoTracks()[0]?.readyState !== 'live') || !window.MediaRecorder || !recCanvas.captureStream;
    element('btn-flip-camera').disabled = locked || s.demo || s.videoDevices.length < 2;
    element('camera-select').disabled = locked || s.demo || !s.videoDevices.length;
    element('camera-select').value = s.currentDeviceId || '';
    element('btn-torch').disabled = s.cameraBusy || s.demo || !s.capabilities.torch;
    element('btn-torch').setAttribute('aria-pressed', String(s.torch));
    element('ois-toggle').disabled = true;
    element('btn-calibrate').disabled = locked || !s.started;
    element('iso-slider').disabled = !s.isIsoManual || !s.capabilities.iso || s.cameraBusy;
    element('shutter-slider').disabled = !s.isShutterManual || !s.capabilities.exposureTime || s.cameraBusy;
    element('exposure-slider').disabled = s.isIsoManual || s.isShutterManual || s.cameraBusy;
    element('zoom-val').textContent = `${s.zoomFactor.toFixed(1)}×`;
    element('smoothing-val').textContent = `${s.smoothing}%`;
    element('delay-val').textContent = `${s.sensorDelay} ms`;
    element('exposure-val').textContent = `${s.exposure > 0 ? '+' : ''}${s.exposure.toFixed(1)} EV`;
    element('iso-val').textContent = s.isIsoManual ? Math.round(s.isoValue) : 'Auto';
    element('shutter-val').textContent = s.isShutterManual ? `1/${Math.max(1, Math.round(10000 / s.shutterValue))} s` : 'Auto';
    element('aspect-label').textContent = s.recAspectRatio === 1 ? '1:1' : s.recAspectRatio > 1 ? '16:9' : '9:16';
    element('demo-controls').hidden = !s.demo;
    element('btn-use-camera')?.toggleAttribute('disabled', locked);
    element('btn-fullscreen').hidden = !document.documentElement.requestFullscreen;
    element('camera-status').textContent = s.cameraBusy ? 'Abrindo câmera…' : s.cameraMessage || 'Câmera ainda não ativada';
    element('sensor-status').textContent = s.demo ? 'Inclinação simulada' : s.sensorMessage;
}

function setPanel(open) {
    element('controls-panel').hidden = !open;
    element('settings-toggle').setAttribute('aria-expanded', String(open));
    if (open) element('btn-close-settings').focus();
    else element('settings-toggle').focus();
}
element('settings-toggle').addEventListener('click', () => setPanel(element('controls-panel').hidden));
element('btn-close-settings').addEventListener('click', () => setPanel(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !element('controls-panel').hidden) setPanel(false); });

element('btn-aspect-toggle').addEventListener('click', () => {
    const s = window.state;
    if (s.isRecording || s.recordingBusy) return;
    s.recAspectRatio = s.recAspectRatio > 1 ? 9 / 16 : s.recAspectRatio < 1 ? 1 : 16 / 9;
    resetFocus(); updateUI();
});
element('btn-flip-camera').addEventListener('click', async () => {
    const s = window.state, index = s.videoDevices.findIndex(device => device.deviceId === s.currentDeviceId);
    const next = s.videoDevices[(index + 1) % s.videoDevices.length];
    if (next) await startCamera(next.deviceId).catch(error => showToast(cameraError(error)));
});
element('camera-select').addEventListener('change', event => {
    startCamera(event.target.value).catch(error => showToast(cameraError(error)));
});
element('btn-torch').addEventListener('click', toggleTorch);
element('btn-calibrate').addEventListener('click', calibrateHorizon);

const checkboxes = { 'horizon-toggle': 'isHorizonLockActive', 'steady-toggle': 'steady', 'audio-toggle': 'audioEnabled', 'grid-toggle': 'grid', 'iso-toggle': 'isIsoManual', 'shutter-toggle': 'isShutterManual' };
for (const [id, key] of Object.entries(checkboxes)) {
    element(id).addEventListener('change', event => {
        window.state[key] = event.target.checked;
        if (id === 'steady-toggle') resetSensorFilter();
        if (id === 'iso-toggle' || id === 'shutter-toggle') applyManualSettings();
        updateUI();
    });
}
const ranges = { 'zoom-slider': 'zoomFactor', 'smoothing-slider': 'smoothing', 'delay-slider': 'sensorDelay', 'exposure-slider': 'exposure', 'iso-slider': 'isoValue', 'shutter-slider': 'shutterValue', 'demo-roll': 'demoRoll' };
for (const [id, key] of Object.entries(ranges)) {
    element(id).addEventListener('input', event => {
        window.state[key] = Number(event.target.value);
        if (id === 'demo-roll') element('demo-roll-val').textContent = `${event.target.value}°`;
        if (['exposure-slider', 'iso-slider', 'shutter-slider'].includes(id)) applyManualSettings();
        updateUI();
    });
}
element('crop-mode').addEventListener('change', event => { window.state.cropMode = event.target.value; });
element('color-profile').addEventListener('change', event => { window.state.colorProfile = event.target.value; });
for (const [id, key] of [['resolution-select', 'resolution'], ['fps-select', 'fps']]) {
    element(id).addEventListener('change', async event => {
        window.state[key] = Number(event.target.value);
        if (window.state.started && !window.state.demo) {
            await startCamera(window.state.currentDeviceId).catch(error => showToast(cameraError(error)));
        }
        updateUI();
    });
}
element('btn-use-camera')?.addEventListener('click', async () => {
    try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'SecurityError' });
        await requestSensors();
        await startCamera();
        stopRenderLoop(); startRenderLoop();
        updateUI();
    } catch (error) { showToast(cameraError(error)); }
});
element('btn-fullscreen').addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
    } catch (_) { showToast('Tela cheia indisponível neste navegador.'); }
});

navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    if (window.state.started && !window.state.demo) getCameras().then(updateUI).catch(() => {});
});
configureCameraControls();
updateUI();
