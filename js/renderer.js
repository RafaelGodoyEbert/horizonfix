// ============================================================
// renderer.js — Core Rendering Engine (v3.2 Ultra-Shield)
// ============================================================

/**
 * Calculates the visual frame size as seen on the screen.
 * v3.2: Introduced Rotation-Aware Clamping (Mathematical Containment)
 */
function getVisualFrameSize(screenWidth, screenHeight, vW, vH, currentZoom, roll) {
    const minDim = Math.min(screenWidth, screenHeight);
    
    // 1. Scene background scale
    const videoRatio = vW / vH;
    const screenRatio = screenWidth / screenHeight;
    const FRAME_V_SCALE = 0.94; // Target base scale

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame (The "bright rectangle")
    const targetAspect = window.recAspectRatio || (16/9);
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

    // --- ROTATION-AWARE CLAMPING (V3.2 CRITICAL FIX) ---
    // Mathematically ensures W*|cos(t)| + H*|sin(t)| fits inside SourceS*Scale
    const rad = Math.abs(roll * (Math.PI / 180));
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    // Visible source size in screen pixels
    const visS_W = vW * finalVFScale;
    const visS_H = vH * finalVFScale;

    // Calculate maximum W/H that fits. For a 16:9 box in the 1:1 sensor:
    // Required Width (projection on axis): W*cosR + H*sinR
    // Required Height (projection on axis): W*sinR + H*cosR
    // We must ensure BOTH are <= visS_W * 0.98 (safety margin)
    
    const maxBoundW = visS_W * 0.96;
    const maxBoundH = visS_H * 0.96;

    // Find the scale factor needed to shrink the frame into the bounds
    const scaleW = maxBoundW / (frameW * cosR + frameH * sinR);
    const scaleH = maxBoundH / (frameW * sinR + frameH * cosR);
    const clampFactor = Math.min(1.0, scaleW, scaleH);

    frameW *= clampFactor;
    frameH *= clampFactor;

    // --- NaN / ZERO SHIELD ---
    if (isNaN(frameW) || isNaN(frameH) || isNaN(finalVFScale) || frameW <= 0 || frameH <= 0 || finalVFScale <= 0) {
        if (window.lastValidVisual) return window.lastValidVisual;
        return { w: 300, h: 168, vfScale: 1.0 };
    }

    const result = { w: frameW, h: frameH, vfScale: finalVFScale };
    window.lastValidVisual = result; // Global cache to prevent flickering
    return result;
}

/**
 * Renders the video frame to a specific context
 */
function renderToCtx(ctx, width, height, isViewfinder = false) {
    const vW = video.videoWidth || cachedVideoW;
    const vH = video.videoHeight || cachedVideoH;

    const centerX = width / 2;
    const centerY = height / 2;
    
    const currentR = isNaN(currentRoll) ? 0 : currentRoll;
    const currentZ = isNaN(zoomFactor) ? 1.0 : zoomFactor;

    const screenW = window.innerWidth || 1080;
    const screenH = window.innerHeight || 1920;
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, currentZ, currentR);

    if (isViewfinder) {
        // Base background (Pure black to prevent bleeding)
        ctx.fillStyle = '#000'; 
        ctx.fillRect(0, 0, width, height);

        if (video.readyState >= 2) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(visual.vfScale, visual.vfScale);
            ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
            ctx.restore();
        }

        // HUD: Only hidden if toggle is off. Never flickers because of 'visual' cache.
        if (isHorizonLockActive) {
            drawViewfinderHUD(ctx, width, height, visual, currentR);
        }
    } else {
        // --- RECORDING ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        if (video.readyState >= 2) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(currentR * (Math.PI / 180));

            // Sync: Content size 'visual.h' on screen fills 'height' (1080)
            const recScale = (height / visual.h) * visual.vfScale;
            ctx.scale(recScale, recScale);
            
            ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
            ctx.restore();
        }
    }
}

/**
 * HUD & ULTRA-MASK (Zero Flicker)
 */
function drawViewfinderHUD(ctx, width, height, visual, roll) {
    const rad = roll * (Math.PI / 180);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    // --- REFINED 4-RECT MASK ---
    // Extended overlap (10px) and massive extension (10x)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    const big = Math.max(width, height) * 10; 
    const ov = 10; // Safety intersection overlap

    // Outer Hood (Drawing strictly clockwise to avoid GPU path issues)
    ctx.fillRect(-big/2, -big/2, big, big/2 - visual.h/2 + ov); // Top
    ctx.fillRect(-big/2, visual.h/2 - ov, big, big/2 - visual.h/2 + ov); // Bottom
    ctx.fillRect(-big/2, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // Left
    ctx.fillRect(visual.w/2 - ov, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // Right

    // --- HUD LINES ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Center Leveler
    ctx.beginPath();
    ctx.moveTo(-60, 0); ctx.lineTo(60, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 4;
    ctx.stroke();

    // Corner Marks (Improved Contrast)
    const cs = 45; ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
    // TL
    ctx.beginPath(); ctx.moveTo(-visual.w/2+cs, -visual.h/2); ctx.lineTo(-visual.w/2, -visual.h/2); ctx.lineTo(-visual.w/2, -visual.h/2+cs); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(visual.w/2-cs, -visual.h/2); ctx.lineTo(visual.w/2, -visual.h/2); ctx.lineTo(visual.w/2, -visual.h/2+cs); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(-visual.w/2+cs, visual.h/2); ctx.lineTo(-visual.w/2, visual.h/2); ctx.lineTo(-visual.w/2, visual.h/2-cs); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(visual.w/2-cs, visual.h/2); ctx.lineTo(visual.w/2, visual.h/2); ctx.lineTo(visual.w/2, visual.h/2-cs); ctx.stroke();

    ctx.restore();
}

/**
 * Main Loop (v3.2 Ultra-Shield)
 */
function draw() {
    const dW = window.innerWidth;
    const dH = window.innerHeight;
    if (dW === 0 || dH === 0) {
        // Browser backgrounded or tab not visible
        animationId = requestAnimationFrame(draw);
        return;
    }

    if (canvas.width !== dW || canvas.height !== dH) {
        canvas.width = dW; canvas.height = dH;
    }

    // Cache healthy dimensions
    if (video.readyState >= 2) {
        cachedVideoW = video.videoWidth || cachedVideoW;
        cachedVideoH = video.videoHeight || cachedVideoH;
    }

    // Stabilization Logic (Damping 0.18)
    currentRoll = lerpAngle(currentRoll, targetRoll, 0.18);
    angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
    
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
        fpsFrameCount = 0;
        fpsLastTime = now;
        debugInfo.innerHTML = `V3.2-SHIELD | FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
    }
    fpsFrameCount++;

    // RENDER: Internally handles all NaN/Shield cases
    renderToCtx(ctx, canvas.width, canvas.height, true);
    if (isRecording) {
        renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
    }

    animationId = requestAnimationFrame(draw);
}
