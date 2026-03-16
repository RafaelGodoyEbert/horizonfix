// ============================================================
// ui.js — Event listeners for UI controls (sliders, toggles)
// ============================================================

// UI Listeners
horizonToggle.addEventListener('change', (e) => {
    isHorizonLockActive = e.target.checked;
    if (isHorizonLockActive) {
        leveler.style.display = 'flex';
    } else {
        leveler.style.display = 'none';
    }
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
