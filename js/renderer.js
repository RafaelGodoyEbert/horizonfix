// Core Constants for the "Quadro Vivo" Concept
const CROP_FACTOR = 0.8; // The frame covers 80% of the screen min dimension
const OUTPUT_ASPECT = 16 / 9;

/**
 * Draw frame onto a given context
 */
function renderToCtx(context, width, height, isViewfinder = false) {
    const centerX = width / 2;
    const centerY = height / 2;

    // --- CRITICAL: PREVENT FLICKER ---
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const diagonal = Math.sqrt(width * width + height * height);

    if (!vW || !vH || vW === 0 || vH === 0) return;

    const videoRatio = vW / vH;
    const screenRatio = width / height;

    // 1. Calculate Viewfinder Background Scale (to cover the screen)
    let vfBgScale;
    if (videoRatio > screenRatio) {
        vfBgScale = height / vH;
    } else {
        vfBgScale = width / vW;
    }

    if (isViewfinder) {
        // --- VIEWFINDER MODE ---
        context.save();
        context.translate(centerX, centerY);
        
        // Background Zoom
        context.scale(zoomFactor, zoomFactor);

        const drawW = vW * vfBgScale;
        const drawH = vH * vfBgScale;
        context.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
        context.restore();

        // 2. Overlay
        if (isHorizonLockActive) {
            drawLiveFrame(context, width, height, vfBgScale);
        }

    } else {
        // --- RECORDING MODE ---
        // We want the output to be exactly what was inside the frame indicator.
        context.save();
        context.translate(centerX, centerY);

        const rad = -currentRoll * (Math.PI / 180);
        context.rotate(rad);

        // SYNC MATH:
        // The viewfinder frame height is roughly (minDim * CROP_FACTOR / OUTPUT_ASPECT).
        // We want the recording height to match this content.
        const minDim = Math.min(window.innerWidth, window.innerHeight);
        const visualFrameHeight = (minDim * CROP_FACTOR) / OUTPUT_ASPECT;
        
        // Recording scale factor: how much to zoom the sensor so the frame content fills the canvas
        const scaleMatch = height / visualFrameHeight;
        const finalScale = scaleMatch * vfBgScale * zoomFactor;

        // Safety: Ensure we cover at least the diagonal to avoid black corners during rotation
        const minDiagonalScale = diagonal / Math.min(vW, vH);
        const safeScale = Math.max(finalScale, minDiagonalScale);

        context.scale(safeScale, safeScale);
        context.drawImage(video, -vW / 2, -vH / 2, vW, vH);
        context.restore();
    }
}

/**
 * Function to draw the dynamic rotating frame and horizon line
 */
function drawLiveFrame(context, width, height, vfBgScale) {
    const centerX = width / 2;
    const centerY = height / 2;
    const rad = -currentRoll * (Math.PI / 180);

    const minDim = Math.min(width, height);
    const frameSize = minDim * CROP_FACTOR;
    let frameW, frameH;
    
    if (width > height) {
        frameW = frameSize;
        frameH = frameSize / OUTPUT_ASPECT;
    } else {
        frameH = frameSize;
        frameW = frameSize / OUTPUT_ASPECT;
    }

    // 1. Shadow overlay (Dimming)
    // We use 4 overlapping rectangles to avoid sub-pixel flickering at the seams.
    context.save();
    context.translate(centerX, centerY);
    context.rotate(rad);

    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const big = Math.max(width, height) * 4;
    const overlap = 2; // 2px overlap to prevent GPU seam flickering

    // Top block
    context.fillRect(-big/2, -big/2, big, big/2 - frameH/2 + overlap);
    // Bottom block
    context.fillRect(-big/2, frameH/2 - overlap, big, big/2 - frameH/2 + overlap);
    // Left block
    context.fillRect(-big/2, -frameH/2 - overlap, big/2 - frameW/2 + overlap, frameH + overlap*2);
    // Right block
    context.fillRect(frameW/2 - overlap, -frameH/2 - overlap, big/2 - frameW/2 + overlap, frameH + overlap*2);

    // 2. Draw Frame Border
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);
    
    // 3. Draw "Vergalhão" (Horizon Line)
    context.beginPath();
    context.moveTo(-30, 0);
    context.lineTo(30, 0);
    context.strokeStyle = '#00f2fe';
    context.lineWidth = 4;
    context.stroke();
    
    // Corner marks (Pro Stylized)
    const cornerSize = 25;
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    
    // Top-Left
    context.beginPath();
    context.moveTo(-frameW/2 + cornerSize, -frameH/2);
    context.lineTo(-frameW/2, -frameH/2);
    context.lineTo(-frameW/2, -frameH/2 + cornerSize);
    context.stroke();

    // Top-Right
    context.beginPath();
    context.moveTo(frameW/2 - cornerSize, -frameH/2);
    context.lineTo(frameW/2, -frameH/2);
    context.lineTo(frameW/2, -frameH/2 + cornerSize);
    context.stroke();

    // Bottom-Left
    context.beginPath();
    context.moveTo(-frameW/2 + cornerSize, frameH/2);
    context.lineTo(-frameW/2, frameH/2);
    context.lineTo(-frameW/2, frameH/2 - cornerSize);
    context.stroke();

    // Bottom-Right
    context.beginPath();
    context.moveTo(frameW/2 - cornerSize, frameH/2);
    context.lineTo(frameW/2, frameH/2);
    context.lineTo(frameW/2, frameH/2 - cornerSize);
    context.stroke();

    context.restore();
}

/**
 * Main Rendering Loop
 */
function draw() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        // REDUCED LERP for STABILITY (from 0.95 to 0.70)
        currentRoll = lerpAngle(currentRoll, targetRoll, 0.70);

        // Update Debug Data
        fpsFrameCount++;
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `FPS: ${fpsDisplay} | R: ${Math.round(currentRoll)}°`;
            camDebugInfo.innerHTML = `Raw: ${Math.round(lastBeta)}/${Math.round(lastGamma)} | Evt: ${sensorEventCount}`;
        }

        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';

        // Render to screen
        renderToCtx(ctx, canvas.width, canvas.height, true);

        if (isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
        }
    }

    animationId = requestAnimationFrame(draw);
}
