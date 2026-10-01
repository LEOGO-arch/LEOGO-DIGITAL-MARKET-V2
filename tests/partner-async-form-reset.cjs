const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('partner/partner.js', 'utf8');

new vm.Script(source, { filename: 'partner/partner.js' });

if (source.includes('event.currentTarget.reset()')) {
  throw new Error('Unsafe async event.currentTarget.reset() usage remains in Partner Portal');
}

const expected = [
  "const formElement=event.currentTarget;const button=event.submitter",
  "const form=new FormData(formElement)",
  "formElement.reset();status(output,'Payment submitted. Admin verification is required before activation.','success');",
  "formElement.reset();status(output,'Extra acceptance payment submitted for Admin verification.','success');",
  "const button=event.submitter||form.querySelector('button[type=\"submit\"]')",
  "form.reset();\n    status($('#providerFlashSaleStatus')",
  "event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;",
  "form.reset();\n    status($('#transportSettlementRequestStatus')"
];

for (const marker of expected) {
  if (!source.includes(marker)) throw new Error('Missing Partner Portal async form safeguard: ' + marker);
}

console.log('partner async form reset regression checks passed');
