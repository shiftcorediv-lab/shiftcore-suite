// ===== ShiftBuilder mock-data.js ここから =====

export const mockShiftData = {
  month: "2026-07",
  area: "all",
  dates: [
    { date: "2026-07-01", label: "7/1", weekday: "水" },
    { date: "2026-07-02", label: "7/2", weekday: "木" },
    { date: "2026-07-03", label: "7/3", weekday: "金" },
    { date: "2026-07-04", label: "7/4", weekday: "土" },
    { date: "2026-07-05", label: "7/5", weekday: "日" }
  ],
  cases: [
    {
      caseId: "CASE-202607-0001",
      title: "福岡A店 販売応援",
      client: "サンプル代理店A",
      area: "福岡",
      cells: {
        "2026-07-01": {
          required: 2,
          assigned: [
            { userId: "u001", name: "山田 花子", note: "福岡エリア" }
          ],
          candidates: [
            { userId: "u002", name: "佐藤 太郎", group: "追加できる候補", reason: "エリア一致・同日予定なし" },
            { userId: "u003", name: "田中 美咲", group: "注意あり候補", reason: "月内アサイン数が多め" },
            { userId: "u004", name: "鈴木 一郎", group: "追加不可", reason: "非稼働希望あり" }
          ]
        },
        "2026-07-02": {
          required: 2,
          assigned: [
            { userId: "u001", name: "山田 花子", note: "福岡エリア" },
            { userId: "u002", name: "佐藤 太郎", note: "福岡エリア" }
          ],
          candidates: [
            { userId: "u003", name: "田中 美咲", group: "注意あり候補", reason: "エリア近接・移動確認必要" },
            { userId: "u005", name: "高橋 葵", group: "追加できる候補", reason: "同日予定なし" }
          ]
        },
        "2026-07-03": {
          required: 1,
          assigned: [],
          candidates: [
            { userId: "u002", name: "佐藤 太郎", group: "追加できる候補", reason: "同日予定なし" },
            { userId: "u006", name: "中村 蓮", group: "追加不可", reason: "別案件にアサイン済" }
          ]
        },
        "2026-07-04": {
          required: 1,
          assigned: [
            { userId: "u003", name: "田中 美咲", note: "注意ありで仮配置" },
            { userId: "u005", name: "高橋 葵", note: "追加配置" }
          ],
          candidates: [
            { userId: "u002", name: "佐藤 太郎", group: "注意あり候補", reason: "連勤確認必要" }
          ]
        },
        "2026-07-05": {
          required: 0,
          assigned: [],
          candidates: []
        }
      }
    },
    {
      caseId: "CASE-202607-0002",
      title: "北九州B店 イベント",
      client: "サンプル代理店B",
      area: "北九州",
      cells: {
        "2026-07-01": {
          required: 1,
          assigned: [
            { userId: "u006", name: "中村 蓮", note: "北九州エリア" }
          ],
          candidates: [
            { userId: "u007", name: "伊藤 結衣", group: "追加できる候補", reason: "エリア一致" }
          ]
        },
        "2026-07-02": {
          required: 1,
          assigned: [],
          candidates: [
            { userId: "u007", name: "伊藤 結衣", group: "追加できる候補", reason: "同日予定なし" },
            { userId: "u001", name: "山田 花子", group: "注意あり候補", reason: "エリア違い" }
          ]
        },
        "2026-07-03": {
          required: 2,
          assigned: [
            { userId: "u006", name: "中村 蓮", note: "北九州エリア" },
            { userId: "u007", name: "伊藤 結衣", note: "北九州エリア" }
          ],
          candidates: []
        },
        "2026-07-04": {
          required: 2,
          assigned: [
            { userId: "u006", name: "中村 蓮", note: "北九州エリア" }
          ],
          candidates: [
            { userId: "u007", name: "伊藤 結衣", group: "追加できる候補", reason: "同日予定なし" },
            { userId: "u008", name: "小林 悠", group: "追加不可", reason: "非稼働希望あり" }
          ]
        },
        "2026-07-05": {
          required: 1,
          assigned: [],
          candidates: [
            { userId: "u008", name: "小林 悠", group: "注意あり候補", reason: "月内アサイン数が多め" }
          ]
        }
      }
    }
  ]
};

// ===== ShiftBuilder mock-data.js ここまで =====
