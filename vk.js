(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (params.get('platform') !== 'vk' && !(params.has('vk_app_id') && params.has('vk_platform'))) return;

  const root = document.documentElement;
  root.classList.add('vk-games');
  const wordmark = document.querySelector('.wordmark');
  wordmark?.removeAttribute('href');
  wordmark?.removeAttribute('aria-label');

  const embedded = window.parent !== window || window.AndroidBridge ||
    window.webkit?.messageHandlers?.VKWebAppClose || window.ReactNativeWebView;
  if (!embedded) {
    root.dataset.vkBridge = 'preview';
    return;
  }

  root.dataset.vkBridge = 'loading';
  const script = document.createElement('script');
  script.src = './vendor/vk-bridge.min.js?v=2.15.12';
  const unavailable = () => { root.dataset.vkBridge = 'unavailable'; };
  const timeout = setTimeout(unavailable, 10000);
  script.addEventListener('error', () => { clearTimeout(timeout); unavailable(); });
  script.addEventListener('load', async () => {
    const bridge = window.vkBridge;
    try {
      bridge.subscribe(({detail}) => {
        if (detail.type === 'VKWebAppViewHide') window.dispatchEvent(new Event('bounce:vk-hide'));
        if (detail.type === 'VKWebAppViewRestore') window.dispatchEvent(new Event('bounce:vk-restore'));
      });
      const response = await bridge.send('VKWebAppInit', {});
      root.dataset.vkBridge = response.result ? 'ready' : 'unavailable';
    } catch {
      unavailable();
    } finally {
      clearTimeout(timeout);
    }
  });
  document.head.append(script);
})();
