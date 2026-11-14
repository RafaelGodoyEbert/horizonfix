'use strict';

window.state = {
    currentRoll: 0, targetRoll: 0, calibration: 0, angularVelocity: 0,
    isHorizonLockActive: true, steady: true, cropMode: 'fixed', smoothing: 30, sensorDelay: 55,
    zoomFactor: 1, recAspectRatio: 16 / 9, resolution: 1080, fps: 30,
    audioEnabled: true, grid: false, colorProfile: 'original',
    isShutterManual: false, isIsoManual: false, shutterValue: 83.33, isoValue: 100,
    exposure: 0, torch: false, capabilities: {}, videoDevices: [],
    currentDeviceId: null, currentStream: null, facingMode: 'environment',
    isRecording: false, recordingBusy: false, cameraBusy: false,
    started: false, demo: false, demoRoll: 0, outputBlob: null,
    sensorLastTime: 0, sensorMessage: 'Aguardando sensores', offsetX: 0, offsetY: 0,
    frameTransform: null, previewFrame: null, cameraMessage: '', fpsActual: 0
};
const video = document.getElementById('video-source');
const canvas = document.getElementById('viewfinder');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const recCanvas = document.createElement('canvas');
const recCtx = recCanvas.getContext('2d', { alpha: false, desynchronized: true });
let wakeLock = null;
let toastTimer;

function showToast(message) {
    const element = document.getElementById('toast');
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element.hidden = true; }, 5500);
}

async function acquireWakeLock() {
    if (wakeLock || !navigator.wakeLock || document.hidden) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) { /* Screen lock is optional; capture still works. */ }
}

async function releaseWakeLock() {
    const previous = wakeLock;
    wakeLock = null;
    if (previous) await previous.release().catch(() => {});
}

function cameraError(error) {
    const messages = {
        NotAllowedError: 'Acesso à câmera negado. Autorize a câmera nas permissões deste site e tente novamente.',
        SecurityError: 'Abra este app por HTTPS ou localhost para permitir câmera e sensores.',
        NotFoundError: 'Nenhuma câmera encontrada. Você pode testar o app no modo demonstração.',
        NotReadableError: 'A câmera está ocupada. Feche outro aplicativo que esteja usando a câmera e tente novamente.',
        OverconstrainedError: 'Esta câmera não aceita a configuração escolhida. Tente outra qualidade.',
        AbortError: 'A câmera foi interrompida. Tente ativá-la novamente.'
    };
    return messages[error.name] || 'Não foi possível iniciar a câmera. Verifique as permissões e tente novamente.';
}

async function activateApp(demo = false) {
    const s = window.state;
    if (s.cameraBusy || s.started) return;
    const errorElement = document.getElementById('start-error');
    errorElement.hidden = true;
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-demo').disabled = true;
    try {
        if (!demo) {
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
                throw Object.assign(new Error(), { name: 'SecurityError' });
            }
            // Both iOS permission requests originate in the same user gesture.
            await requestSensors();
            await startCamera();
        } else {
            s.demo = true;
            s.cameraMessage = 'Demonstração • imagem simulada';
            s.sensorMessage = 'Inclinação simulada';
            document.getElementById('demo-controls').hidden = false;
        }
        s.started = true;
        document.getElementById('start-overlay').hidden = true;
        startRenderLoop();
        updateUI();
        await acquireWakeLock();
    } catch (error) {
        errorElement.textContent = cameraError(error);
        errorElement.hidden = false;
    } finally {
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-demo').disabled = false;
    }
}

document.getElementById('btn-start').addEventListener('click', () => activateApp(false));
document.getElementById('btn-demo').addEventListener('click', () => activateApp(true));

document.addEventListener('visibilitychange', () => {
    const s = window.state;
    if (document.hidden) {
        if (s.isRecording) {
            stopRecording();
            showToast('A gravação foi encerrada ao sair do app. Seu vídeo está disponível para salvar.');
        }
        releaseWakeLock();
    } else if (s.started) {
        resetSensorFilter();
        acquireWakeLock();
        if (!s.demo && (!s.currentStream || s.currentStream.getVideoTracks()[0]?.readyState === 'ended')) {
            startCamera(s.currentDeviceId).catch(error => showToast(cameraError(error)));
        } else if (!s.demo) video.play().catch(() => showToast('Toque na câmera para retomar a visualização.'));
    }
});

window.addEventListener('beforeunload', event => {
    if (window.state.isRecording || window.state.recordingBusy || window.state.outputBlob) {
        event.preventDefault();
        event.returnValue = '';
    }
});
window.addEventListener('pagehide', () => {
    if (window.state.isRecording) stopRecording();
    stopRenderLoop();
    stopSensors();
    window.state.currentStream?.getTracks().forEach(track => track.stop());
    releaseWakeLock();
});
window.addEventListener('pageshow', event => {
    if (event.persisted && window.state.started) {
        startSensors();
        startRenderLoop();
        if (!window.state.demo) startCamera(window.state.currentDeviceId).catch(error => showToast(cameraError(error)));
    }
});
