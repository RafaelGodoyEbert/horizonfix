/* Geometry shared by the preview, recording and touch focus. */
(function (root) {
    'use strict';
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const angle = value => ((value + 180) % 360 + 360) % 360 - 180;
    const lerpAngle = (from, to, amount) => from + angle(to - from) * amount;

    function orientationRoll(beta, gamma, screenAngle = 0) {
        if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
        const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
        // Z-X'-Y'' orientation: the vertical vector in device coordinates.
        const x = -Math.sin(g) * Math.cos(b), y = Math.sin(b);
        if (Math.hypot(x, y) < 0.08) return null;
        return angle(-Math.atan2(x, y) * 180 / Math.PI + screenAngle);
    }

    function sampleAt(samples, time) {
        if (!samples.length) return 0;
        if (time <= samples[0].t) return samples[0].r;
        for (let i = samples.length - 2; i >= 0; i--) {
            const before = samples[i], after = samples[i + 1];
            if (time >= before.t) {
                if (time >= after.t || after.t <= before.t) return after.r;
                return lerpAngle(before.r, after.r, (time - before.t) / (after.t - before.t));
            }
        }
        return samples[samples.length - 1].r;
    }

    function crop(sourceW, sourceH, width, height, degrees, zoom = 1, mode = 'fixed', margin = 1) {
        if (![sourceW, sourceH, width, height].every(n => Number.isFinite(n) && n > 0)) return null;
        const rad = degrees * Math.PI / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
        const protectedW = c * width / 2 + s * height / 2;
        const protectedH = s * width / 2 + c * height / 2;
        const cover = Math.max(width / sourceW, height / sourceH);
        const base = mode === 'fixed' ? Math.hypot(width, height) / Math.min(sourceW, sourceH) : cover;
        const scale = Math.max(base * Math.max(1, zoom) * margin, 2 * protectedW / sourceW, 2 * protectedH / sourceH) * 1.002;
        return { scale, slackX: Math.max(0, sourceW * scale / 2 - protectedW), slackY: Math.max(0, sourceH * scale / 2 - protectedH) };
    }

    function sourcePoint(x, y, sourceW, sourceH, transform) {
        const rad = -transform.roll * Math.PI / 180;
        const dx = x - transform.cx, dy = y - transform.cy;
        const px = (dx * Math.cos(rad) - dy * Math.sin(rad) - transform.offsetX) / transform.scale;
        const py = (dx * Math.sin(rad) + dy * Math.cos(rad) - transform.offsetY) / transform.scale;
        return { x: clamp(0.5 + (transform.mirror ? -px : px) / sourceW, 0, 1), y: clamp(0.5 + py / sourceH, 0, 1) };
    }

    function spring(position, velocity, target, dt, omega = 9) {
        if (!Number.isFinite(dt) || dt <= 0) return [position, velocity];
        const decay = Math.exp(-omega * dt), delta = position - target;
        const step = (velocity + omega * delta) * dt;
        return [target + (delta + step) * decay, (velocity - omega * step) * decay];
    }

    const api = { clamp, angle, lerpAngle, orientationRoll, sampleAt, crop, sourcePoint, spring };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HorizonMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
