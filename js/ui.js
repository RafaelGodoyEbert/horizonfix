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
