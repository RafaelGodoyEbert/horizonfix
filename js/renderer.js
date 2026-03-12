// ============================================================
// renderer.js — Core Rendering Engine (v2.7.2)
// ============================================================

/**
 * Helper: Linear interpolation for angles (shortest path)
 */
function lerpAngle(start, end, factor) {
    let diff = ((end - start + 180) % 360) - 180;
    if (diff < -180) diff += 360;
    return start + diff * factor;
}

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
    const FRAME_V_SCALE = 0.8;

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame (The "bright rectangle")
    // We always aim for a horizontal 16:9 stabilized output.
    let frameW, frameH;
    
    // In portrait phone: width is small. frameW = width * 0.8
    // In landscape phone: height is small. frameH = height * 0.8
    if (screenWidth < screenHeight) {
        frameW = minDim * FRAME_V_SCALE;
        frameH = frameW / TARGET_ASPECT;
    } else {
        frameH = minDim * FRAME_V_SCALE / 1.5; // Slight reduction in landscape to fit buttons
        frameW = frameH * TARGET_ASPECT;
    }

    // 3. Constraints: Frame cannot exceed the visible video image
    const visVideoW = vW * finalVFScale;
    const visVideoH = vH * finalVFScale;
    
    // If zoom is too low (e.g. 0.5), force the frame to stay inside the sensor
    if (frameW > visVideoW * 0.95) {
        frameW = visVideoW * 0.95;
        frameH = frameW / TARGET_ASPECT;
    }
    if (frameH > visVideoH * 0.95) {
        frameH = visVideoH * 0.95;
        frameW = frameH * TARGET_ASPECT;
    }

    return { w: frameW, h: frameH, vfScale: finalVFScale };
}

/**
 * Renders the video frame to a specific context (Viewfinder or Recording)
 */
function renderToCtx(ctx, width, height, isViewfinder = false) {
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH) return;

    const centerX = width / 2;
    const centerY = height / 2;
    
    // Get parameters from Screen perspective (always used for both contexts)
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
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

        if (isHorizonLockActive) {
            drawViewfinderHUD(ctx, width, height, visual);
        }
    } else {
        // --- RECORDING RENDERING ---
        // Clean output without UI. Stabilized.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-currentRoll * (Math.PI / 180));

        // SYNC MATH:
        // We want the content that was inside visual.h to fill 'height' (1080).
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
    const rad = -currentRoll * (Math.PI / 180);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    // Atomic Shadow Mask
    ctx.beginPath();
    const big = Math.max(width, height) * 4;
    ctx.rect(-big / 2, -big / 2, big, big);
    ctx.rect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill('evenodd');

    // White Frame
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    // Horizon Center Blue Line
    ctx.beginPath();
    ctx.moveTo(-40, 0); ctx.lineTo(40, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 3;
    ctx.stroke();

    // Corner Pro Accents
    const cs = 25; ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
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

        currentRoll = lerpAngle(currentRoll, targetRoll, 0.70);
        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
        
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `V2.7 | FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
        }
        fpsFrameCount++;

        renderToCtx(ctx, canvas.width, canvas.height, true);
        if (isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
        }
    }
    animationId = requestAnimationFrame(draw);
}
