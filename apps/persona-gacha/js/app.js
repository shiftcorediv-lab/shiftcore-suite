document.addEventListener('DOMContentLoaded', function () {
  const appState = {
    mode: 'teacher',
    persona: null,
    studentUrl: '',
    requestedRarity: 'random',
    openedCategories: {}
  };

  const generateButton = document.getElementById('generateButton');
  const raritySelect = document.getElementById('raritySelect');
  const resultPanel = document.getElementById('resultPanel');
  const resultArea = document.getElementById('resultArea');
  const qrPanel = document.getElementById('qrPanel');
  const qrBox = document.getElementById('qrBox');
  const timerPanel = document.getElementById('timerPanel');
  const copyButton = document.getElementById('copyStudentUrlButton');
  const openStudentLink = document.getElementById('openStudentUrlLink');
  const copyMessage = document.getElementById('copyMessage');

  RoleplayTimer.init();

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      appState.mode = radio.value;
      if (appState.persona) {
        renderCurrentPersona();
      }
    });
  });

  generateButton.addEventListener('click', () => {
    appState.requestedRarity = raritySelect.value;
    appState.persona = PersonaGenerator.generatePersona({
      requestedRarity: appState.requestedRarity
    });
    appState.openedCategories = {};

    appState.studentUrl = QRCodeHelper.buildStudentUrl(appState.persona, appState.requestedRarity);

    resultPanel.classList.remove('hidden');
    timerPanel.classList.remove('hidden');
    qrPanel.classList.toggle('hidden', appState.mode !== 'teacher');

    QRCodeHelper.renderQr(qrBox, appState.studentUrl);
    openStudentLink.href = appState.studentUrl;
    copyMessage.textContent = '';

    renderCurrentPersona();
  });

  resultArea.addEventListener('click', (event) => {
    const button = event.target.closest('.reveal-button');
    if (!button) return;

    const category = button.dataset.category;
    appState.openedCategories[category] = true;
    renderCurrentPersona();
  });

  copyButton.addEventListener('click', async () => {
    if (!appState.studentUrl) return;

    const ok = await QRCodeHelper.copyText(appState.studentUrl);

    copyMessage.textContent = ok
      ? '生徒用URLをコピーしました。'
      : 'コピーできませんでした。URLを開いて共有してください。';
  });

  function renderCurrentPersona() {
    if (!appState.persona) return;

    if (appState.mode === 'teacher') {
      qrPanel.classList.remove('hidden');
      Render.renderTeacherView(resultArea, appState.persona);
      return;
    }

    qrPanel.classList.add('hidden');
    Render.renderSoloView(resultArea, appState.persona, appState.openedCategories);
  }
});
