const Rules = (function () {
  function validatePersona(persona) {
    const errors = [];
    const warnings = [];

    checkAhamoRules(persona, errors, warnings);
    checkBillingRules(persona, errors, warnings);
    checkHome5gRules(persona, errors, warnings);
    checkDeviceRules(persona, errors, warnings);
    checkPaymentRules(persona, errors, warnings);
    checkCallRules(persona, errors, warnings);

    return {
      ok: errors.length === 0,
      errors,
      warnings
    };
  }

  function checkAhamoRules(persona, errors) {
    const plan = persona.basicInfo.currentPlan;
    const callOption = persona.basicInfo.callOption;

    if (plan === 'ahamo') {
      const validOptions = Masters.callOptions.ahamo;
      if (!validOptions.includes(callOption)) {
        errors.push('ahamoなのに通話オプションがahamo用ではありません');
      }
    }

    if (plan !== 'ahamo' && callOption.includes('ahamo')) {
      errors.push('ahamo以外なのにahamo用通話オプションが付いています');
    }
  }

  function checkBillingRules(persona, errors, warnings) {
    const billingType = persona.basicInfo.billingType;
    const paymentMethod = persona.basicInfo.paymentMethod;
    const groupLinesText = persona.basicInfo.billingGroupLines;

    if (billingType === '一括請求の子回線' && paymentMethod !== '代表回線が支払い') {
      errors.push('一括請求の子回線なのに支払い方法が代表回線支払いではありません');
    }

    if (billingType === '単独請求' && groupLinesText !== '1回線') {
      warnings.push('単独請求なのに一括請求グループ回線数が1回線ではありません');
    }

    if (billingType === '一括請求の代表回線') {
      const groupLines = parseInt(groupLinesText, 10);
      if (!Number.isNaN(groupLines) && groupLines < 2) {
        errors.push('一括請求の代表回線なのにグループ回線数が2未満です');
      }
    }
  }

  function checkHome5gRules(persona, errors) {
    const internet = persona.basicInfo.internetContract;
    const internetHearing = persona.hearingMap.internetContract || {};

    if (internet !== 'home 5G') return;

    const text = internetHearing.text || '';

    if (text.includes('家族名義') || text.includes('同居人名義')) {
      if (text.includes('割賦残') && !text.includes('本人では確認できない')) {
        errors.push('home 5Gが本人名義ではないのに残債が具体表示されています');
      }
    }

    if (text.includes('本人名義')) {
      if (!text.includes('HR01') && !text.includes('HR02')) {
        errors.push('home 5G本人名義なのに機種名がありません');
      }

      if (!text.includes('月々サポート')) {
        errors.push('home 5G本人名義なのに月々サポート情報がありません');
      }
    }
  }

  function checkDeviceRules(persona, errors) {
    const device = persona.basicInfo.device;
    const yearsText = persona.basicInfo.deviceUsageYears;
    const maxYears = Masters.deviceMaxYears[device];

    if (!maxYears) return;

    const years = parseInt(yearsText, 10);

    if (!Number.isNaN(years) && years > maxYears) {
      errors.push(`${device}なのに利用期間が長すぎます`);
    }
  }

  function checkPaymentRules(persona, errors, warnings) {
    const paymentText = (persona.hearingMap.paymentMethod && persona.hearingMap.paymentMethod.text) || '';

    if (paymentText.includes('dカードなし') && paymentText.includes('dカード GOLD')) {
      errors.push('dカードなしなのにdカード GOLDが利用されています');
    }

    if (paymentText.includes('dカード GOLDあり') && paymentText.includes('楽天カードがメイン')) {
      warnings.push('dカード GOLDありだがメインカードが楽天カードです');
    }
  }

function checkCallRules(persona, errors, warnings) {
  const callOption = persona.basicInfo.callOption;
  const familyDiscountCount = persona.basicInfo.familyDiscountCount;
  const familyCount = parseInt(familyDiscountCount, 10);

  const validDocomoCallOptions = [
    'なし',
    '5分通話無料オプション',
    'かけ放題オプション'
  ];

  const validAhamoCallOptions = [
    'ahamo標準：5分以内通話無料',
    'ahamo + かけ放題オプション'
  ];

  const allValidCallOptions = [
    ...validDocomoCallOptions,
    ...validAhamoCallOptions
  ];

  if (!allValidCallOptions.includes(callOption)) {
    errors.push(`通話オプションに不正な値があります：${callOption}`);
  }

  if (callOption === 'ファミリー割引内通話メイン') {
    errors.push('ファミリー割引内通話メインは通話オプションではなく、ヒアリング情報として扱う必要があります');
  }

  const callHearingText = Object.values(persona.hearingMap || {})
    .map((item) => item.text || '')
    .join('\n');

  const mentionsFamilyCall =
    callHearingText.includes('家族への通話が中心') ||
    callHearingText.includes('家族内通話') ||
    callHearingText.includes('ファミリー割引内通話');

  if (!Number.isNaN(familyCount) && familyCount <= 1 && mentionsFamilyCall) {
    warnings.push('ファミリー割引人数が1人なのに、家族内通話中心のような表現があります');
  }
}
  
  return {
    validatePersona
  };
})();

