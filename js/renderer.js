// ============================================================
// renderer.js — Canvas rendering and the main draw loop
// ============================================================

// Draw frame onto a given context
function renderToCtx(context, width, height, isViewfinder = false) {
    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate video base ratio and diagonal
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const diagonal = Math.sqrt(width * width + height * height);

    // MATH GUARD: If sensor flips and reports 0x0 momentarily, do not draw and avoid NaN crashes
    if (!vW || !vH || vW === 0 || vH === 0) {
        context.fillStyle = '#000';
        context.fillRect(0, 0, width, height);
        return;
    }

    const videoRatio = vW / vH;

    if (isViewfinder) {
        // --- VIEWFINDER MODE: STATIC BACKGROUND + LIVE FRAME ---
        
        // 1. Draw Static Background (Full Sensor)
        context.save();
        context.translate(centerX, centerY);
        
        // Apply Zoom to the background as well so it doesn't feel like the frame is shrinking
        context.scale(zoomFactor, zoomFactor);

        // We draw the video to cover the screen (like a normal camera app)
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
            // Rotate the canvas in the opposite direction of the tilt
            const rad = -currentRoll * (Math.PI / 180);
            context.rotate(rad);

            // Apply Crop/Zoom to hide black borders caused by rotation
            context.scale(zoomFactor, zoomFactor);
        }

        let drawWidth, drawHeight;
        // We force the drawn video to cover the entire diagonal circle.
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
    // Since the background now zooms, the frame should remain a fixed size relative to the screen.
    const frameSize = Math.min(width, height) * 0.8;
    let frameW, frameH;
    
    // Default to 16:9 for the frame
    if (width > height) {
        frameW = frameSize;
        frameH = frameSize / (16/9);
    } else {
        frameH = frameSize;
        frameW = frameSize / (16/9);
    }

    // 1. Dim area outside the frame (Inverse Reality effect)
    // We use a large rectangle with a hole to shadow the areas NOT being recorded.
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    context.beginPath();
    const big = Math.max(width, height) * 2; 
    context.rect(-big, -big, big * 2, big * 2);
    context.rect(-frameW / 2, -frameH / 2, frameW, frameH);
    context.fill('evenodd');

    // 2. Draw Frame Border
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 2;
    context.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);
    
    // 3. Draw "Vergalhão" (Horizon Line) within the frame
    context.beginPath();
    context.moveTo(-30, 0);
    context.lineTo(30, 0);
    context.strokeStyle = '#00f2fe';
    context.lineWidth = 3;
    context.stroke();
    
    // Corner marks for the "Pro" look
    const cornerSize = 20;
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

// The Magic Rendering Loop
function draw() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Match canvas to CSS pixel size
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        // Smooth the rotation angle using lerp (0.95 = FAST interpolation per frame)
        currentRoll = lerpAngle(currentRoll, targetRoll, 0.95);

        // FPS counter
        fpsFrameCount++;
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `FPS: ${fpsDisplay} | Roll: ${Math.round(currentRoll)}°<br>B: ${Math.round(lastBeta)}° G: ${Math.round(lastGamma)}°<br>${canvas.width}x${canvas.height} | Evt: ${sensorEventCount}`;
        }

        // Update UI text (we keep some standard UI but let the Canvas do the heavy lifting)
        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
        
        // Render to screen (Viewfinder mode)
        renderToCtx(ctx, canvas.width, canvas.height, true);

        if (isRecording) {
            // Recording uses the same math but clean output (No Frame overlay)
            renderToCtx(recCtx, recCanvas.width, recCanvas.height, false);
        }
    }

    animationId = requestAnimationFrame(draw);
}
