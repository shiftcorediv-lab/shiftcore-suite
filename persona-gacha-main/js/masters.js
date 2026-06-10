const Masters = {
  rarities: [
    { key: 'N', label: 'N：基礎', weight: 40 },
    { key: 'R', label: 'R：標準', weight: 30 },
    { key: 'SR', label: 'SR：応用', weight: 20 },
    { key: 'SSR', label: 'SSR：高難度', weight: 8 },
    { key: 'UR', label: 'UR：特殊ケース', weight: 2 }
  ],

  rarityLabels: {
    N: 'N：基礎',
    R: 'R：標準',
    SR: 'SR：応用',
    SSR: 'SSR：高難度',
    UR: 'UR：特殊ケース'
  },

  callOptions: {
    docomo: [
      'なし',
      '5分通話無料オプション',
      'かけ放題オプション',
    ],
    ahamo: [
      'ahamo標準：5分以内通話無料',
      'ahamo + かけ放題オプション'
    ]
  },

  deviceMaxYears: {
    'iPhone 15': 2,
    'iPhone 14': 3,
    'iPhone 13': 4,
    'iPhone SE 第2世代': 6,
    'AQUOS sense5G': 5,
    'らくらくスマートフォン': 8,
    'ガラケー': 12
  },

  labels: {
    currentPlan: '現在の料金プラン',
    callOption: '通話オプション',
    monthlyDataUsage: '月間データ量',
    familyDiscountCount: 'ファミリー割引人数',
    internetContract: 'インターネット契約',
    billingType: '請求区分',
    paymentMethod: '支払い方法',
    docomoYears: 'ドコモ契約年数',
    billingGroupLines: '一括請求グループ回線数',
    device: '端末',
    deviceUsageYears: '端末の利用期間',
    electricityContract: '電気契約',
    gasContract: 'ガス契約'
  }
};
