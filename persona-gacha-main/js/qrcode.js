const QRCodeHelper = (function () {
  function buildStudentUrl(persona, requestedRarity) {
    const baseUrl = new URL('./student.html', window.location.href);
    baseUrl.searchParams.set('v', '1');
    baseUrl.searchParams.set('seed', String(persona.seed));
    baseUrl.searchParams.set('rarity', requestedRarity || 'random');
    return baseUrl.toString();
  }

  function renderQr(container, url) {
    const encoded = encodeURIComponent(url);
    const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encoded}`;

    container.innerHTML = '';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '生徒用QRコード';

    container.appendChild(img);
  }

  async function copyText(text) {
    if (!navigator.clipboard) {
      return false;
    }

    await navigator.clipboard.writeText(text);
    return true;
  }

  return {
    buildStudentUrl,
    renderQr,
    copyText
  };
})();
