const PersonaGenerator = (function () {
  function generatePersona(options = {}) {
    const maxRetry = 30;
    const seed = Number.isFinite(options.seed) ? options.seed : createSeed();
    const requestedRarity = options.requestedRarity || 'random';

    for (let i = 0; i < maxRetry; i++) {
      const rng = createRng(seed + i);
      const rarity = requestedRarity === 'random' ? pickWeighted(Masters.rarities, rng).key : requestedRarity;
      const typeId = pickOne(PersonaTypes.byRarity[rarity], rng);
      const type = PersonaTypes.types[typeId];

      const persona = buildPersona(type, rarity, seed, rng);
      const validation = Rules.validatePersona(persona);

      if (validation.ok) {
        persona.validation = validation;
        return persona;
      }
    }

    return buildFallbackPersona(seed);
  }

  function buildPersona(type, rarity, seed, rng) {
    const basicInfo = generateBasicInfo(type, rng);
    const hearingMap = generateHearingMap(type, basicInfo, rng);

    return {
      id: `PG-${seed}`,
      version: 'v1',
      seed,
      rarity,
      rarityLabel: Masters.rarityLabels[rarity],
      typeId: type.id,
      typeName: type.name,
      themes: type.themes,
      basicInfo,
      hearingMap
    };
  }

  function generateBasicInfo(type, rng) {
    const currentPlan = pickOne(type.plans, rng);
    const callOption = generateCallOption(currentPlan, type, rng);
    const billingType = pickOne(type.billingTypes, rng);
    const paymentMethod = normalizePaymentMethod(billingType, pickOne(type.paymentMethods, rng));

    const billingGroupLines = generateBillingGroupLines(billingType, rng);
    const familyDiscountCount = generateFamilyCount(billingType, billingGroupLines, rng);
    const internetContract = pickOne(type.internetContracts, rng);
    const device = pickOne(type.devices, rng);

    return {
      currentPlan,
      callOption,
      monthlyDataUsage: generateDataUsage(type, currentPlan, rng),
      familyDiscountCount,
      internetContract,
      billingType,
      paymentMethod,
      docomoYears: generateDocomoYears(type, rng),
      billingGroupLines,
      device,
      deviceUsageYears: generateDeviceYears(device, rng),
      electricityContract: pickOne(type.electricityContracts, rng),
      gasContract: pickOne(type.gasContracts, rng)
    };
  }

  function generateHearingMap(type, basicInfo, rng) {
    return {
      currentPlan: {
        category: 'reception',
        text: generateReceptionHearing(type, basicInfo, rng)
      },
      callOption: {
        category: 'call',
        text: generateCallHearing(type, basicInfo, rng)
      },
      monthlyDataUsage: {
        category: 'data',
        text: generateDataHearing(type, basicInfo, rng)
      },
      familyDiscountCount: {
        category: 'family',
        text: generateFamilyHearing(type, basicInfo, rng)
      },
      internetContract: {
        category: 'internet',
        text: generateInternetHearing(type, basicInfo, rng)
      },
      billingType: {
        category: 'payment',
        text: generateBillingHearing(type, basicInfo, rng)
      },
      paymentMethod: {
        category: 'payment',
        text: generatePaymentHearing(type, basicInfo, rng)
      },
      docomoYears: {
        category: 'contract',
        text: generateContractHearing(type, basicInfo, rng)
      },
      billingGroupLines: {
        category: 'family',
        text: generateGroupLinesHearing(type, basicInfo, rng)
      },
      device: {
        category: 'device',
        text: generateDeviceHearing(type, basicInfo, rng)
      },
      deviceUsageYears: {
        category: 'device',
        text: '利用期間が長くなっており、バッテリー持ちや動作速度への不満が出ている可能性があります。'
      },
      electricityContract: {
        category: 'lifeline',
        text: generateElectricityHearing(type, basicInfo, rng)
      },
      gasContract: {
        category: 'lifeline',
        text: generateGasHearing(type, basicInfo, rng)
      }
    };
  }

  function generateCallOption(plan, type, rng) {
    if (plan === 'ahamo') {
      return pickOne(Masters.callOptions.ahamo, rng);
    }

    if (type.id === 'T002') {
      return pickOne(['なし', 'かけ放題オプション', 'ファミリー割引内通話メイン'], rng);
    }

    return pickOne(Masters.callOptions.docomo, rng);
  }

  function normalizePaymentMethod(billingType, paymentMethod) {
    if (billingType === '一括請求の子回線') {
      return '代表回線が支払い';
    }

    return paymentMethod;
  }

  function generateBillingGroupLines(billingType, rng) {
    if (billingType === '単独請求') return '1回線';
    if (billingType === '一括請求の代表回線') return `${randomInt(2, 6, rng)}回線`;
    if (billingType === '一括請求の子回線') return `${randomInt(2, 6, rng)}回線`;
    return '本人が把握していない';
  }

  function generateFamilyCount(billingType, groupLinesText, rng) {
    if (billingType === '単独請求') return `${randomInt(1, 3, rng)}人`;
    const groupLines = parseInt(groupLinesText, 10);
    if (!Number.isNaN(groupLines)) return `${randomInt(groupLines, Math.max(groupLines, 6), rng)}人`;
    return '本人が把握していない';
  }

  function generateDataUsage(type, plan, rng) {
    if (type.id === 'T009') return pickOne(['15GB前後', '18GB前後', '25GB前後', '30GB以上'], rng);
    if (plan === 'ahamo') return pickOne(['10GB前後', '20GB前後', '25GB前後'], rng);
    if (type.id === 'T002') return pickOne(['1GB未満', '2GB前後', '3GB前後'], rng);
    return pickOne(['4GB前後', '8GB前後', '12GB前後', '18GB前後'], rng);
  }

  function generateDocomoYears(type, rng) {
    if (type.id === 'T002' || type.id === 'T004' || type.id === 'T005') {
      return `${randomInt(15, 28, rng)}年`;
    }
    return `${randomInt(3, 18, rng)}年`;
  }

  function generateDeviceYears(device, rng) {
    const max = Masters.deviceMaxYears[device] || 5;
    const min = Math.min(1, max);
    return `${randomInt(min, max, rng)}年`;
  }

  function generateReceptionHearing(type, basicInfo, rng) {
    const phrases = {
      T001: '「そろそろ機種変更しようかなと思って」と来店。主な理由は端末の古さで、料金見直しはついでです。',
      T002: '「料金がよく分からない」「スマホの使い方も聞きたい」と相談。来店理由がやや曖昧です。',
      T003: '「ahamoにしたら安くなるか聞きたい」と相談。店頭サポートや通話条件の理解確認が必要です。',
      T004: '「家族全体の料金を見たい」と相談。代表回線として全体の支払いを気にしています。',
      T005: '「家族の料金を聞きたい」と来店。ただし本人は子回線で、詳細は代表回線側が管理しています。',
      T006: '「カードとか料金のことで聞きたい」と相談。dカードは持っていますが、日常決済では他社カードを使っています。',
      T007: '「家のネット代も含めて高い気がする」と相談。home 5Gの契約状況確認が重要です。',
      T008: '「家のWi-Fiのことで聞きたい」と相談。home 5Gはあるが、名義は本人ではない可能性があります。',
      T009: '「データ量が足りるか気になる」と相談。動画SNSの利用が多いタイプです。',
      T010: '「電気やガスもまとめられるか聞きたい」と相談。ライフラインは本人名義で把握できています。',
      T011: '「今のドコモ契約がちゃんとお得か見てほしい」と相談。複数商材を契約済みです。',
      T012: '「よく分からないけど料金を見てほしい」と相談。本人が把握していない情報が多いです。'
    };

    return phrases[type.id] || '来店理由はヒアリングで確認が必要です。';
  }

  function generateCallHearing(type, basicInfo, rng) {
  const familyCount = parseInt(basicInfo.familyDiscountCount, 10);
  const hasFamilyCallTarget = !Number.isNaN(familyCount) && familyCount >= 2;

  if (type.id === 'T002' || type.id === 'T012') {
    if (hasFamilyCallTarget) {
      return '本人は「電話はよく使う」と話しますが、LINE通話と通常電話の区別が曖昧です。家族への連絡が中心ですが、通常電話かLINE通話かは追加確認が必要です。';
    }

    return '本人は「電話はよく使う」と話しますが、LINE通話と通常電話の区別が曖昧です。ファミリー割引内通話ではなく、LINEや通常電話をまとめて「電話」と表現している可能性があります。';
  }

  if (basicInfo.callOption === 'かけ放題オプション') {
    if (hasFamilyCallTarget) {
      return '週8回前後、1回あたり10分以上の通話があります。家族への通話もありますが、職場・店舗・病院など家族外への通常電話もあります。';
    }

    return '週8回前後、1回あたり10分以上の通話があります。ファミリー割引内通話ではなく、職場・店舗・病院など家族外への通常電話が中心です。';
  }

  if (basicInfo.callOption === '5分通話無料オプション') {
    return '週2〜5回程度、1回あたり3〜5分ほどの短時間通話が中心です。LINE通話と通常電話はある程度区別できています。';
  }

  if (basicInfo.callOption === 'ahamo標準：5分以内通話無料') {
    return '週2〜5回程度、1回あたり5分以内の短時間通話が中心です。ahamo標準の5分以内通話無料に収まりやすい使い方です。';
  }

  if (basicInfo.callOption === 'ahamo + かけ放題オプション') {
    return '週8回前後、1回あたり10分以上の通話があります。ahamo利用中ですが、長めの通常電話があるため、かけ放題オプションを追加しています。';
  }

  return '週2〜5回程度、1回あたり3〜5分ほどの短時間通話が中心です。LINE通話と通常電話はある程度区別できています。';
}

  function generateDataHearing(type, basicInfo, rng) {
    if (type.id === 'T009') {
      return '通勤中にTikTokやYouTube Shortsを見ることが多いです。職場Wi-Fiはなく、通勤は電車で片道30〜45分前後です。';
    }

    if (type.id === 'T002') {
      return '外ではLINEとニュース、天気予報程度です。自宅Wi-Fiの有無を本人が正確に把握していない場合があります。';
    }

    return '自宅ではWi-Fi中心です。外ではLINE、地図、SNSを使う程度ですが、月によって動画視聴が増えることがあります。';
  }

  function generateFamilyHearing(type, basicInfo, rng) {
    if (basicInfo.billingType === '一括請求の代表回線') {
      return '家族回線をまとめて管理しています。本人は代表として料金全体を見ていますが、家族それぞれの利用状況までは把握しきれていません。';
    }

    if (basicInfo.billingType === '一括請求の子回線') {
      return '家族グループ内の子回線です。支払い変更や詳細確認は代表回線側への確認が必要です。';
    }

    return 'ファミリー割引内の通話もありますが、支払いは本人単独で管理しています。';
  }

  function generateInternetHearing(type, basicInfo, rng) {
    if (basicInfo.internetContract === 'home 5G') {
      if (type.id === 'T008' || type.id === 'T005') {
        return 'home 5Gは家族名義です。本人では契約年数・割賦残回数・月々サポート残回数を確認できません。名義人確認が必要です。';
      }

      const model = pickOne(['HR01', 'HR02'], rng);
      const supportCount = pickOne([36, 48], rng);
      const monthlySupport = supportCount === 36 ? 1980 : 1525;
      const remaining = randomInt(8, supportCount - 2, rng);

      return `home 5Gは本人名義です。機種は${model}。契約は1〜2年程度。家電量販店や店舗値引きで端末代金が安くなっている可能性があります。割賦残${remaining}回、月々サポート残${remaining}回、月々サポートは月${monthlySupport.toLocaleString()}円です。`;
    }

    if (basicInfo.internetContract === '本人が把握していない') {
      return 'インターネット契約の有無や名義を本人が把握していません。家族や同居人が契約している可能性があります。';
    }

    return `${basicInfo.internetContract}を利用中です。名義は本人または家族の可能性があり、詳細確認が必要です。`;
  }

  function generateBillingHearing(type, basicInfo, rng) {
    if (basicInfo.billingType === '一括請求の子回線') {
      return '本人は支払い主体ではありません。支払い方法や変更可否は代表回線側への確認が必要です。';
    }

    if (basicInfo.billingType === '一括請求の代表回線') {
      return '本人が一括請求の代表として家族分の請求をまとめています。支払い方法の変更は本人主導で検討できます。';
    }

    return '本人単独で請求管理しています。支払い方法の変更可否も本人判断で進めやすい状態です。';
  }

  function generatePaymentHearing(type, basicInfo, rng) {
    if (type.id === 'T006' || basicInfo.paymentMethod.includes('楽天')) {
      return 'クレジットカードを複数枚所有しています。dカード GOLDあり。ただし携帯料金も日常決済も楽天カードがメインで、dカードはほぼ使っていません。';
    }

    if (basicInfo.paymentMethod === '代表回線が支払い') {
      return '本人は携帯料金の支払いカードや口座を把握していません。代表回線側の確認が必要です。';
    }

    if (basicInfo.paymentMethod.includes('dカード')) {
      return '携帯料金はdカード系で支払っています。日常決済でも使っているかは追加確認が必要です。';
    }

    return '支払い方法は本人が把握しています。クレジットカード所有枚数やメインカードは追加ヒアリングで確認できます。';
  }

  function generateContractHearing(type, basicInfo, rng) {
    return 'ドコモ契約年数は長めです。ただし、最近の料金プランや特典までは追えていない可能性があります。';
  }

  function generateGroupLinesHearing(type, basicInfo, rng) {
    if (basicInfo.billingType.includes('一括請求')) {
      return '家族複数回線がまとまっています。代表回線か子回線かによって、本人が変更できる範囲が変わります。';
    }

    return '一括請求ではなく、本人単独で管理している回線です。';
  }

  function generateDeviceHearing(type, basicInfo, rng) {
    return `${basicInfo.device}を${basicInfo.deviceUsageYears}利用しています。バッテリー持ちや動作速度への不満が出始めている可能性があります。`;
  }

  function generateElectricityHearing(type, basicInfo, rng) {
    if (basicInfo.electricityContract === '本人が把握していない') {
      return '電気契約の会社・名義・金額を本人が把握していません。家族や同居人が管理している可能性があります。';
    }

    if (basicInfo.electricityContract === 'ドコモでんき') {
      return 'ドコモでんき契約済みです。本人名義の可能性が高いですが、料金や支払い方法の理解は確認が必要です。';
    }

    return `${basicInfo.electricityContract}を利用中です。本人名義なら月8,000〜18,000円前後。携帯料金の支払いカードと同一か確認できます。`;
  }

  function generateGasHearing(type, basicInfo, rng) {
    if (basicInfo.gasContract === '本人が把握していない') {
      return 'ガス契約の会社・名義・金額を本人が把握していません。家族や同居人が管理している可能性があります。';
    }

    if (basicInfo.gasContract === 'ドコモガス') {
      return 'ドコモガス契約済みです。契約内容を本人が覚えていない場合があります。';
    }

    return `${basicInfo.gasContract}を利用中です。本人名義なら月4,000〜10,000円前後。携帯料金の支払い方法と同一か確認できます。`;
  }

  function buildFallbackPersona(seed) {
    const type = PersonaTypes.types.T001;
    return buildPersona(type, 'N', seed, createRng(seed));
  }

  function createSeed() {
    return Math.floor(Date.now() % 1000000000);
  }

  function createRng(seed) {
    let value = seed % 2147483647;

    if (value <= 0) {
      value += 2147483646;
    }

    return function () {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function randomInt(min, max, rng) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function pickOne(array, rng) {
    return array[Math.floor(rng() * array.length)];
  }

  function pickWeighted(items, rng) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let point = rng() * total;

    for (const item of items) {
      point -= item.weight;
      if (point <= 0) return item;
    }

    return items[items.length - 1];
  }

  return {
    generatePersona
  };
})();
