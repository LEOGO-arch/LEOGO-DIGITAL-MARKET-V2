// LEOGO DIGITAL MARKET V2 — shared customer payment destinations from Admin settings.
(() => {
  'use strict';

  const cache = new Map();

  const getClient = () => window.leogoAuth?.client || null;

  const getDestination = async (functionCode, options = {}) => {
    const client = getClient();
    if (!client) {
      return { data: null, error: new Error('Customer authentication service is not ready.') };
    }

    const force = Boolean(options.force);
    if (!force && cache.has(functionCode)) {
      return { data: cache.get(functionCode), error: null };
    }

    const { data, error } = await client.rpc('get_customer_payment_destination', {
      p_function_code: functionCode
    });

    if (error) return { data: null, error };

    const destination = Array.isArray(data) ? (data[0] || null) : (data || null);
    cache.set(functionCode, destination);
    return { data: destination, error: null };
  };

  const clear = (functionCode = '') => {
    if (functionCode) cache.delete(functionCode);
    else cache.clear();
  };

  const paymentNumber = (destination) => {
    if (!destination) return '';
    return destination.till_number
      || destination.paybill_number
      || destination.account_number
      || '';
  };

  const typeLabel = (destination) => ({
    mpesa_till: 'M-Pesa Till',
    mpesa_paybill: 'M-Pesa Paybill',
    bank: 'Bank Account',
    other: 'Payment Account'
  })[destination?.account_type] || 'Payment Account';

  const destinationName = (destination) => destination?.account_name
    || destination?.business_name
    || destination?.display_name
    || 'LEOGO DIGITAL MARKET';

  window.leogoPayments = {
    getDestination,
    clear,
    paymentNumber,
    typeLabel,
    destinationName
  };

  document.addEventListener('leogo:authchange', () => clear());
})();