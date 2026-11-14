'use strict';

let mediaRecorder = null, chunks = [], recordingStartedAt = 0, timer = null, recordingUrl = null, audioStream = null;

function outputSize() {
    const s = window.state, short = s.resolution;
    if (s.recAspectRatio === 1) return [short, short];
    return s.recAspectRatio > 1 ? [Math.round(short * s.recAspectRatio), short] : [short, Math.round(short / s.recAspectRatio)];
}
function bestMime() {
    return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || '';
}
function updateTime() {
    const elapsed = Math.floor((performance.now() - recordingStartedAt) / 1000);
    document.getElementById('time-display').textContent = `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`;
}
async function startRecording() {
    const s = window.state;
    if (s.isRecording || s.recordingBusy || (!s.demo && !s.currentStream)) return;
    if (!window.MediaRecorder || !recCanvas.captureStream) { showToast('Este navegador não oferece gravação de vídeo por canvas.'); return; }
    s.recordingBusy = true; updateUI();
    try {
        if (s.audioEnabled) {
            try { audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
            catch (_) { audioStream = null; showToast('O microfone não foi autorizado. Desative Áudio ou autorize o microfone para gravar.'); return; }
        }
        const [width, height] = outputSize();
        recCanvas.width = width; recCanvas.height = height;
        renderRecordingFrame();
        const stream = recCanvas.captureStream(s.fps);
        audioStream?.getAudioTracks().forEach(track => stream.addTrack(track));
        const mimeType = bestMime();
        mediaRecorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: Math.min(16_000_000, Math.max(3_000_000, width * height * s.fps * .1)) });
        chunks = [];
        mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        mediaRecorder.onerror = () => showToast('A gravação falhou. Tente gravar novamente.');
        mediaRecorder.onstop = finishRecording;
        mediaRecorder.start(1000);
        s.isRecording = true; recordingStartedAt = performance.now(); updateTime(); timer = setInterval(updateTime, 250);
        document.getElementById('recording-time').hidden = false;
        document.getElementById('btn-record').classList.add('recording');
        await acquireWakeLock();
    } catch (error) {
        audioStream?.getTracks().forEach(track => track.stop()); audioStream = null;
        showToast('Não foi possível iniciar a gravação.');
    } finally {
        if (!s.isRecording) s.recordingBusy = false;
        updateUI();
    }
}
function stopRecording() {
    const s = window.state;
    if (!s.isRecording || s.recordingBusy) return;
    s.isRecording = false; s.recordingBusy = true; updateUI();
    clearInterval(timer); timer = null;
    document.getElementById('recording-time').hidden = true;
    document.getElementById('btn-record').classList.remove('recording');
    if (mediaRecorder?.state !== 'inactive') mediaRecorder.stop(); else finishRecording();
}
function finishRecording() {
    const s = window.state, type = mediaRecorder?.mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    audioStream?.getTracks().forEach(track => track.stop()); audioStream = null;
    mediaRecorder?.stream.getTracks().forEach(track => track.stop());
    mediaRecorder = null; chunks = [];
    if (blob.size < 1000) { s.recordingBusy = false; updateUI(); showToast('O vídeo ficou vazio. Tente novamente.'); return; }
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(blob); s.outputBlob = blob;
    const ext = type.includes('mp4') ? 'mp4' : 'webm', date = new Date().toISOString().replace(/[:.]/g,'-');
    const out = document.getElementById('output-video'), download = document.getElementById('output-download');
    out.src = recordingUrl; out.load();
    download.href = recordingUrl; download.download = `HorizonteFixo-${date}.${ext}`;
    document.getElementById('output-info').textContent = `${recCanvas.width} × ${recCanvas.height} · ${Math.round(blob.size / 1024 / 1024 * 10) / 10} MB`;
    const share = document.getElementById('btn-share'), file = new File([blob], download.download, { type });
    share.hidden = !navigator.canShare?.({ files: [file] });
    share.onclick = async () => { try { await navigator.share({ files:[file], title:'Horizonte Fixo' }); } catch (_) {} };
    document.getElementById('output-dialog').showModal();
    s.recordingBusy = false; updateUI(); releaseWakeLock();
}
function cleanupRecording() {
    clearInterval(timer); timer = null; audioStream?.getTracks().forEach(track => track.stop()); audioStream = null;
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}
document.getElementById('btn-record').addEventListener('click', () => window.state.isRecording ? stopRecording() : startRecording());
document.getElementById('btn-close-output').addEventListener('click', () => document.getElementById('output-dialog').close());
