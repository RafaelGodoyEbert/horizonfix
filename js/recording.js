// ============================================================
// recording.js — Video recording, saving, and time display
// ============================================================

// Recording logic
const btnRecord = document.getElementById('btn-record');
const recordingTime = document.getElementById('recording-time');
const timeDisplay = document.getElementById('time-display');

btnRecord.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    recordedChunks = [];

    // Set recording resolution based on selected Aspect Ratio
    if (recAspectRatio > 1) {
        // LANDSCAPE (16:9)
        recCanvas.width = 1920;
        recCanvas.height = 1080;
    } else {
        // PORTRAIT (9:16)
        recCanvas.width = 1080;
        recCanvas.height = 1920;
    }

    // Chrome BUG FIX: captureStream() on an unattached canvas often fails or records 0 bytes.
    // We append it to the body hidden, so the browser graphics engine considers it "active".
    if (!document.getElementById('hidden-rec-canvas')) {
        recCanvas.id = 'hidden-rec-canvas';
        recCanvas.style.position = 'absolute';
        recCanvas.style.opacity = '0';
        recCanvas.style.pointerEvents = 'none';
        recCanvas.style.width = '1px';
        recCanvas.style.height = '1px';
        document.body.appendChild(recCanvas);
    }

    // captureStream() with NO argument = capture a frame each time canvas is painted.
    // Each frame gets a real-time timestamp matching when it was actually rendered.
    // captureStream(30) was WRONG: it assigned fixed 1/30s timestamps per frame,
    // but the canvas paint rate was ~15fps, so 20s of recording only produced
    // 10s of video content (300 frames × 1/30s = 10s instead of 300 × 1/15s = 20s).
    // captureStream(30) forces exactly 30fps. The Android Native Gallery HATES variable
    // frame rate (which happens when you pass no arguments). If frames drop, the gallery
    // speeds up the video (10s becomes 4s). 30fps guarantees constant timeframe.
    const canvasStream = recCanvas.captureStream(30);

    // Prioritize WebM (with H.264) for Hardware Acceleration!
    // We CANNOT use 'video/mp4' as the primary choice because ysFixWebmDuration 
    // only injects missing duration metadata into WebM containers. Without it, 
    // Android Gallery and WhatsApp will see a 8s video as 3s.
    const mimeTypes = [
        'video/webm;codecs=h264',   // Standard HW Accelerated on Chrome Android (best for ysFixWebmDuration)
        'video/webm;codecs=vp8',    // Lighter fallback
        'video/webm',               // General WebM
        'video/mp4',                // Fallback (will break duration in Gallery!)
        ''  // Let browser choose
    ];

    let chosenMime = '';
    for (const mime of mimeTypes) {
        if (mime === '' || MediaRecorder.isTypeSupported(mime)) {
            chosenMime = mime;
            break;
        }
    }

    try {
        // Request 8 Mbps (stable for 1080p H264 hardware encoders without dropping frames)
        const options = chosenMime ? { mimeType: chosenMime, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 };
        mediaRecorder = new MediaRecorder(canvasStream, options);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Save video ONLY after MediaRecorder has fully stopped and flushed
            saveVideo();
        };

        mediaRecorder.start(500);
        isRecording = true;

        // Request Screen Wake Lock
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen')
                .then(lock => { wakeLock = lock; })
                .catch(err => console.warn('Wake Lock request failed:', err));
        }

        // UI Updates
        btnRecord.classList.add('recording');
        recordingTime.style.display = 'flex';
        recordingStartTime = Date.now();
        updateRecordingTime();
        recordingInterval = setInterval(updateRecordingTime, 1000);

        const mbps = (options.videoBitsPerSecond / 1000000).toFixed(1);
        camDebugInfo.innerHTML += `<br>Rec: ${chosenMime ? chosenMime.substring(0, 10) : 'auto'} | ${mbps} Mbps`;

    } catch (e) {
        console.error("Exception while creating MediaRecorder:", e);
        alert("Falha ao iniciar gravação: " + e.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        isRecording = false;

        // UI Updates
        btnRecord.classList.remove('recording');
        recordingTime.style.display = 'none';
        clearInterval(recordingInterval);
        timeDisplay.innerText = "00:00";

        // Release Screen Wake Lock
        if (wakeLock !== null) {
            wakeLock.release().then(() => { wakeLock = null; });
        }

        // Stop triggers onstop which calls saveVideo
        mediaRecorder.stop();
    }
}

function updateRecordingTime() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timeDisplay.innerText = `${minutes}:${seconds}`;
}

function saveVideo() {
    const rawBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/mp4' });
    const durationMs = Date.now() - recordingStartTime;

    // Fallback save function in case the fixer script didn't load (AdBlock, etc)
    const fallbackSave = () => {
        const url = URL.createObjectURL(rawBlob);
        const a = document.createElement('a');
        let ext = 'mp4';
        if (mediaRecorder.mimeType && mediaRecorder.mimeType.toLowerCase().includes('webm')) ext = 'webm';
        const date = new Date();
        const filename = `HorizonRaw_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.${ext}`;
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
    };

    // FIX THE METADATA FOR WHATSAPP/GALLERY (Now using webm-duration-fix for H.264 support)
    if (typeof webmFixDuration !== 'undefined') {
        try {
            webmFixDuration(rawBlob, durationMs, {logger: false})
                .then(function (fixedBlob) {
                    const url = URL.createObjectURL(fixedBlob);
                    const a = document.createElement('a');

                    let ext = 'mp4';
                    if (mediaRecorder.mimeType && mediaRecorder.mimeType.toLowerCase().includes('webm')) ext = 'webm';

                    const date = new Date();
                    const filename = `HorizonFix_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.${ext}`;

                    document.body.appendChild(a);
                    a.style = 'display: none';
                    a.href = url;
                    a.download = filename;
                    a.click();
                    setTimeout(() => window.URL.revokeObjectURL(url), 100);
                })
                .catch(function (err) {
                    console.error("webmFixDuration failed during H.264 processing, falling back to raw save:", err);
                    fallbackSave();
                });
        } catch (err) {
            console.error("webmFixDuration initial setup failed, falling back to raw save:", err);
            fallbackSave();
        }
    } else {
        console.warn("webm-duration-fix library not loaded! Falling back to raw save without duration metadata.");
        fallbackSave();
    }
}
