'use strict';

let cameraConstraintQueue = Promise.resolve();

async function getCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    window.state.videoDevices = devices.filter(device => device.kind === 'videoinput');
    const select = document.getElementById('camera-select');
    select.replaceChildren();
    window.state.videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Câmera ${index + 1}`;
        select.appendChild(option);
    });
    select.value = window.state.currentDeviceId || '';
}

function waitForCameraFrame() {
    if (video.readyState >= 2 && video.videoWidth) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const finish = error => {
            clearTimeout(timeout);
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('error', onError);
            error ? reject(error) : resolve();
        };
        const onReady = () => finish();
        const onError = () => finish(new Error('Video playback failed'));
        const timeout = setTimeout(() => finish(Object.assign(new Error(), { name: 'AbortError' })), 12000);
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
    });
}

function describeCamera() {
    const s = window.state, track = s.currentStream?.getVideoTracks()[0];
    if (!track) return;
    const settings = track.getSettings();
    s.cameraMessage = `${settings.width || video.videoWidth} × ${settings.height || video.videoHeight} · ${Math.round(settings.frameRate || s.fps)} fps`;
}

async function openCamera(constraints) {
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
        video.srcObject = stream;
        await video.play();
        await waitForCameraFrame();
        return stream;
    } catch (error) {
        stream?.getTracks().forEach(track => track.stop());
        throw error;
    }
}

async function startCamera(deviceId = null) {
    const s = window.state;
    if (s.cameraBusy || s.isRecording || s.recordingBusy) return;
    s.cameraBusy = true;
    updateUI();
    const previousId = s.currentDeviceId;
    const hadCamera = !!s.currentStream;
    const previousDemo = s.demo;
    try {
        if (hadCamera) {
            s.currentStream.getTracks().forEach(track => track.stop());
            s.currentStream = null;
            video.srcObject = null;
            await new Promise(resolve => setTimeout(resolve, 180));
        }
        const identity = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
        let stream;
        try {
            // Request a taller sensor area to leave useful rotation margin.
            stream = await openCamera({ ...identity, width: { ideal: Math.round(s.resolution * 4 / 3) }, height: { ideal: s.resolution }, frameRate: { ideal: s.fps } });
        } catch (error) {
            if (!['OverconstrainedError', 'NotReadableError', 'AbortError'].includes(error.name)) throw error;
            stream = await openCamera(identity);
        }
        s.currentStream = stream;
        const track = stream.getVideoTracks()[0], settings = track.getSettings();
        s.currentDeviceId = settings.deviceId || deviceId;
        s.facingMode = settings.facingMode || (/front|frontal|user|face/i.test(track.label) ? 'user' : 'environment');
        s.capabilities = track.getCapabilities?.() || {};
        s.demo = false;
        s.torch = false;
        s.isShutterManual = s.isIsoManual = false;
        resetFocus();
        resetSensorFilter();
        describeCamera();
        await getCameras().catch(() => showToast('Não foi possível listar as outras câmeras.'));
        configureCameraControls();
        await applyManualSettings();
        track.addEventListener('ended', () => {
            if (s.currentStream !== stream || s.cameraBusy) return;
            if (s.isRecording) stopRecording();
            showToast('A câmera foi desconectada. Escolha outra câmera ou tente novamente.');
            s.cameraMessage = 'Câmera desconectada';
            updateUI();
        });
    } catch (error) {
        // Preserve a usable view if a physical lens refuses to open.
        if (hadCamera && previousId) {
            try {
                s.currentStream = await openCamera({ deviceId: { exact: previousId } });
                s.currentDeviceId = previousId;
                s.capabilities = s.currentStream.getVideoTracks()[0].getCapabilities?.() || {};
                describeCamera();
                configureCameraControls();
                showToast('A câmera selecionada não abriu. A câmera anterior foi restaurada.');
            } catch (_) {
                s.currentStream = null;
                s.cameraMessage = 'Câmera indisponível';
            }
        }
        s.demo = previousDemo;
        throw error;
    } finally {
        s.cameraBusy = false;
        updateUI();
    }
}

function configureCameraControls() {
    const s = window.state, caps = s.demo ? {} : s.capabilities;
    const settings = s.currentStream?.getVideoTracks()[0]?.getSettings() || {};
    const manual = caps.exposureMode?.includes('manual');
    const range = (property, sliderId, groupId, available = true) => {
        const bounds = caps[property], slider = document.getElementById(sliderId);
        const supported = available && Number.isFinite(bounds?.min) && Number.isFinite(bounds?.max) && bounds.max > bounds.min;
        document.getElementById(groupId).hidden = !supported;
        slider.dataset.supported = String(supported);
        if (supported) {
            slider.min = bounds.min; slider.max = bounds.max; slider.step = bounds.step || 'any';
            slider.value = HorizonMath.clamp(settings[property] ?? (bounds.min + bounds.max) / 2, bounds.min, bounds.max);
        }
    };
    range('exposureCompensation', 'exposure-slider', 'exposure-control');
    range('iso', 'iso-slider', 'iso-control', manual);
    range('exposureTime', 'shutter-slider', 'shutter-control', manual);
    s.exposure = Number(document.getElementById('exposure-slider').value);
    s.isoValue = Number(document.getElementById('iso-slider').value);
    s.shutterValue = Number(document.getElementById('shutter-slider').value);
    document.getElementById('iso-toggle').checked = false;
    document.getElementById('shutter-toggle').checked = false;
    // There is no standard browser control for optical stabilization.
    document.getElementById('ois-toggle').disabled = true;
    document.getElementById('ois-toggle').checked = false;
    document.getElementById('ois-note').textContent = 'O navegador não expõe controle de OIS. A câmera pode gerenciá-lo automaticamente.';
}

function applyManualSettings() {
    const s = window.state;
    const track = s.currentStream?.getVideoTracks()[0];
    if (!track || s.demo) return Promise.resolve();
    const caps = s.capabilities, desired = {};
    if (!window.focusLocked && caps.focusMode?.includes('continuous')) desired.focusMode = 'continuous';
    if (caps.whiteBalanceMode?.includes('continuous')) desired.whiteBalanceMode = 'continuous';
    if ((s.isIsoManual || s.isShutterManual) && caps.exposureMode?.includes('manual')) {
        desired.exposureMode = 'manual';
        if (s.isIsoManual && caps.iso) desired.iso = s.isoValue;
        if (s.isShutterManual && caps.exposureTime) desired.exposureTime = s.shutterValue;
    } else if (caps.exposureMode?.includes('continuous')) desired.exposureMode = 'continuous';
    if (caps.exposureCompensation) desired.exposureCompensation = s.exposure;
    if (!Object.keys(desired).length) return Promise.resolve();
    cameraConstraintQueue = cameraConstraintQueue.catch(() => {}).then(async () => {
        if (track.readyState !== 'live' || s.currentStream?.getVideoTracks()[0] !== track) return;
        try {
            await track.applyConstraints({ advanced: [desired] });
        } catch (_) {
            showToast('A câmera não aceitou este ajuste. Tente outro valor ou o modo automático.');
        }
    });
    return cameraConstraintQueue;
}

async function toggleTorch() {
    const s = window.state, track = s.currentStream?.getVideoTracks()[0];
    if (!track || !s.capabilities.torch || s.demo) return;
    const enabled = !s.torch;
    try {
        await track.applyConstraints({ advanced: [{ torch: enabled }] });
        s.torch = track.getSettings().torch ?? enabled;
    } catch (_) {
        showToast('A lanterna não está disponível nesta câmera.');
    }
    updateUI();
}
