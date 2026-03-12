// ============================================================
// renderer.js — Core Rendering Engine (v2.7.3)
// ============================================================

/**
 * Calculates the visual frame size as seen on the screen.
 * This is crucial for synchronizing the recording.
 */
function getVisualFrameSize(screenWidth, screenHeight, vW, vH, currentZoom) {
    const minDim = Math.min(screenWidth, screenHeight);
    
    // 1. Calculate how the video fills the screen (VF background scale)
    const videoRatio = vW / vH;
    const screenRatio = screenWidth / screenHeight;
    const TARGET_ASPECT = 16 / 9;
    const FRAME_V_SCALE = 0.90; // INCREASED to reduce crop/zoom

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    // digital zoom factor
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame (The "bright rectangle")
    let frameW, frameH;
    
    // Constraint: Height MUST be TARGET_ASPECT relative to Width (or vice versa)
    if (screenWidth < screenHeight) {
        // Portrait phone: Width limited
        frameW = minDim * FRAME_V_SCALE;
        frameH = frameW / TARGET_ASPECT;
    } else {
        // Landscape phone: Height limited
        frameH = minDim * FRAME_V_SCALE;
        frameW = frameH * TARGET_ASPECT;
    }

    // 3. SENSOR CONSTRAINTS (CRITICAL for Zoom 0.5x)
    // The frame box on screen cannot be larger than the visible sensor pixels
    const visVideoW = vW * finalVFScale;
    const visVideoH = vH * finalVFScale;
    
    if (frameW > visVideoW * 0.98) {
        frameW = visVideoW * 0.98;
        frameH = frameW / TARGET_ASPECT;
    }
    if (frameH > visVideoH * 0.98) {
        frameH = visVideoH * 0.98;
        frameW = frameH * TARGET_ASPECT;
    }

    // Safety fallback for NaN
    if (isNaN(frameW) || frameW <= 0) frameW = 100;
    if (isNaN(frameH) || frameH <= 0) frameH = 56;

    return { w: frameW, h: frameH, vfScale: finalVFScale };
}

/**
 * Renders the video frame to a specific context (Viewfinder or Recording)
 */
function renderToCtx(ctx, width, height, isViewfinder = false) {
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH || vW === 0 || vH === 0) return;

    const centerX = width / 2;
    const centerY = height / 2;
    
    // Safety check for global variables
    if (isNaN(currentRoll)) currentRoll = 0;
    if (isNaN(zoomFactor)) zoomFactor = 1.0;

    // Get parameters from Screen perspective
    const screenW = window.innerWidth || 1080;
    const screenH = window.innerHeight || 1920;
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, zoomFactor);

    if (isViewfinder) {
        // --- VIEWPORT RENDERING ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(visual.vfScale, visual.vfScale);
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();

        // Overlay is drawn if lock is on OR if we just want it always visible (User said 'Quadro Vivo' concept)
        if (isHorizonLockActive) {
            drawViewfinderHUD(ctx, width, height, visual);
        }
    } else {
        // --- RECORDING RENDERING ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        // COUNTER-ROTATE the sensor image to keep content level
        ctx.rotate(currentRoll * (Math.PI / 180));

        // SYNC MATH:
        // We want the area that was inside 'visual.h' on screen to fill 'height' (1080)
        const recScale = (height / visual.h) * visual.vfScale;
        ctx.scale(recScale, recScale);
        
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();
    }
}

/**
 * HUD & Masking
 */
function drawViewfinderHUD(ctx, width, height, visual) {
    // Rotation for HUD: The HUD box itself rotates relative to the screen
    // to keep its horizontal axis level with gravity.
    const rad = currentRoll * (Math.PI / 180);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    // Atomic Shadow Mask (Even-Odd)
    ctx.beginPath();
    const big = Math.max(width, height) * 5;
    ctx.rect(-big / 2, -big / 2, big, big);
    ctx.rect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill('evenodd');

    // White Border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Horizon Center Cross (Pro-look)
    ctx.beginPath();
    ctx.moveTo(-50, 0); ctx.lineTo(50, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    ctx.stroke();

    // Corner Pro Accents
    const cs = 30; ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff';
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
 * Main Loop
 */
function draw() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const dW = window.innerWidth;
        const dH = window.innerHeight;
        if (canvas.width !== dW || canvas.height !== dH) {
            canvas.width = dW; canvas.height = dH;
        }

        // SMOOTH stabilization (Damping 0.40 for pro feel, 0.70 was too twitchy)
        currentRoll = lerpAngle(currentRoll, targetRoll, 0.40);
        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
        
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `V2.7.3 | FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
        }
        fpsFrameCount++;

        renderToCtx(ctx, canvas.width, canvas.height, true);
        if (isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
        }
    }
    animationId = requestAnimationFrame(draw);
}
