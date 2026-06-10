const PersonaTypes = {
  byRarity: {
    N: ['T001', 'T001', 'T009'],
    R: ['T002', 'T003', 'T010'],
    SR: ['T004', 'T006', 'T009'],
    SSR: ['T007', 'T008', 'T011'],
    UR: ['T005', 'T012']
  },

  types: {
    T001: {
      id: 'T001',
      name: '標準スマホユーザー',
      themes: ['機種変更', '軽い料金確認'],
      plans: ['ドコモ mini', 'irumo', 'eximo'],
      internetContracts: ['ドコモ光', 'SoftBank光', 'なし'],
      billingTypes: ['単独請求'],
      paymentMethods: ['クレジットカード払い', '口座引き落とし'],
      devices: ['iPhone 12', 'iPhone 13', 'AQUOS sense5G'],
      electricityContracts: ['関西電力', '東京電力'],
      gasContracts: ['大阪ガス', '東京ガス']
    },

    T002: {
      id: 'T002',
      name: '年配・低リテラシー',
      themes: ['料金確認', 'スマホ操作相談'],
      plans: ['irumo', 'はじめてスマホプラン', 'ギガライト'],
      internetContracts: ['なし', '本人が把握していない', 'ドコモ光'],
      billingTypes: ['単独請求', '一括請求の代表回線'],
      paymentMethods: ['口座引き落とし', '請求書払い'],
      devices: ['らくらくスマートフォン', 'AQUOS sense5G', 'ガラケー'],
      electricityContracts: ['本人が把握していない', '関西電力', '東京電力'],
      gasContracts: ['本人が把握していない', '大阪ガス', '東京ガス']
    },

    T003: {
      id: 'T003',
      name: 'ahamo検討ユーザー',
      themes: ['ahamo相談', '料金見直し'],
      plans: ['eximo', 'ドコモ MAX', 'ahamo'],
      internetContracts: ['ドコモ光', 'なし', 'SoftBank光'],
      billingTypes: ['単独請求'],
      paymentMethods: ['クレジットカード払い', 'dカード払い', '楽天カード払い'],
      devices: ['iPhone 13', 'iPhone 14', 'iPhone 15'],
      electricityContracts: ['関西電力', '楽天でんき'],
      gasContracts: ['大阪ガス', '楽天ガス']
    },

    T004: {
      id: 'T004',
      name: '一括請求代表回線',
      themes: ['家族まとめ', '支払い確認'],
      plans: ['eximo', 'ドコモ MAX', '5Gギガホ プレミア'],
      internetContracts: ['ドコモ光', 'home 5G', '他社ホームルーター'],
      billingTypes: ['一括請求の代表回線'],
      paymentMethods: ['dカード GOLD払い', '楽天カード払い', '口座引き落とし'],
      devices: ['iPhone 13', 'iPhone SE 第2世代', 'AQUOS sense5G'],
      electricityContracts: ['関西電力', 'ドコモでんき'],
      gasContracts: ['大阪ガス', 'ドコモガス']
    },

    T005: {
      id: 'T005',
      name: '一括請求子回線',
      themes: ['家族の料金相談', '情報不足'],
      plans: ['5Gギガライト', 'irumo', 'ギガライト'],
      internetContracts: ['home 5G', '本人が把握していない', 'ドコモ光'],
      billingTypes: ['一括請求の子回線'],
      paymentMethods: ['代表回線が支払い'],
      devices: ['らくらくスマートフォン', 'iPhone SE 第2世代', 'AQUOS sense5G'],
      electricityContracts: ['本人が把握していない'],
      gasContracts: ['本人が把握していない']
    },

    T006: {
      id: 'T006',
      name: 'dカード休眠ユーザー',
      themes: ['dカード', '支払い見直し'],
      plans: ['eximo', 'ドコモ MAX', 'ドコモ mini'],
      internetContracts: ['ドコモ光', 'SoftBank光', 'home 5G'],
      billingTypes: ['単独請求', '一括請求の代表回線'],
      paymentMethods: ['楽天カード払い', 'PayPayカード払い', 'クレジットカード払い'],
      devices: ['iPhone 13', 'iPhone 14', 'iPhone SE 第2世代'],
      electricityContracts: ['関西電力', '東京電力'],
      gasContracts: ['大阪ガス', '東京ガス']
    },

    T007: {
      id: 'T007',
      name: 'home 5G本人名義ユーザー',
      themes: ['home 5G', 'ネット料金確認'],
      plans: ['eximo', 'ドコモ MAX', '5Gギガホ プレミア'],
      internetContracts: ['home 5G'],
      billingTypes: ['単独請求', '一括請求の代表回線'],
      paymentMethods: ['楽天カード払い', 'dカード GOLD払い', 'クレジットカード払い'],
      devices: ['iPhone SE 第2世代', 'iPhone 13', 'AQUOS sense5G'],
      electricityContracts: ['関西電力', 'ドコモでんき'],
      gasContracts: ['大阪ガス', 'ドコモガス']
    },

    T008: {
      id: 'T008',
      name: 'home 5G家族名義ユーザー',
      themes: ['home 5G', '名義確認'],
      plans: ['irumo', 'eximo', 'ギガライト'],
      internetContracts: ['home 5G'],
      billingTypes: ['単独請求', '一括請求の子回線'],
      paymentMethods: ['口座引き落とし', '代表回線が支払い'],
      devices: ['iPhone 12', 'AQUOS sense5G', 'らくらくスマートフォン'],
      electricityContracts: ['本人が把握していない', '関西電力'],
      gasContracts: ['本人が把握していない', '大阪ガス']
    },

    T009: {
      id: 'T009',
      name: '動画SNS高利用ユーザー',
      themes: ['データ通信', '動画SNS'],
      plans: ['eximo', 'ドコモ MAX', 'ahamo'],
      internetContracts: ['ドコモ光', 'なし', 'SoftBank光'],
      billingTypes: ['単独請求'],
      paymentMethods: ['クレジットカード払い', '楽天カード払い'],
      devices: ['iPhone 14', 'iPhone 15', 'iPhone 13'],
      electricityContracts: ['関西電力', '東京電力'],
      gasContracts: ['大阪ガス', '東京ガス']
    },

    T010: {
      id: 'T010',
      name: 'ライフライン他社本人名義ユーザー',
      themes: ['電気ガス', '支払い整理'],
      plans: ['ドコモ mini', 'eximo', 'irumo'],
      internetContracts: ['ドコモ光', 'SoftBank光', 'なし'],
      billingTypes: ['単独請求'],
      paymentMethods: ['楽天カード払い', 'クレジットカード払い', '口座引き落とし'],
      devices: ['iPhone 12', 'iPhone 13', 'AQUOS sense5G'],
      electricityContracts: ['関西電力', '東京電力', '楽天でんき'],
      gasContracts: ['大阪ガス', '東京ガス', '楽天ガス']
    },

    T011: {
      id: 'T011',
      name: 'ドコモ経済圏寄りユーザー',
      themes: ['ドコモ商材利用状況', '既存契約確認'],
      plans: ['ドコモ MAX', 'ドコモ ポイ活 MAX', 'eximo'],
      internetContracts: ['ドコモ光', 'home 5G'],
      billingTypes: ['一括請求の代表回線', '単独請求'],
      paymentMethods: ['dカード GOLD払い', 'dカード払い'],
      devices: ['iPhone 14', 'iPhone 13', 'AQUOS sense5G'],
      electricityContracts: ['ドコモでんき'],
      gasContracts: ['ドコモガス']
    },

    T012: {
      id: 'T012',
      name: '情報ほぼ不明ユーザー',
      themes: ['情報不足', '確認順序'],
      plans: ['本人が把握していない', 'ギガライト', 'irumo'],
      internetContracts: ['本人が把握していない', 'home 5G'],
      billingTypes: ['本人が把握していない', '一括請求の子回線'],
      paymentMethods: ['本人が把握していない', '代表回線が支払い'],
      devices: ['らくらくスマートフォン', 'AQUOS sense5G'],
      electricityContracts: ['本人が把握していない'],
      gasContracts: ['本人が把握していない']
    }
  }
};
