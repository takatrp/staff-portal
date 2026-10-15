// Keep Google scripts outside the document containing voucher data and inputs.
(function () {
  'use strict';
  const id = 'G-R4S7KNRPCP';
  if (location.hostname !== 'takatrp.github.io'
      || !/^\/staff-portal\/demo-voucher\/(?:index\.html)?$/.test(location.pathname)
      || window.voucherAnalyticsInitialized || window['ga-disable-' + id]) return;
  window.voucherAnalyticsInitialized = true;
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'アクセス計測';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.referrerPolicy = 'no-referrer';
  frame.src = 'analytics-frame.html';
  document.body.appendChild(frame);
})();
