// ============================================================
// renderer.js — Core Rendering Engine (v2.9)
// ============================================================

/**
 * Calculates the visual frame size as seen on the screen.
 * Synchronized with the dynamic aspect ratio.
 */
function getVisualFrameSize(screenWidth, screenHeight, vW, vH, currentZoom) {
    const minDim = Math.min(screenWidth, screenHeight);
    
    // 1. Scene background scale
    const videoRatio = vW / vH;
    const screenRatio = screenWidth / screenHeight;
    const FRAME_V_SCALE = 0.90;

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame (The "bright rectangle")
    // Use the global 'recAspectRatio' (16/9 or 9/16)
    const targetAspect = recAspectRatio;
    let frameW, frameH;
    
    if (targetAspect > 1) {
        // 16:9 Mode (Horizontal)
        frameW = minDim * FRAME_V_SCALE;
        if (screenWidth > screenHeight) frameW = screenW * 0.5; // Wider in landscape
        frameH = frameW / targetAspect;
        
        // Safety: ensure it fits height
        if (frameH > screenHeight * 0.8) {
            frameH = screenHeight * 0.8;
            frameW = frameH * targetAspect;
        }
    } else {
        // 9:16 Mode (Vertical)
        frameH = screenHeight * 0.7;
        frameW = frameH * targetAspect;
        
        // Safety: ensure it fits width
        if (frameW > screenWidth * 0.8) {
            frameW = screenWidth * 0.8;
            frameH = frameW / targetAspect;
        }
    }

    // 3. Sensor Constraints (Hardware limit)
    const visVideoW = vW * finalVFScale;
    const visVideoH = vH * finalVFScale;
    
    if (frameW > visVideoW * 0.98) {
        frameW = visVideoW * 0.98;
        frameH = frameW / targetAspect;
    }
    if (frameH > visVideoH * 0.98) {
        frameH = visVideoH * 0.98;
        frameW = frameH * targetAspect;
    }

    // Static fallbacks
    if (isNaN(frameW) || frameW <= 0) frameW = 200;
    if (isNaN(frameH) || frameH <= 0) frameH = 200 / targetAspect;

    return { w: frameW, h: frameH, vfScale: finalVFScale };
}

/**
 * Renders the video frame to a specific context
 */
function renderToCtx(ctx, width, height, isViewfinder = false) {
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH || vW === 0 || vH === 0) return;

    const centerX = width / 2;
    const centerY = height / 2;
    
    // Fallback protection for globals
    const currentR = isNaN(currentRoll) ? 0 : currentRoll;
    const currentZ = isNaN(zoomFactor) ? 1.0 : zoomFactor;

    const screenW = window.innerWidth || 1080;
    const screenH = window.innerHeight || 1920;
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, currentZ);

    if (isViewfinder) {
        // --- VIEWPORT ---
        ctx.fillStyle = '#111'; // Darker base to emphasize frame
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(visual.vfScale, visual.vfScale);
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();

        if (isHorizonLockActive) {
            drawViewfinderHUD(ctx, width, height, visual, currentR);
        }
    } else {
        // --- RECORDING ---
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(currentR * (Math.PI / 180));

        // Content Sync
        const recScale = (height / visual.h) * visual.vfScale;
        ctx.scale(recScale, recScale);
        
        ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
        ctx.restore();
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
    // Increased overlap and 'big' size for extreme rotation safety.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const big = Math.max(width, height) * 6; // Increased to 6x
    const ov = 4; // 4px overlap for maximum safety

    // Outer Hood
    // Top
    ctx.fillRect(-big/2, -big/2, big, big/2 - visual.h/2 + ov);
    // Bottom
    ctx.fillRect(-big/2, visual.h/2 - ov, big, big/2 - visual.h/2 + ov);
    // Left
    ctx.fillRect(-big/2, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2);
    // Right
    ctx.fillRect(visual.w/2 - ov, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2);

    // --- SHARP HUD ---
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Center Leveler
    ctx.beginPath();
    ctx.moveTo(-50, 0); ctx.lineTo(50, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    ctx.stroke();

    // Corner Marks
    const cs = 35; ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
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

        // SMOOTH stabilization (Tuned to 0.18 for gimbal smoothness)
        currentRoll = lerpAngle(currentRoll, targetRoll, 0.18);
        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
        
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `V2.9 | FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
        }
        fpsFrameCount++;

        renderToCtx(ctx, canvas.width, canvas.height, true);
        if (isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
        }
    }
    animationId = requestAnimationFrame(draw);
}
