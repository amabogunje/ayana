function widgetScript() {
  return `(function () {
  var script = document.currentScript;
  if (!script) return;

  var widgetKey = script.getAttribute('data-widget-key');
  if (!widgetKey) return;

  var scriptUrl = new URL(script.src, window.location.href);
  var baseUrl = scriptUrl.origin;
  var iframeUrl = baseUrl + '/widget/' + encodeURIComponent(widgetKey) + '?origin=' + encodeURIComponent(window.location.origin);

  function mountWidget() {
    if (!document.body || document.getElementById('tablecapture-website-chat-root')) {
      return;
    }

    var host = document.createElement('div');
    host.id = 'tablecapture-website-chat-root';
    host.style.position = 'fixed';
    host.style.right = '20px';
    host.style.bottom = '20px';
    host.style.zIndex = '2147483000';
    host.style.fontFamily = 'system-ui, sans-serif';

    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Book a VIP Table';
    button.setAttribute('aria-label', 'Book a VIP table');
    button.style.border = '0';
    button.style.borderRadius = '999px';
    button.style.padding = '14px 18px';
    button.style.background = '#111827';
    button.style.color = '#ffffff';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 18px 40px rgba(15, 23, 42, 0.28)';

    var frame = document.createElement('iframe');
    frame.src = iframeUrl;
    frame.title = 'Ayana website chat';
    frame.style.display = 'none';
    frame.style.width = '360px';
    frame.style.maxWidth = 'calc(100vw - 24px)';
    frame.style.height = '640px';
    frame.style.maxHeight = 'calc(100vh - 88px)';
    frame.style.border = '0';
    frame.style.borderRadius = '20px';
    frame.style.overflow = 'hidden';
    frame.style.background = '#ffffff';
    frame.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.22)';
    frame.style.marginTop = '12px';

    button.addEventListener('click', function () {
      var open = frame.style.display === 'block';
      frame.style.display = open ? 'none' : 'block';
    });

    host.appendChild(button);
    host.appendChild(frame);
    document.body.appendChild(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget, { once: true });
  } else {
    mountWidget();
  }
})();`;
}

export async function GET() {
  return new Response(widgetScript(), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
