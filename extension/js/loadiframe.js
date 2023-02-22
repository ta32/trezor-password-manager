window.parent.postMessage({
  event: 'UI_EVENT',
  type: 'iframe-bootstrap',
}, '*');
const iframeScript = document.createElement('script');
iframeScript.setAttribute('type', 'text/javascript');
iframeScript.setAttribute('src', './js/iframe.85d79dd9b56856b62ca6.js');
iframeScript.setAttribute('async', 'false');
document.body.appendChild(iframeScript);