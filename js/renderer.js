// ============================================================
// renderer.js — Core Rendering Engine (v2.8)
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
    const FRAME_V_SCALE = 0.90; // High coverage

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame
    let frameW, frameH;
    
    if (screenWidth < screenHeight) {
        frameW = minDim * FRAME_V_SCALE;
        frameH = frameW / TARGET_ASPECT;
    } else {
        frameH = minDim * FRAME_V_SCALE;
        frameW = frameH * TARGET_ASPECT;
    }

    // 3. SENSOR CONSTRAINTS (Prevent black edges)
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

    // Safety fallback
    if (isNaN(frameW) || frameW <= 0) frameW = 200;
    if (isNaN(frameH) || frameH <= 0) frameH = 112;

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
    
    // Safety
    if (isNaN(currentRoll)) currentRoll = 0;
    if (isNaN(zoomFactor)) zoomFactor = 1.0;

    const screenW = window.innerWidth || 1080;
    const screenH = window.innerHeight || 1920;
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, zoomFactor);

    if (isViewfinder) {
        // --- VIEWPORT ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(visual.vfScale, visual.vfScale);
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();

        if (isHorizonLockActive) {
            drawViewfinderHUD(ctx, width, height, visual);
        }
    } else {
        // --- RECORDING ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(currentRoll * (Math.PI / 180));

        // Sync Content to filling 1080p
        const recScale = (height / visual.h) * visual.vfScale;
        ctx.scale(recScale, recScale);
        
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();
    }
}

/**
 * HUD & Robust Masking
 */
function drawViewfinderHUD(ctx, width, height, visual) {
    const rad = currentRoll * (Math.PI / 180);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    // --- ROBUST 4-RECT OVERLAPPING MASK ---
    // Why: even-odd and paths sometimes flicker on sub-pixels. 
    // Solid overlapping rects are mathematically immune to edge gaps.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    const big = Math.max(width, height) * 5;
    const ov = 2; // 2px overlap (The "Immunity Gap")

    // Top
    ctx.fillRect(-big/2, -big/2, big, big/2 - visual.h/2 + ov);
    // Bottom
    ctx.fillRect(-big/2, visual.h/2 - ov, big, big/2 - visual.h/2 + ov);
    // Left
    ctx.fillRect(-big/2, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2);
    // Right
    ctx.fillRect(visual.w/2 - ov, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2);

    // --- HUD LINES ---
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Leveler Center
    ctx.beginPath();
    ctx.moveTo(-50, 0); ctx.lineTo(50, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    ctx.stroke();

    // Corner Pro Accents
    const cs = 35; ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff';
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

        // GIMBAL-GRADE LERP (0.20): 
        // Balances responsiveness while removing all tripod jitter combined with Sensors LPF.
        currentRoll = lerpAngle(currentRoll, targetRoll, 0.20);
        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
        
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `V2.8 | FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
        }
        fpsFrameCount++;

        renderToCtx(ctx, canvas.width, canvas.height, true);
        if (isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
        }
    }
    animationId = requestAnimationFrame(draw);
}
