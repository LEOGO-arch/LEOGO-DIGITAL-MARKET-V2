const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('js/app.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(app, /advertisementVideoPlayButton\.addEventListener\('click'/);
assert.match(app, /advertisementVideoPlayButton\.dataset\.source = source/);
assert.match(app, /media\.preload = 'metadata'/);
assert.match(app, /advertisementLightboxVideo\.muted = true/);
assert.match(app, /advertisementLightboxVideo\.play\(\)\.then/);
assert.match(app, /Autoplay unavailable\. Tap Play to watch/);
assert.match(app, /advertisementLightboxVideo\.addEventListener\('error'/);
assert.match(css, /\.advertisement-video-play\{/);
assert.match(html, /js\/app\.js\?v=advert-video-muted-autoplay-1/);
console.log('Advertisement muted autoplay and fallback checks passed.');
