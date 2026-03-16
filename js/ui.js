// ============================================================
// ui.js — UI Listeners (v3.3)
// ============================================================

const btnAspectToggle = document.getElementById('btn-aspect-toggle');
const aspectLabel = document.getElementById('aspect-label');
const aspectIcon = document.getElementById('aspect-icon');

// Sync UI states to shared window.state
horizonToggle.addEventListener('change', (e) => {
    window.state.isHorizonLockActive = e.target.checked;
});

zoomSlider.addEventListener('input', (e) => {
    window.state.zoomFactor = parseFloat(e.target.value);
    zoomVal.innerText = window.state.zoomFactor.toFixed(1) + 'x';
});

document.getElementById('ois-toggle').addEventListener('change', (e) => {
    window.state.isOisLockActive = e.target.checked;
    if (window.state.currentDeviceId) {
        startCamera(window.state.currentDeviceId);
    }
});

settingsToggle.addEventListener('click', () => {
    controlsPanel.classList.toggle('expanded');
    settingsToggle.style.borderColor = controlsPanel.classList.contains('expanded') ? 'var(--primary)' : 'transparent';
});

// Aspect Ratio Toggle (v3.3 Fixed)
if (btnAspectToggle) {
    btnAspectToggle.addEventListener('click', () => {
        if (window.state.recAspectRatio > 1) {
            // Switch to 9:16 (Vertical)
            window.state.recAspectRatio = 9 / 16;
            aspectLabel.innerText = "9:16";
            aspectIcon.style.width = "8px";
            aspectIcon.style.height = "12px";
        } else {
            // Switch to 16:9 (Horizontal)
            window.state.recAspectRatio = 16 / 9;
            aspectLabel.innerText = "16:9";
            aspectIcon.style.width = "12px";
            aspectIcon.style.height = "8px";
        }
        // Invalidate renderer stable cache so frame recalculates immediately
        if (typeof _stableCache !== 'undefined') { _stableCache = null; }
        console.log("UI: Aspect switch to", window.state.recAspectRatio);
    });
}

// Manual Camera Controls Sync
shutterToggle.addEventListener('change', (e) => {
    window.state.isShutterManual = e.target.checked;
    shutterSlider.disabled = !window.state.isShutterManual;
    shutterVal.innerText = window.state.isShutterManual ? window.state.shutterValue : 'Auto';
    if (typeof applyManualSettings === 'function') applyManualSettings();
});

shutterSlider.addEventListener('input', (e) => {
    window.state.shutterValue = parseInt(e.target.value);
    shutterVal.innerText = window.state.shutterValue;
    if (window.state.isShutterManual && typeof applyManualSettings === 'function') applyManualSettings();
});

isoToggle.addEventListener('change', (e) => {
    window.state.isIsoManual = e.target.checked;
    isoSlider.disabled = !window.state.isIsoManual;
    isoVal.innerText = window.state.isIsoManual ? window.state.isoValue : 'Auto';
    if (typeof applyManualSettings === 'function') applyManualSettings();
});

isoSlider.addEventListener('input', (e) => {
    window.state.isoValue = parseInt(e.target.value);
    isoVal.innerText = window.state.isoValue;
    if (window.state.isIsoManual && typeof applyManualSettings === 'function') applyManualSettings();
});
