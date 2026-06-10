const Render = (function () {
  const basicOrder = [
    'currentPlan',
    'callOption',
    'monthlyDataUsage',
    'familyDiscountCount',
    'internetContract',
    'billingType',
    'paymentMethod',
    'docomoYears',
    'billingGroupLines',
    'device',
    'deviceUsageYears',
    'electricityContract',
    'gasContract'
  ];

  const soloCategories = [
    { key: 'reception', label: '受付・来店理由' },
    { key: 'call', label: '通話' },
    { key: 'data', label: 'データ通信' },
    { key: 'payment', label: '支払い・カード' },
    { key: 'internet', label: 'インターネット回線' },
    { key: 'lifeline', label: '電気・ガス' }
  ];

  function renderTeacherView(container, persona) {
    container.innerHTML = '';

    container.appendChild(createHeader(persona, '講師ロープレモード'));

    const list = document.createElement('div');
    list.className = 'info-list';

    basicOrder.forEach((key) => {
      list.appendChild(createInfoItem({
        label: Masters.labels[key],
        value: persona.basicInfo[key],
        hearingText: persona.hearingMap[key] ? persona.hearingMap[key].text : ''
      }));
    });

    container.appendChild(list);
    container.appendChild(createDevMonitor(persona));
  }

  function renderSoloView(container, persona, openedCategories = {}) {
    container.innerHTML = '';

    container.appendChild(createHeader(persona, 'ひとり学習モード'));

    const revealPanel = document.createElement('div');
    revealPanel.className = 'panel-lite';

    const revealTitle = document.createElement('h3');
    revealTitle.textContent = 'ヒアリング結果を開示';
    revealPanel.appendChild(revealTitle);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'button-row';

    soloCategories.forEach((category) => {
      const button = document.createElement('button');
      button.className = 'reveal-button';
      button.textContent = openedCategories[category.key]
        ? `${category.label}：開示済み`
        : `${category.label}を開示`;
      button.dataset.category = category.key;
      buttonRow.appendChild(button);
    });

    revealPanel.appendChild(buttonRow);
    container.appendChild(revealPanel);

    const list = document.createElement('div');
    list.className = 'info-list';

    basicOrder.forEach((key) => {
      const hearing = persona.hearingMap[key];
      const shouldShow = hearing && openedCategories[hearing.category];

      list.appendChild(createInfoItem({
        label: Masters.labels[key],
        value: persona.basicInfo[key],
        hearingText: shouldShow ? hearing.text : ''
      }));
    });

    container.appendChild(list);
    container.appendChild(createDevMonitor(persona));
  }

  function renderStudentView(container, persona) {
    container.innerHTML = '';

    const badge = document.createElement('div');
    badge.className = 'rarity-badge';
    badge.textContent = persona.rarityLabel;
    container.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'persona-title';
    title.textContent = '顧客基本情報';
    container.appendChild(title);

    const list = document.createElement('div');
    list.className = 'info-list';

    basicOrder.forEach((key) => {
      list.appendChild(createInfoItem({
        label: Masters.labels[key],
        value: persona.basicInfo[key],
        hearingText: ''
      }));
    });

    container.appendChild(list);

    const note = document.createElement('p');
    note.className = 'help-text';
    note.textContent = 'まずは来店理由からヒアリングしてください。';
    container.appendChild(note);
  }

  function createHeader(persona, modeLabel) {
    const fragment = document.createDocumentFragment();

    const badge = document.createElement('div');
    badge.className = 'rarity-badge';
    badge.textContent = `${persona.rarityLabel}｜${modeLabel}`;
    fragment.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'persona-title';
    title.textContent = '生成されたペルソナ';
    fragment.appendChild(title);

    return fragment;
  }

  function createInfoItem({ label, value, hearingText }) {
    const item = document.createElement('div');
    item.className = 'info-item';

    const labelEl = document.createElement('p');
    labelEl.className = 'info-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('p');
    valueEl.className = 'info-value';
    valueEl.textContent = value || '未設定';

    item.appendChild(labelEl);
    item.appendChild(valueEl);

    if (hearingText) {
      const hearing = document.createElement('div');
      hearing.className = 'hearing-text';
      hearing.textContent = `ヒアリングで分かること：\n${hearingText}`;
      item.appendChild(hearing);
    }

    return item;
  }

  function createDevMonitor(persona) {
    const dev = document.createElement('div');
    dev.className = 'dev-monitor';
    dev.textContent = `dev：${persona.rarity} / ${persona.typeId} ${persona.typeName} / seed:${persona.seed}`;
    return dev;
  }

  return {
    renderTeacherView,
    renderSoloView,
    renderStudentView
  };
})();
