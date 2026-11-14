'use strict';

let renderRunning = false, renderHandle = null, renderHandleType = null;
let lastDemoFrame = 0, framesSinceUpdate = 0, fpsUpdatedAt = 0;
const demoSource = document.createElement('canvas');
demoSource.width = 1600; demoSource.height = 1200;
const demoContext = demoSource.getContext('2d', { alpha: false });

function drawDemoScene(now) {
    const d = demoContext, w = demoSource.width, h = demoSource.height;
    d.save();
    d.translate(w / 2, h / 2);
    d.rotate(window.state.demoRoll * Math.PI / 180);
    const sky = d.createLinearGradient(0, -1200, 0, 300);
    sky.addColorStop(0, '#104975'); sky.addColorStop(0.65, '#60bfd2'); sky.addColorStop(1, '#cce5cf');
    d.fillStyle = sky; d.fillRect(-2400, -2400, 4800, 4800);
    d.fillStyle = '#e8d8a6'; d.beginPath(); d.arc(420, -330, 65, 0, Math.PI * 2); d.fill();
    d.fillStyle = '#477c87';
    d.beginPath(); d.moveTo(-2400, 75);
    for (let x = -2400; x <= 2400; x += 160) d.lineTo(x, -70 - (Math.sin(x * 0.012) + 1) * 110);
    d.lineTo(2400, 300); d.lineTo(-2400, 300); d.fill();
    const water = d.createLinearGradient(0, 0, 0, 900);
    water.addColorStop(0, '#3f9d9c'); water.addColorStop(1, '#092c49');
    d.fillStyle = water; d.fillRect(-2400, 0, 4800, 2400);
    d.strokeStyle = '#b4ded0'; d.lineWidth = 3;
    d.beginPath(); d.moveTo(-2400, 0); d.lineTo(2400, 0); d.stroke();
    for (let i = 1; i <= 12; i++) {
        const y = i * i * 5, offset = Math.sin(now / 1300 + i) * 25;
        d.strokeStyle = 'rgba(196,231,215,0.22)'; d.lineWidth = 2;
        d.beginPath(); d.moveTo(-700 + offset, y); d.lineTo(700 + offset, y); d.stroke();
    }
    d.fillStyle = '#16384a'; d.fillRect(-340, -130, 12, 440);
    d.fillStyle = '#f1e9d5'; d.beginPath(); d.moveTo(-310, -120); d.lineTo(-310, 70); d.lineTo(-180, 70); d.fill();
    d.fillStyle = '#ecb979'; d.beginPath(); d.moveTo(-375, 90); d.lineTo(-165, 90); d.lineTo(-195, 125); d.lineTo(-340, 125); d.fill();
    d.fillStyle = 'rgba(255,255,255,0.9)'; d.font = '500 23px system-ui'; d.textAlign = 'center';
    d.fillText('HORIZONTE FIXO', 0, -225);
    d.font = '15px system-ui'; d.fillText('Cena de demonstração', 0, -194);
    d.restore();
}

function sourceDimensions() {
    return window.state.demo ? [demoSource.width, demoSource.height] : [video.videoWidth, video.videoHeight];
}

function frameGeometry(width, height, recording) {
    const s = window.state, [sourceW, sourceH] = sourceDimensions();
    if (!sourceW || !sourceH) return null;
    let frameW = width, frameH = height;
    if (!recording) {
        frameW = Math.min(width * 0.89, height * 0.82 * s.recAspectRatio);
        frameH = frameW / s.recAspectRatio;
    }
    const roll = s.isHorizonLockActive ? s.currentRoll : 0;
    const mode = s.isHorizonLockActive ? s.cropMode : 'adaptive';
    const margin = s.isHorizonLockActive && s.steady ? 1.1 : 1;
    const bounds = HorizonMath.crop(sourceW, sourceH, frameW, frameH, roll, s.zoomFactor, mode, margin);
    return {
        cx: width / 2, cy: height / 2, frameW, frameH, roll, scale: bounds.scale,
        offsetX: HorizonMath.clamp(s.offsetX, -1, 1) * bounds.slackX * 0.85,
        offsetY: HorizonMath.clamp(s.offsetY, -1, 1) * bounds.slackY * 0.85,
        mirror: !s.demo && s.facingMode === 'user'
    };
}

