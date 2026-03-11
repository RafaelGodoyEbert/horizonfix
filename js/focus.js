// ============================================================
// focus.js — Touch-to-focus and AE/AF lock mechanism
// ============================================================

// Touch to focus mechanism (Tap & Hold for AE/AF Lock)
let touchTimer = null;
let isFocusedLocked = false;
let touchStartX = 0;
let touchStartY = 0;
let continuousFocusTimeout = null;

function clearFocusTimers() {
    if (touchTimer) clearTimeout(touchTimer);
    if (continuousFocusTimeout) clearTimeout(continuousFocusTimeout);
}

async function triggerFocus(x, y, clientX, clientY, isLongPress) {
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};

    clearFocusTimers();

    // Setup UI Square (using new rounded reticle)
    focusPointUI.style.left = `${clientX}px`;
    focusPointUI.style.top = `${clientY}px`;
    focusPointUI.classList.remove('fade-out');
    focusPointUI.classList.add('active');

    // Remove the legacy square's pulse class usage if it was there
    focusSquare.style.display = 'none';

    if (isLongPress) {
        // AE/AF Lock Mode
        isFocusedLocked = true;
        // Add an explicit text lock indicator if needed, or simply style the reticle
        focusPointUI.style.borderColor = '#FFA500'; // Orange for locked
    } else {
        // Temporary AF Mode
        focusPointUI.style.borderColor = 'rgba(255, 255, 255, 0.8)'; // Revert to white
        continuousFocusTimeout = setTimeout(() => {
            if (!isFocusedLocked) {
                focusPointUI.classList.add('fade-out');
                setTimeout(() => focusPointUI.classList.remove('active'), 200);
            }
        }, 1500);
    }

    // Send hardware constraint if supported
    let options = { advanced: [{}] };
    let hasCapability = false;

    if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
        options.advanced[0].focusMode = 'single-shot';
        options.advanced[0].pointsOfInterest = [{ x: x, y: y }];
        hasCapability = true;
    }

    // Bind Exposure checking to the same coordinate (User Request: autoexposicao/luz no rosto)
    if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
        options.advanced[0].exposureMode = 'continuous';
        options.advanced[0].pointsOfInterest = [{ x: x, y: y }];
        hasCapability = true;
    }

    if (hasCapability && track.applyConstraints) {
        try {
            await track.applyConstraints(options);

            if (isLongPress) {
                camDebugInfo.innerHTML += ` | LOCK: [${x.toFixed(1)},${y.toFixed(1)}]`;
            } else {
                camDebugInfo.innerHTML += ` | AE+AF: [${x.toFixed(1)},${y.toFixed(1)}]`;
                // Auto-unlock after 3 seconds for quick taps
                continuousFocusTimeout = setTimeout(() => {
                    if (!isFocusedLocked) {
                        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                        camDebugInfo.innerHTML += ` | AF-C`;
                    }
                }, 3000);
            }
        } catch (err) {
            console.warn('Touch focus failed:', err);
        }
    }
}

canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    touchStartX = e.clientX;
    touchStartY = e.clientY;

    // If already locked, a quick tap anywhere unlocks it immediately
    if (isFocusedLocked) {
        isFocusedLocked = false;
        focusPointUI.classList.add('fade-out');
        setTimeout(() => focusPointUI.classList.remove('active'), 200);
        focusPointUI.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        clearFocusTimers();

        if (currentStream && currentStream.getVideoTracks()[0].applyConstraints) {
            try {
                currentStream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                camDebugInfo.innerHTML += ` | UNLOCK`;
            } catch (e) { }
        }
        return; // Wait for next interaction
    }

    // Start holding timer
    touchTimer = setTimeout(() => {
        // Trigger Long Press
        triggerFocus(relX, relY, e.clientX, e.clientY, true);
        touchTimer = null; // Mark as fired
    }, 600); // 600ms hold required
});

canvas.addEventListener('pointerup', (e) => {
    if (touchTimer) {
        // Fired before 600ms expired = Quick Tap
        clearTimeout(touchTimer);
        touchTimer = null;

        if (!isFocusedLocked) { // Prevent quick tap trigger immediately after unlocking
            const rect = canvas.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width;
            const relY = (e.clientY - rect.top) / rect.height;
            triggerFocus(relX, relY, e.clientX, e.clientY, false);
        }
    }
});

// Cancel long press if user moves finger drastically or touch is cancelled
canvas.addEventListener('pointermove', (e) => {
    if (touchTimer) {
        const dist = Math.abs(e.clientX - touchStartX) + Math.abs(e.clientY - touchStartY);
        if (dist > 20) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    }
});

canvas.addEventListener('pointercancel', () => clearTimeout(touchTimer));
