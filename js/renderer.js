// ============================================================
// renderer.js — Core Rendering Engine (v4.0)
// ============================================================

/**
 * ARCHITECTURE v4.0:
 * - The VIDEO (background) rotates to compensate for device tilt
 * - The FRAME (white rectangle) stays PERFECTLY STILL on screen
 * - Frame size is the largest rectangle that fits inside the
 *   INSCRIBED CIRCLE of the sensor, so rotating video NEVER
 *   exposes black edges — guaranteed mathematically.
 */

// Cached stable frame dimensions — computed ONCE per canvas resize
let _stableCache = null;
let _stableCacheKey = '';

function getStableFrameDimensions(canvasW, canvasH, videoW, videoH, targetAspect) {
    const key = `${canvasW}|${canvasH}|${videoW}|${videoH}|${targetAspect.toFixed(4)}`;
    if (_stableCacheKey === key && _stableCache) return _stableCache;

    const sensorRadius = Math.min(videoW, videoH) / 2;
    const aspect = targetAspect;
    const inscribedW = (2 * sensorRadius) / Math.sqrt(1 + 1 / (aspect * aspect));
    const inscribedH = inscribedW / aspect;

    const displayScale = Math.min(
        (canvasW * 0.88) / inscribedW,
        (canvasH * 0.88) / inscribedH
    );
    const frameW = inscribedW * displayScale;
    const frameH = inscribedH * displayScale;
    const videoFillScale = displayScale;

    _stableCache = { frameW, frameH, videoFillScale, sensorRadius, inscribedW, inscribedH };
    _stableCacheKey = key;
    return _stableCache;
}

function renderToCtx(ctx, width, height, isViewfinder) {
    const s = window.state;
    const vW = s.cachedVideoW;
    const vH = s.cachedVideoH;

    if (vW <= 0 || vH <= 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        return;
    }

    const targetAspect = s.recAspectRatio || (16 / 9);
    const dims = getStableFrameDimensions(width, height, vW, vH, targetAspect);

    const roll = isNaN(s.currentRoll) ? 0 : s.currentRoll;
    const zoom = isNaN(s.zoomFactor) ? 1.0 : s.zoomFactor;
    const rad = roll * (Math.PI / 180);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (video.readyState >= 2) {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(rad);
        ctx.scale(dims.videoFillScale * zoom, dims.videoFillScale * zoom);
        ctx.drawImage(video, -vW / 2, -vH / 2, vW, vH);
        ctx.restore();
    }

    if (s.isHorizonLockActive) {
        drawStaticHUD(ctx, width, height, dims, isViewfinder);
    }
}

function drawStaticHUD(ctx, width, height, dims, isViewfinder) {
    const hw = dims.frameW / 2;
    const hh = dims.frameH / 2;
    const cx = width / 2;
    const cy = height / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, cy - hh);
    ctx.fillRect(0, cy + hh, width, height - (cy + hh));
    ctx.fillRect(0, cy - hh, cx - hw, dims.frameH);
    ctx.fillRect(cx + hw, cy - hh, width - (cx + hw), dims.frameH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - hw, cy - hh, dims.frameW, dims.frameH);

    const cs = 28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    // TL
    ctx.beginPath(); ctx.moveTo(cx - hw + cs, cy - hh); ctx.lineTo(cx - hw, cy - hh); ctx.lineTo(cx - hw, cy - hh + cs); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(cx + hw - cs, cy - hh); ctx.lineTo(cx + hw, cy - hh); ctx.lineTo(cx + hw, cy - hh + cs); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(cx - hw + cs, cy + hh); ctx.lineTo(cx - hw, cy + hh); ctx.lineTo(cx - hw, cy + hh - cs); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(cx + hw - cs, cy + hh); ctx.lineTo(cx + hw, cy + hh); ctx.lineTo(cx + hw, cy + hh - cs); ctx.stroke();

    if (isViewfinder) {
        ctx.beginPath();
        ctx.moveTo(cx - 55, cy);
        ctx.lineTo(cx + 55, cy);
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00f2fe';
        ctx.fill();
    }
}

function draw(timestamp, metadata) {
    const s = window.state;
    const dW = window.innerWidth;
    const dH = window.innerHeight;

    if (canvas.width !== dW || canvas.height !== dH) {
        canvas.width = dW;
        canvas.height = dH;
        _stableCache = null;
    }

    if (video.readyState >= 2 && video.videoWidth > 0) {
        if (s.cachedVideoW !== video.videoWidth || s.cachedVideoH !== video.videoHeight) {
            s.cachedVideoW = video.videoWidth;
            s.cachedVideoH = video.videoHeight;
            _stableCache = null;
        }
    }

    const targetTimestamp = (metadata && metadata.presentationTime) || timestamp || performance.now();
    const exactTargetRoll = getInterpolatedRoll(targetTimestamp);

    const baseTau = 0.05;
    const velocityScale = 0.005;
    const dynamicTau = Math.min(1.0, baseTau + ((window.state.angularVelocity || 0) * velocityScale));

    s.currentRoll = lerpAngle(s.currentRoll || 0, exactTargetRoll, dynamicTau);
    angleText.innerText = Math.abs(s.currentRoll).toFixed(1) + '°';

    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
        fpsFrameCount = 0;
        fpsLastTime = now;
        debugInfo.innerHTML = `V4.0 | FPS: ${fpsDisplay} | Tau: ${dynamicTau.toFixed(3)} | V: ${Math.round(window.state.angularVelocity || 0)}°/s`;
    }
    fpsFrameCount++;

    if (horizonLine) horizonLine.style.transform = `rotate(${-s.currentRoll}deg)`;

    renderToCtx(ctx, canvas.width, canvas.height, true);

    if (s.isRecording) {
        renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
    }

    if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(draw);
    } else {
        animationId = requestAnimationFrame(draw);
    }
}

if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(draw);
} else {
    animationId = requestAnimationFrame(draw);
}
