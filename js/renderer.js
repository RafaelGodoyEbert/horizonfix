// ============================================================
// renderer.js — Canvas rendering and the main draw loop
// ============================================================

// Draw frame onto a given context
function renderToCtx(context, width, height, isViewfinder = false) {
    const centerX = width / 2;
    const centerY = height / 2;

    // --- CRITICAL: CLEAR CANVAS ---
    // Without this, transparent layers (overlays) stack and flicker during rotation
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    // Calculate video base ratio and diagonal
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const diagonal = Math.sqrt(width * width + height * height);

    // MATH GUARD: If sensor flips and reports 0x0 momentarily, do not draw and avoid NaN crashes
    if (!vW || !vH || vW === 0 || vH === 0) {
        return;
    }

    const videoRatio = vW / vH;

    if (isViewfinder) {
        // --- VIEWFINDER MODE: STATIC BACKGROUND + LIVE FRAME ---
        
        context.save();
        context.translate(centerX, centerY);
        
        // Application of zoom on the IMAGE (as requested)
        context.scale(zoomFactor, zoomFactor);

        let bgW, bgH;
        const screenRatio = width / height;
        if (videoRatio > screenRatio) {
            bgH = height;
            bgW = height * videoRatio;
        } else {
            bgW = width;
            bgH = width / videoRatio;
        }
        context.drawImage(video, -bgW / 2, -bgH / 2, bgW, bgH);
        context.restore();

        // 2. Draw the "Quadro Vivo" (Live Frame) OVER the background
        if (isHorizonLockActive) {
            drawLiveFrame(context, width, height, videoRatio);
        }

    } else {
        // --- RECORDING MODE: FULLY STABILIZED & CROPPED VIDEO ---
        context.save();
        context.translate(centerX, centerY);

        if (isHorizonLockActive) {
            const rad = -currentRoll * (Math.PI / 180);
            context.rotate(rad);
            context.scale(zoomFactor, zoomFactor);
        }

        let drawWidth, drawHeight;
        if (videoRatio > 1) {
            drawHeight = diagonal;
            drawWidth = diagonal * videoRatio;
        } else {
            drawWidth = diagonal;
            drawHeight = diagonal / videoRatio;
        }

        context.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        context.restore();
    }
}

// Function to draw the dynamic rotating frame and horizon line
function drawLiveFrame(context, width, height, videoRatio) {
    const centerX = width / 2;
    const centerY = height / 2;
    const rad = -currentRoll * (Math.PI / 180);

    context.save();
    context.translate(centerX, centerY);
    context.rotate(rad);

    // The FRAME represents the stabilization window.
    const frameSize = Math.min(width, height) * 0.8;
    let frameW, frameH;
    
    if (width > height) {
        frameW = frameSize;
        frameH = frameSize / (16/9);
    } else {
        frameH = frameSize;
        frameW = frameSize / (16/9);
    }

    // 1. Shadow overlay (Dimming)
    // Using a simpler approach to ensure no flickering
    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    
    context.beginPath();
    const big = Math.max(width, height) * 3;
    // Outer rect
    context.rect(-big/2, -big/2, big, big);
    // Inner hole (must be drawn in opposite direction or use evenodd)
    context.rect(frameW / 2, -frameH / 2, -frameW, frameH);
    context.fill();

    // 2. Draw Frame Border
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);
    
    // 3. Draw "Vergalhão" (Horizon Line)
    context.beginPath();
    context.moveTo(-30, 0);
    context.lineTo(30, 0);
    context.strokeStyle = '#00f2fe';
    context.lineWidth = 4; // Bolder for visibility
    context.stroke();
    
    // Corner marks
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

// Main Rendering Loop
function draw() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        // REDUCED LERP for STABILITY (from 0.95 to 0.70)
        // High values cause jitters ("moving like a madman"), low values smooth it out.
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
