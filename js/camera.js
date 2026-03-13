// ============================================================
// camera.js — Lens detection & Square Sensor Constraints (v3.5)
// ============================================================

/**
 * WHY SQUARE SENSOR:
 * We need the camera to deliver a square (or as-square-as-possible) frame
 * so that when we rotate the video by any angle, we NEVER see black edges
 * outside the inscribed circle. The renderer uses min(W,H)/2 as the safe
 * radius regardless of what the browser actually delivers.
 */

async function getCameras() {
    try {
        // Request permission first with minimal constraints
        let tempStream;
        try {
            tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
            try { tempStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            catch (e2) { console.error("Camera permission denied", e2); return; }
        }

        // Wait for device list to populate after permission grant
        await new Promise(r => setTimeout(r, 700));
        let devices = await navigator.mediaDevices.enumerateDevices();

        if (tempStream) tempStream.getTracks().forEach(t => t.stop());
        await new Promise(r => setTimeout(r, 400));

        devices = await navigator.mediaDevices.enumerateDevices();

        // Prefer back cameras
        let backCameras = devices.filter(d =>
            d.kind === 'videoinput' && (
                d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('traseira') ||
                d.label.toLowerCase().includes('environment') ||
                d.label.toLowerCase().includes('0')
            )
        );
        if (backCameras.length === 0) backCameras = devices.filter(d => d.kind === 'videoinput');
        backCameras = backCameras.filter(d => d.deviceId && d.deviceId.trim() !== '');

        window.state.videoDevices = backCameras.map((device, index) => {
            let friendlyName = `Cam ${index + 1}`;
            let type = 'standard';
            const label = device.label.toLowerCase();
            if (label.includes('ultrawide') || label.includes('0.5') || label.includes('0.6')) {
                friendlyName = '0.5x'; type = 'ultrawide';
            } else if (label.includes('tele') || label.includes('3.0')) {
                friendlyName = '3x'; type = 'telephoto';
            } else if (label.includes('wide') || label.includes('standard')) {
                friendlyName = '1x'; type = 'wide';
            }
            return { ...device, friendlyName, type, rawLabel: label };
        });

        // Flip button cycles through cameras
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
        console.error('getCameras error:', err);
    }
}

async function startCamera(deviceId = null) {
    // Stop previous stream
    if (window.state.currentStream) {
        window.state.currentStream.getTracks().forEach(t => t.stop());
        window.state.currentStream = null;
        await new Promise(r => setTimeout(r, 400));
    }

    if (!deviceId && window.state.videoDevices.length > 0) {
        deviceId = window.state.videoDevices.find(d => d.type === 'wide')?.deviceId
            || window.state.videoDevices[0].deviceId;
    }
    window.state.currentDeviceId = deviceId;

    // ── SQUARE SENSOR CONSTRAINT CHAIN ──────────────────────────────────────
    // Attempt 1: Perfect square 1080x1080 @ 60fps
    // Attempt 2: Square 1080x1080 @ 30fps
    // Attempt 3: Largest square the device supports (no size hint)
    // Attempt 4: Any video (renderer handles it with inscribed-circle math)
    // ────────────────────────────────────────────────────────────────────────

    const baseConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'environment' };

    const attempts = [
        // Try square at 60fps
        { ...baseConstraints, width: { ideal: 1080 }, height: { ideal: 1080 }, aspectRatio: { exact: 1.0 }, frameRate: { ideal: 60 } },
        // Try square at 30fps
        { ...baseConstraints, width: { ideal: 1080 }, height: { ideal: 1080 }, aspectRatio: { exact: 1.0 }, frameRate: { ideal: 30 } },
        // Square without exact aspect ratio
        { ...baseConstraints, width: { ideal: 1080 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        // Any square-ish
        { ...baseConstraints, width: { ideal: 1080 }, height: { ideal: 1080 } },
        // Pure fallback
        { ...baseConstraints }
    ];

    let stream = null;
    let usedAttempt = -1;

    for (let i = 0; i < attempts.length; i++) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: attempts[i], audio: false });
            usedAttempt = i;
            break;
        } catch (err) {
            console.warn(`Camera attempt ${i + 1} failed:`, err.name);
        }
    }

    if (!stream) {
        // Absolute last resort
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            usedAttempt = 99;
        } catch (err) {
            console.error('All camera attempts failed:', err);
            camDebugInfo.innerHTML = 'ERRO: Câmera não disponível';
            return;
        }
    }

    window.state.currentStream = stream;
    video.srcObject = stream;
    sensorDot.classList.add('active');

    video.onloadedmetadata = async () => {
        await video.play();
        const settings = stream.getVideoTracks()[0].getSettings();
        const isSquare = Math.abs(settings.width - settings.height) < 20;
        camDebugInfo.innerHTML =
            `Sensor: ${settings.width}x${settings.height} @ ${Math.round(settings.frameRate || 0)}fps` +
            ` [A${usedAttempt + 1}]${isSquare ? ' ✓SQ' : ' ⚠ non-sq'}`;

        // Invalidate renderer cache to pick up new sensor dimensions
        if (typeof _stableCache !== 'undefined') _stableCache = null;

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
            advanced.exposureTime = Math.min(
                Math.max(window.state.shutterValue, capabilities.exposureTime.min),
                capabilities.exposureTime.max
            );
        }
        if (window.state.isIsoManual && capabilities.iso) {
            advanced.exposureMode = 'manual';
            advanced.iso = Math.min(
                Math.max(window.state.isoValue, capabilities.iso.min),
                capabilities.iso.max
            );
        }

        if (Object.keys(advanced).length > 0) {
            await track.applyConstraints({ advanced: [advanced] });
        }
    } catch (e) {
        console.warn('applyManualSettings error:', e);
    }
}
