// ============================================================
// camera.js — Lens detection & Strict Sensor Constraints (v3.4)
// ============================================================

async function getCameras() {
    try {
        let tempStream;
        try {
            tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
            try { tempStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            catch (e2) { console.error("Total permission failure", e2); return; }
        }

        await new Promise(r => setTimeout(r, 600));
        let devices = await navigator.mediaDevices.enumerateDevices();

        if (tempStream) {
            tempStream.getTracks().forEach(track => track.stop());
        }

        await new Promise(r => setTimeout(r, 500));
        devices = await navigator.mediaDevices.enumerateDevices();

        let backCameras = devices.filter(device => device.kind === 'videoinput' && (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('traseira') || device.label.toLowerCase().includes('environment') || device.label.toLowerCase().includes('0')));
        if (backCameras.length === 0) backCameras = devices.filter(device => device.kind === 'videoinput');
        backCameras = backCameras.filter(device => device.deviceId && device.deviceId.trim() !== '');

        window.state.videoDevices = backCameras.map((device, index) => {
            let friendlyName = `Cam ${index + 1}`;
            let type = "standard";
            const label = device.label.toLowerCase();
            if (label.includes('ultrawide') || label.includes('0.5') || label.includes('0.6')) {
                friendlyName = "0.5x"; type = "ultrawide";
            } else if (label.includes('tele') || label.includes('3.0')) {
                friendlyName = "3x"; type = "telephoto";
            } else if (label.includes('wide') || label.includes('standard')) {
                friendlyName = "1x"; type = "wide";
            }
            return { ...device, friendlyName, type, rawLabel: label };
        });

        // Link Flip Button
        btnFlipCamera.onclick = () => {
            const v = window.state;
            if (v.videoDevices.length > 1) {
                const currentIdx = v.videoDevices.findIndex(d => d.deviceId === v.currentDeviceId);
                const nextIdx = (currentIdx + 1) % v.videoDevices.length;
                v.currentDeviceId = v.videoDevices[nextIdx].deviceId;
                startCamera(v.currentDeviceId);
            }
        };

        if (window.state.videoDevices.length > 0) {
            window.state.currentDeviceId = window.state.videoDevices[0].deviceId;
        }

    } catch (err) {
        console.error("Error accessing media devices.", err);
    }
}

async function startCamera(deviceId = null) {
    if (window.state.currentStream) {
        window.state.currentStream.getTracks().forEach(track => track.stop());
        await new Promise(r => setTimeout(r, 400));
    }

    if (!deviceId && window.state.videoDevices.length > 0) {
        deviceId = window.state.videoDevices.find(d => d.type === 'wide')?.deviceId || window.state.videoDevices[0].deviceId;
    }
    window.state.currentDeviceId = deviceId;

    // --- AGGRESSIVE SQUARE SENSOR CONSTRAINTS ---
    // Requesting 1:1 ratio explicitly to ensure maximum rotation padding.
    // If the browser ignores this, we handle it in renderToCtx.
    let videoConstraints = {
        aspectRatio: { ideal: 1.0 },
        width: { ideal: 2160 },
        height: { ideal: 2160 },
        frameRate: { ideal: 60 }
    };

    if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
    } else {
        videoConstraints.facingMode = "environment";
    }

    const constraints = { video: videoConstraints, audio: false };

    try {
        window.state.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        console.warn("Square constraints rejected, trying balanced 4:3 fallback", err);
        try {
            videoConstraints.aspectRatio = { ideal: 1.333 };
            window.state.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            videoConstraints = { facingMode: "environment" };
            window.state.currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
    }

    video.srcObject = window.state.currentStream;
    sensorDot.classList.add('active');

    video.onloadedmetadata = () => {
        video.play();
        const settings = window.state.currentStream.getVideoTracks()[0].getSettings();
        camDebugInfo.innerHTML = `Qualidade: ${settings.width}x${settings.height} @ ${Math.round(settings.frameRate)}fps`;
        applyManualSettings();
    };
}

async function applyManualSettings() {
    if (!window.state.currentStream) return;
    try {
        const track = window.state.currentStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const advanced = {};
        
        if (capabilities.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
        if (capabilities.whiteBalanceMode?.includes('continuous')) advanced.whiteBalanceMode = 'continuous';
        
        if (window.state.isShutterManual && capabilities.exposureTime) {
            advanced.exposureMode = 'manual';
            advanced.exposureTime = Math.min(Math.max(window.state.shutterValue, capabilities.exposureTime.min), capabilities.exposureTime.max);
        }
        if (window.state.isIsoManual && capabilities.iso) {
            advanced.exposureMode = 'manual';
            advanced.iso = Math.min(Math.max(window.state.isoValue, capabilities.iso.min), capabilities.iso.max);
        }

        await track.applyConstraints({ advanced: [advanced] });
    } catch (e) { console.warn("Caps error", e); }
}
