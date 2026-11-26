/* ==========================================================================
   創用 CC RPG：八島冒險（Three.js r128）
   - 8 座低多邊形關卡島（第 8 關中央主島 + 第 1–7 關環繞外島）與懸索吊橋
   - 48 題完整題庫：每輪每關各抽 1 快速題 + 1 操作題（共 16 題）
   - 支援單選、一對一配對／連連看、分類、多對多配對、排序、找錯改寫
   - 首答正確 2 分、重試答對 1 分、未完成 0 分；六大核心概念掌握結算
   ========================================================================== */

(function () {
  "use strict";

  const PAIR_COLORS = ["#0284c7", "#16a34a", "#d97706", "#7c3aed", "#e11d48", "#0d9488"];
  const PAIR_LETTERS = ["A", "B", "C", "D", "E", "F"];

  const dom = {
    sceneContainer: document.getElementById("scene-container"),
    labelsLayer: document.getElementById("labels-layer"),
    sidebar: document.getElementById("sidebar"),
    sheetBackdrop: document.getElementById("sheet-backdrop"),
    sheetHandleBtn: document.getElementById("sheet-handle-btn"),
    sheetPeekTitle: document.getElementById("sheet-peek-title"),
    viewIndex: document.getElementById("view-index"),
    viewDetail: document.getElementById("view-detail"),
    progressIslands: document.getElementById("progress-islands"),
    progressScore: document.getElementById("progress-score"),
    progressFill: document.getElementById("progress-fill"),
    searchInput: document.getElementById("search-input"),
    searchClearBtn: document.getElementById("search-clear-btn"),
    islandList: document.getElementById("island-list"),
    backAllBtn: document.getElementById("back-all-btn"),
    detailBadge: document.getElementById("detail-badge"),
    detailStageScore: document.getElementById("detail-stage-score"),
    detailTitle: document.getElementById("detail-title"),
    detailBlurb: document.getElementById("detail-blurb"),
    questionTabs: document.getElementById("question-tabs"),
    quizBody: document.getElementById("quiz-body"),
    prevIslandBtn: document.getElementById("prev-island-btn"),
    nextIslandBtn: document.getElementById("next-island-btn"),
    summaryBtn: document.getElementById("summary-btn"),
    newRoundBtn: document.getElementById("new-round-btn"),
    resetViewBtn: document.getElementById("reset-view-btn"),
    summaryModal: document.getElementById("summary-modal"),
    summaryContent: document.getElementById("summary-content"),
    closeSummaryBtn: document.getElementById("close-summary-btn"),
    modalNewRoundBtn: document.getElementById("modal-new-round-btn"),
    modalContinueBtn: document.getElementById("modal-continue-btn"),
    openCertFromSummaryBtn: document.getElementById("open-cert-from-summary-btn"),
    certHudBtn: document.getElementById("cert-hud-btn"),
    playerPillBtn: document.getElementById("player-pill-btn"),
    playerPillText: document.getElementById("player-pill-text"),
    welcomeModal: document.getElementById("welcome-modal"),
    playerForm: document.getElementById("player-form"),
    inputClass: document.getElementById("input-class"),
    inputSeat: document.getElementById("input-seat"),
    inputName: document.getElementById("input-name"),
    welcomeError: document.getElementById("welcome-error"),
    guestStartBtn: document.getElementById("guest-start-btn"),
    certificateModal: document.getElementById("certificate-modal"),
    certPreviewSheet: document.getElementById("cert-preview-sheet"),
    closeCertBtn: document.getElementById("close-cert-btn"),
    closeCertFooterBtn: document.getElementById("close-cert-footer-btn"),
    downloadCertPngBtn: document.getElementById("download-cert-png-btn"),
    printCertBtn: document.getElementById("print-cert-btn"),
    toast: document.getElementById("toast")
  };

  // 應用程式狀態
  const state = {
    concepts: [],
    islands: [],
    // 每座島本輪抽出的 2 題（index 0: 快速題, index 1: 操作題）
    roundPlan: [],
    // 記錄每題作答狀態：{ firstCorrect: boolean|null, solved: boolean, score: 0|1|2, attempts: number, draft: any, lastWrong: boolean }
    records: {},
    selectedIndex: -1,
    activeSlot: 0, // 0 = 快速題, 1 = 操作題
    hoveredIndex: -1,
    searchQuery: "",
    sheetOpen: false,
    toastTimer: null,
    summaryAutoShown: false,
    player: {
      className: "",
      seatNo: "",
      studentName: "",
      isGuest: false
    }
  };

  // Three.js 全域物件
  let scene, camera, renderer, raycaster, clock;
  let oceanMesh, oceanBasePositions;
  const islandEntries = [];
  const clickableMeshes = [];
  const clouds = [];
  const animatedParts = [];

  const OVERVIEW_CAM = {
    target: new THREE.Vector3(0, 0.2, 0),
    radius: 53,
    theta: 0.36,
    phi: 0.92
  };

  const camCtrl = {
    target: OVERVIEW_CAM.target.clone(),
    desiredTarget: OVERVIEW_CAM.target.clone(),
    radius: OVERVIEW_CAM.radius,
    desiredRadius: OVERVIEW_CAM.radius,
    theta: OVERVIEW_CAM.theta,
    desiredTheta: OVERVIEW_CAM.theta,
    phi: OVERVIEW_CAM.phi,
    desiredPhi: OVERVIEW_CAM.phi,
    minRadius: 9,
    maxRadius: 80,
    minPhi: 0.34,
    maxPhi: 1.36,
    isDragging: false,
    dragDistance: 0,
    lastX: 0,
    lastY: 0,
    pinchStartDist: 0,
    pinchStartRadius: 0,
    flight: null
  };

  /* ------------------------------------------------------------------------
     工具函式
     ------------------------------------------------------------------------ */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove("hidden");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => dom.toast.classList.add("hidden"), 3400);
  }

  function hexToInt(hex) {
    return parseInt(String(hex).replace("#", ""), 16);
  }

  /* ------------------------------------------------------------------------
     資料載入與抽題邏輯（每關 1 快速題 + 1 操作題，共 16 題）
     ------------------------------------------------------------------------ */
  async function loadGameData() {
    if (window.__INLINE_ISLANDS_DATA__ && Array.isArray(window.__INLINE_ISLANDS_DATA__.islands)) {
      return window.__INLINE_ISLANDS_DATA__;
    }
    try {
      const res = await fetch("./islands.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json && Array.isArray(json.islands) && json.islands.length > 0) {
        return json;
      }
      throw new Error("Invalid JSON");
    } catch (err) {
      return {"meta": {"title": "創用 CC RPG：八島冒險", "subtitle": "8 座低多邊形小島・48 題完整題庫・每輪隨機抽 16 題", "note": "本遊戲所有情境中的作品及作者均為虛構；除特別說明外，授權版本均為 4.0。題目只檢核授權條件，不處理肖像權、商標等其他權利。"}, "concepts": [{"id": "icons", "name": "圖示", "desc": "辨識 BY、NC、ND、SA 四種授權要素"}, {"id": "combos", "name": "授權組合", "desc": "理解六種 CC 公眾授權的組合與限制"}, {"id": "usage", "name": "用途判斷", "desc": "依商業／非商業與改作需求挑選合適素材"}, {"id": "adapt", "name": "改作", "desc": "掌握 ND 禁止分享改作與 SA 相同方式分享"}, {"id": "source", "name": "來源核對", "desc": "回到原始作品頁核對作者、作品與授權連結"}, {"id": "attrib", "name": "標示", "desc": "完成適當姓名標示、修改說明與綜合應用"}], "islands": [{"id": "forest", "stage": 1, "name": "圖示森林", "subtitle": "四種授權要素", "concept": "icons", "blurb": "踏入圖示森林，認識 BY、NC、ND、SA 四個最核心的創用 CC 授權要素。", "landmark": "forest", "accent": "#16a34a", "palette": {"grass": "#34d399", "grassAlt": "#059669", "sand": "#fde68a", "rock": "#57534e"}, "questions": [{"id": "1-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "icons", "prompt": "CC 授權中的 BY 主要要求什麼？", "options": ["標示作者等適當資訊", "禁止分享", "不得商用"], "answer": "標示作者等適當資訊", "feedback": "BY 是姓名標示；分享時須依授權條款適當標示。"}, {"id": "1-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "icons", "prompt": "作品標示 NC，哪項說法最接近它的意思？", "options": ["只要沒有收到錢就一定符合", "使用目的不得主要為商業利益或金錢報酬", "不能在網路上分享"], "answer": "使用目的不得主要為商業利益或金錢報酬", "feedback": "NC 看使用目的，不能只用「有沒有收錢」判斷。"}, {"id": "1-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "icons", "prompt": "作品標示 ND，你想把照片明顯改畫成插畫後公開分享，應如何處理？", "options": ["直接分享", "先取得額外許可，或改選允許改作的素材", "只要寫作者就可以"], "answer": "先取得額外許可，或改選允許改作的素材", "feedback": "ND 不允許依該授權分享改作版本。"}, {"id": "1-4", "group": "action", "type": "match", "typeLabel": "配對", "concept": "icons", "prompt": "將圖示與意思正確配對：", "pairs": [{"left": "BY", "right": "姓名標示"}, {"left": "NC", "right": "非商業性"}, {"left": "ND", "right": "禁止分享改作版本"}, {"left": "SA", "right": "分享改作版本時採相同或相容授權"}], "feedback": "SA 管的是改作版本的授權方式，不是檔案格式。"}, {"id": "1-5", "group": "action", "type": "classify", "typeLabel": "分類", "concept": "icons", "prompt": "將下列敘述分入對應的 BY、NC、ND、SA：", "categories": ["BY", "NC", "ND", "SA"], "items": [{"text": "標示作者", "answer": "BY"}, {"text": "商業用途限制", "answer": "NC"}, {"text": "改作後公開分享的限制", "answer": "ND"}, {"text": "改作後分享的授權方式", "answer": "SA"}], "feedback": "先看每個圖示在限制哪一件事。"}, {"id": "1-6", "group": "action", "type": "match", "typeLabel": "連連看", "concept": "icons", "prompt": "將以下使用情境連至「最需要先檢查」的授權要素：", "pairs": [{"left": "報告附上作者資訊", "right": "BY"}, {"left": "品牌廣告使用圖片", "right": "NC"}, {"left": "重畫圖片後發布", "right": "ND"}, {"left": "改圖後選授權", "right": "SA"}], "feedback": "真實使用常需同時檢查多個圖示；本題只找最直接相關的要素。"}]}, {"id": "workshop", "stage": 2, "name": "授權工坊", "subtitle": "六種授權組合", "concept": "combos", "blurb": "走進授權工坊，拆解六種標準 CC 公眾授權的名稱縮寫與附加條件。", "landmark": "workshop", "accent": "#ea580c", "palette": {"grass": "#a3e635", "grassAlt": "#65a30d", "sand": "#fed7aa", "rock": "#78716c"}, "questions": [{"id": "2-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "combos", "prompt": "哪一組是六種 CC 公眾授權之一？", "options": ["CC BY-SA", "CC NC-ND", "CC SA-ND"], "answer": "CC BY-SA", "feedback": "六種標準公眾授權都有 BY。"}, {"id": "2-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "combos", "prompt": "哪一種授權允許商業使用及分享改作版本，但分享改作版本時須採相同或相容授權？", "options": ["CC BY-SA", "CC BY-NC-ND", "CC BY-ND"], "answer": "CC BY-SA", "feedback": "SA 管改作版本的授權；沒有 NC 代表此授權未禁止商業使用。"}, {"id": "2-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "combos", "prompt": "哪一種授權同時有非商業性和禁止分享改作版本的條件？", "options": ["CC BY-NC-SA", "CC BY-NC-ND", "CC BY-SA"], "answer": "CC BY-NC-ND", "feedback": "NC 與 ND 可以同時出現。"}, {"id": "2-4", "group": "action", "type": "match", "typeLabel": "配對", "concept": "combos", "prompt": "將四組授權與主要條件配對：", "pairs": [{"left": "CC BY", "right": "標示即可，允許商用與改作分享"}, {"left": "CC BY-NC", "right": "限非商業用途"}, {"left": "CC BY-ND", "right": "只能依授權分享未改作版本"}, {"left": "CC BY-SA", "right": "分享改作版本須採相同或相容授權"}], "feedback": "四組都要適當姓名標示。"}, {"id": "2-5", "group": "action", "type": "match", "typeLabel": "配對", "concept": "combos", "prompt": "將授權名稱配對正確的圖示組合：", "pairs": [{"left": "CC BY-NC-SA", "right": "BY+NC+SA"}, {"left": "CC BY-NC-ND", "right": "BY+NC+ND"}, {"left": "CC BY-SA", "right": "BY+SA"}, {"left": "CC BY-ND", "right": "BY+ND"}], "feedback": "讀授權名稱時，逐一拆開縮寫。"}, {"id": "2-6", "group": "action", "type": "order", "typeLabel": "排序", "concept": "combos", "prompt": "依「從授權名稱中讀到的限制數量」由少至多排列：", "items": ["CC BY", "CC BY-NC", "CC BY-NC-ND"], "feedback": "這是比較名稱中的附加條件，不代表所有實際情境都能只靠數量判斷。"}]}, {"id": "crossroad", "stage": 3, "name": "用途岔路", "subtitle": "用途與授權", "concept": "usage", "blurb": "站在用途岔路的燈塔前，判斷商業廣告、非商業班刊與原圖／改圖是否符合授權。", "landmark": "lighthouse", "accent": "#e11d48", "palette": {"grass": "#86efac", "grassAlt": "#22c55e", "sand": "#fef08a", "rock": "#64748b"}, "questions": [{"id": "3-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "usage", "prompt": "商店要把一張 CC BY 4.0 圖片放進付費廣告，並完成適當標示。就 CC 授權而言，哪項正確？", "options": ["可依授權使用", "一定不行，因為有收費", "只有 NC 才能使用"], "answer": "可依授權使用", "feedback": "CC BY 允許商業使用，仍須遵守姓名標示等條件。"}, {"id": "3-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "usage", "prompt": "公司要把 CC BY-NC 4.0 圖片用在商品廣告。哪項選擇較恰當？", "options": ["直接使用", "另找允許商用的圖片或取得額外許可", "只標示作者即可"], "answer": "另找允許商用的圖片或取得額外許可", "feedback": "商品廣告是明確的商業用途，不符合 NC 條件。"}, {"id": "3-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "usage", "prompt": "你把 CC BY-ND 4.0 圖片原樣放在公開網頁，完成適當標示。就 ND 條件而言，哪項正確？", "options": ["可依授權分享未改作版本", "ND 禁止任何分享", "必須改圖才能分享"], "answer": "可依授權分享未改作版本", "feedback": "ND 允許分享未改作版本。"}, {"id": "3-4", "group": "action", "type": "classify", "typeLabel": "分類", "concept": "usage", "prompt": "把四種使用放入對應分類（所有情境均完成適當標示）：", "categories": ["可依所述授權使用", "CC BY-NC 不允許"], "items": [{"text": "付費廣告使用 CC BY 圖", "answer": "可依所述授權使用"}, {"text": "付費廣告使用 CC BY-NC 圖", "answer": "CC BY-NC 不允許"}, {"text": "非商業班刊使用 CC BY 圖", "answer": "可依所述授權使用"}, {"text": "非商業班刊使用 CC BY-NC 圖", "answer": "可依所述授權使用"}], "feedback": "先看素材的授權，再看實際用途。"}, {"id": "3-5", "group": "action", "type": "multi-match", "typeLabel": "多對多配對", "concept": "usage", "prompt": "為每項需求勾選可用的素材（每項需求可複選多張素材，同一素材也可重複選用；假設完成標示與 SA 條件）：", "choices": [{"id": "1", "label": "1｜CC BY-NC-ND"}, {"id": "2", "label": "2｜CC BY-NC-SA"}, {"id": "3", "label": "3｜CC BY"}], "targets": [{"id": "A", "label": "A｜商品包裝廣告，原圖使用", "answers": ["3"]}, {"id": "B", "label": "B｜非商業班刊，改圖後分享", "answers": ["2", "3"]}, {"id": "C", "label": "C｜商業網站，改圖後分享", "answers": ["3"]}], "feedback": "先排除與用途衝突的 NC，再檢查改圖分享是否遇到 ND。"}, {"id": "3-6", "group": "action", "type": "single", "typeLabel": "找錯", "concept": "usage", "prompt": "「這張圖是 CC BY-NC；我沒有向讀者收錢，所以把它放進商品廣告一定可以。」選出錯誤部分：", "options": ["沒收錢就一定符合 NC", "需要看圖的尺寸", "商品廣告只能用黑白圖"], "answer": "沒收錢就一定符合 NC", "feedback": "NC 要看使用是否主要指向商業利益，商品廣告不能靠「讀者免費看」排除商業目的。"}]}, {"id": "market", "stage": 4, "name": "素材市集", "subtitle": "挑選素材", "concept": "usage", "blurb": "瀏覽市集裡的甲～己六張素材卡，根據不同任務需求篩選出合規作品。", "landmark": "observatory", "accent": "#0d9488", "palette": {"grass": "#2dd4bf", "grassAlt": "#0d9488", "sand": "#fde68a", "rock": "#475569"}, "contextCard": {"title": "本關素材卡（所有題目假設已完成適當標示）", "type": "materials", "materials": [{"code": "甲", "title": "《校園樹影》", "license": "CC BY 4.0"}, {"code": "乙", "title": "《河邊》", "license": "CC BY-NC 4.0"}, {"code": "丙", "title": "《小貓》", "license": "CC BY-ND 4.0"}, {"code": "丁", "title": "《星空》", "license": "CC BY-NC-SA 4.0"}, {"code": "戊", "title": "《舊街》", "license": "CC BY-NC-ND 4.0"}, {"code": "己", "title": "《山景》", "license": "CC BY-SA 4.0"}]}, "questions": [{"id": "4-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "usage", "prompt": "要把圖片改成商店宣傳海報並公開張貼，哪張最容易符合所列 CC 條件？", "options": ["甲《校園樹影》(CC BY 4.0)", "乙《河邊》(CC BY-NC 4.0)", "戊《舊街》(CC BY-NC-ND 4.0)"], "answer": "甲《校園樹影》(CC BY 4.0)", "feedback": "甲的 CC BY 允許商業使用及分享改作版本。"}, {"id": "4-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "usage", "prompt": "非商業班刊要原樣刊登圖片，哪張在遵守姓名標示後可依授權使用？", "options": ["只有甲", "甲、乙、丙、丁、戊、己", "只有丙"], "answer": "甲、乙、丙、丁、戊、己", "feedback": "這裡不改作、也不作商業使用，六張都可依各自授權使用。"}, {"id": "4-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "usage", "prompt": "你要改圖後公開分享，並希望新圖仍採 CC BY-SA 4.0。哪張合適？", "options": ["己《山景》(CC BY-SA 4.0)", "丙《小貓》(CC BY-ND 4.0)", "戊《舊街》(CC BY-NC-ND 4.0)"], "answer": "己《山景》(CC BY-SA 4.0)", "feedback": "己的 SA 要求改作版本用相同或相容授權分享。"}, {"id": "4-4", "group": "action", "type": "classify", "typeLabel": "分類", "concept": "usage", "prompt": "將甲～己六張素材分成「可用於商品廣告」與「不可用於商品廣告」（假設只原樣使用並完成適當標示）：", "categories": ["可用於商品廣告", "不可用於商品廣告"], "items": [{"text": "甲《校園樹影》CC BY 4.0", "answer": "可用於商品廣告"}, {"text": "乙《河邊》CC BY-NC 4.0", "answer": "不可用於商品廣告"}, {"text": "丙《小貓》CC BY-ND 4.0", "answer": "可用於商品廣告"}, {"text": "丁《星空》CC BY-NC-SA 4.0", "answer": "不可用於商品廣告"}, {"text": "戊《舊街》CC BY-NC-ND 4.0", "answer": "不可用於商品廣告"}, {"text": "己《山景》CC BY-SA 4.0", "answer": "可用於商品廣告"}], "feedback": "商品廣告是商業用途；檢查有無 NC。"}, {"id": "4-5", "group": "action", "type": "classify", "typeLabel": "分類", "concept": "usage", "prompt": "將甲～己分成「可分享明顯改圖版本」與「不可分享明顯改圖版本」（假設非商業分享，並遵守 SA 與姓名標示條件）：", "categories": ["可分享明顯改圖版本", "不可分享明顯改圖版本"], "items": [{"text": "甲《校園樹影》CC BY 4.0", "answer": "可分享明顯改圖版本"}, {"text": "乙《河邊》CC BY-NC 4.0", "answer": "可分享明顯改圖版本"}, {"text": "丙《小貓》CC BY-ND 4.0", "answer": "不可分享明顯改圖版本"}, {"text": "丁《星空》CC BY-NC-SA 4.0", "answer": "可分享明顯改圖版本"}, {"text": "戊《舊街》CC BY-NC-ND 4.0", "answer": "不可分享明顯改圖版本"}, {"text": "己《山景》CC BY-SA 4.0", "answer": "可分享明顯改圖版本"}], "feedback": "檢查有無 ND；SA 素材改作後分享還有授權條件。"}, {"id": "4-6", "group": "action", "type": "multi-match", "typeLabel": "多對多配對", "concept": "usage", "prompt": "為三個需求勾選所有可用素材（每個需求可複選多張，同一素材可重複選用；假設完成所有標示與 SA 條件）：", "choices": [{"id": "甲", "label": "甲 BY"}, {"id": "乙", "label": "乙 BY-NC"}, {"id": "丙", "label": "丙 BY-ND"}, {"id": "丁", "label": "丁 BY-NC-SA"}, {"id": "戊", "label": "戊 BY-NC-ND"}, {"id": "己", "label": "己 BY-SA"}], "targets": [{"id": "A", "label": "A｜商業使用且改圖", "answers": ["甲", "己"]}, {"id": "B", "label": "B｜非商業使用且改圖", "answers": ["甲", "乙", "丁", "己"]}, {"id": "C", "label": "C｜非商業使用且原樣分享", "answers": ["甲", "乙", "丙", "丁", "戊", "己"]}], "feedback": "同一張素材可能符合多種需求；逐項檢查 NC 與 ND。"}]}, {"id": "gate", "stage": 5, "name": "改作之門", "subtitle": "ND 與 SA", "concept": "adapt", "blurb": "穿越古堡的改作之門，釐清 ND「不得分享改作」與 SA「相同或相容授權」的關鍵界線。", "landmark": "castle", "accent": "#7c3aed", "palette": {"grass": "#6ee7b7", "grassAlt": "#10b981", "sand": "#e2e8f0", "rock": "#6b7280"}, "questions": [{"id": "5-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "adapt", "prompt": "你明顯修改一張 CC BY-SA 4.0 圖片，並準備公開分享改圖。哪項符合 SA？", "options": ["改圖採 CC BY-SA 4.0，並適當標示原作者與修改", "改圖聲明「禁止任何人再分享」", "不需標示原作者"], "answer": "改圖採 CC BY-SA 4.0，並適當標示原作者與修改", "feedback": "分享改作版本時，須採相同或相容授權，並完成標示。"}, {"id": "5-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "adapt", "prompt": "朋友給你一張 CC BY-ND 4.0 圖片。哪個行為最符合所列 CC 授權？", "options": ["明顯改圖後公開發布", "原樣發布並適當標示", "改圖後只寫「來源網路」"], "answer": "原樣發布並適當標示", "feedback": "ND 可分享未改作版本；改作版本不能依這項授權公開分享。"}, {"id": "5-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "adapt", "prompt": "CC BY-NC-SA 4.0 圖片改作後要公開分享，哪組條件都要注意？", "options": ["BY、NC、SA", "只看 SA", "只看有沒有收費"], "answer": "BY、NC、SA", "feedback": "授權名稱中的條件需一起遵守。"}, {"id": "5-4", "group": "action", "type": "classify", "typeLabel": "分類", "concept": "adapt", "prompt": "將下列行為分為「可依 CC BY-ND 授權分享」與「不可依該授權分享」（假設沒有其他特殊情況）：", "categories": ["可依 CC BY-ND 授權分享", "不可依該授權分享"], "items": [{"text": "原圖加適當標示公開", "answer": "可依 CC BY-ND 授權分享"}, {"text": "重新繪製成漫畫公開", "answer": "不可依該授權分享"}, {"text": "原圖加適當標示印在書中", "answer": "可依 CC BY-ND 授權分享"}, {"text": "把照片合成到新圖後公開", "answer": "不可依該授權分享"}], "feedback": "重點是公開分享的是否為改作版本。"}, {"id": "5-5", "group": "action", "type": "match", "typeLabel": "配對", "concept": "adapt", "prompt": "將三種授權與對應的改作分享規則配對：", "pairs": [{"left": "CC BY", "right": "可分享改作版本且不附 SA 條件"}, {"left": "CC BY-ND", "right": "只能依授權分享未改作版本"}, {"left": "CC BY-SA", "right": "分享改作版本須採相同或相容授權"}], "feedback": "三張都仍須適當姓名標示。"}, {"id": "5-6", "group": "action", "type": "single", "typeLabel": "找錯", "concept": "adapt", "prompt": "小杰說：「我改了 CC BY-SA 圖片；只要在新圖旁寫原作者，就可以把新圖改成禁止別人分享。」哪項須修正？", "options": ["新圖的授權方式", "原圖的顏色", "圖片長寬"], "answer": "新圖的授權方式", "feedback": "分享改作版本時，還須遵守 SA 的相同或相容授權要求。"}]}, {"id": "archive", "stage": 6, "name": "來源檔案室", "subtitle": "核對作品頁", "concept": "source", "blurb": "進入來源檔案室，學習回到原始作品頁核對作者、原始連結與授權條款。", "landmark": "tower", "accent": "#d97706", "palette": {"grass": "#facc15", "grassAlt": "#ca8a04", "sand": "#fde68a", "rock": "#78716c"}, "contextCard": {"title": "模擬作品頁（example.org 為示意網址）", "type": "workpage", "fields": [{"label": "作品名稱", "value": "《雨後操場》"}, {"label": "作者", "value": "林安"}, {"label": "原始頁", "value": "https://example.org/works/rainy-playground"}, {"label": "授權", "value": "CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）"}, {"label": "備註", "value": "本圖已裁切"}]}, "questions": [{"id": "6-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "source", "prompt": "搜尋結果寫「可免費使用」，你要確認授權，第一步應做什麼？", "options": ["開啟原始作品頁查看授權", "直接下載", "只截搜尋結果"], "answer": "開啟原始作品頁查看授權", "feedback": "搜尋摘要可能不完整，應回到作品頁核對。"}, {"id": "6-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "source", "prompt": "在模擬頁面中，誰是應標示的作者？", "options": ["林安", "搜尋引擎", "你自己"], "answer": "林安", "feedback": "搜尋引擎是找素材的工具，不是作品作者。"}, {"id": "6-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "source", "prompt": "哪個網址是模擬作品的原始頁？", "options": ["https://example.org/works/rainy-playground", "https://creativecommons.org/licenses/by/4.0/", "搜尋結果頁"], "answer": "https://example.org/works/rainy-playground", "feedback": "作品頁與授權條款頁各有不同用途。"}, {"id": "6-4", "group": "action", "type": "match", "typeLabel": "配對", "concept": "source", "prompt": "將欄位名稱與模擬作品頁中的正確資訊配對：", "pairs": [{"left": "作品名稱", "right": "《雨後操場》"}, {"left": "作者", "right": "林安"}, {"left": "原始作品頁", "right": "example.org/works/rainy-playground"}, {"left": "授權條款頁", "right": "creativecommons.org/licenses/by/4.0/"}], "feedback": "標示來源時要分清作品連結與授權連結。"}, {"id": "6-5", "group": "action", "type": "order", "typeLabel": "排序", "concept": "source", "prompt": "使用搜尋找到圖片後，排列較可靠的核對步驟（由第一步到最後一步）：", "items": ["開啟原始作品頁", "確認作者及作品名稱", "查看授權及條款連結", "記下日後標示所需資料"], "feedback": "不能只憑搜尋篩選器認定某張圖的授權。"}, {"id": "6-6", "group": "action", "type": "fix-fields", "typeLabel": "找錯改寫", "concept": "source", "prompt": "小琪記錄：「作者：Google；授權：免費；來源：搜尋結果截圖。」請從模擬頁面為三欄選出正確改寫：", "fields": [{"label": "作者（原寫：Google）", "options": ["林安", "搜尋引擎", "《雨後操場》"], "answer": "林安"}, {"label": "授權（原寫：免費）", "options": ["CC BY 4.0", "可免費下載", "公眾領域"], "answer": "CC BY 4.0"}, {"label": "來源（原寫：搜尋結果截圖）", "options": ["原始作品頁網址", "瀏覽器歷史紀錄", "圖片檔名"], "answer": "原始作品頁網址"}], "feedback": "「免費」未說明授權條件，搜尋引擎也不是作者。"}]}, {"id": "forge", "stage": 7, "name": "標示鍛造台", "subtitle": "完成適當標示", "concept": "attrib", "blurb": "在營火鍛造台練習寫出完整、清楚的姓名標示，包含連結與修改說明。", "landmark": "campfire", "accent": "#dc2626", "palette": {"grass": "#4ade80", "grassAlt": "#16a34a", "sand": "#fdba74", "rock": "#57534e"}, "contextCard": {"title": "沿用《雨後操場》模擬頁（學生將圖片裁切後公開放進報告網站）", "type": "workpage", "fields": [{"label": "作品名稱", "value": "《雨後操場》"}, {"label": "作者", "value": "林安"}, {"label": "原始頁", "value": "https://example.org/works/rainy-playground"}, {"label": "授權", "value": "CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）"}, {"label": "本次修改", "value": "學生已裁切後公開放進報告網站"}]}, "questions": [{"id": "7-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "attrib", "prompt": "哪個標示最完整？", "options": ["「圖片來自網路」", "「《雨後操場》／林安，原始頁：example.org/works/rainy-playground，CC BY 4.0（附授權連結）；我已裁切」", "「圖片：Google」"], "answer": "「《雨後操場》／林安，原始頁：example.org/works/rainy-playground，CC BY 4.0（附授權連結）；我已裁切」", "feedback": "包含作品、作者、來源、授權與修改資訊。"}, {"id": "7-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "attrib", "prompt": "使用 CC BY 4.0 圖片並公開分享裁切版，標示中應補充什麼？", "options": ["曾裁切的說明", "自己的考試成績", "搜尋日期即可"], "answer": "曾裁切的說明", "feedback": "4.0 授權要求指出是否修改。"}, {"id": "7-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "attrib", "prompt": "標示「林安，CC BY 4.0」還缺少哪項重要資訊？", "options": ["原始作品頁與授權連結", "圖片的像素數", "下載時的網速"], "answer": "原始作品頁與授權連結", "feedback": "提供連結可讓讀者找到作品與授權條款。"}, {"id": "7-4", "group": "action", "type": "order", "typeLabel": "排序", "concept": "attrib", "acceptAnyComplete": true, "prompt": "將這五項資訊排成容易閱讀的標示（建議順序：作品→作者→原始頁→授權→修改；只要五項資訊完整清楚也接受其他合理順序）：", "items": ["《雨後操場》", "林安", "原始作品頁連結", "CC BY 4.0 與授權連結", "已裁切"], "feedback": "重點是資料齊全且能對回原作。示範順序：《雨後操場》／林安／原始作品頁連結／CC BY 4.0 與授權連結／已裁切。"}, {"id": "7-5", "group": "action", "type": "fix-fields", "typeLabel": "找錯改寫", "concept": "attrib", "prompt": "標示草稿：「《雨後操場》／林安，CC BY 4.0，取自 Google 圖片。已裁切。」請選出最需要替換的片段與正確替代：", "fields": [{"label": "最需要替換的錯誤片段", "options": ["取自 Google 圖片", "《雨後操場》／林安", "已裁切"], "answer": "取自 Google 圖片"}, {"label": "應替換成的正確內容", "options": ["原始作品頁連結，並補授權條款連結", "取自網路搜尋結果", "加上自己的班級座號"], "answer": "原始作品頁連結，並補授權條款連結"}], "feedback": "搜尋頁不是原始作品頁。"}, {"id": "7-6", "group": "action", "type": "classify", "typeLabel": "分類", "concept": "attrib", "prompt": "將下列資訊分為「本題標示應包含」與「本題標示無須包含」：", "categories": ["本題標示應包含", "本題標示無須包含"], "items": [{"text": "作者", "answer": "本題標示應包含"}, {"text": "作品名稱", "answer": "本題標示應包含"}, {"text": "原始頁", "answer": "本題標示應包含"}, {"text": "授權連結", "answer": "本題標示應包含"}, {"text": "修改說明", "answer": "本題標示應包含"}, {"text": "學生座號", "answer": "本題標示無須包含"}, {"text": "下載速度", "answer": "本題標示無須包含"}], "feedback": "學生座號可能是繳交資訊，但不是原作品的授權標示。"}]}, {"id": "center", "stage": 8, "isCenter": true, "name": "發布校刊", "subtitle": "總合挑戰", "concept": "attrib", "blurb": "登上中央最大的總合挑戰主島！整合創用 CC、CC0 與發布流程，順利發行校刊。", "landmark": "library", "accent": "#0284c7", "palette": {"grass": "#4ade80", "grassAlt": "#16a34a", "sand": "#fde68a", "rock": "#64748b"}, "questions": [{"id": "8-1", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "attrib", "prompt": "校刊網站要公開一張明顯改圖版本，且不作商業使用。哪張可依所列授權使用？", "options": ["CC BY-NC-SA，改圖依相同或相容授權分享並完成標示", "CC BY-NC-ND，改圖後只標示作者", "沒有授權資訊的搜尋縮圖"], "answer": "CC BY-NC-SA，改圖依相同或相容授權分享並完成標示", "feedback": "逐一檢查改作、用途、分享條件及來源。"}, {"id": "8-2", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "attrib", "prompt": "一張作品標示 CC0，哪項說法較準確？", "options": ["權利人在法律允許的最大範圍內拋棄相關權利，使用時不以 CC0 要求姓名標示", "它是六種 CC 授權之一，必須標示 BY", "任何人都能替別人的作品加上 CC0"], "answer": "權利人在法律允許的最大範圍內拋棄相關權利，使用時不以 CC0 要求姓名標示", "feedback": "CC0 是公眾領域貢獻工具，不屬於六種 CC 公眾授權。"}, {"id": "8-3", "group": "quick", "type": "single", "typeLabel": "單選", "concept": "attrib", "prompt": "學生說：「圖片沒有標 CC，所以一定不能在任何情況下使用。」哪項回應較妥當？", "options": ["是否可用還可能涉及其他授權、法定例外或取得許可，不能只看有無 CC 標誌", "沒標 CC 就可以任意使用", "學校作業永遠不受著作權限制"], "answer": "是否可用還可能涉及其他授權、法定例外或取得許可，不能只看有無 CC 標誌", "feedback": "創用 CC 是一種事先授權方式，並非所有可能的利用依據。"}, {"id": "8-4", "group": "action", "type": "match", "typeLabel": "配對", "concept": "source", "prompt": "將四個問題與查核證據配對：", "pairs": [{"left": "誰創作？", "right": "作者欄"}, {"left": "允許商用嗎？", "right": "NC 有無"}, {"left": "能分享改圖嗎？", "right": "ND 有無"}, {"left": "改圖分享時採何授權？", "right": "SA 有無"}], "feedback": "最後還要保留原始頁與授權連結，以便標示及複查。"}, {"id": "8-5", "group": "action", "type": "order", "typeLabel": "排序", "concept": "attrib", "prompt": "請依正確先後順序排列「校刊發布流程」：", "items": ["確認校刊用途", "到作品頁核對授權與作者", "檢查用途及改作是否符合條件", "完成標示並發布"], "feedback": "先確定你要怎麼用，再挑選適合的素材。"}, {"id": "8-6", "group": "action", "type": "classify", "typeLabel": "綜合分類", "concept": "usage", "prompt": "需求是「將圖片明顯改成商品廣告並公開發布」。只檢查所列 CC 工具、並完成甲所需標示的前提下，將三張圖分類：", "categories": ["可依授權／工具使用", "不可依授權使用"], "items": [{"text": "甲｜CC BY 4.0", "answer": "可依授權／工具使用"}, {"text": "乙｜CC BY-NC-ND 4.0", "answer": "不可依授權使用"}, {"text": "丙｜CC0", "answer": "可依授權／工具使用"}], "feedback": "乙同時涉及 NC 與 ND；CC0 不以 CC0 條款要求標示，但教學上仍可記錄來源。"}]}]};
    }
  }

  function prepareQuestionInstance(rawQ) {
    const q = JSON.parse(JSON.stringify(rawQ));
    if (q.type === "single") {
      q.shuffledOptions = shuffle(q.options);
    } else if (q.type === "match") {
      q.leftItems = shuffle(q.pairs.map((p) => p.left));
      q.rightItems = shuffle(q.pairs.map((p) => p.right));
    } else if (q.type === "classify") {
      q.shuffledItems = shuffle(q.items);
    } else if (q.type === "multi-match") {
      q.shuffledTargets = q.targets.slice();
    } else if (q.type === "order") {
      let arr = shuffle(q.items);
      if (!q.acceptAnyComplete && arr.length > 1 && arr.every((v, i) => v === q.items[i])) {
        arr.reverse();
      }
      q.initialOrder = arr;
    } else if (q.type === "fix-fields") {
      q.fields.forEach((f) => {
        f.shuffledOptions = shuffle(f.options);
      });
    }
    return q;
  }

  function createEmptyDraft(q) {
    if (q.type === "single") return { selected: null };
    if (q.type === "match") return { activeLeft: null, pairs: {} }; // leftText -> rightText
    if (q.type === "classify") return { map: {} }; // itemText -> category
    if (q.type === "multi-match") {
      const map = {};
      q.shuffledTargets.forEach((t) => { map[t.id] = []; });
      return { map };
    }
    if (q.type === "order") return { list: q.initialOrder.slice() };
    if (q.type === "fix-fields") return { map: {} }; // fieldIdx -> value
    return {};
  }

  function startNewRound(silent) {
    state.roundPlan = [];
    state.records = {};
    state.summaryAutoShown = false;

    state.islands.forEach((island, idx) => {
      const quickPool = (island.questions || []).filter((q) => q.group === "quick");
      const actionPool = (island.questions || []).filter((q) => q.group === "action");
      const pickedQuick = quickPool[Math.floor(Math.random() * quickPool.length)];
      const pickedAction = actionPool[Math.floor(Math.random() * actionPool.length)];

      const pair = [prepareQuestionInstance(pickedQuick), prepareQuestionInstance(pickedAction)];
      state.roundPlan[idx] = pair;

      pair.forEach((q) => {
        state.records[q.id] = {
          firstCorrect: null,
          solved: false,
          score: 0,
          attempts: 0,
          lastWrong: false,
          draft: createEmptyDraft(q)
        };
      });
    });

    updateAllProgressUI();
    updateIslandVisualStates();

    if (state.selectedIndex !== -1) {
      state.activeSlot = 0;
      renderDetailView(state.selectedIndex);
    } else {
      renderIslandIndex();
    }

    if (!silent) {
      showToast("已重新隨機抽出 16 題，開始新一輪八島冒險！");
    }
  }

  function getStageProgress(islandIdx) {
    const pair = state.roundPlan[islandIdx] || [];
    let solvedCount = 0;
    let score = 0;
    pair.forEach((q) => {
      const r = state.records[q.id];
      if (r && r.solved) solvedCount++;
      if (r) score += r.score;
    });
    return { solvedCount, total: pair.length, score, maxScore: pair.length * 2, cleared: pair.length > 0 && solvedCount === pair.length };
  }

  function getOverallProgress() {
    let clearedIslands = 0;
    let totalScore = 0;
    let maxScore = 0;
    let solvedQuestions = 0;
    let totalQuestions = 0;
    let firstTryCorrect = 0;
    let attemptedQuestions = 0;

    state.islands.forEach((_, idx) => {
      const sp = getStageProgress(idx);
      if (sp.cleared) clearedIslands++;
      totalScore += sp.score;
      maxScore += sp.maxScore;

      (state.roundPlan[idx] || []).forEach((q) => {
        totalQuestions++;
        const r = state.records[q.id];
        if (r) {
          if (r.solved) solvedQuestions++;
          if (r.attempts > 0) attemptedQuestions++;
          if (r.firstCorrect === true) firstTryCorrect++;
        }
      });
    });

    return { clearedIslands, totalScore, maxScore, solvedQuestions, totalQuestions, firstTryCorrect, attemptedQuestions };
  }

  /* ------------------------------------------------------------------------
     Three.js 3D 場景建構
     ------------------------------------------------------------------------ */
  function getViewportSize() {
    const w = Math.max(dom.sceneContainer.clientWidth || 0, window.innerWidth || 0, 320);
    const h = Math.max(dom.sceneContainer.clientHeight || 0, window.innerHeight || 0, 320);
    return { w, h };
  }

  function initThree() {
    if (typeof THREE === "undefined") {
      showToast("3D 引擎載入失敗，請確認網路連線或改用外部網址內嵌。");
      return false;
    }
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xbae6fd, 0.0062);

    const { w, h } = getViewportSize();
    camera = new THREE.PerspectiveCamera(44, w / h, 0.5, 260);
    updateCameraViewOffset();

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      showToast("目前瀏覽器環境不支援 WebGL 3D 畫面，建議改用 Chrome 開啟或透過 GitHub Pages 內嵌。");
      return false;
    }
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    dom.sceneContainer.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0c4a6e, 0.72);
    hemiLight.position.set(0, 40, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 0.98);
    sunLight.position.set(26, 42, 22);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 120;
    const d = 34;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0008;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.35);
    rimLight.position.set(-24, 16, -24);
    scene.add(rimLight);

    buildOcean();
    buildClouds();
    buildArchipelago();
    applyCameraPosition();
  }

  function updateCameraViewOffset() {
    const { w, h } = getViewportSize();
    if (w > 768) {
      camera.setViewOffset(w, h, -195, 0, w, h);
    } else {
      camera.clearViewOffset();
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function buildOcean() {
    const geom = new THREE.PlaneGeometry(240, 240, 46, 46);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position;
    oceanBasePositions = new Float32Array(pos.array.length);
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) + Math.sin(i * 12.9898) * 0.45);
      pos.setZ(i, pos.getZ(i) + Math.cos(i * 78.233) * 0.45);
    }
    oceanBasePositions.set(pos.array);
    geom.computeVertexNormals();

    oceanMesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.12,
        flatShading: true,
        roughness: 0.32,
        metalness: 0.12
      })
    );
    oceanMesh.position.y = -0.25;
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);

    const deepMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x0369a1 })
    );
    deepMesh.position.y = -2.4;
    scene.add(deepMesh);
  }

  function buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      roughness: 0.9,
      transparent: true,
      opacity: 0.9
    });
    [
      { x: -24, y: 15.5, z: -20, s: 1.35, speed: 0.28 },
      { x: 18, y: 17.5, z: -26, s: 1.45, speed: 0.22 },
      { x: 28, y: 15, z: 12, s: 1.15, speed: 0.34 },
      { x: -26, y: 16.5, z: 18, s: 1.25, speed: 0.26 }
    ].forEach((cfg, idx) => {
      const group = new THREE.Group();
      [[0, 0, 0, 2.0], [1.7, -0.25, 0.2, 1.45], [-1.6, -0.3, -0.1, 1.5], [0.6, 0.65, -0.2, 1.3]].forEach(([px, py, pz, pr]) => {
        const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(pr, 0), cloudMat);
        mesh.position.set(px, py, pz);
        mesh.scale.set(1.2, 0.72, 0.95);
        group.add(mesh);
      });
      group.position.set(cfg.x, cfg.y, cfg.z);
      group.scale.setScalar(cfg.s);
      scene.add(group);
      clouds.push({ group, baseX: cfg.x, speed: cfg.speed, phase: idx * 1.4 });
    });
  }

  function jitterGeometry(geometry, ax, ay, az, seed) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const h1 = Math.sin(x * 12.7 + y * 31.3 + z * 47.1 + seed) * 43758.5453;
      const n1 = (h1 - Math.floor(h1)) - 0.5;
      const h2 = Math.sin(x * 23.1 + y * 17.9 + z * 11.7 + seed * 2.1) * 24634.6345;
      const n2 = (h2 - Math.floor(h2)) - 0.5;
      pos.setXYZ(i, x + n1 * ax, y + n2 * ay, z + n1 * az);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  function createLowPolyTree(scale, color) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.19 * scale, 0.75 * scale, 5),
      new THREE.MeshStandardMaterial({ color: 0x78350f, flatShading: true })
    );
    trunk.position.y = 0.36 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({ color, flatShading: true });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.68 * scale, 1.15 * scale, 6), leafMat);
    c1.position.y = 1.05 * scale;
    c1.castShadow = true;
    tree.add(c1);

    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.5 * scale, 0.95 * scale, 6), leafMat);
    c2.position.y = 1.62 * scale;
    c2.castShadow = true;
    tree.add(c2);
    return tree;
  }

  function createRock(scale, color) {
    const rock = new THREE.Mesh(
      jitterGeometry(new THREE.DodecahedronGeometry(0.45 * scale, 0), 0.12 * scale, 0.1 * scale, 0.12 * scale, scale * 7),
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.92 })
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  }

  function createLandmark(type, baseY) {
    const group = new THREE.Group();
    group.position.y = baseY;

    if (type === "library") {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 2.05, 0.45, 7),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, flatShading: true })
      );
      base.position.y = 0.22;
      base.castShadow = true;
      group.add(base);

      const hall = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 1.35, 1.65),
        new THREE.MeshStandardMaterial({ color: 0xfffbeb, flatShading: true })
      );
      hall.position.y = 1.05;
      hall.castShadow = true;
      group.add(hall);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.85, 1.15, 4),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, flatShading: true })
      );
      roof.position.y = 2.25;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);

      const winMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.85 });
      [-0.55, 0, 0.55].forEach((wx) => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.08), winMat);
        win.position.set(wx, 1.08, 0.84);
        group.add(win);
      });

      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4, 0),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.8, flatShading: true })
      );
      crystal.position.y = 3.5;
      group.add(crystal);
      animatedParts.push({ type: "floatSpin", mesh: crystal, baseY: 3.5 });
    } else if (type === "forest") {
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.95, 1.05),
        new THREE.MeshStandardMaterial({ color: 0xb45309, flatShading: true })
      );
      cabin.position.y = 0.48;
      cabin.castShadow = true;
      group.add(cabin);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 0.85, 4),
        new THREE.MeshStandardMaterial({ color: 0x15803d, flatShading: true })
      );
      roof.position.y = 1.35;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);
    } else if (type === "lighthouse") {
      [
        { rt: 0.55, rb: 0.72, h: 0.8, y: 0.4, c: 0xf8fafc },
        { rt: 0.46, rb: 0.55, h: 0.75, y: 1.15, c: 0xe11d48 },
        { rt: 0.38, rb: 0.46, h: 0.75, y: 1.9, c: 0xf8fafc },
        { rt: 0.32, rb: 0.38, h: 0.65, y: 2.6, c: 0xe11d48 }
      ].forEach((s) => {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(s.rt, s.rb, s.h, 7),
          new THREE.MeshStandardMaterial({ color: s.c, flatShading: true })
        );
        seg.position.y = s.y;
        seg.castShadow = true;
        group.add(seg);
      });
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.42, 7),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.0 })
      );
      lantern.position.y = 3.12;
      group.add(lantern);
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.45, 7),
        new THREE.MeshStandardMaterial({ color: 0xbe123c, flatShading: true })
      );
      cap.position.y = 3.54;
      group.add(cap);
      const beamPivot = new THREE.Group();
      beamPivot.position.y = 3.12;
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 3.1, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
      );
      beam.rotation.z = Math.PI / 2;
      beam.position.x = 1.6;
      beamPivot.add(beam);
      group.add(beamPivot);
      animatedParts.push({ type: "spinY", mesh: beamPivot, speed: 1.1 });
    } else if (type === "observatory") {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.08, 0.95, 8),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, flatShading: true })
      );
      base.position.y = 0.48;
      base.castShadow = true;
      group.add(base);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x0d9488, flatShading: true, metalness: 0.2 })
      );
      dome.position.y = 0.95;
      dome.castShadow = true;
      group.add(dome);
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.2, 1.25, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155, flatShading: true })
      );
      scope.position.set(0.55, 1.6, 0);
      scope.rotation.z = -0.78;
      group.add(scope);
    } else if (type === "tower") {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.48, 2.75, 5),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, flatShading: true })
      );
      mast.position.y = 1.38;
      mast.castShadow = true;
      group.add(mast);
      const dish = new THREE.Mesh(
        new THREE.ConeGeometry(0.68, 0.35, 7),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true })
      );
      dish.position.set(0.32, 2.1, 0.15);
      dish.rotation.z = -1.1;
      group.add(dish);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.05, 5, 12),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2.95;
      group.add(ring);
      animatedParts.push({ type: "pulse", mesh: ring });
    } else if (type === "castle") {
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, flatShading: true });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, flatShading: true });
      const keep = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.3, 1.15), stoneMat);
      keep.position.y = 0.65;
      keep.castShadow = true;
      group.add(keep);
      [[-0.7, 0.55, 1.8], [0.7, -0.5, 2.15]].forEach(([tx, tz, th]) => {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, th, 6), stoneMat);
        turret.position.set(tx, th / 2, tz);
        turret.castShadow = true;
        group.add(turret);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.72, 6), roofMat);
        spire.position.set(tx, th + 0.35, tz);
        spire.castShadow = true;
        group.add(spire);
      });
    } else if (type === "workshop") {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.0, 1.1),
        new THREE.MeshStandardMaterial({ color: 0xfef3c7, flatShading: true })
      );
      body.position.y = 0.5;
      body.castShadow = true;
      group.add(body);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.25, 0.85, 4),
        new THREE.MeshStandardMaterial({ color: 0xea580c, flatShading: true })
      );
      roof.position.y = 1.4;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);
      const puff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.24, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.8 })
      );
      puff.position.set(0.45, 2.1, -0.2);
      group.add(puff);
      animatedParts.push({ type: "smoke", mesh: puff, baseY: 2.0 });
    } else if (type === "campfire") {
      const tent = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 1.05, 4),
        new THREE.MeshStandardMaterial({ color: 0xf97316, flatShading: true })
      );
      tent.position.set(-0.75, 0.52, -0.35);
      tent.rotation.y = 0.4;
      tent.castShadow = true;
      group.add(tent);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.72, 5),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf97316, emissiveIntensity: 1.0, flatShading: true })
      );
      flame.position.set(0.4, 0.42, 0.35);
      group.add(flame);
      animatedParts.push({ type: "flicker", mesh: flame });
    }

    return group;
  }

  function buildSingleIsland(data, index, pos, radius, isCenter) {
    const pal = data.palette || { grass: "#4ade80", grassAlt: "#16a34a", sand: "#fde68a", rock: "#64748b" };
    const group = new THREE.Group();
    group.position.copy(pos);

    const underMesh = new THREE.Mesh(
      jitterGeometry(new THREE.CylinderGeometry(radius * 1.02, radius * 0.42, 3.0, 9, 2), 0.32, 0.16, 0.32, index * 13 + 1),
      new THREE.MeshStandardMaterial({ color: hexToInt(pal.rock), flatShading: true, roughness: 0.94 })
    );
    underMesh.position.y = -1.45;
    group.add(underMesh);

    const sandHeight = isCenter ? 0.85 : 0.68;
    const sandMesh = new THREE.Mesh(
      jitterGeometry(new THREE.CylinderGeometry(radius * 0.92, radius * 1.04, sandHeight, 10, 1), 0.26, 0.1, 0.26, index * 19 + 3),
      new THREE.MeshStandardMaterial({ color: hexToInt(pal.sand), flatShading: true, roughness: 0.88 })
    );
    sandMesh.position.y = sandHeight * 0.45;
    sandMesh.castShadow = true;
    sandMesh.receiveShadow = true;
    group.add(sandMesh);

    const grassHeight = isCenter ? 1.18 : 0.92;
    const grassMesh = new THREE.Mesh(
      jitterGeometry(new THREE.CylinderGeometry(radius * 0.68, radius * 0.86, grassHeight, 9, 1), 0.22, 0.14, 0.22, index * 29 + 7),
      new THREE.MeshStandardMaterial({ color: hexToInt(pal.grass), flatShading: true, roughness: 0.84 })
    );
    grassMesh.position.y = sandHeight + grassHeight * 0.38;
    grassMesh.castShadow = true;
    grassMesh.receiveShadow = true;
    group.add(grassMesh);

    const topY = sandHeight + grassHeight * 0.86;

    const foamMesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.03, radius * 1.24, 14),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.48, side: THREE.DoubleSide })
    );
    foamMesh.rotation.x = -Math.PI / 2;
    foamMesh.position.y = -0.14;
    group.add(foamMesh);
    animatedParts.push({ type: "foam", mesh: foamMesh, phase: index * 0.9 });

    // 通關金色光環（通關後顯示）
    const clearHalo = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.72, 0.1, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85 })
    );
    clearHalo.rotation.x = Math.PI / 2;
    clearHalo.position.y = topY + 0.15;
    clearHalo.visible = false;
    group.add(clearHalo);

    group.add(createLandmark(data.landmark || "forest", topY - 0.06));

    const treeCount = isCenter ? 7 : 4;
    for (let t = 0; t < treeCount; t++) {
      const ang = (t / treeCount) * Math.PI * 2 + index * 0.7;
      const dist = radius * (isCenter ? 0.52 + (t % 2) * 0.12 : 0.48 + (t % 2) * 0.1);
      const tree = createLowPolyTree(
        isCenter ? 0.95 + (t % 3) * 0.16 : 0.72 + (t % 2) * 0.16,
        t % 2 === 0 ? hexToInt(pal.grassAlt) : 0x15803d
      );
      tree.position.set(Math.cos(ang) * dist, topY - 0.1, Math.sin(ang) * dist);
      group.add(tree);
    }

    for (let r = 0; r < 3; r++) {
      const ang = (r / 3) * Math.PI * 2 + index * 1.3 + 0.4;
      const rock = createRock(isCenter ? 0.9 : 0.65, hexToInt(pal.rock));
      rock.position.set(Math.cos(ang) * radius * 0.78, sandHeight * 0.72, Math.sin(ang) * radius * 0.78);
      group.add(rock);
    }

    group.traverse((obj) => {
      if (obj.isMesh && obj !== foamMesh && obj !== clearHalo) {
        obj.userData.islandIndex = index;
        clickableMeshes.push(obj);
      }
    });

    scene.add(group);

    // 浮動名牌
    const numStr = String(data.stage || index + 1).padStart(2, "0");
    const labelEl = document.createElement("button");
    labelEl.type = "button";
    labelEl.className = "island-label";
    labelEl.innerHTML =
      '<span class="label-num" style="background:' + (data.accent || "#0284c7") + '">' + numStr + "</span>" +
      '<span class="label-name">' + escapeHtml(data.name) + "</span>" +
      '<span class="label-status"></span>';
    labelEl.addEventListener("click", (e) => {
      e.stopPropagation();
      selectIsland(index, { openMobileSheet: true });
    });
    labelEl.addEventListener("mouseenter", () => setHoveredIsland(index));
    labelEl.addEventListener("mouseleave", () => setHoveredIsland(-1));
    dom.labelsLayer.appendChild(labelEl);

    return {
      index,
      numStr,
      data,
      group,
      clearHalo,
      position: pos.clone(),
      radius,
      isCenter,
      labelHeight: topY + (isCenter ? 4.35 : 3.65),
      labelEl
    };
  }

  function buildSuspensionBridge(entryA, entryB) {
    const dir = new THREE.Vector3().subVectors(entryB.position, entryA.position).normalize();
    const startPt = entryA.position.clone().addScaledVector(dir, entryA.radius * 0.88);
    const endPt = entryB.position.clone().addScaledVector(dir, -entryB.radius * 0.88);
    const spanLen = startPt.distanceTo(endPt);
    if (spanLen < 1.2) return;

    const bridgeGroup = new THREE.Group();
    const bridgeY = 0.88;
    const sagDepth = Math.min(0.95, spanLen * 0.11);
    const plankCount = Math.max(8, Math.floor(spanLen * 1.45));

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb45309, flatShading: true, roughness: 0.9 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x78350f, flatShading: true, roughness: 0.92 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd6d3d1, flatShading: true, roughness: 0.85 });

    const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);
    const halfWidth = 0.42;
    const yaw = Math.atan2(dir.x, dir.z);

    [startPt, endPt].forEach((anchor) => {
      [-1, 1].forEach((side) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.9, 5), postMat);
        post.position.set(anchor.x + sideDir.x * halfWidth * side, bridgeY + 0.55, anchor.z + sideDir.z * halfWidth * side);
        post.castShadow = true;
        bridgeGroup.add(post);
      });
    });

    for (let i = 0; i <= plankCount; i++) {
      const t = i / plankCount;
      const sag = 4 * t * (1 - t) * sagDepth;
      const px = THREE.MathUtils.lerp(startPt.x, endPt.x, t);
      const pz = THREE.MathUtils.lerp(startPt.z, endPt.z, t);
      const py = bridgeY - sag;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2.15, 0.09, 0.36), woodMat);
      plank.position.set(px, py, pz);
      plank.rotation.y = yaw;
      plank.castShadow = true;
      bridgeGroup.add(plank);

      if (i > 0 && i < plankCount && i % 2 === 0) {
        const ropeTopY = bridgeY + 1.3 - 4 * t * (1 - t) * (sagDepth * 0.95);
        const hLen = Math.max(0.25, ropeTopY - py);
        [-1, 1].forEach((side) => {
          const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, hLen, 4), ropeMat);
          hanger.position.set(px + sideDir.x * halfWidth * side, py + hLen * 0.5, pz + sideDir.z * halfWidth * side);
          bridgeGroup.add(hanger);
        });
      }
    }

    [-1, 1].forEach((side) => {
      const curvePts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        curvePts.push(new THREE.Vector3(
          THREE.MathUtils.lerp(startPt.x, endPt.x, t) + sideDir.x * halfWidth * side,
          bridgeY + 1.35 - 4 * t * (1 - t) * (sagDepth * 1.02),
          THREE.MathUtils.lerp(startPt.z, endPt.z, t) + sideDir.z * halfWidth * side
        ));
      }
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 12, 0.042, 4, false), ropeMat);
      bridgeGroup.add(cable);
    });

    scene.add(bridgeGroup);
  }

  function buildArchipelago() {
    const count = state.islands.length;
    if (count === 0) return;

    // 找出中央主島（預設為標記 isCenter 的第 8 關，若無則取第 0 座）
    let centerIdx = state.islands.findIndex((isl) => isl.isCenter);
    if (centerIdx === -1) centerIdx = 0;

    const outerIndices = [];
    for (let i = 0; i < count; i++) {
      if (i !== centerIdx) outerIndices.push(i);
    }

    const baseRingRadius = 16.8;
    const positions = new Array(count);
    const radii = new Array(count);

    positions[centerIdx] = new THREE.Vector3(0, 0, 0);
    radii[centerIdx] = 5.3;

    outerIndices.forEach((idx, k) => {
      const angle = (k / Math.max(1, outerIndices.length)) * Math.PI * 2 - Math.PI * 0.5;
      const r = baseRingRadius + (k % 2 === 0 ? 0.55 : -0.5);
      positions[idx] = new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      radii[idx] = 3.2 + (k % 3) * 0.22;
    });

    for (let i = 0; i < count; i++) {
      islandEntries.push(buildSingleIsland(state.islands[i], i, positions[i], radii[i], i === centerIdx));
    }

    // 吊橋連結：外圍 7 島彼此環狀相連，且其中 4 座輻射連向中央總合挑戰島
    outerIndices.forEach((idx, k) => {
      const nextOuter = outerIndices[(k + 1) % outerIndices.length];
      buildSuspensionBridge(islandEntries[idx], islandEntries[nextOuter]);
      if (k === 0 || k === 2 || k === 4 || k === 6) {
        buildSuspensionBridge(islandEntries[centerIdx], islandEntries[idx]);
      }
    });
  }

  function updateIslandVisualStates() {
    islandEntries.forEach((entry, i) => {
      const sp = getStageProgress(i);
      entry.clearHalo.visible = sp.cleared;
      entry.labelEl.classList.toggle("is-cleared", sp.cleared);
      const statusSpan = entry.labelEl.querySelector(".label-status");
      if (statusSpan) {
        statusSpan.textContent = sp.cleared ? "★" : sp.solvedCount > 0 ? "1/2" : "";
      }
    });
  }

  /* ------------------------------------------------------------------------
     鏡頭控制與動畫
     ------------------------------------------------------------------------ */
  function applyCameraPosition() {
    const sinPhi = Math.sin(camCtrl.phi);
    camera.position.set(
      camCtrl.target.x + camCtrl.radius * sinPhi * Math.sin(camCtrl.theta),
      camCtrl.target.y + camCtrl.radius * Math.cos(camCtrl.phi),
      camCtrl.target.z + camCtrl.radius * sinPhi * Math.cos(camCtrl.theta)
    );
    camera.lookAt(camCtrl.target);
  }

  function startCameraFlight(goalTarget, goalRadius, goalTheta, goalPhi, durationMs) {
    let dTheta = goalTheta - camCtrl.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    camCtrl.flight = {
      startTime: performance.now(),
      duration: durationMs || 900,
      fromTarget: camCtrl.target.clone(),
      toTarget: goalTarget.clone(),
      fromRadius: camCtrl.radius,
      toRadius: goalRadius,
      fromTheta: camCtrl.theta,
      toTheta: camCtrl.theta + dTheta,
      fromPhi: camCtrl.phi,
      toPhi: goalPhi
    };
  }

  function flyToIsland(index) {
    const entry = islandEntries[index];
    if (!entry) return;
    const target = entry.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const goalRadius = entry.isCenter ? 16.5 : 12.2;
    const goalTheta = entry.isCenter ? 0.42 : Math.atan2(entry.position.x, entry.position.z) + 0.35;
    startCameraFlight(target, goalRadius, goalTheta, 1.0, 900);
  }

  function flyToOverview() {
    startCameraFlight(OVERVIEW_CAM.target, OVERVIEW_CAM.radius, OVERVIEW_CAM.theta, OVERVIEW_CAM.phi, 880);
  }

  function cancelFlight() {
    if (camCtrl.flight) {
      camCtrl.desiredTarget.copy(camCtrl.target);
      camCtrl.desiredRadius = camCtrl.radius;
      camCtrl.desiredTheta = camCtrl.theta;
      camCtrl.desiredPhi = camCtrl.phi;
      camCtrl.flight = null;
    }
  }

  function pickIslandAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(clickableMeshes, false);
    if (hits.length > 0 && typeof hits[0].object.userData.islandIndex === "number") {
      return hits[0].object.userData.islandIndex;
    }
    return -1;
  }

  function bindSceneEvents() {
    const el = dom.sceneContainer;
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      cancelFlight();
      camCtrl.isDragging = true;
      camCtrl.dragDistance = 0;
      camCtrl.lastX = e.clientX;
      camCtrl.lastY = e.clientY;
      el.classList.add("dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (camCtrl.isDragging) {
        const dx = e.clientX - camCtrl.lastX;
        const dy = e.clientY - camCtrl.lastY;
        camCtrl.lastX = e.clientX;
        camCtrl.lastY = e.clientY;
        camCtrl.dragDistance += Math.hypot(dx, dy);
        camCtrl.desiredTheta -= dx * 0.0062;
        camCtrl.desiredPhi = THREE.MathUtils.clamp(camCtrl.desiredPhi - dy * 0.0052, camCtrl.minPhi, camCtrl.maxPhi);
      } else if (e.target === renderer.domElement) {
        setHoveredIsland(pickIslandAt(e.clientX, e.clientY));
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (!camCtrl.isDragging) return;
      camCtrl.isDragging = false;
      el.classList.remove("dragging");
      if (camCtrl.dragDistance < 6 && e.target === renderer.domElement) {
        const hitIdx = pickIslandAt(e.clientX, e.clientY);
        if (hitIdx !== -1) selectIsland(hitIdx, { openMobileSheet: true });
      }
    });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      cancelFlight();
      camCtrl.desiredRadius = THREE.MathUtils.clamp(camCtrl.desiredRadius + e.deltaY * 0.028, camCtrl.minRadius, camCtrl.maxRadius);
    }, { passive: false });

    el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        cancelFlight();
        camCtrl.isDragging = true;
        camCtrl.dragDistance = 0;
        camCtrl.lastX = e.touches[0].clientX;
        camCtrl.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        cancelFlight();
        camCtrl.isDragging = false;
        camCtrl.pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        camCtrl.pinchStartRadius = camCtrl.desiredRadius;
      }
    }, { passive: true });

    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1 && camCtrl.isDragging) {
        const dx = e.touches[0].clientX - camCtrl.lastX;
        const dy = e.touches[0].clientY - camCtrl.lastY;
        camCtrl.lastX = e.touches[0].clientX;
        camCtrl.lastY = e.touches[0].clientY;
        camCtrl.dragDistance += Math.hypot(dx, dy);
        camCtrl.desiredTheta -= dx * 0.0072;
        camCtrl.desiredPhi = THREE.MathUtils.clamp(camCtrl.desiredPhi - dy * 0.006, camCtrl.minPhi, camCtrl.maxPhi);
      } else if (e.touches.length === 2 && camCtrl.pinchStartDist > 0) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        camCtrl.desiredRadius = THREE.MathUtils.clamp(camCtrl.pinchStartRadius * (camCtrl.pinchStartDist / Math.max(10, dist)), camCtrl.minRadius, camCtrl.maxRadius);
      }
    }, { passive: true });

    el.addEventListener("touchend", (e) => {
      if (camCtrl.isDragging && camCtrl.dragDistance < 10 && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const hitIdx = pickIslandAt(t.clientX, t.clientY);
        if (hitIdx !== -1) selectIsland(hitIdx, { openMobileSheet: true });
      }
      if (e.touches.length === 0) {
        camCtrl.isDragging = false;
        camCtrl.pinchStartDist = 0;
      }
    }, { passive: true });

    const handleResize = () => {
      if (!renderer || !camera) return;
      const { w, h } = getViewportSize();
      renderer.setSize(w, h);
      updateCameraViewOffset();
      if (w > 768) setMobileSheetOpen(false);
    };
    window.addEventListener("resize", handleResize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(handleResize).observe(dom.sceneContainer);
    }
    setTimeout(handleResize, 150);
    setTimeout(handleResize, 600);
  }

  const projVec = new THREE.Vector3();

  function updateLabels() {
    const { w, h } = getViewportSize();
    for (let i = 0; i < islandEntries.length; i++) {
      const entry = islandEntries[i];
      projVec.set(entry.position.x, entry.labelHeight, entry.position.z);
      projVec.project(camera);
      if (projVec.z < -1 || projVec.z > 1) {
        entry.labelEl.style.display = "none";
        continue;
      }
      const sx = (projVec.x * 0.5 + 0.5) * w;
      const sy = (-projVec.y * 0.5 + 0.5) * h;
      const scale = state.selectedIndex === i ? 1.08 : state.hoveredIndex === i ? 1.05 : 1;
      entry.labelEl.style.display = "inline-flex";
      entry.labelEl.style.transform =
        "translate(-50%, -100%) translate3d(" + sx.toFixed(1) + "px," + sy.toFixed(1) + "px,0) scale(" + scale + ")";
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (camCtrl.flight) {
      const f = camCtrl.flight;
      const raw = Math.min(1, (performance.now() - f.startTime) / f.duration);
      const ease = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      camCtrl.target.lerpVectors(f.fromTarget, f.toTarget, ease);
      camCtrl.radius = THREE.MathUtils.lerp(f.fromRadius, f.toRadius, ease);
      camCtrl.theta = THREE.MathUtils.lerp(f.fromTheta, f.toTheta, ease);
      camCtrl.phi = THREE.MathUtils.lerp(f.fromPhi, f.toPhi, ease);
      if (raw >= 1) {
        camCtrl.desiredTarget.copy(camCtrl.target);
        camCtrl.desiredRadius = camCtrl.radius;
        camCtrl.desiredTheta = camCtrl.theta;
        camCtrl.desiredPhi = camCtrl.phi;
        camCtrl.flight = null;
      }
    } else {
      const damp = 0.1;
      camCtrl.target.lerp(camCtrl.desiredTarget, damp);
      camCtrl.radius += (camCtrl.desiredRadius - camCtrl.radius) * damp;
      camCtrl.theta += (camCtrl.desiredTheta - camCtrl.theta) * damp;
      camCtrl.phi += (camCtrl.desiredPhi - camCtrl.phi) * damp;
    }
    applyCameraPosition();

    const pos = oceanMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = oceanBasePositions[i * 3];
      const bz = oceanBasePositions[i * 3 + 2];
      pos.setY(i, Math.sin(bx * 0.16 + t * 1.15) * 0.18 + Math.cos(bz * 0.14 + t * 0.95) * 0.16);
    }
    pos.needsUpdate = true;

    for (let i = 0; i < clouds.length; i++) {
      clouds[i].group.position.x = clouds[i].baseX + Math.sin(t * 0.12 * clouds[i].speed + clouds[i].phase) * 5.5;
    }

    for (let i = 0; i < animatedParts.length; i++) {
      const p = animatedParts[i];
      if (p.type === "floatSpin") {
        p.mesh.position.y = p.baseY + Math.sin(t * 2.2) * 0.18;
        p.mesh.rotation.y = t * 1.1;
      } else if (p.type === "spinY") {
        p.mesh.rotation.y = t * p.speed;
      } else if (p.type === "pulse") {
        const s = 0.85 + ((t * 0.9) % 1) * 1.3;
        p.mesh.scale.setScalar(s);
        p.mesh.material.opacity = Math.max(0, 0.75 * (1 - ((t * 0.9) % 1)));
      } else if (p.type === "smoke") {
        const c = (t * 0.45) % 1;
        p.mesh.position.y = p.baseY + c * 1.15;
        p.mesh.scale.setScalar(0.6 + c * 0.85);
        p.mesh.material.opacity = 0.75 * (1 - c);
      } else if (p.type === "flicker") {
        p.mesh.scale.set(1, 0.92 + Math.sin(t * 11) * 0.12, 1);
      } else if (p.type === "foam") {
        p.mesh.scale.setScalar(1 + Math.sin(t * 1.8 + p.phase) * 0.04);
      }
    }

    renderer.render(scene, camera);
    updateLabels();
  }

  /* ------------------------------------------------------------------------
     側邊欄：全部小島索引 & 單島闖關互動
     ------------------------------------------------------------------------ */
  function setHoveredIsland(index) {
    if (state.hoveredIndex === index) return;
    state.hoveredIndex = index;
    dom.sceneContainer.classList.toggle("hovering-island", index !== -1);
    islandEntries.forEach((entry, i) => entry.labelEl.classList.toggle("is-hovered", i === index));
  }

  function updateAllProgressUI() {
    const ov = getOverallProgress();
    dom.progressIslands.innerHTML = "通關 <strong>" + ov.clearedIslands + " / " + state.islands.length + "</strong> 島";
    dom.progressScore.textContent = ov.totalScore + " / " + ov.maxScore + " 分";
    const pct = ov.totalQuestions > 0 ? Math.round((ov.solvedQuestions / ov.totalQuestions) * 100) : 0;
    dom.progressFill.style.width = pct + "%";
    updateMobilePeekTitle();
  }

  function selectIsland(index, opts) {
    if (index < 0 || index >= state.islands.length) return;
    state.selectedIndex = index;
    // 自動切換到本島尚未完成的那一題
    const pair = state.roundPlan[index] || [];
    const firstUnsolved = pair.findIndex((q) => !state.records[q.id].solved);
    state.activeSlot = firstUnsolved !== -1 ? firstUnsolved : 0;

    islandEntries.forEach((entry, i) => {
      entry.labelEl.classList.toggle("is-active", i === index);
      entry.labelEl.classList.remove("is-dimmed");
    });

    renderDetailView(index);
    dom.viewIndex.classList.add("hidden");
    dom.viewDetail.classList.remove("hidden");
    updateMobilePeekTitle();

    if (opts && opts.openMobileSheet && window.innerWidth <= 768) {
      setMobileSheetOpen(true);
    }
    flyToIsland(index);
  }

  function showAllIslands(flyBack) {
    state.selectedIndex = -1;
    islandEntries.forEach((entry) => entry.labelEl.classList.remove("is-active"));
    dom.viewDetail.classList.add("hidden");
    dom.viewIndex.classList.remove("hidden");
    renderIslandIndex();
    updateMobilePeekTitle();
    if (flyBack !== false) flyToOverview();
  }

  function renderIslandIndex() {
    const q = state.searchQuery.trim().toLowerCase();
    dom.searchClearBtn.classList.toggle("hidden", q.length === 0);
    dom.islandList.innerHTML = "";

    const firstIncompleteIdx = state.islands.findIndex((_, i) => !getStageProgress(i).cleared);
    let visible = 0;

    state.islands.forEach((island, index) => {
      const sp = getStageProgress(index);
      const hay = (island.name + " " + island.subtitle + " " + island.blurb).toLowerCase();
      const isMatch = !q || hay.includes(q);
      if (islandEntries[index]) {
        islandEntries[index].labelEl.classList.toggle("is-dimmed", Boolean(q && !isMatch));
      }
      if (!isMatch) return;
      visible++;

      const numStr = String(island.stage || index + 1).padStart(2, "0");
      const card = document.createElement("button");
      card.type = "button";
      card.className = "island-card" + (sp.cleared ? " is-cleared" : "") + (index === firstIncompleteIdx ? " is-next" : "");
      card.style.setProperty("--card-accent", island.accent || "#0284c7");

      const statusClass = sp.cleared ? "done" : sp.solvedCount > 0 ? "progress" : "todo";
      const statusText = sp.cleared ? "★ 已通關 " + sp.score + "分" : sp.solvedCount > 0 ? "進行中 1/2" : index === firstIncompleteIdx ? "▶ 建議挑戰" : "未挑戰";

      card.innerHTML =
        '<div class="island-card-top">' +
          '<div class="island-card-title-group">' +
            '<span class="island-num-pill" style="background:' + (island.accent || "#0284c7") + '">' + numStr + "</span>" +
            '<div><div class="island-card-name">' + escapeHtml(island.name) + '</div><div class="island-card-sub">' + escapeHtml(island.subtitle || "") + "</div></div>" +
          "</div>" +
          '<span class="status-pill ' + statusClass + '">' + statusText + "</span>" +
        "</div>" +
        '<p class="island-card-blurb">' + escapeHtml(island.blurb || "") + "</p>";

      card.addEventListener("click", () => selectIsland(index, { openMobileSheet: true }));
      card.addEventListener("mouseenter", () => setHoveredIsland(index));
      card.addEventListener("mouseleave", () => setHoveredIsland(-1));
      dom.islandList.appendChild(card);
    });

    if (visible === 0) {
      dom.islandList.innerHTML = '<div class="empty-state">找不到符合「' + escapeHtml(state.searchQuery) + "」的關卡島。</div>";
    }
  }

  function renderDetailView(index) {
    const island = state.islands[index];
    const sp = getStageProgress(index);
    const pair = state.roundPlan[index] || [];

    dom.detailBadge.textContent = "第 " + (island.stage || index + 1) + " 關";
    dom.detailBadge.style.background = island.accent || "#0284c7";
    dom.detailStageScore.textContent = sp.score + " / " + sp.maxScore + " 分";
    dom.detailTitle.textContent = island.name + "｜" + (island.subtitle || "");
    dom.detailBlurb.textContent = island.blurb || "";

    // 渲染本島兩題切換頁籤
    dom.questionTabs.innerHTML = "";
    pair.forEach((q, slotIdx) => {
      const rec = state.records[q.id];
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "q-tab" + (slotIdx === state.activeSlot ? " active" : "") + (rec.solved ? " solved" : "");
      const label = slotIdx === 0 ? "第 1 題・快速題" : "第 2 題・操作題";
      const mark = rec.solved ? "✓ +" + rec.score : rec.lastWrong ? "↺" : "●";
      tab.innerHTML = "<span>" + label + "</span><span>" + mark + "</span>";
      tab.addEventListener("click", () => {
        state.activeSlot = slotIdx;
        renderDetailView(index);
      });
      dom.questionTabs.appendChild(tab);
    });

    // 渲染情境參考卡 + 題目互動區
    dom.quizBody.innerHTML = "";

    if (island.contextCard) {
      dom.quizBody.appendChild(buildContextCardEl(island.contextCard));
    }

    const activeQ = pair[state.activeSlot];
    if (activeQ) {
      dom.quizBody.appendChild(buildQuestionCardEl(activeQ, index));
    }
  }

  function buildContextCardEl(ctx) {
    const box = document.createElement("div");
    box.className = "context-card";
    let inner = '<div class="context-card-title">📋 ' + escapeHtml(ctx.title) + "</div>";
    if (ctx.type === "materials") {
      inner += '<div class="material-grid">';
      ctx.materials.forEach((m) => {
        inner +=
          '<div class="material-chip"><strong>' + escapeHtml(m.code) + "</strong> " + escapeHtml(m.title) +
          '<div><span class="material-lic">' + escapeHtml(m.license) + "</span></div></div>";
      });
      inner += "</div>";
    } else if (ctx.type === "workpage") {
      inner += '<div class="workpage-list">';
      ctx.fields.forEach((f) => {
        inner += '<div class="workpage-row"><span class="workpage-label">' + escapeHtml(f.label) + '：</span><span class="workpage-val">' + escapeHtml(f.value) + "</span></div>";
      });
      inner += "</div>";
    }
    box.innerHTML = inner;
    return box;
  }

  /* ------------------------------------------------------------------------
     六種互動題型渲染與評分
     ------------------------------------------------------------------------ */
  function buildQuestionCardEl(q, islandIdx) {
    const rec = state.records[q.id];
    const locked = rec.solved;
    const card = document.createElement("div");
    card.className = "quiz-card";

    card.innerHTML =
      '<div class="quiz-meta-row">' +
        '<span class="quiz-type-tag">' + escapeHtml(q.typeLabel) + "</span>" +
        '<span class="quiz-id-tag">題號 ' + escapeHtml(q.id) + "</span>" +
      "</div>" +
      '<div class="quiz-prompt">' + escapeHtml(q.prompt) + "</div>";

    if (q.type === "multi-match") {
      const hint = document.createElement("div");
      hint.className = "quiz-hint-banner";
      hint.textContent = "💡 提示：每項需求可複選多張素材，同一素材也可重複選用。";
      card.appendChild(hint);
    }

    // 依題型渲染作答區
    if (q.type === "single") {
      const list = document.createElement("div");
      list.className = "option-list";
      q.shuffledOptions.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-btn" + (rec.draft.selected === opt ? " selected" : "");
        btn.disabled = locked;
        btn.innerHTML = '<span class="option-letter">' + PAIR_LETTERS[i] + "</span><span>" + escapeHtml(opt) + "</span>";
        btn.addEventListener("click", () => {
          rec.draft.selected = opt;
          rec.lastWrong = false;
          renderDetailView(islandIdx);
        });
        list.appendChild(btn);
      });
      card.appendChild(list);
    } else if (q.type === "match") {
      const tip = document.createElement("div");
      tip.className = "match-instruction";
      tip.textContent = "先點左側項目，再點右側對應內容完成配對（點擊已配對項目可取消重配）。";
      card.appendChild(tip);

      const grid = document.createElement("div");
      grid.className = "match-grid";
      const leftCol = document.createElement("div");
      leftCol.className = "match-col";
      const rightCol = document.createElement("div");
      rightCol.className = "match-col";

      const leftList = q.leftItems;
      const pairedKeys = Object.keys(rec.draft.pairs);

      leftList.forEach((lText, lIdx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isActive = rec.draft.activeLeft === lText;
        const isPaired = Boolean(rec.draft.pairs[lText]);
        const color = PAIR_COLORS[lIdx % PAIR_COLORS.length];
        btn.className = "match-item" + (isActive ? " active" : "");
        btn.disabled = locked;
        if (isPaired) btn.style.borderColor = color;
        btn.innerHTML =
          '<span class="match-badge" style="background:' + (isPaired || isActive ? color : "#94a3b8") + '">' + PAIR_LETTERS[lIdx] + "</span>" +
          "<span>" + escapeHtml(lText) + "</span>";
        btn.addEventListener("click", () => {
          if (rec.draft.pairs[lText]) {
            delete rec.draft.pairs[lText];
            rec.draft.activeLeft = lText;
          } else {
            rec.draft.activeLeft = isActive ? null : lText;
          }
          rec.lastWrong = false;
          renderDetailView(islandIdx);
        });
        leftCol.appendChild(btn);
      });

      q.rightItems.forEach((rText) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const ownerLeft = pairedKeys.find((k) => rec.draft.pairs[k] === rText);
        const ownerIdx = ownerLeft ? leftList.indexOf(ownerLeft) : -1;
        const color = ownerIdx >= 0 ? PAIR_COLORS[ownerIdx % PAIR_COLORS.length] : "#94a3b8";

        btn.className = "match-item";
        btn.disabled = locked;
        if (ownerIdx >= 0) btn.style.borderColor = color;
        btn.innerHTML =
          (ownerIdx >= 0 ? '<span class="match-badge" style="background:' + color + '">' + PAIR_LETTERS[ownerIdx] + "</span>" : "") +
          "<span>" + escapeHtml(rText) + "</span>";
        btn.addEventListener("click", () => {
          if (rec.draft.activeLeft) {
            // 若右側已被其他左側配對，先解除舊配對
            if (ownerLeft) delete rec.draft.pairs[ownerLeft];
            rec.draft.pairs[rec.draft.activeLeft] = rText;
            rec.draft.activeLeft = null;
            rec.lastWrong = false;
            renderDetailView(islandIdx);
          } else if (ownerLeft) {
            delete rec.draft.pairs[ownerLeft];
            rec.lastWrong = false;
            renderDetailView(islandIdx);
          } else {
            showToast("請先點選左側項目，再點右側配對！");
          }
        });
        rightCol.appendChild(btn);
      });

      grid.appendChild(leftCol);
      grid.appendChild(rightCol);
      card.appendChild(grid);
    } else if (q.type === "classify") {
      const list = document.createElement("div");
      list.className = "classify-list";
      q.shuffledItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "classify-row";
        row.innerHTML = '<div class="classify-label">' + escapeHtml(item.text) + "</div>";
        const chips = document.createElement("div");
        chips.className = "chip-group";
        q.categories.forEach((cat) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "choice-chip" + (rec.draft.map[item.text] === cat ? " selected" : "");
          chip.disabled = locked;
          chip.textContent = cat;
          chip.addEventListener("click", () => {
            rec.draft.map[item.text] = cat;
            rec.lastWrong = false;
            renderDetailView(islandIdx);
          });
          chips.appendChild(chip);
        });
        row.appendChild(chips);
        list.appendChild(row);
      });
      card.appendChild(list);
    } else if (q.type === "multi-match") {
      const list = document.createElement("div");
      list.className = "classify-list";
      q.shuffledTargets.forEach((target) => {
        const row = document.createElement("div");
        row.className = "classify-row";
        row.innerHTML = '<div class="classify-label">' + escapeHtml(target.label) + "</div>";
        const chips = document.createElement("div");
        chips.className = "chip-group";
        const picked = rec.draft.map[target.id] || [];
        q.choices.forEach((ch) => {
          const chip = document.createElement("button");
          chip.type = "button";
          const isSel = picked.includes(ch.id);
          chip.className = "choice-chip" + (isSel ? " selected" : "");
          chip.disabled = locked;
          chip.textContent = (isSel ? "✓ " : "") + ch.label;
          chip.addEventListener("click", () => {
            const arr = rec.draft.map[target.id] || [];
            const pos = arr.indexOf(ch.id);
            if (pos >= 0) arr.splice(pos, 1);
            else arr.push(ch.id);
            rec.draft.map[target.id] = arr;
            rec.lastWrong = false;
            renderDetailView(islandIdx);
          });
          chips.appendChild(chip);
        });
        row.appendChild(chips);
        list.appendChild(row);
      });
      card.appendChild(list);
    } else if (q.type === "order") {
      const list = document.createElement("div");
      list.className = "order-list";
      rec.draft.list.forEach((text, i) => {
        const row = document.createElement("div");
        row.className = "order-row";
        row.innerHTML =
          '<div class="order-left"><span class="order-idx">' + (i + 1) + '</span><span class="order-text">' + escapeHtml(text) + "</span></div>";
        const actions = document.createElement("div");
        actions.className = "order-actions";

        const upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.className = "order-move-btn";
        upBtn.textContent = "↑";
        upBtn.disabled = locked || i === 0;
        upBtn.addEventListener("click", () => {
          const arr = rec.draft.list;
          const tmp = arr[i - 1];
          arr[i - 1] = arr[i];
          arr[i] = tmp;
          rec.lastWrong = false;
          renderDetailView(islandIdx);
        });

        const downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.className = "order-move-btn";
        downBtn.textContent = "↓";
        downBtn.disabled = locked || i === rec.draft.list.length - 1;
        downBtn.addEventListener("click", () => {
          const arr = rec.draft.list;
          const tmp = arr[i + 1];
          arr[i + 1] = arr[i];
          arr[i] = tmp;
          rec.lastWrong = false;
          renderDetailView(islandIdx);
        });

        actions.appendChild(upBtn);
        actions.appendChild(downBtn);
        row.appendChild(actions);
        list.appendChild(row);
      });
      card.appendChild(list);
    } else if (q.type === "fix-fields") {
      const list = document.createElement("div");
      list.className = "classify-list";
      q.fields.forEach((field, fIdx) => {
        const row = document.createElement("div");
        row.className = "classify-row";
        row.innerHTML = '<div class="classify-label">' + escapeHtml(field.label) + "</div>";
        const chips = document.createElement("div");
        chips.className = "chip-group";
        field.shuffledOptions.forEach((opt) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "choice-chip" + (rec.draft.map[fIdx] === opt ? " selected" : "");
          chip.disabled = locked;
          chip.textContent = opt;
          chip.addEventListener("click", () => {
            rec.draft.map[fIdx] = opt;
            rec.lastWrong = false;
            renderDetailView(islandIdx);
          });
          chips.appendChild(chip);
        });
        row.appendChild(chips);
        list.appendChild(row);
      });
      card.appendChild(list);
    }

    // 送出按鈕或回饋區塊
    if (!rec.solved) {
      const actions = document.createElement("div");
      actions.className = "quiz-actions";
      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.className = "btn-primary";
      submitBtn.textContent = rec.lastWrong ? "重新送出答案" : "送出答案";
      submitBtn.addEventListener("click", () => evaluateQuestion(q, islandIdx));
      actions.appendChild(submitBtn);
      card.appendChild(actions);
    }

    if (rec.solved || rec.lastWrong) {
      const fb = document.createElement("div");
      fb.className = "feedback-box " + (rec.solved ? "correct" : "wrong");
      const titleText = rec.solved
        ? (rec.score === 2 ? "🎉 首答正確！獲得 +2 分" : "✅ 修正後答對！獲得 +1 分")
        : "💡 還差一點！先看看提示再試一次";
      fb.innerHTML = '<div class="feedback-title">' + titleText + "</div><div>" + escapeHtml(q.feedback) + "</div>";

      if (rec.solved) {
        const nextActionBtn = document.createElement("button");
        nextActionBtn.type = "button";
        nextActionBtn.className = "btn-primary";
        const sp = getStageProgress(islandIdx);
        const ov = getOverallProgress();

        if (!sp.cleared) {
          nextActionBtn.textContent = state.activeSlot === 0 ? "前往本島第 2 題（操作題） →" : "前往本島第 1 題（快速題） →";
          nextActionBtn.addEventListener("click", () => {
            state.activeSlot = state.activeSlot === 0 ? 1 : 0;
            renderDetailView(islandIdx);
          });
        } else if (ov.clearedIslands === state.islands.length) {
          nextActionBtn.textContent = "🏆 查看八島概念結算報告";
          nextActionBtn.addEventListener("click", openSummaryModal);
        } else {
          const nextIdx = (islandIdx + 1) % state.islands.length;
          nextActionBtn.textContent = "起飛前往下一座島（" + state.islands[nextIdx].name + "） →";
          nextActionBtn.addEventListener("click", () => selectIsland(nextIdx, { openMobileSheet: true }));
        }
        fb.appendChild(nextActionBtn);
      }
      card.appendChild(fb);
    }

    return card;
  }

  function evaluateQuestion(q, islandIdx) {
    const rec = state.records[q.id];
    let complete = true;
    let isCorrect = false;

    if (q.type === "single") {
      if (!rec.draft.selected) complete = false;
      else isCorrect = rec.draft.selected === q.answer;
    } else if (q.type === "match") {
      if (Object.keys(rec.draft.pairs).length < q.pairs.length) complete = false;
      else isCorrect = q.pairs.every((p) => rec.draft.pairs[p.left] === p.right);
    } else if (q.type === "classify") {
      if (Object.keys(rec.draft.map).length < q.items.length) complete = false;
      else isCorrect = q.items.every((it) => rec.draft.map[it.text] === it.answer);
    } else if (q.type === "multi-match") {
      if (q.shuffledTargets.some((t) => !(rec.draft.map[t.id] && rec.draft.map[t.id].length > 0))) {
        complete = false;
      } else {
        isCorrect = q.shuffledTargets.every((t) => {
          const picked = (rec.draft.map[t.id] || []).slice().sort().join(",");
          const expected = t.answers.slice().sort().join(",");
          return picked === expected;
        });
      }
    } else if (q.type === "order") {
      isCorrect = q.acceptAnyComplete ? true : rec.draft.list.every((v, i) => v === q.items[i]);
    } else if (q.type === "fix-fields") {
      if (Object.keys(rec.draft.map).length < q.fields.length) complete = false;
      else isCorrect = q.fields.every((f, idx) => rec.draft.map[idx] === f.answer);
    }

    if (!complete) {
      showToast("請先完成本題所有選項或配對再送出喔！");
      return;
    }

    rec.attempts++;
    if (rec.firstCorrect === null) {
      rec.firstCorrect = isCorrect;
    }

    if (isCorrect) {
      rec.solved = true;
      rec.lastWrong = false;
      rec.score = rec.firstCorrect ? 2 : 1;
      updateAllProgressUI();
      updateIslandVisualStates();
      renderDetailView(islandIdx);

      const sp = getStageProgress(islandIdx);
      const ov = getOverallProgress();
      if (sp.cleared) {
        showToast("★ 恭喜通關「" + state.islands[islandIdx].name + "」！");
      }
      if (ov.clearedIslands === state.islands.length && !state.summaryAutoShown) {
        state.summaryAutoShown = true;
        setTimeout(openSummaryModal, 900);
      }
    } else {
      rec.lastWrong = true;
      renderDetailView(islandIdx);
    }
  }

  /* ------------------------------------------------------------------------
     六大核心概念結算彈窗
     ------------------------------------------------------------------------ */
  function openSummaryModal() {
    const ov = getOverallProgress();
    const firstRate = ov.attemptedQuestions > 0 ? Math.round((ov.firstTryCorrect / ov.attemptedQuestions) * 100) : 0;

    // 彙整六大概念分數
    const conceptStats = state.concepts.map((c) => ({ ...c, score: 0, max: 0, attempted: 0 }));
    const conceptMap = {};
    conceptStats.forEach((c) => { conceptMap[c.id] = c; });

    const historyItems = [];
    state.islands.forEach((isl, idx) => {
      (state.roundPlan[idx] || []).forEach((q) => {
        const rec = state.records[q.id];
        const bucket = conceptMap[q.concept || isl.concept];
        if (bucket) {
          bucket.max += 2;
          bucket.score += rec.score;
          if (rec.attempts > 0) bucket.attempted++;
        }
        historyItems.push({ islandName: isl.name, q, rec });
      });
    });

    let html =
      '<div class="kpi-grid">' +
        '<div class="kpi-box"><div class="kpi-val">' + ov.totalScore + ' / ' + ov.maxScore + '</div><div class="kpi-label">總得分（滿分 32）</div></div>' +
        '<div class="kpi-box"><div class="kpi-val">' + ov.solvedQuestions + ' / ' + ov.totalQuestions + '</div><div class="kpi-label">已完成題數</div></div>' +
        '<div class="kpi-box"><div class="kpi-val">' + firstRate + '%</div><div class="kpi-label">首答正確率</div></div>' +
      "</div>";

    html += '<div class="concept-list">';
    conceptStats.forEach((c) => {
      const pct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
      let tagClass = "pending", tagText = "尚未作答";
      if (c.attempted > 0) {
        if (pct >= 85) { tagClass = "mastered"; tagText = "精熟"; }
        else if (pct >= 60) { tagClass = "good"; tagText = "良好"; }
        else { tagClass = "review"; tagText = "建議複習"; }
      }
      html +=
        '<div class="concept-row">' +
          '<div class="concept-head">' +
            '<span class="concept-name">' + escapeHtml(c.name) + "（" + c.score + " / " + c.max + " 分）</span>" +
            '<span class="concept-tag ' + tagClass + '">' + tagText + "</span>" +
          "</div>" +
          '<div class="concept-bar-track"><div class="concept-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="concept-desc">' + escapeHtml(c.desc) + "</div>" +
        "</div>";
    });
    html += "</div>";

    html += '<div><div style="font-size:13.5px;font-weight:800;margin-bottom:8px;">📝 本輪 16 題首次／最終作答紀錄</div><div class="history-list">';
    historyItems.forEach(({ islandName, q, rec }) => {
      const firstMark = rec.firstCorrect === true ? "首答 ✓" : rec.firstCorrect === false ? "首答 ✗" : "未作答";
      const finalMark = rec.solved ? "+" + rec.score + " 分" : "0 分";
      html +=
        '<div class="history-item">' +
          '<span><strong>' + escapeHtml(q.id) + "</strong> " + escapeHtml(islandName) + "</span>" +
          '<span>' + firstMark + "｜<strong>" + finalMark + "</strong></span>" +
        "</div>";
    });
    html += "</div></div>";

    dom.summaryContent.innerHTML = html;
    dom.summaryModal.classList.remove("hidden");
  }

  function closeSummaryModal() {
    dom.summaryModal.classList.add("hidden");
  }

  /* ------------------------------------------------------------------------
     手機版抽屜與全域事件
     ------------------------------------------------------------------------ */
  function setMobileSheetOpen(open) {
    state.sheetOpen = Boolean(open);
    dom.sidebar.classList.toggle("sheet-open", state.sheetOpen);
    dom.sheetBackdrop.classList.toggle("visible", state.sheetOpen);
  }

  function updateMobilePeekTitle() {
    const ov = getOverallProgress();
    if (state.selectedIndex >= 0 && state.islands[state.selectedIndex]) {
      const isl = state.islands[state.selectedIndex];
      const sp = getStageProgress(state.selectedIndex);
      dom.sheetPeekTitle.textContent = "第 " + isl.stage + " 關｜" + isl.name + "（" + sp.solvedCount + "/2 題）";
    } else {
      dom.sheetPeekTitle.textContent = "創用 CC 八島冒險（已通關 " + ov.clearedIslands + "/8 島）";
    }
  }

  /* ------------------------------------------------------------------------
     歡迎畫面、班級座號管理與闖關證書／各關證明
     ------------------------------------------------------------------------ */
  function loadSavedPlayer() {
    try {
      const raw = localStorage.getItem("cc_rpg_player_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state.player.className = String(parsed.className || "");
          state.player.seatNo = String(parsed.seatNo || "");
          state.player.studentName = String(parsed.studentName || "");
          state.player.isGuest = Boolean(parsed.isGuest);
        }
      }
    } catch (e) {}
    dom.inputClass.value = state.player.className;
    dom.inputSeat.value = state.player.seatNo;
    dom.inputName.value = state.player.studentName;
    updatePlayerPill();
  }

  function savePlayer() {
    try {
      localStorage.setItem("cc_rpg_player_v1", JSON.stringify(state.player));
    } catch (e) {}
    updatePlayerPill();
  }

  function getPlayerDisplayLabel() {
    const cls = state.player.className.trim();
    const seat = state.player.seatNo.trim();
    const name = state.player.studentName.trim();
    if (!cls && !seat && !name) {
      return state.player.isGuest ? "訪客體驗模式" : "尚未填寫班級座號";
    }
    const parts = [];
    if (cls) parts.push(cls.endsWith("班") ? cls : cls + " 班");
    if (seat) parts.push(seat.endsWith("號") ? seat : seat + " 號");
    if (name) parts.push(name);
    return parts.join(" ");
  }

  function updatePlayerPill() {
    dom.playerPillText.textContent = "冒險者：" + getPlayerDisplayLabel();
  }

  function openWelcomeModal() {
    dom.inputClass.value = state.player.className;
    dom.inputSeat.value = state.player.seatNo;
    dom.inputName.value = state.player.studentName;
    dom.welcomeError.classList.add("hidden");
    dom.welcomeModal.classList.remove("hidden");
  }

  function closeWelcomeModal() {
    dom.welcomeModal.classList.add("hidden");
  }

  function getConceptSummaryStats() {
    const conceptStats = state.concepts.map((c) => ({ ...c, score: 0, max: 0, attempted: 0 }));
    const conceptMap = {};
    conceptStats.forEach((c) => { conceptMap[c.id] = c; });
    state.islands.forEach((isl, idx) => {
      (state.roundPlan[idx] || []).forEach((q) => {
        const rec = state.records[q.id];
        const bucket = conceptMap[q.concept || isl.concept];
        if (bucket && rec) {
          bucket.max += 2;
          bucket.score += rec.score;
          if (rec.attempts > 0) bucket.attempted++;
        }
      });
    });
    return conceptStats;
  }

  function getAdventureRank(ov) {
    if (ov.clearedIslands < state.islands.length) {
      return "⛵ 群島探索進行中（已通關 " + ov.clearedIslands + " / " + state.islands.length + " 島）";
    }
    if (ov.totalScore >= 28) return "🏆 創用 CC 領航大師";
    if (ov.totalScore >= 22) return "🌟 授權探索高手";
    return "🧭 群島見習冒險家";
  }

  function formatNowString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function openCertificateModal() {
    closeSummaryModal();
    renderCertificateSheet();
    dom.certificateModal.classList.remove("hidden");
  }

  function closeCertificateModal() {
    dom.certificateModal.classList.add("hidden");
  }

  function renderCertificateSheet() {
    const ov = getOverallProgress();
    const firstRate = ov.attemptedQuestions > 0 ? Math.round((ov.firstTryCorrect / ov.attemptedQuestions) * 100) : 0;
    const conceptStats = getConceptSummaryStats();
    const rankText = getAdventureRank(ov);
    const playerText = getPlayerDisplayLabel();
    const nowStr = formatNowString();

    let stampsHtml = '<div class="stamp-grid">';
    state.islands.forEach((isl, idx) => {
      const sp = getStageProgress(idx);
      const pair = state.roundPlan[idx] || [];
      const qSummary = pair.map((q) => {
        const r = state.records[q.id];
        const mark = r && r.solved ? (r.score === 2 ? "✓" : "↺") : "○";
        return q.id + " " + mark;
      }).join("・");

      stampsHtml +=
        '<div class="stamp-card ' + (sp.cleared ? "cleared" : "") + '">' +
          '<div class="stamp-head">' +
            '<span class="stamp-num" style="background:' + (isl.accent || "#0284c7") + '">' + String(isl.stage || idx + 1).padStart(2, "0") + "</span>" +
            '<span class="stamp-seal ' + (sp.cleared ? "ok" : "no") + '">' + (sp.cleared ? "★ 已通關" : sp.solvedCount + "/2 題") + "</span>" +
          "</div>" +
          '<div class="stamp-name">' + escapeHtml(isl.name) + "</div>" +
          '<div class="stamp-meta">' + sp.score + " / " + sp.maxScore + " 分（" + escapeHtml(qSummary) + "）</div>" +
        "</div>";
    });
    stampsHtml += "</div>";

    let conceptsHtml = '<div class="cert-concepts-grid">';
    conceptStats.forEach((c) => {
      const pct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
      const lvl = c.attempted === 0 ? "未作答" : pct >= 85 ? "精熟" : pct >= 60 ? "良好" : "複習";
      conceptsHtml +=
        '<div class="cert-concept-chip">' +
          "<span>" + escapeHtml(c.name) + "</span>" +
          "<span>" + c.score + "/" + c.max + "（" + lvl + "）</span>" +
        "</div>";
    });
    conceptsHtml += "</div>";

    dom.certPreviewSheet.innerHTML =
      '<div class="cert-top">' +
        '<div class="cert-kicker">CREATIVE COMMONS RPG • ARCHIPELAGO CERTIFICATE</div>' +
        '<div class="cert-main-title">創用 CC 八島冒險・闖關證書與各關證明</div>' +
        '<div class="cert-recipient">🎓 ' + escapeHtml(playerText) + "</div>" +
        '<div class="cert-rank-row">' +
          '<span class="cert-rank-pill">' + escapeHtml(rankText) + "</span>" +
          "<span>總分：<strong>" + ov.totalScore + " / " + ov.maxScore + " 分</strong></span>" +
          "<span>通關：<strong>" + ov.clearedIslands + " / " + state.islands.length + " 島</strong></span>" +
          "<span>首答率：<strong>" + firstRate + "%</strong></span>" +
        "</div>" +
      "</div>" +
      '<div><div class="cert-section-label">🏝️ 八座小島闖關印章證明（✓ 首答正確 +2分・↺ 修正答對 +1分）</div>' + stampsHtml + "</div>" +
      '<div><div class="cert-section-label">📊 六大核心概念掌握紀錄</div>' + conceptsHtml + "</div>" +
      '<div class="cert-footer-meta">' +
        "<span>核發時間：" + escapeHtml(nowStr) + "</span>" +
        "<span>創用 CC RPG 48 題題庫・八年級閱讀資訊素養</span>" +
      "</div>";
  }

  function downloadCertificatePng() {
    const ov = getOverallProgress();
    const firstRate = ov.attemptedQuestions > 0 ? Math.round((ov.firstTryCorrect / ov.attemptedQuestions) * 100) : 0;
    const conceptStats = getConceptSummaryStats();
    const rankText = getAdventureRank(ov);
    const playerText = getPlayerDisplayLabel();
    const nowStr = formatNowString();

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 860;
    const ctx = canvas.getContext("2d");

    // 背景漸層
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, "#fffdf5");
    bgGrad.addColorStop(1, "#f0f9ff");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 雙層金色邊框
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 8;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
    ctx.strokeStyle = "#fcd34d";
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);

    // 標題區
    ctx.textAlign = "center";
    ctx.fillStyle = "#b45309";
    ctx.font = "bold 18px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText("CREATIVE COMMONS RPG • 八島冒險學習證明", 600, 86);

    ctx.fillStyle = "#0f172a";
    ctx.font = "900 40px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText("創用 CC 八島冒險・闖關證書", 600, 140);

    // 冒險者膠囊
    ctx.fillStyle = "#fef3c7";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 320, 162, 560, 52, 26);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#92400e";
    ctx.font = "bold 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText("冒險者：" + playerText, 600, 196);

    // 戰績摘要列
    ctx.fillStyle = "#334155";
    ctx.font = "bold 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText(
      rankText + "   ｜   總分 " + ov.totalScore + " / " + ov.maxScore + " 分   ｜   首答正確率 " + firstRate + "%",
      600,
      250
    );

    // 八關印章證明區
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText("八座小島闖關印章證明（✓ 首答正確 +2分・↺ 修正答對 +1分）", 74, 302);

    const cardW = 250;
    const cardH = 128;
    const gapX = 18;
    const gapY = 18;
    const startX = 74;
    const startY = 320;

    state.islands.forEach((isl, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const sp = getStageProgress(idx);
      const pair = state.roundPlan[idx] || [];
      const qSummary = pair.map((q) => {
        const r = state.records[q.id];
        return q.id + " " + (r && r.solved ? (r.score === 2 ? "✓" : "↺") : "○");
      }).join("  ");

      ctx.fillStyle = sp.cleared ? "#f0fdf4" : "#f8fafc";
      ctx.strokeStyle = sp.cleared ? "#22c55e" : "#cbd5e1";
      ctx.lineWidth = 2.5;
      drawRoundedRect(ctx, x, y, cardW, cardH, 14);
      ctx.fill();
      ctx.stroke();

      // 關卡編號徽章
      ctx.fillStyle = isl.accent || "#0284c7";
      drawRoundedRect(ctx, x + 14, y + 14, 42, 26, 8);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px 'Noto Sans TC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(isl.stage || idx + 1).padStart(2, "0"), x + 35, y + 32);

      // 通關印章
      ctx.fillStyle = sp.cleared ? "#dcfce7" : "#e2e8f0";
      drawRoundedRect(ctx, x + 150, y + 14, 86, 26, 13);
      ctx.fill();
      ctx.fillStyle = sp.cleared ? "#15803d" : "#64748b";
      ctx.font = "bold 13px 'Noto Sans TC', sans-serif";
      ctx.fillText(sp.cleared ? "★ 已通關" : sp.solvedCount + "/2 題", x + 193, y + 32);

      // 島名與得分
      ctx.textAlign = "left";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
      ctx.fillText(isl.name, x + 14, y + 72);

      ctx.fillStyle = "#475569";
      ctx.font = "bold 15px 'Noto Sans TC', sans-serif";
      ctx.fillText("得分：" + sp.score + " / " + sp.maxScore + " 分", x + 14, y + 96);

      ctx.fillStyle = "#64748b";
      ctx.font = "13px 'Noto Sans TC', sans-serif";
      ctx.fillText(qSummary, x + 14, y + 116);
    });

    // 六大概念區
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText("六大核心概念掌握紀錄", 74, 636);

    const cW = 340;
    const cH = 54;
    conceptStats.forEach((c, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 74 + col * (cW + 16);
      const y = 652 + row * (cH + 14);
      const pct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
      const lvl = c.attempted === 0 ? "未作答" : pct >= 85 ? "精熟" : pct >= 60 ? "良好" : "建議複習";

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.8;
      drawRoundedRect(ctx, x, y, cW, cH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 17px 'Noto Sans TC', sans-serif";
      ctx.fillText(c.name, x + 16, y + 33);

      ctx.textAlign = "right";
      ctx.fillStyle = "#0284c7";
      ctx.font = "bold 16px 'Noto Sans TC', sans-serif";
      ctx.fillText(c.score + " / " + c.max + " 分（" + lvl + "）", x + cW - 16, y + 33);
      ctx.textAlign = "left";
    });

    // 底部簽發時間
    ctx.fillStyle = "#64748b";
    ctx.font = "15px 'Noto Sans TC', sans-serif";
    ctx.fillText("核發時間：" + nowStr, 74, 808);
    ctx.textAlign = "right";
    ctx.fillText("創用 CC RPG：八島冒險（48 題完整題庫）", 1126, 808);

    const safeTag = (state.player.className + "_" + state.player.seatNo).replace(/[^a-zA-Z0-9一-龥_-]/g, "") || "冒險者";
    const link = document.createElement("a");
    link.download = "創用CC闖關證書_" + safeTag + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("已下載闖關證書 PNG 圖檔！");
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function bindUIEvents() {
    dom.searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      renderIslandIndex();
    });

    dom.searchClearBtn.addEventListener("click", () => {
      state.searchQuery = "";
      dom.searchInput.value = "";
      renderIslandIndex();
      dom.searchInput.focus();
    });

    dom.backAllBtn.addEventListener("click", () => showAllIslands(true));

    dom.resetViewBtn.addEventListener("click", () => {
      if (state.selectedIndex !== -1) showAllIslands(true);
      else flyToOverview();
      if (window.innerWidth <= 768) setMobileSheetOpen(false);
    });

    dom.prevIslandBtn.addEventListener("click", () => {
      const len = state.islands.length;
      if (len === 0) return;
      selectIsland((state.selectedIndex - 1 + len) % len, { openMobileSheet: true });
    });

    dom.nextIslandBtn.addEventListener("click", () => {
      const len = state.islands.length;
      if (len === 0) return;
      selectIsland((state.selectedIndex + 1) % len, { openMobileSheet: true });
    });

    dom.summaryBtn.addEventListener("click", openSummaryModal);
    dom.closeSummaryBtn.addEventListener("click", closeSummaryModal);
    dom.modalContinueBtn.addEventListener("click", closeSummaryModal);
    dom.summaryModal.addEventListener("click", (e) => {
      if (e.target === dom.summaryModal) closeSummaryModal();
    });

    dom.newRoundBtn.addEventListener("click", () => startNewRound(false));
    dom.modalNewRoundBtn.addEventListener("click", () => {
      closeSummaryModal();
      startNewRound(false);
    });

    dom.openCertFromSummaryBtn.addEventListener("click", openCertificateModal);
    dom.certHudBtn.addEventListener("click", openCertificateModal);
    dom.closeCertBtn.addEventListener("click", closeCertificateModal);
    dom.closeCertFooterBtn.addEventListener("click", closeCertificateModal);
    dom.certificateModal.addEventListener("click", (e) => {
      if (e.target === dom.certificateModal) closeCertificateModal();
    });
    dom.downloadCertPngBtn.addEventListener("click", downloadCertificatePng);
    dom.printCertBtn.addEventListener("click", () => window.print());

    dom.playerPillBtn.addEventListener("click", openWelcomeModal);

    dom.playerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const cls = dom.inputClass.value.trim();
      const seat = dom.inputSeat.value.trim();
      const name = dom.inputName.value.trim();
      if (!cls || !seat) {
        dom.welcomeError.classList.remove("hidden");
        return;
      }
      state.player.className = cls;
      state.player.seatNo = seat;
      state.player.studentName = name;
      state.player.isGuest = false;
      savePlayer();
      closeWelcomeModal();
      showToast("歡迎 " + getPlayerDisplayLabel() + "！點擊「01 圖示森林」開始闖關吧！");
    });

    dom.guestStartBtn.addEventListener("click", () => {
      state.player.isGuest = true;
      savePlayer();
      closeWelcomeModal();
      showToast("已進入訪客體驗模式，隨時可點左側冒險者列補填班級座號！");
    });

    dom.sheetHandleBtn.addEventListener("click", () => setMobileSheetOpen(!state.sheetOpen));
    dom.sheetBackdrop.addEventListener("click", () => setMobileSheetOpen(false));

    let touchStartY = 0;
    dom.sheetHandleBtn.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive: true });
    dom.sheetHandleBtn.addEventListener("touchend", (e) => {
      if (e.changedTouches.length !== 1) return;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (dy < -28) setMobileSheetOpen(true);
      else if (dy > 28) setMobileSheetOpen(false);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------------
     啟動
     ------------------------------------------------------------------------ */
  async function init() {
    const gameData = await loadGameData();
    state.concepts = gameData.concepts || [];
    state.islands = gameData.islands || [];
    const ok3d = initThree() !== false;
    if (ok3d) bindSceneEvents();
    bindUIEvents();
    loadSavedPlayer();
    startNewRound(true);
    if (ok3d) animate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
