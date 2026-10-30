const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('js/app.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(app, /advertisementVideoPlayButton\.addEventListener\('click'/);
assert.match(app, /advertisementVideoPlayButton\.dataset\.source = source/);
assert.match(app, /media\.preload = 'metadata'/);
assert.doesNotMatch(app, /advertisementLightboxVideo\.play\(\)\.catch\(\(\) => \{\}\)/);
assert.match(app, /advertisementLightboxVideo\.addEventListener\('error'/);
assert.match(css, /\.advertisement-video-play\{/);
assert.match(html, /js\/app\.js\?v=advert-video-on-demand-1/);
console.log('Advertisement video on-demand checks passed.');
