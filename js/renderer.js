// ============================================================
// renderer.js — Core Rendering Engine (v3.5 Stable)
// ============================================================

/**
 * ARCHITECTURE v3.5:
 * - The VIDEO (background) rotates to compensate for device tilt
 * - The FRAME (white rectangle) stays PERFECTLY STILL on screen
 * - Frame size is the largest rectangle that fits inside the
 *   INSCRIBED CIRCLE of the sensor, so rotating video NEVER
 *   exposes black edges — guaranteed mathematically.
 *
 * Sensor is requested as 1080x1080 (square). Even if browser
 * delivers 16:9, we use the shortest dimension as our "safe radius".
 */

// Cached stable frame dimensions — computed ONCE per canvas resize
// and NEVER changed during animation. This kills flicker.
let _stableCache = null;
let _stableCacheKey = '';

function getStableFrameDimensions(canvasW, canvasH, videoW, videoH, targetAspect) {
    const key = `${canvasW}|${canvasH}|${videoW}|${videoH}|${targetAspect.toFixed(4)}`;
    if (_stableCacheKey === key && _stableCache) return _stableCache;

    // The inscribed circle radius of the sensor (shortest half-dimension).
    // This is the MAX distance from center that is ALWAYS valid,
    // regardless of rotation angle — zero black bars guaranteed.
    const sensorRadius = Math.min(videoW, videoH) / 2;

    // Largest rectangle with given aspect ratio that fits inside this circle:
    //   W² + H² = (2R)²  and  H = W/aspect
    //   W = 2R / sqrt(1 + 1/aspect²)
    const aspect = targetAspect;
    const inscribedW = (2 * sensorRadius) / Math.sqrt(1 + 1 / (aspect * aspect));
    const inscribedH = inscribedW / aspect;

    // displayScale maps sensor pixels -> screen pixels so frame fits in 88% of screen
    const displayScale = Math.min(
        (canvasW * 0.88) / inscribedW,
        (canvasH * 0.88) / inscribedH
    );
    const frameW = inscribedW * displayScale;
    const frameH = inscribedH * displayScale;

    // videoFillScale = displayScale ensures sensorRadius on screen == frame circumradius
    // meaning: at ANY rotation angle, video always covers the frame fully. Zero black bars.
    const videoFillScale = displayScale;

    _stableCache = { frameW, frameH, videoFillScale, sensorRadius, inscribedW, inscribedH };
    _stableCacheKey = key;
    return _stableCache;
}

/**
 * Main render — draws one frame onto a given context.
 * isViewfinder: true = show HUD overlays; false = clean recording output
 */
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

    // ── 1. Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // ── 2. VIDEO rotates around canvas center to counteract device tilt.
    //       Zoom scales around center. Because sensor is square (or we use
    //       shortest dimension), rotating never reveals edges.
    if (video.readyState >= 2) {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(rad);
        ctx.scale(dims.videoFillScale * zoom, dims.videoFillScale * zoom);
        ctx.drawImage(video, -vW / 2, -vH / 2, vW, vH);
        ctx.restore();
    }

    // ── 3. STATIC mask + STATIC frame — absolutely no rotation here.
    //       Frame is always centered, always same size.
    if (s.isHorizonLockActive) {
        drawStaticHUD(ctx, width, height, dims, isViewfinder);
    }
}

/**
 * Draws the non-rotating frame, mask, and horizon indicator.
 * Zero jitter: positions are computed from stable cache only.
 */
function drawStaticHUD(ctx, width, height, dims, isViewfinder) {
    const hw = dims.frameW / 2;
    const hh = dims.frameH / 2;
    const cx = width / 2;
    const cy = height / 2;

    // ── Darkening mask outside frame (4 rects, no overdraw artifacts)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, cy - hh);                         // top
    ctx.fillRect(0, cy + hh, width, height - (cy + hh));        // bottom
    ctx.fillRect(0, cy - hh, cx - hw, dims.frameH);             // left
    ctx.fillRect(cx + hw, cy - hh, width - (cx + hw), dims.frameH); // right

    // ── Frame border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - hw, cy - hh, dims.frameW, dims.frameH);

    // ── Corner accents
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

    // ── Horizon line (static center crosshair — always level visually)
    if (isViewfinder) {
        ctx.beginPath();
        ctx.moveTo(cx - 55, cy);
        ctx.lineTo(cx + 55, cy);
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00f2fe';
        ctx.fill();
    }
}

/**
 * Main Rendering Loop
 */
function draw(timestamp) {
    const s = window.state;
    const dW = window.innerWidth;
    const dH = window.innerHeight;

    // ── 1. Resize & Cache management
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

    // ── 2. The "Secret": Interpolation + Adaptive Filtering
    // We use the frame timestamp (from rVFC or rAF) to look up the EXACT historical angle
    const targetTimestamp = timestamp || performance.now();
    const exactTargetRoll = getInterpolatedRoll(targetTimestamp);

    // Dynamic Tau: Higher rotation speed = faster response (less smoothing)
    // velocity is in deg/sec. Base 0.05, max 1.0.
    const baseTau = 0.05;
    const velocityScale = 0.005; // Adjust this to tune responsiveness
    const dynamicTau = Math.min(1.0, baseTau + (s.angularVelocity * velocityScale));

    s.currentRoll = lerpAngle(s.currentRoll, exactTargetRoll, dynamicTau);
    angleText.innerText = Math.abs(s.currentRoll).toFixed(1) + '°';

    // ── 3. FPS & Debug
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
        fpsFrameCount = 0;
        fpsLastTime = now;
        debugInfo.innerHTML = `V4.0 | FPS:${fpsDisplay} | Tau:${dynamicTau.toFixed(3)} | V:${Math.round(s.angularVelocity)}°/s`;
    }
    fpsFrameCount++;

    // ── 4. Render
    renderToCtx(ctx, canvas.width, canvas.height, true);

    if (s.isRecording) {
        const rCtx = recCanvas.getContext('2d', { alpha: false });
        renderToCtx(rCtx, recCanvas.width, recCanvas.height, false);
    }

    // Use requestVideoFrameCallback if available for ultra-sync, otherwise rAF
    if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(draw);
    } else {
        animationId = requestAnimationFrame(draw);
    }
}

// Start the loop
if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(draw);
} else {
    animationId = requestAnimationFrame(draw);
}
