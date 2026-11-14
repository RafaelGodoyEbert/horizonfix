'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('./js/math.js');

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, message || `${actual} != ${expected}`);
near(M.orientationRoll(90, 0), 0);
near(M.orientationRoll(0, 90), 90);
near(M.orientationRoll(0, -90, 90), 0);
assert.equal(M.orientationRoll(null, 0), null);
assert.equal(M.orientationRoll(0, 0), null);
near(M.angle(721), 1);
near(M.lerpAngle(179, -179, 0.5), 180);
for (const size of [2, 30, 256]) {
    const samples = Array.from({ length: size }, (_, i) => ({ t: i * 10, r: i }));
    near(M.sampleAt(samples, 5), 0.5);
    near(M.sampleAt(samples, -10), 0);
    near(M.sampleAt(samples, 100000), size - 1);
}
near(M.sampleAt([{ t: 1, r: 179 }, { t: 3, r: -179 }], 2), 180);

let checked = 0;
for (const [sw, sh] of [[1920, 1080], [1080, 1920], [1440, 1080], [1080, 1080]]) {
    for (const aspect of [16 / 9, 9 / 16, 1, 4 / 3]) {
        const w = 640, h = w / aspect;
        for (const mode of ['fixed', 'adaptive']) {
            for (const zoom of [1, 1.5, 3]) {
                let fixedScale = null;
                for (let degree = -180; degree <= 180; degree += 3) {
                    const crop = M.crop(sw, sh, w, h, degree, zoom, mode, 1.1);
                    if (mode === 'fixed') {
                        if (fixedScale === null) fixedScale = crop.scale;
                        near(crop.scale, fixedScale, 'Fixed crop must not breathe during rotation');
                    }
                    for (const ox of [-1, 1]) for (const oy of [-1, 1]) {
                        const a = degree * Math.PI / 180;
                        for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) {
                            const localX = (x * Math.cos(a) + y * Math.sin(a) - ox * crop.slackX) / crop.scale;
                            const localY = (-x * Math.sin(a) + y * Math.cos(a) - oy * crop.slackY) / crop.scale;
                            assert.ok(Math.abs(localX) <= sw / 2 + 1e-6);
                            assert.ok(Math.abs(localY) <= sh / 2 + 1e-6);
                            checked++;
                        }
                    }
                    const preview = M.crop(sw, sh, w / 2, h / 2, degree, zoom, mode, 1.1);
                    near(crop.scale, preview.scale * 2, 'Preview and encoder must use identical framing');
                }
            }
        }
    }
}
const transform = { cx: 320, cy: 240, roll: 90, scale: 2, offsetX: 30, offsetY: -20, mirror: false };
const point = M.sourcePoint(320, 340, 1000, 800, transform);
near(point.x, 0.535); near(point.y, 0.5125);
near(M.sourcePoint(320, 340, 1000, 800, { ...transform, mirror: true }).x, 0.465);
let position = 0, velocity = 0;
for (let i = 0; i < 120; i++) [position, velocity] = M.spring(position, velocity, 1, 1 / 120);
const slow = M.spring(0, 0, 1, 1);
near(position, slow[0]); near(velocity, slow[1]);
assert.ok(position > 0 && position < 1);
assert.ok(M.spring(0, 0, 1, 5).every(Number.isFinite));

// Every requested DOM control exists, and classic scripts share one valid global scope.
const html = fs.readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate DOM IDs');
const scripts = [...html.matchAll(/<script[^>]+src="([^"?]+)/g)].map(match => match[1]).filter(file => !/^https?:/.test(file));
scripts.forEach(file => {
    const source = fs.readFileSync(file, 'utf8');
    new vm.Script(source, { filename: file });
    for (const match of source.matchAll(/(?:getElementById|element)\('([^']+)'\)/g)) {
        assert.ok(ids.includes(match[1]), `Missing DOM control: ${match[1]}`);
    }
});
console.log(`OK: ${checked.toLocaleString('pt-BR')} crop corner checks, preview parity, angles, interpolation, focus, spring, DOM and script syntax.`);
