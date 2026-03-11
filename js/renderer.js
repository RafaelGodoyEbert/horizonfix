// ============================================================
// renderer.js — Canvas rendering and the main draw loop
// ============================================================

// Draw frame onto a given context
function renderToCtx(context, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;

    // Clear canvas behind
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(centerX, centerY);

    if (isHorizonLockActive) {
        // Rotate the canvas in the opposite direction of the tilt
        const rad = -currentRoll * (Math.PI / 180);
        context.rotate(rad);

        // Apply Crop/Zoom to hide black borders caused by rotation
        context.scale(zoomFactor, zoomFactor);
    } else {
        context.scale(1.0, 1.0);
    }

    // FULL DIAGONAL COVERAGE
    // Draw the video large enough that its shortest side covers the full canvas diagonal.
    // This ensures no black borders appear at ANY rotation angle.
    const diagonal = Math.sqrt(width * width + height * height);

    // Calculate video base ratio
    const vW = video.videoWidth;
    const vH = video.videoHeight;

    // MATH GUARD: If sensor flips and reports 0x0 momentarily, do not draw and avoid NaN crashes
    if (!vW || !vH || vW === 0 || vH === 0) {
        context.restore();
        return;
    }

    const videoRatio = vW / vH;
    let drawWidth, drawHeight;

    // We force the drawn video to cover the entire diagonal circle.
    // This means we crop into the center of the sensor (just like the S26 Ultra does).
    if (videoRatio > 1) {
        // Landscape video source
        drawHeight = diagonal;
        drawWidth = diagonal * videoRatio;
    } else {
        // Portrait video source
        drawWidth = diagonal;
        drawHeight = diagonal / videoRatio;
    }

    // Center the massive video image inside the canvas.
    // Since we applied context.translate(centerX, centerY) earlier, we draw from -drawWidth/2
    context.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
}

// The Magic Rendering Loop
function draw() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Match canvas to CSS pixel size (NOT physical pixels)
        // Using window.innerWidth/Height gives small, fast canvas sizes
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        // Smooth the rotation angle using lerp (0.1 = 10% interpolation per frame)
        // Higher value = faster/snappier, Lower value = smoother/slower
        currentRoll = lerpAngle(currentRoll, targetRoll, 0.2);

        // FPS counter — update every 500ms to minimize overhead
        fpsFrameCount++;
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `FPS: ${fpsDisplay} | Roll: ${Math.round(currentRoll)}°<br>B: ${Math.round(lastBeta)}° G: ${Math.round(lastGamma)}°<br>${canvas.width}x${canvas.height} | Evt: ${sensorEventCount}`;
        }

        // Update UI text
        angleText.innerText = Math.abs(currentRoll).toFixed(1) + '°';
        horizonLine.style.transform = `rotate(${-currentRoll}deg)`;

        // Render to screen map
        renderToCtx(ctx, canvas.width, canvas.height);

        if (isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height);
        }
    }

    animationId = requestAnimationFrame(draw);
}