function renderToCtx(context, width, height, recording = false) {
    context.fillStyle = '#080c10'; context.fillRect(0, 0, width, height);
    const s = window.state;
    if (!s.demo && (video.readyState < 2 || !s.currentStream)) return;
    const transform = frameGeometry(width, height, recording);
    if (!transform) return;
    const [sourceW, sourceH] = sourceDimensions();
    context.save();
    context.translate(transform.cx, transform.cy);
    context.rotate(transform.roll * Math.PI / 180);
    context.translate(transform.offsetX, transform.offsetY);
    context.scale(transform.scale * (transform.mirror ? -1 : 1), transform.scale);
    context.filter = s.colorProfile === 'flat' ? 'contrast(0.75) saturate(0.78) brightness(1.08)' : s.colorProfile === 'punchy' ? 'contrast(1.12) saturate(1.15)' : 'none';
    context.drawImage(s.demo ? demoSource : video, -sourceW / 2, -sourceH / 2, sourceW, sourceH);
    context.restore();
    if (!recording) {
        s.frameTransform = transform;
        s.previewFrame = { x: transform.cx - transform.frameW / 2, y: transform.cy - transform.frameH / 2, width: transform.frameW, height: transform.frameH };
        drawFrameGuide(context, width, height, s.previewFrame);
    }
}

function drawFrameGuide(context, width, height, frame) {
    const { x, y, width: w, height: h } = frame;
    context.fillStyle = 'rgba(3,8,12,0.72)';
    context.fillRect(0, 0, width, y);
    context.fillRect(0, y + h, width, height - y - h);
    context.fillRect(0, y, x, h);
    context.fillRect(x + w, y, width - x - w, h);
    context.strokeStyle = 'rgba(255,255,255,0.5)'; context.lineWidth = 1;
    context.strokeRect(x, y, w, h);
    const corner = Math.min(22, w * 0.1, h * 0.1);
    context.strokeStyle = '#fff'; context.lineWidth = 2.5;
    for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        context.beginPath(); context.moveTo(px + corner * dx, py); context.lineTo(px, py); context.lineTo(px, py + corner * dy); context.stroke();
    }
    if (window.state.grid) {
        context.strokeStyle = 'rgba(255,255,255,0.3)'; context.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            context.beginPath(); context.moveTo(x + w * i / 3, y); context.lineTo(x + w * i / 3, y + h);
            context.moveTo(x, y + h * i / 3); context.lineTo(x + w, y + h * i / 3); context.stroke();
        }
    }
    if (window.state.isHorizonLockActive) {
        context.strokeStyle = '#49e6dc'; context.lineWidth = 2;
        context.beginPath(); context.moveTo(width / 2 - 30, height / 2); context.lineTo(width / 2 - 8, height / 2);
        context.moveTo(width / 2 + 8, height / 2); context.lineTo(width / 2 + 30, height / 2); context.stroke();
        context.fillStyle = '#49e6dc'; context.beginPath(); context.arc(width / 2, height / 2, 2, 0, Math.PI * 2); context.fill();
    }
}

function renderRecordingFrame() {
    renderToCtx(recCtx, recCanvas.width, recCanvas.height, true);
}

function draw(now) {
    if (!renderRunning) return;
    const s = window.state;
    // Use the delivered camera frame callback when available, one loop only.
    if (!s.demo || now - lastDemoFrame >= 1000 / s.fps - 1) {
        lastDemoFrame = now;
        const rect = document.getElementById('preview-stage').getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        if (s.demo) drawDemoScene(now);
        updateSensorFrame(now);
        renderToCtx(ctx, w, h);
        if (s.isRecording) renderRecordingFrame();
        framesSinceUpdate++;
        if (now - fpsUpdatedAt > 500) {
            s.fpsActual = Math.round(framesSinceUpdate * 1000 / Math.max(1, now - fpsUpdatedAt));
            fpsUpdatedAt = now; framesSinceUpdate = 0;
            document.getElementById('angle-text').textContent = `${HorizonMath.angle(s.currentRoll).toFixed(1)}°`;
            document.getElementById('sensor-status').textContent = s.demo ? 'Inclinação simulada' : s.sensorMessage;
            document.getElementById('sensor-dot').classList.toggle('active', s.demo || (s.sensorLastTime > 0 && now - s.sensorLastTime < 1500));
            document.getElementById('camera-status').textContent = s.demo ? s.cameraMessage : `${s.cameraMessage} · visor ${s.fpsActual} fps`;
        }
    }
    scheduleFrame();
}

function scheduleFrame() {
    if (!renderRunning) return;
    if (!window.state.demo && video.requestVideoFrameCallback) {
        renderHandleType = 'video'; renderHandle = video.requestVideoFrameCallback(draw);
    } else {
        renderHandleType = 'animation'; renderHandle = requestAnimationFrame(draw);
    }
}

function startRenderLoop() {
    if (renderRunning) return;
    renderRunning = true; fpsUpdatedAt = performance.now(); framesSinceUpdate = 0;
    draw(performance.now());
}

function stopRenderLoop() {
    renderRunning = false;
    if (renderHandleType === 'video') video.cancelVideoFrameCallback?.(renderHandle);
    else if (renderHandle !== null) cancelAnimationFrame(renderHandle);
    renderHandle = null;
}
