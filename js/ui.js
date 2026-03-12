// ============================================================
// ui.js — Event listeners for UI controls (sliders, toggles)
// ============================================================

// UI Listeners
horizonToggle.addEventListener('change', (e) => {
    isHorizonLockActive = e.target.checked;
});

zoomSlider.addEventListener('input', (e) => {
    zoomFactor = parseFloat(e.target.value);
    zoomVal.innerText = zoomFactor.toFixed(1) + 'x';
});

document.getElementById('ois-toggle').addEventListener('change', (e) => {
    isOisLockActive = e.target.checked;
    // Restart camera to apply or remove hardware constraints immediately
    if (currentDeviceId) {
        startCamera(currentDeviceId);
    } else if (videoDevices.length > 0) {
        startCamera(videoDevices[0].deviceId);
    }
});

settingsToggle.addEventListener('click', () => {
    controlsPanel.classList.toggle('expanded');
    settingsToggle.style.borderColor = controlsPanel.classList.contains('expanded') ? 'var(--primary)' : 'transparent';
});

// Shutter Speed Control
shutterToggle.addEventListener('change', (e) => {
    isShutterManual = e.target.checked;
    shutterSlider.disabled = !isShutterManual;
    if (!isShutterManual) {
        shutterVal.innerText = 'Auto';
    } else {
        shutterVal.innerText = shutterValue;
    }
    if (typeof applyManualSettings === 'function') applyManualSettings();
});

shutterSlider.addEventListener('input', (e) => {
    shutterValue = parseInt(e.target.value);
    shutterVal.innerText = shutterValue;
    if (isShutterManual && typeof applyManualSettings === 'function') applyManualSettings();
});

// ISO Control
isoToggle.addEventListener('change', (e) => {
    isIsoManual = e.target.checked;
    isoSlider.disabled = !isIsoManual;
    if (!isIsoManual) {
        isoVal.innerText = 'Auto';
    } else {
        isoVal.innerText = isoValue;
    }
    if (typeof applyManualSettings === 'function') applyManualSettings();
});

isoSlider.addEventListener('input', (e) => {
    isoValue = parseInt(e.target.value);
    isoVal.innerText = isoValue;
    if (isIsoManual && typeof applyManualSettings === 'function') applyManualSettings();
});
const btnAspectToggle = document.getElementById('btn-aspect-toggle');
const aspectLabel = document.getElementById('aspect-label');
const aspectIcon = document.getElementById('aspect-icon');

btnAspectToggle.addEventListener('click', () => {
    if (recAspectRatio > 1) {
        // Switch to 9:16
        recAspectRatio = 9 / 16;
        aspectLabel.innerText = "9:16";
        aspectIcon.style.width = "8px";
        aspectIcon.style.height = "12px";
    } else {
        // Switch to 16:9
        recAspectRatio = 16 / 9;
        aspectLabel.innerText = "16:9";
        aspectIcon.style.width = "12px";
        aspectIcon.style.height = "8px";
    }
    
    // Update recording canvas if it was already prepared (optional, startRecording handles it)
    if (isRecording) {
        // We don't change mid-recording for stability, user must stop and start.
    }
});
