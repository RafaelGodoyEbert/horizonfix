// ============================================================
// camera.js — Camera enumeration, lens detection, switching
// ============================================================

async function getCameras() {
    try {
        // STEP 1: Blind enumerations usually return 'facing back' without IDs (Privcy Lock).
        // We ask for basic video to convince the browser the user agreed.
        let tempStream;
        try {
            tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
            try { tempStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            catch (e2) { console.error("Total permission failure", e2); return; }
        }

        // STEP 2: Give the camera hardware the time it needs to spin up
        await new Promise(r => setTimeout(r, 600));

        // STEP 3: Enumerate with the active stream. 
        let devices = await navigator.mediaDevices.enumerateDevices();

        // STEP 4: KILL the stream completely so hardware isn't locked!
        if (tempStream) {
            tempStream.getTracks().forEach(track => {
                track.stop();
                // Also try to forcefully set constraints to nothing to sever ties on Samsung
                try { track.applyConstraints({ advanced: [] }); } catch (err) { }
            });
        }

        // CRITICAL WAIT: Let Android CameraDaemon actually release the lens node
        await new Promise(r => setTimeout(r, 500));

        // STEP 5: Re-enumerate now that the lock is released but permission is granted
        devices = await navigator.mediaDevices.enumerateDevices();

        let backCameras = devices.filter(device => device.kind === 'videoinput' && (device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('traseira') || device.label.toLowerCase().includes('environment') || device.label.toLowerCase().includes('0')));

        // Fallback if Chrome still doesn't label them
        if (backCameras.length === 0) {
            backCameras = devices.filter(device => device.kind === 'videoinput');
        }

        // Protect against 'none' or empty DeviceIDs by filtering them out!
        backCameras = backCameras.filter(device => device.deviceId && device.deviceId.trim() !== '');

        // Analyze lenses based on label heuristics (Chrome on Samsung/Pixel)
        videoDevices = backCameras.map((device, index) => {
            let friendlyName = `Cam ${index + 1}`;
            let type = "standard";
            const label = device.label.toLowerCase();

            // Samsung/Pixel lens heuristics
            if (label.includes('ultrawide') || label.includes('ultra-wide') || label.includes('0.5') || label.includes('0.6') || label.includes('lens 1') || label.includes('camera2 0')) {
                friendlyName = label.includes('0.5') ? "0.5x" : "0.6x";
                type = "ultrawide";
            } else if (label.includes('tele') || label.includes('zoom') || label.includes('3.0') || label.includes('lens 3') || label.includes('camera2 2')) {
                friendlyName = "3x";
                type = "telephoto";
            } else if (label.includes('wide') || label.includes('standard') || label.includes('1.0') || label.includes('lens 2') || label.includes('camera2 1')) {
                friendlyName = "1x";
                type = "wide";
            } else {
                if (index === 0) friendlyName = "1x";
                else if (index === 1) friendlyName = "0.6x";
                else if (index === 2) friendlyName = "3x";
            }

            return { ...device, friendlyName, type, rawLabel: label };
        });

        // STRICT FILTER: Keep ONLY the primary wide (1x) and ultrawide (0.5x/0.6x)
        // Discard telephoto/macro lenses that confuse the toggle button
        videoDevices = videoDevices.filter(d => d.type === 'wide' || d.type === 'ultrawide');

        // If somehow we filtered everything out, revert to all back cameras
        if (videoDevices.length === 0) {
            videoDevices = backCameras.map((d, i) => ({ ...d, friendlyName: `Cam ${i + 1}`, type: 'standard' }));
        }

        // Debug print cameras and their unique hashes
        let camHashes = videoDevices.map(d => `${d.friendlyName}:${(d.deviceId || '').substring(0, 4) || 'none'}`).join(' | ');
        camDebugInfo.innerHTML = `Cams: ${videoDevices.length} <br> ${camHashes}`;

        // Link Flip Button to cycle cameras
        let currentCameraIndex = 0;
        btnFlipCamera.onclick = () => {
            if (videoDevices.length > 1) {
                currentCameraIndex = (currentCameraIndex + 1) % videoDevices.length;
                currentDeviceId = videoDevices[currentCameraIndex].deviceId;
                startCamera(currentDeviceId);
            }
        };

        // Set initial active camera index correctly
        if (currentDeviceId) {
            const idx = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
            if (idx !== -1) currentCameraIndex = idx;
        } else if (videoDevices.length > 0) {
            currentDeviceId = videoDevices[0].deviceId;
        }

    } catch (err) {
        console.error("Error accessing media devices.", err);
        alert("Erro ao acessar câmeras: " + err.message);
    }
}

async function startCamera(deviceId = null) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        // CRITICAL FOR MOBILE: Give the hardware 400ms to truly release the camera lens
        // before requesting a new one. Otherwise Samsung Internet and Firefox throw ConcurrentAccess errors
        // and the code fails to switch to the ultrawide!
        await new Promise(r => setTimeout(r, 400));
    }

    // If no device ID was passed, fallback to the 1x lens we found
    if (!deviceId && videoDevices.length > 0) {
        deviceId = videoDevices.find(d => d.friendlyName === '1x')?.deviceId || videoDevices[0].deviceId;
    }

    // Update Debug with current lens request
    camDebugInfo.innerHTML += `<br>Req: ${deviceId ? deviceId.substring(0, 4) : 'auto'}`;

    // PURE STANDARD CONSTRAINTS
    // User requested explicit return to square constraint (2160x2160 logic)
    // This forces the lens into its maximum sensor width, ensuring the highest autofocus and sharpness
    // frameRate is set to ideal:60 for the primary request. If the ultrawide can't handle it,
    // the fallback chain below will retry WITHOUT framerate so the lens still switches.
    let videoConstraints = {
        width: { ideal: 1080 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 }
    };
    
    // Hint to the browser to prioritize performance over battery saving (Chrome/Edge)
    // Some implementations might ignore this, but it's the standard API for WebRTC
    try {
        if (navigator.mediaDevices.getSupportedConstraints && navigator.mediaDevices.getSupportedConstraints().powerEfficient) {
            videoConstraints.powerEfficient = false;
        }
    } catch(e) {}

    // Firefox and some Chrome versions bug out if facingMode is even present as undefined
    // when requesting an exact deviceId. So we branch the logic.
    // Also, don't pass {exact: ''} if deviceId is empty string.
    if (deviceId && deviceId.trim() !== '') {
        videoConstraints.deviceId = { exact: deviceId };
    } else {
        videoConstraints.facingMode = "environment";
    }

    const constraints = {
        video: videoConstraints,
        audio: false
    };

    // If the user manually turned on OIS Hardware Switch, inject heavy constraints
    if (isOisLockActive) {
        // 'none' disables digital cropping (EIS) which causes the 10fps CPU bottleneck
        constraints.video.resizeMode = "none";
        constraints.video.advanced = [{ zoom: 1.0, frameRate: 60 }];
        camDebugInfo.innerHTML += ` | OIS: ON`;
    } else {
        camDebugInfo.innerHTML += ` | OIS: OFF`;
    }

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        console.warn("High-res / specific constraints rejected. Trying naked 1080p fallback for THIS SPECIFIC LENS.", err);
        try {
            // Fall back to simple 1080p feed but absolutely KEEP the deviceId so it doesn't snap back to lens 0!
            if (deviceId && deviceId.trim() !== '') {
                constraints.video = { deviceId: { exact: deviceId }, width: { ideal: 1080 }, height: { ideal: 1080 } };
            } else {
                constraints.video = { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } };
            }
            delete constraints.video.advanced;
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (fallbackErr) {
            console.warn("Naked constraints rejected. Giving the hardware 500ms to breathe and trying naked DeviceID again...", fallbackErr);
            await new Promise(r => setTimeout(r, 500));
            try {
                // Ultimate Fallback 1: Just the naked device ID, absolutely no width/height logic to confuse Android
                constraints.video = (deviceId && deviceId.trim() !== '') ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' };
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (totalFail) {
                console.warn("All attempts for this physical lens failed.", totalFail);
                camDebugInfo.innerHTML += ` | LENS FAILED`;
                sensorDot.classList.remove('active');
                return; // DO NOT fall back to 'environment' or it creates an illusion of a broken button!
            }
        }
    }

    video.srcObject = currentStream;
    sensorDot.classList.add('active'); // Camera active

    // Ensure video plays
    try {
        await new Promise((resolve) => {
            video.onloadedmetadata = async () => {
                video.play();

                // Apply continuous auto-focus and auto-exposure to prevent blown-out images
                try {
                    const track = currentStream.getVideoTracks()[0];
                    await applyManualSettings();


                    // Display Camera Quality Metrics & Hardware Info
                    const trackSettings = track.getSettings();
                    if (trackSettings) {
                        const w = trackSettings.width || '?';
                        const h = trackSettings.height || '?';
                        const fps = trackSettings.frameRate ? Math.round(trackSettings.frameRate) : '?';
                        
                        // Check if browser reveals GPU/CPU rendering status via settings
                        // (Usually only available contextually, but good to log if exposed)
                        const hwInfo = (window.chrome && window.chrome.loadTimes) ? 'GPU(Chr)' : 'GPU/CPU';
                        camDebugInfo.innerHTML += `<br>Qualidade: ${w}x${h} @ ${fps}fps | Render: ${hwInfo}`;
                    }
                } catch (aeErr) {
                    console.warn('Could not apply AF/AE constraints:', aeErr);
                }

                resolve();
            };
        });
    } catch (err) {
        console.error("Camera playback error:", err);
    }
}

