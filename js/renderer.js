// ============================================================
// renderer.js — Core Rendering Engine (v3.3 Ultra-Clamping)
// ============================================================

/**
 * Calculates the visual frame size with MATHEMATICAL CLAMPING.
 * Ensures the box NEVER touches the edge of the source image.
 */
function getVisualFrameSize(screenWidth, screenHeight, vW, vH, currentZoom, roll) {
    const minDim = Math.min(screenWidth, screenHeight);
    
    // 1. Scene background scale
    const videoRatio = vW / vH;
    const screenRatio = screenWidth / screenHeight;
    const FRAME_V_SCALE = 0.94;

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame (Widescreen 16:9 or Vertical 9:16)
    const targetAspect = window.state.recAspectRatio || (16/9);
    let frameW, frameH;
    
    if (targetAspect > 1) {
        // Landscape (16:9)
        frameW = (screenWidth < screenHeight) ? (screenWidth * 0.95) : (screenWidth * 0.65);
        frameH = frameW / targetAspect;
    } else {
        // Portrait (9:16)
        frameH = screenHeight * 0.75;
        frameW = frameH * targetAspect;
    }

    // --- MATHEMATICAL CONTAINMENT TRAVA ---
    // visible width needed = W*|cos| + H*|sin|
    const rad = Math.abs(roll * (Math.PI / 180));
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const visS_W = vW * finalVFScale;
    const visS_H = vH * finalVFScale;

    // We must ensure the rotated box fits inside both dimensions of the source image
    // Safety margin is 0.95 (5% distance from edges)
    const limitX = visS_W * 0.95;
    const limitY = visS_H * 0.95;

    const currentSpreadX = frameW * cosR + frameH * sinR;
    const currentSpreadY = frameW * sinR + frameH * cosR;

    const scaleX = limitX / currentSpreadX;
    const scaleY = limitY / currentSpreadY;
    const clampFactor = Math.min(1.0, scaleX, scaleY);

    frameW *= clampFactor;
    frameH *= clampFactor;

    // NaN Shield
    if (isNaN(frameW) || isNaN(frameH) || isNaN(finalVFScale) || frameW <= 0 || frameH <= 0) {
        if (window.state.lastValidVisual) return window.state.lastValidVisual;
        return { w: 400, h: 225, vfScale: 1.0 };
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
    const vW = video.videoWidth || s.cachedVideoW;
    const vH = video.videoHeight || s.cachedVideoH;

    const centerX = width / 2;
    const centerY = height / 2;
    
    const currentR = isNaN(s.currentRoll) ? 0 : s.currentRoll;
    const currentZ = isNaN(s.zoomFactor) ? 1.0 : s.zoomFactor;

    const screenW = window.innerWidth || 1080;
    const screenH = window.innerHeight || 1920;
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, currentZ, currentR);

    // --- RENDERING PIPELINE ---
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (video.readyState >= 2) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(visual.vfScale, visual.vfScale);
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();
    }

    // Always draw HUD if active, using state-locking to prevent flickering
    if (s.isHorizonLockActive) {
        drawViewfinderHUD(ctx, width, height, visual, currentR);
    }
}

/**
 * HUD & MASKING
 */
function drawViewfinderHUD(ctx, width, height, visual, roll) {
    const rad = roll * (Math.PI / 180);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    // 4-Rect Overlapping Mask (15px overlap for total seal)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
    const big = Math.max(width, height) * 10;
    const ov = 15;

    ctx.fillRect(-big/2, -big/2, big, big/2 - visual.h/2 + ov); // Top
    ctx.fillRect(-big/2, visual.h/2 - ov, big, big/2 - visual.h/2 + ov); // Bottom
    ctx.fillRect(-big/2, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // Left
    ctx.fillRect(visual.w/2 - ov, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // Right

    // HUD Design
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Horizon line UI
    ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 4; ctx.stroke();

    // Corners
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

    if (dW > 0 && dH > 0 && (canvas.width !== dW || canvas.height !== dH)) {
        canvas.width = dW; canvas.height = dH;
    }

    // Cache healthy dimensions
    if (video.readyState >= 2) {
        s.cachedVideoW = video.videoWidth || s.cachedVideoW;
        s.cachedVideoH = video.videoHeight || s.cachedVideoH;
    }

    // Stabilize
    s.currentRoll = lerpAngle(s.currentRoll, s.targetRoll, 0.18);
    angleText.innerText = Math.abs(s.currentRoll).toFixed(1) + '°';
    
    // Debug info
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
        fpsFrameCount = 0;
        fpsLastTime = now;
        debugInfo.innerHTML = `V3.3-SHIELD | FPS: ${fpsDisplay} | R: ${Math.round(s.currentRoll)}°`;
    }
    fpsFrameCount++;

    renderToCtx(ctx, canvas.width, canvas.height, true);
    if (s.isRecording) {
        // Find Recording Canvas Context
        const recCtx = recCanvas.getContext('2d');
        renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
    }

    animationId = requestAnimationFrame(draw);
}
