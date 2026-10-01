const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const walletJs = fs.readFileSync('js/wallet.js', 'utf8');

const requiredTabs = ['overview', 'save', 'challenge', 'withdraw', 'statements', 'transactions', 'loans'];
const requiredWalletIds = [
  'walletAvailableBalance',
  'walletWithdrawableBalance',
  'walletReservedWithdrawals',
  'walletPointsEarned',
  'walletMaintenanceFee',
  'walletTotalSaved',
  'walletSavingStreak',
  'walletLoanEligibility',
  'walletSavingPreviewForm',
  'walletChallengeForm',
  'walletChallengePaymentForm',
  'walletWithdrawalForm',
  'walletPinForm',
  'walletLoanPreviewForm',
  'walletDownloadExcel',
  'walletDownloadPdf',
  'walletTransactionList'
];

for (const tab of requiredTabs) {
  const buttonMatches = html.match(new RegExp(`data-wallet-tab="${tab}"`, 'g')) || [];
  const panelMatches = html.match(new RegExp(`data-wallet-tab-panel="${tab}"`, 'g')) || [];
  if (buttonMatches.length !== 1) throw new Error(`Expected one wallet tab button for ${tab}, got ${buttonMatches.length}`);
  if (panelMatches.length !== 1) throw new Error(`Expected one wallet tab panel for ${tab}, got ${panelMatches.length}`);
}

for (const id of requiredWalletIds) {
  const matches = html.match(new RegExp(`id="${id}"`, 'g')) || [];
  if (matches.length !== 1) throw new Error(`Expected wallet control #${id} exactly once, got ${matches.length}`);
}

if (!html.includes('data-wallet-tab-target="save"') || !html.includes('data-wallet-tab-target="withdraw"')) {
  throw new Error('Wallet overview quick actions are missing.');
}

if (!css.includes('LEOGO Wallet tabs — customer dashboard organisation')) {
  throw new Error('Wallet tab styles are missing.');
}

new vm.Script(walletJs, { filename: 'js/wallet.js' });
console.log('wallet-tabs regression checks passed');
