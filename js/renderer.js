// ============================================================
// renderer.js — Core Rendering Engine (v3.4 Ultra-Shield)
// ============================================================

/**
 * Calculates visual frame size with Rotation-Aware Containment.
 */
function getVisualFrameSize(screenWidth, screenHeight, vW, vH, currentZoom, roll) {
    const minDim = Math.min(screenWidth, screenHeight);
    
    // 1. Scene background scale
    const videoRatio = vW / vH;
    const screenRatio = screenWidth / screenHeight;
    const isLandscapeScreen = screenWidth > screenHeight;

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame
    const targetAspect = window.state.recAspectRatio || (16/9);
    let frameW, frameH;
    
    if (targetAspect > 1) {
        // Landscape (16:9)
        frameW = isLandscapeScreen ? (screenWidth * 0.7) : (screenWidth * 0.95);
        frameH = frameW / targetAspect;
    } else {
        // Portrait (9:16)
        frameH = isLandscapeScreen ? (screenHeight * 0.8) : (screenHeight * 0.75);
        frameW = frameH * targetAspect;
    }

    // --- MATHEMATICAL CONTAINMENT TRAVA (v3.4) ---
    // Ensure the rotated box fits inside the source image with 5% margin
    const rad = Math.abs(roll * (Math.PI / 180));
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const limitX = vW * finalVFScale * 0.94;
    const limitY = vH * finalVFScale * 0.94;

    const currentSpreadX = frameW * cosR + frameH * sinR;
    const currentSpreadY = frameW * sinR + frameH * cosR;

    const scaleX = limitX / currentSpreadX;
    const scaleY = limitY / currentSpreadY;
    const clampFactor = Math.min(1.0, scaleX, scaleY);

    frameW *= clampFactor;
    frameH *= clampFactor;

    // Hard Fallback Shield
    if (isNaN(frameW) || isNaN(frameH) || frameW <= 0 || frameH <= 0) {
        if (window.state.lastValidVisual) return window.state.lastValidVisual;
        return { w: 300, h: 168, vfScale: 1.0 };
    }

    const result = { w: frameW, h: frameH, vfScale: finalVFScale };
    window.state.lastValidVisual = result; 
    return result;
}

/**
 * Standard Context Renderer
 */
function renderToCtx(ctx, width, height, isViewfinder = false) {
    const s = window.state;
    // CRITICAL: Always use cached dimensions for the math to prevent HUD flicker
    const vW = video.videoWidth || s.cachedVideoW;
    const vH = video.videoHeight || s.cachedVideoH;

    const currentR = isNaN(s.currentRoll) ? 0 : s.currentRoll;
    const currentZ = isNaN(s.zoomFactor) ? 1.0 : s.zoomFactor;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, currentZ, currentR);

    // --- DRAW PIPELINE ---
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (video.readyState >= 2) {
        ctx.save();
        ctx.translate(width/2, height/2);
        ctx.scale(visual.vfScale, visual.vfScale);
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();
    }

    // Shielded HUD: Always drawn if active, using cached math results
    if (s.isHorizonLockActive) {
        drawViewfinderHUD(ctx, width, height, visual, currentR);
    }
}

/**
 * HUD Drawing (v3.4 Refined)
 */
function drawViewfinderHUD(ctx, width, height, visual, roll) {
    const rad = roll * (Math.PI / 180);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    // 4-Rect Shield Mask (Large overlaps to kill flickering)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    const big = Math.max(width, height) * 12; // Massive hood
    const ov = 20; // 20px overlap

    ctx.fillRect(-big/2, -big/2, big, big/2 - visual.h/2 + ov); // T
    ctx.fillRect(-big/2, visual.h/2 - ov, big, big/2 - visual.h/2 + ov); // B
    ctx.fillRect(-big/2, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // L
    ctx.fillRect(visual.w/2 - ov, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // R

    // Visual Frame
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Horizon line
    ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 4; ctx.stroke();

    // v3.4 Corner Pro Style
    const cs = 50; ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-visual.w/2+cs, -visual.h/2); ctx.lineTo(-visual.w/2, -visual.h/2); ctx.lineTo(-visual.w/2, -visual.h/2+cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(visual.w/2-cs, -visual.h/2); ctx.lineTo(visual.w/2, -visual.h/2); ctx.lineTo(visual.w/2, -visual.h/2+cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-visual.w/2+cs, visual.h/2); ctx.lineTo(-visual.w/2, visual.h/2); ctx.lineTo(-visual.w/2, visual.h/2-cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(visual.w/2-cs, visual.h/2); ctx.lineTo(visual.w/2, visual.h/2); ctx.lineTo(visual.w/2, visual.h/2-cs); ctx.stroke();

    ctx.restore();
}

/**
 * Main Rendering Loop
 */
function draw() {
    const s = window.state;
    const dW = window.innerWidth;
    const dH = window.innerHeight;

    if (dW > 0 && dH > 0) {
        if (canvas.width !== dW || canvas.height !== dH) {
            canvas.width = dW; canvas.height = dH;
        }
    }

    if (video.readyState >= 2) {
        s.cachedVideoW = video.videoWidth || s.cachedVideoW;
        s.cachedVideoH = video.videoHeight || s.cachedVideoH;
    }

    // Stabilize (Damping 0.18 for cinematic feel)
    s.currentRoll = lerpAngle(s.currentRoll, s.targetRoll, 0.18);
    angleText.innerText = Math.abs(s.currentRoll).toFixed(1) + '°';
    
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
        fpsFrameCount = 0;
        fpsLastTime = now;
        debugInfo.innerHTML = `V3.4-ULTRA | FPS: ${fpsDisplay} | R: ${Math.round(s.currentRoll)}°`;
    }
    fpsFrameCount++;

    renderToCtx(ctx, canvas.width, canvas.height, true);
    if (s.isRecording) {
        const rCtx = recCanvas.getContext('2d');
        renderToCtx(rCtx, recCanvas.width, recCanvas.height, false);
    }

    animationId = requestAnimationFrame(draw);
}
