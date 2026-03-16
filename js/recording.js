// ============================================================
// recording.js — Video Capture (v4.0)
// ============================================================

function startRecording() {
    recordedChunks = [];
    const s = window.state;

    // Set recording resolution based on selected Aspect Ratio
    if (s.recAspectRatio > 1) {
        recCanvas.width = 1920;
        recCanvas.height = 1080;
    } else {
        recCanvas.width = 1080;
        recCanvas.height = 1920;
    }

    if (!recCanvas.parentElement) {
        recCanvas.style.display = 'none';
        document.body.appendChild(recCanvas);
    }

    const stream = recCanvas.captureStream(60);
    const options = { mimeType: 'video/webm;codecs=vp8' };
    
    // Check for H.264 support if available
    if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        options.mimeType = 'video/webm;codecs=h264';
    }

    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = async () => {
        const fullBlob = new Blob(recordedChunks, { type: 'video/webm' });
        
        // WhatsApp/Browser Fix: Inject duration
        const fixedBlob = await fixWebmDuration(fullBlob);
        
        const url = URL.createObjectURL(fixedBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `HorizonFix-${ts}.webm`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    };

    mediaRecorder.start();
    s.isRecording = true;
    recordingStartTime = Date.now();
    updateRecordingTime();
    recordingInterval = setInterval(updateRecordingTime, 1000);

    const btn = document.getElementById('btn-record');
    btn.classList.add('recording');
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    window.state.isRecording = false;
    clearInterval(recordingInterval);
    document.getElementById('recording-time').style.display = 'none';
    const btn = document.getElementById('btn-record');
    btn.classList.remove('recording');
}

function updateRecordingTime() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('time-display').innerText = `${m}:${s}`;
    document.getElementById('recording-time').style.display = 'flex';
}

document.getElementById('btn-record').addEventListener('click', () => {
    if (window.state.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});
