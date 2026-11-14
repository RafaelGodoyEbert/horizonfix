'use strict';

window.focusLocked = false;
let focusTimer = null, focusRestoreTimer = null, focusFadeTimer = null, pointerOrigin = null;
let focusGeneration = 0;

function resetFocus() {
    focusGeneration++;
    clearTimeout(focusTimer); clearTimeout(focusRestoreTimer); clearTimeout(focusFadeTimer);
    focusTimer = focusRestoreTimer = focusFadeTimer = null;
    pointerOrigin = null;
    window.focusLocked = false;
    const point = document.getElementById('focus-point');
    point.hidden = true;
    point.classList.remove('locked');
}

async function triggerFocus(clientX, clientY, lock) {
    const s = window.state, track = s.currentStream?.getVideoTracks()[0];
    if (!track || s.demo || !s.frameTransform) return;
    const caps = s.capabilities;
    if (!caps.pointsOfInterest || !caps.focusMode?.some(mode => ['single-shot', 'continuous'].includes(mode))) {
        showToast('Esta câmera não oferece foco por toque no navegador.');
        return;
    }
    if (lock && !caps.focusMode.includes('manual')) {
        showToast('O bloqueio de foco não está disponível nesta câmera.');
        return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * canvas.width / rect.width;
    const y = (clientY - rect.top) * canvas.height / rect.height;
    const frame = s.previewFrame;
    if (!frame || x < frame.x || x > frame.x + frame.width || y < frame.y || y > frame.y + frame.height) return;
    const [sourceW, sourceH] = sourceDimensions();
    const position = HorizonMath.sourcePoint(x, y, sourceW, sourceH, s.frameTransform);
    resetFocus();
    const generation = focusGeneration;
    try {
        const mode = caps.focusMode.includes('single-shot') ? 'single-shot' : 'continuous';
        await track.applyConstraints({ advanced: [{ focusMode: mode, pointsOfInterest: [position] }] });
        if (generation !== focusGeneration || track !== s.currentStream?.getVideoTracks()[0]) return;
        if (lock) {
            // Give AF time to settle, then hold its actual focus distance.
            await new Promise(resolve => setTimeout(resolve, 400));
            if (generation !== focusGeneration || track.readyState !== 'live') return;
            const settings = track.getSettings();
            const desired = { focusMode: 'manual' };
            if (caps.focusDistance && Number.isFinite(settings.focusDistance)) desired.focusDistance = settings.focusDistance;
            await track.applyConstraints({ advanced: [desired] });
            window.focusLocked = true;
            showToast('Foco bloqueado. Toque novamente para liberar.');
        }
        const point = document.getElementById('focus-point');
        point.hidden = false;
        point.style.left = `${clientX - rect.left}px`; point.style.top = `${clientY - rect.top}px`;
        point.classList.toggle('locked', lock);
        if (!lock) {
            focusFadeTimer = setTimeout(() => { point.hidden = true; }, 1800);
            focusRestoreTimer = setTimeout(() => {
                if (generation === focusGeneration && track.readyState === 'live') applyManualSettings();
            }, 2500);
        }
    } catch (_) {
        showToast('Não foi possível ajustar o foco nesta câmera.');
    }
}

canvas.addEventListener('pointerdown', event => {
    if (!window.state.started || window.state.demo || window.state.cameraBusy) return;
    if (window.focusLocked) {
        resetFocus(); applyManualSettings(); showToast('Foco automático ativado.'); return;
    }
    pointerOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture?.(event.pointerId);
    focusTimer = setTimeout(() => {
        focusTimer = null; pointerOrigin = null;
        triggerFocus(event.clientX, event.clientY, true);
    }, 600);
});
canvas.addEventListener('pointerup', event => {
    if (focusTimer && pointerOrigin?.id === event.pointerId) {
        clearTimeout(focusTimer); focusTimer = null; pointerOrigin = null;
        triggerFocus(event.clientX, event.clientY, false);
    }
});
canvas.addEventListener('pointermove', event => {
    if (pointerOrigin && Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) > 15) {
        clearTimeout(focusTimer); focusTimer = null; pointerOrigin = null;
    }
});
canvas.addEventListener('pointercancel', () => { clearTimeout(focusTimer); focusTimer = null; pointerOrigin = null; });
