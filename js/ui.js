// ============================================================
// ui.js — Event listeners for UI controls (v3.0)
// ============================================================

// Initialize window-level variable for renderer visibility
window.recAspectRatio = 16/9;

horizonToggle.addEventListener('change', (e) => {
    isHorizonLockActive = e.target.checked;
});

zoomSlider.addEventListener('input', (e) => {
    zoomFactor = parseFloat(e.target.value);
    zoomVal.innerText = zoomFactor.toFixed(1) + 'x';
});

document.getElementById('ois-toggle').addEventListener('change', (e) => {
    isOisLockActive = e.target.checked;
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

// Aspect Ratio Toggle (Bulletproof)
const btnAspectToggle = document.getElementById('btn-aspect-toggle');
const aspectLabel = document.getElementById('aspect-label');
const aspectIcon = document.getElementById('aspect-icon');

if (btnAspectToggle) {
    btnAspectToggle.addEventListener('click', () => {
        if (window.recAspectRatio > 1) {
            // Switch to 9:16 (Portrait)
            window.recAspectRatio = 9 / 16;
            aspectLabel.innerText = "9:16";
            aspectIcon.style.width = "8px";
            aspectIcon.style.height = "12px";
        } else {
            // Switch to 16:9 (Landscape)
            window.recAspectRatio = 16 / 9;
            aspectLabel.innerText = "16:9";
            aspectIcon.style.width = "12px";
            aspectIcon.style.height = "8px";
        }
        // Forces UI badge to update visually for reinforcement
        console.log("Aspect Ratio Changed:", window.recAspectRatio);
    });
}

// Shutter
shutterToggle.addEventListener('change', (e) => {
    isShutterManual = e.target.checked;
    shutterSlider.disabled = !isShutterManual;
    shutterVal.innerText = isShutterManual ? shutterValue : 'Auto';
    if (typeof applyManualSettings === 'function') applyManualSettings();
});

shutterSlider.addEventListener('input', (e) => {
    shutterValue = parseInt(e.target.value);
    shutterVal.innerText = shutterValue;
    if (isShutterManual && typeof applyManualSettings === 'function') applyManualSettings();
});

// ISO
isoToggle.addEventListener('change', (e) => {
    isIsoManual = e.target.checked;
    isoSlider.disabled = !isIsoManual;
    isoVal.innerText = isIsoManual ? isoValue : 'Auto';
    if (typeof applyManualSettings === 'function') applyManualSettings();
});

isoSlider.addEventListener('input', (e) => {
    isoValue = parseInt(e.target.value);
    isoVal.innerText = isoValue;
    if (isIsoManual && typeof applyManualSettings === 'function') applyManualSettings();
});
