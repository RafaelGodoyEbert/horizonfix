// ============================================================
// renderer.js — Core Rendering Engine (v3.1 NaN-Shield)
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
    const FRAME_V_SCALE = 0.92;

    let baseVFScale;
    if (videoRatio > screenRatio) {
        baseVFScale = screenHeight / vH;
    } else {
        baseVFScale = screenWidth / vW;
    }
    const finalVFScale = baseVFScale * currentZoom;

    // 2. Define the recording frame
    const targetAspect = window.recAspectRatio || (16/9);
    let frameW, frameH;
    
    if (targetAspect > 1) {
        // Landscape (16:9)
        frameW = (screenWidth < screenHeight) ? (screenWidth * 0.95) : (screenWidth * 0.6);
        frameH = frameW / targetAspect;
        if (frameH > screenHeight * 0.85) {
            frameH = screenHeight * 0.85;
            frameW = frameH * targetAspect;
        }
    } else {
        // Portrait (9:16)
        frameH = screenHeight * 0.75;
        frameW = frameH * targetAspect;
        if (frameW > screenWidth * 0.85) {
            frameW = screenWidth * 0.85;
            frameH = frameW / targetAspect;
        }
    }

    // 3. Sensor Constraints (Hardware Limit)
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

    // --- NaN / ZERO SHIELD ---
    if (isNaN(frameW) || isNaN(frameH) || isNaN(finalVFScale) || frameW <= 0 || frameH <= 0 || finalVFScale <= 0) {
        if (lastValidVisual) return lastValidVisual;
        // Absolute fallback if no cache exists yet
        return { w: 300, h: 168, vfScale: 1.0 };
    }

    const result = { w: frameW, h: frameH, vfScale: finalVFScale };
    lastValidVisual = result; // Update cache
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
    const visual = getVisualFrameSize(screenW, screenH, vW, vH, currentZ);

    if (isViewfinder) {
        ctx.fillStyle = '#000'; 
        ctx.fillRect(0, 0, width, height);

        if (video.readyState >= 2) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(visual.vfScale, visual.vfScale);
            ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
            ctx.restore();
        }

        if (isHorizonLockActive) {
            drawViewfinderHUD(ctx, width, height, visual, currentR);
        }
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        if (video.readyState >= 2) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(currentR * (Math.PI / 180));

            const recScale = (height / visual.h) * visual.vfScale;
            ctx.scale(recScale, recScale);
            
            ctx.drawImage(video, -vW/2, -vH/2, vW, vH);
            ctx.restore();
        }
    }
}

/**
 * HUD & G-SHIELD MASK (Deep Overlap)
 */
function drawViewfinderHUD(ctx, width, height, visual, roll) {
    const rad = roll * (Math.PI / 180);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rad);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    const big = Math.max(width, height) * 8; 
    const ov = 8; // Increased overlap for anti-flicker

    // Outer Hood
    ctx.fillRect(-big/2, -big/2, big, big/2 - visual.h/2 + ov); // Top
    ctx.fillRect(-big/2, visual.h/2 - ov, big, big/2 - visual.h/2 + ov); // Bottom
    ctx.fillRect(-big/2, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // Left
    ctx.fillRect(visual.w/2 - ov, -visual.h/2 - ov, big/2 - visual.w/2 + ov, visual.h + ov*2); // Right

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(-visual.w / 2, -visual.h / 2, visual.w, visual.h);

    ctx.beginPath();
    ctx.moveTo(-60, 0); ctx.lineTo(60, 0);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 4;
    ctx.stroke();

    const cs = 40; ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-visual.w/2+cs, -visual.h/2); ctx.lineTo(-visual.w/2, -visual.h/2); ctx.lineTo(-visual.w/2, -visual.h/2+cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(visual.w/2-cs, -visual.h/2); ctx.lineTo(visual.w/2, -visual.h/2); ctx.lineTo(visual.w/2, -visual.h/2+cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-visual.w/2+cs, visual.h/2); ctx.lineTo(-visual.w/2, visual.h/2); ctx.lineTo(-visual.w/2, visual.h/2-cs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(visual.w/2-cs, visual.h/2); ctx.lineTo(visual.w/2, visual.h/2); ctx.lineTo(visual.w/2, visual.h/2-cs); ctx.stroke();

    ctx.restore();
}

/**
 * Main Loop (v3.1)
 */
function draw() {
    const dW = window.innerWidth;
    const dH = window.innerHeight;
    if (canvas.width !== dW || canvas.height !== dH) {
        canvas.width = dW; canvas.height = dH;
    }

    if (video.readyState >= 2) {
        cachedVideoW = video.videoWidth || cachedVideoW;
        cachedVideoH = video.videoHeight || cachedVideoH;
    }

    currentRoll = lerpAngle(currentRoll, targetRoll, 0.18);
    angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
    
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
        fpsFrameCount = 0;
        fpsLastTime = now;
        debugInfo.innerHTML = `V3.1-SHIELD | FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
    }
    fpsFrameCount++;

    renderToCtx(ctx, canvas.width, canvas.height, true);
    if (isRecording) {
        renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
    }

    animationId = requestAnimationFrame(draw);
}
