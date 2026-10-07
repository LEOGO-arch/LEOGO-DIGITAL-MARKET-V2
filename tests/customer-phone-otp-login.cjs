const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const auth = fs.readFileSync('js/auth.js', 'utf8');

assert.match(html, /id="customerPhoneLoginForm"/, 'phone OTP login form must be present');
assert.match(html, /id="loginPhone"/, 'phone login number input must be present');
assert.match(html, /id="loginPhoneOtp"/, 'phone OTP input must be present');
assert.match(html, /id="enablePhoneLoginButton"/, 'existing customers need a safe phone-link action');
assert.match(html, /id="phoneLinkForm"/, 'phone verification form must be present');

assert.match(auth, /signInWithPassword\(\{ email, password \}\)/, 'existing email/password login must remain unchanged');
assert.match(auth, /signInWithOtp\(\{[\s\S]*?phone,[\s\S]*?shouldCreateUser: false[\s\S]*?\}\)/, 'phone OTP login must not create duplicate customer accounts');
assert.match(auth, /verifyOtp\(\{[\s\S]*?type: 'sms'[\s\S]*?\}\)/, 'phone login OTP must be verified as SMS');
assert.match(auth, /updateUser\(\{ phone \}\)/, 'signed-in users must be able to link their phone to the existing account');
assert.match(auth, /type: 'phone_change'/, 'phone linking must require phone-change OTP verification');
assert.match(html, /id="customerEmailLoginStatus"/, 'email/password login feedback must be visible beside the email login form');
assert.match(auth, /setEmailLoginStatus\(message, 'error'\)/, 'email/password errors must be surfaced in the inline login status');
assert.match(html, /js\/auth\.js\?v=email-login-feedback-1/, 'auth cache key must be refreshed');

console.log('Customer phone OTP login regression checks passed.');
