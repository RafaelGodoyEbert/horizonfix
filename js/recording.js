// recording.js — Video Capture (v4.0)
// ============================================================

const btnRecord = document.getElementById('btn-record');
const recordingTime = document.getElementById('recording-time');
const timeDisplay = document.getElementById('time-display');

btnRecord.addEventListener('click', () => {
    if (!window.state.isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    recordedChunks = [];
    const s = window.state;

    // Aspect Ratio Logic
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
    const mimeTypes = [
        'video/webm;codecs=h264',
        'video/webm;codecs=vp8',
        'video/webm'
    ];

    let chosenMime = '';
    for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
            chosenMime = mime;
            break;
        }
    }

    try {
        const options = chosenMime ? { mimeType: chosenMime, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 };
        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            saveVideo();
        };

        mediaRecorder.start();
        s.isRecording = true;
        recordingStartTime = Date.now();
        updateRecordingTime();
        recordingInterval = setInterval(updateRecordingTime, 1000);

        btnRecord.classList.add('recording');
        recordingTime.style.display = 'flex';

    } catch (e) {
        console.error("Recording error:", e);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    window.state.isRecording = false;
    clearInterval(recordingInterval);
    btnRecord.classList.remove('recording');
    recordingTime.style.display = 'none';
}

function updateRecordingTime() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    timeDisplay.innerText = `${m}:${s}`;
}

async function saveVideo() {
    const fullBlob = new Blob(recordedChunks, { type: 'video/webm' });
    
    let fixedBlob = fullBlob;
    if (typeof fixWebmDuration !== 'undefined') {
        try {
            // fixWebmDuration is the primary function name in the library
            fixedBlob = await fixWebmDuration(fullBlob);
        } catch (e) {
            console.warn("Duration fix failed:", e);
        }
    }

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
}
