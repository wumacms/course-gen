export default function vesaErrorReporter() {
  return {
    name: "vesa-error-reporter",
    transformIndexHtml(html) {
      const errorScript = `
<script data-vesa-error-reporter>
(function () {
  var reported = {};
  function send(err) {
    var key = (err.message || '') + '|' + (err.filename || '') + '|' + (err.lineno || 0);
    if (reported[key]) return;
    reported[key] = 1;
    try {
      window.parent.postMessage({ type: '__VESA_RUNTIME_ERROR__', error: err }, '*');
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    send({
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error ? e.error.stack : ''
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    send({
      message: r.message || String(r),
      filename: '',
      lineno: 0,
      colno: 0,
      stack: r.stack || ''
    });
  });
})();
<\/script>`;

      const routeScript = `
<script data-vesa-route-reporter>
(function () {
  if (window === window.parent) return;
  var lastPath = '';
  function notify() {
    var p = location.pathname;
    if (p === lastPath) return;
    lastPath = p;
    try {
      window.parent.postMessage({ type: '__VESA_ROUTE_CHANGE__', path: p }, '*');
    } catch (_) {}
  }
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    notify();
  };
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    notify();
  };
  window.addEventListener('popstate', notify);
  notify();
})();
<\/script>`;

      return html.replace("</head>", errorScript + routeScript + "</head>");
    },
  };
}
