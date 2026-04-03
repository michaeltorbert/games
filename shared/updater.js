(function () {
  var DEBOUNCE_MS = 2000;
  var INTERVAL_MS = 5 * 60 * 1000;
  var lastCheck = 0;
  var bannerShown = false;

  var versionUrl = new URL('../version.json', document.currentScript.src).href;

  var segments = location.pathname.split('/').filter(Boolean);
  var gameId = segments[0] || '';

  function dismissKey(remoteVersion) {
    return 'updater_dismissed:' + gameId + ':' + remoteVersion;
  }

  function showBanner(remoteVersion) {
    if (bannerShown) return;
    if (sessionStorage.getItem(dismissKey(remoteVersion))) return;
    bannerShown = true;

    var banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed',
      'bottom:0',
      'left:0',
      'right:0',
      'background:#1a1a2e',
      'color:#fff',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:12px',
      'padding:12px 16px',
      'z-index:99999',
      'font-family:Nunito,sans-serif',
      'font-size:15px',
      'box-shadow:0 -2px 8px rgba(0,0,0,.4)'
    ].join(';');

    var msg = document.createElement('span');
    msg.textContent = 'Update available!';

    var reload = document.createElement('button');
    reload.textContent = 'Reload';
    reload.style.cssText = 'padding:6px 14px;background:#4cc9f0;color:#1a1a2e;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:14px;';
    reload.onclick = function () {
      var url = new URL(location.href);
      url.searchParams.set('r', Date.now().toString());
      location.href = url.toString();
    };

    var dismiss = document.createElement('button');
    dismiss.textContent = '✕';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.style.cssText = 'background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;';
    dismiss.onclick = function () {
      sessionStorage.setItem(dismissKey(remoteVersion), '1');
      banner.remove();
    };

    banner.appendChild(msg);
    banner.appendChild(reload);
    banner.appendChild(dismiss);
    document.body.appendChild(banner);
  }

  function check() {
    var now = Date.now();
    if (now - lastCheck < DEBOUNCE_MS) return;
    lastCheck = now;

    var url = versionUrl + '?t=' + now;
    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var remote = data[gameId];
        if (!remote) return;
        if (typeof GAME_VERSION !== 'undefined' && remote !== GAME_VERSION) {
          showBanner(remote);
        }
      })
      .catch(function () {});
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') check();
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) check();
  });

  window.addEventListener('focus', check);

  setInterval(check, INTERVAL_MS);

  setTimeout(check, 3000);
})();
