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
function draw(timestamp, metadata) {
    if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        // ── Interpolation + Adaptive Filtering
        // We use the frame timestamp (from rVFC or rAF) for the EXACT historical angle
        const targetTimestamp = (metadata && metadata.presentationTime) || timestamp || performance.now();
        const exactTargetRoll = getInterpolatedRoll(targetTimestamp);

        // Dynamic Tau: Higher rotation speed = faster response (less smoothing)
        const baseTau = 0.05;
        const velocityScale = 0.005; 
        const dynamicTau = Math.min(1.0, baseTau + ((window.state.angularVelocity || 0) * velocityScale));

        window.state.currentRoll = lerpAngle(window.state.currentRoll || 0, exactTargetRoll, dynamicTau);

        // FPS counter
        fpsFrameCount++;
        const now = performance.now();
        if (now - fpsLastTime >= 500) {
            fpsDisplay = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
            fpsFrameCount = 0;
            fpsLastTime = now;
            debugInfo.innerHTML = `V4.0 | FPS: ${fpsDisplay} | Tau: ${dynamicTau.toFixed(3)} | V: ${Math.round(window.state.angularVelocity || 0)}°/s`;
        }

        angleText.innerText = Math.abs(window.state.currentRoll).toFixed(1) + '°';
        if (horizonLine) horizonLine.style.transform = `rotate(${-window.state.currentRoll}deg)`;

        renderToCtx(ctx, canvas.width, canvas.height);

        if (window.state.isRecording) {
            renderToCtx(recCtx, recCanvas.width, recCanvas.height);
        }
    }

    if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(draw);
    } else {
        animationId = requestAnimationFrame(draw);
    }
}

// Start the loop
if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(draw);
} else {
    animationId = requestAnimationFrame(draw);
}