async function applyManualSettings() {
    if (!currentStream) return;
    try {
        const track = currentStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const advancedConstraints = {};
        let hasChanges = false;
        
        // Focus fallback
        if (capabilities.focusMode) {
            if (capabilities.focusMode.includes('continuous')) {
                advancedConstraints.focusMode = 'continuous';
                hasChanges = true;
            } else if (capabilities.focusMode.includes('auto')) {
                advancedConstraints.focusMode = 'auto';
                hasChanges = true;
            }
        }

        // Auto White Balance
        if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
            advancedConstraints.whiteBalanceMode = 'continuous';
            hasChanges = true;
        }

        // Shutter and ISO Limits
        if (isShutterManual || isIsoManual) {
            if (capabilities.exposureMode && capabilities.exposureMode.includes('manual')) {
                advancedConstraints.exposureMode = 'manual';
                hasChanges = true;
            }

            if (isShutterManual && capabilities.exposureTime) {
                let expTime = shutterValue;
                if (expTime < capabilities.exposureTime.min) expTime = capabilities.exposureTime.min;
                if (expTime > capabilities.exposureTime.max) expTime = capabilities.exposureTime.max;
                advancedConstraints.exposureTime = expTime;
                hasChanges = true;
            }

            if (isIsoManual && capabilities.iso) {
                let isoVal = isoValue;
                if (isoVal < capabilities.iso.min) isoVal = capabilities.iso.min;
                if (isoVal > capabilities.iso.max) isoVal = capabilities.iso.max;
                advancedConstraints.iso = isoVal;
                hasChanges = true;
            }
        } else {
            // Pure Auto
            if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
                advancedConstraints.exposureMode = 'continuous';
                hasChanges = true;
            }
        }

        if (hasChanges) {
            try {
                await track.applyConstraints({ advanced: [advancedConstraints] });
                camDebugInfo.innerHTML += ` | Man.Settings Applied`;
            } catch (e) {
                console.warn("Failed to apply advanced camera settings:", e);
                camDebugInfo.innerHTML += ` | Man.Settings Fail`;
            }
        }
        
        // Update the UI bounds dynamically if supported
        if (capabilities.exposureTime) {
            shutterSlider.min = capabilities.exposureTime.min || 0;
            shutterSlider.max = capabilities.exposureTime.max || 10000;
        }
        if (capabilities.iso) {
            isoSlider.min = capabilities.iso.min || 0;
            isoSlider.max = capabilities.iso.max || 3200;
        }

    } catch (err) {
        console.warn('Failed to apply manual settings:', err);
    }
}
