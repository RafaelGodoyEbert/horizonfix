// ============================================================
// camera.js — Camera (v3.5 — Native 4:3 Sensor)
// ============================================================

/**
 * CONCEITO CORRETO (como a Samsung faz):
 *
 *  [Sensor físico 4:3]
 *       ↓
 *  Círculo inscrito no 4:3  (raio = altura/2, pois altura é o lado menor)
 *       ↓
 *  Maior 16:9 que cabe DENTRO desse círculo  ← esse é o frame de output
 *       ↓
 *  Girar o sensor virtualmente = nunca sai do círculo = zero fita preta
 *
 * Portanto: NÃO pedimos sensor quadrado.
 * Pedimos a MÁXIMA RESOLUÇÃO 4:3 que o dispositivo suporta.
 * O renderer.js usa min(W,H)/2 como raio — correto para 4:3.
 */

async function getCameras() {
    try {
        // Pede permissão com constraint mínima
        let tempStream;
        try {
            tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
            try { tempStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            catch (e2) { console.error('Permissão de câmera negada', e2); return; }
        }

        await new Promise(r => setTimeout(r, 700));
        let devices = await navigator.mediaDevices.enumerateDevices();

        if (tempStream) tempStream.getTracks().forEach(t => t.stop());
        await new Promise(r => setTimeout(r, 400));

        devices = await navigator.mediaDevices.enumerateDevices();

        // Prefere câmeras traseiras
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

    const baseId = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'environment' };

    // ── CADEIA DE CONSTRAINTS ─────────────────────────────────────────────
    // Sempre pedimos 4:3 nativo — que é o formato físico real do sensor.
    // Alta resolução = círculo inscrito maior = mais espaço pro 16:9 rotacionado.
    // NUNCA pedimos quadrado: isso força o browser a fazer crop/scale desnecessário.
    // ─────────────────────────────────────────────────────────────────────
    const attempts = [
        // Melhor caso: 4:3 em alta res + 60fps
        { ...baseId, width: { ideal: 3840 }, height: { ideal: 2880 }, aspectRatio: { ideal: 4/3 }, frameRate: { ideal: 60 } },
        // 4:3 full HD
        { ...baseId, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4/3 }, frameRate: { ideal: 60 } },
        // 4:3 sem fps específico
        { ...baseId, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4/3 } },
        // 4:3 básico
        { ...baseId, aspectRatio: { ideal: 4/3 }, frameRate: { ideal: 30 } },
        // Qualquer coisa (renderer trata)
        { ...baseId },
    ];

    let stream = null;
    let usedAttempt = -1;

    for (let i = 0; i < attempts.length; i++) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: attempts[i], audio: false });
            usedAttempt = i;
            break;
        } catch (err) {
            console.warn(`Tentativa ${i + 1} falhou:`, err.name);
        }
    }

    if (!stream) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            usedAttempt = 99;
        } catch (err) {
            console.error('Todas as tentativas falharam:', err);
            camDebugInfo.innerHTML = 'ERRO: Câmera indisponível';
            return;
        }
    }

    window.state.currentStream = stream;
    video.srcObject = stream;
    sensorDot.classList.add('active');

    video.onloadedmetadata = async () => {
        await video.play();
        const settings = stream.getVideoTracks()[0].getSettings();
        const W = settings.width || video.videoWidth;
        const H = settings.height || video.videoHeight;
        const aspectStr = W && H ? (W/H).toFixed(3) : '?';

        // Raio do círculo inscrito = metade do lado MENOR (altura em 4:3 landscape)
        const R = Math.min(W, H) / 2;
        // 16:9 máximo dentro desse círculo
        const outW = (2 * R) / Math.sqrt(1 + (9/16)*(9/16));
        const outH = outW * (9/16);

        camDebugInfo.innerHTML =
            `Sensor: ${W}x${H} (${aspectStr}) | ` +
            `R=${Math.round(R)}px | ` +
            `Output: ${Math.round(outW)}x${Math.round(outH)} | A${usedAttempt + 1}`;

        // Invalida cache do renderer para recalcular com novo sensor
        if (typeof _stableCache !== 'undefined') _stableCache = null;
        if (typeof _stableCacheKey !== 'undefined') _stableCacheKey = '';

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
        console.warn('applyManualSettings:', e);
    }
}
