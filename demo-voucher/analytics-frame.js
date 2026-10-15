// This empty document has no forms, voucher previews or download links.
// Enhanced measurement cannot observe interactions in the parent document.
(function () {
  'use strict';
  const id = 'G-R4S7KNRPCP';
  if (window.parent === window || location.hostname !== 'takatrp.github.io'
      || location.pathname !== '/staff-portal/demo-voucher/analytics-frame.html'
      || window.voucherAnalyticsInitialized) return;
  try {
    if (window.parent['ga-disable-' + id]
        || !/^\/staff-portal\/demo-voucher\/(?:index\.html)?$/.test(window.parent.location.pathname)) return;
  } catch (_) { return; }
  window.voucherAnalyticsInitialized = true;
  window.dataLayer = window.dataLayer || [];
  // Retain any consent commands established by the host. Never grant consent here.
  for (const command of window.parent.dataLayer || []) {
    if (command && command[0] === 'consent') window.dataLayer.push(command);
  }
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', id, {
    page_location: 'https://takatrp.github.io/staff-portal/demo-voucher/',
    page_referrer: '',
    page_title: '証憑デモ工房 | Demo Voucher Studio',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(script);
})();
