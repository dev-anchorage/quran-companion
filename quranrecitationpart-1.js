// ==UserScript==
// @name         Quran Companion - Dawat-e-Islami
// @namespace    https://www.dawateislami.net/
// @version      2.5.0
// @description  Professional Quran Media Player with Audio, Ayah Playback and Reading Settings
// @match        https://www.dawateislami.net/quran/surah-*/translation-*
// @run-at       document-idle
// @grant        none
// @require https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js
// ==/UserScript==

(() => {
  "use strict";

  // =====================================================
  // 1. WEBSITE VALIDATION
  // =====================================================

  // Website configuration
  const SITE = "www.dawateislami.net";

  // Current page information
  const path = location.pathname;

  // Allowed page URL pattern
  const REQUIRED_PATH = /^\/quran\/surah-[^/]+\/translation-[^/]+\/?$/;

  // Validate website and page
  if (
      location.hostname !== SITE || !REQUIRED_PATH.test(path) 
     ) {
      console.error(
         "Quran Auto Player: Open a Dawat-e-Islami Surah translation page first.",
        );
        return;
      }

  // Continue Quran Auto Player...

  // =====================================================
  // 2. CLEAN UP PREVIOUS PLAYER
  // =====================================================

  // Destroy the previous Quran player, if it exists
  window.quranAutoPlayer?.destroy?.();

  // Remove previous player interface and styles
  document.querySelector("#quran-auto-panel")?.remove();
  document.querySelector("#quran-auto-player-style")?.remove();

  // =====================================================
  // 3. DETECT SURAH INFORMATION
  // =====================================================

  // Find the HTML element containing Surah information
  const surahElement = document.querySelector(".tolTopstyle[data-surah-id]");

  // Check whether Surah information exists
  if (!surahElement) {
    console.error("Quran Auto Player: Surah information not detected.");
    return;
  }

  // Extract Surah information from the HTML element
  const surahId = Number(surahElement.dataset.surahId);
  const surahName = surahElement.dataset.surahName?.trim();
  const totalAyahs = Number(surahElement.dataset.surahTotalAyaat);

  // Extract Surah slug from the current URL
  const surahSlug = path.match(/surah-([^/]+)/)?.[1];

  // Validate the extracted Surah information
  if (
    !Number.isInteger(surahId) ||
    surahId < 1 ||
    surahId > 114 ||
    !surahName ||
    !Number.isInteger(totalAyahs) ||
    totalAyahs < 1 ||
    !surahSlug
  ) {
    console.error("Quran Auto Player: Surah information is incomplete.");
    return;
  }

  // =====================================================
  // 4. PLAYER STATE
  // =====================================================

  let ayah = 1;

  let running = false;
  let expanded = false;

  let autoScroll = true;

  let speed = 1;

  let generation = 0;

  let timer = null;

  let qari = "02";

  let destroyed = false;

  let currentError = "";

  let currentStatus = "Ready to play";

  // =========================================
  // AYAH RANGE PLAYBACK SETTINGS
  // =========================================

  let rangeStart = 1;

  let rangeEnd = 1;

  let rangeRepeat = 1;

  let rangeRepeatCount = 0;

  let rangeRepeatMode = "range";

  let rangeAyahRepeatCount = 0;

  let rangePlaybackActive = false;

  let audio = new Audio();

  audio.preload = "auto";

  // =====================================================
  // 5. AUDIO URL GENERATOR
  // =====================================================

  let audioMode = "both";
  
  let urduTranslation = "02";

  // Current audio track.
  let currentTrack = "arabic";

  // Tracks selected for the current Ayah.
  let trackQueue = [];

  // Position inside the track queue.
  let trackIndex = 0;

  // Track playback generation.

  function audioURL(n, language) {
    const audioBase =
      "https://data2.dawateislami.net/static/images/main-website/quran-arabic-audios/";

    const folder = String(surahId).padStart(3, "0");

    const ayahNumber = String(n).padStart(3, "0");

    const code = language === "arabic" ? qari : urduTranslation;

    const prefix = language === "arabic" ? "A" : "U";

    return (
      audioBase + folder + "/" + prefix + code + folder + ayahNumber + ".mp3"
    );
  }

  // =========================================
  // INITIALIZE LUCIDE ICONS
  // =========================================

  function initializeQapIcons() {
    if (typeof lucide !== "undefined") {
      lucide.createIcons({
        attrs: {
          class: "qap-icon",
        },
      });
    } else {
      console.warn("Lucide library unavailable.");
    }
  }
  // =====================================================
  //  6. PROFESSIONAL CSS VERSION 3.0
  // =====================================================

  const css = document.createElement("style");

  css.id = "quran-auto-player-style";

  css.textContent = `

  /* ================ C01. ROOT VARIABLES ==================== */

  #quran-auto-panel {
    --qap-green: #18543d;
    --qap-dark: #103326;
    --qap-deep: #0c291f;
    --qap-gold: #f6c453;
    --qap-gold-light: #ffe5a1;
    --qap-text: #ffffff;
    --qap-muted: #c8dfd3;
    --qap-border: rgba(255,255,255,.13);
    --qap-surface: rgba(255,255,255,.075);
    --qap-surface-hover: rgba(255,255,255,.12);
    --qap-success: #a9edbd;
    --qap-danger: #ff8585;

    position: fixed;
    z-index: 99999999;

    right: 18px;
    bottom: 18px;

    width: 340px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 36px);

    padding: 18px;

    color: var(--qap-text);

    background: linear-gradient(
      155deg,
      var(--qap-green),
      var(--qap-dark)
    );

    border: 1px solid var(--qap-border);
    border-radius: 19px;

    box-shadow:
      0 15px 45px rgba(0,0,0,.32),
      0 3px 10px rgba(0,0,0,.15);

    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;

    box-sizing: border-box;
    user-select: none;

    overflow: hidden;

    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);

    transition:
      width .25s ease,
      height .25s ease;
  }

  /* ================ C02. GLOBAL BOX SIZING ==================== */

  #quran-auto-panel *,
  #quran-auto-panel *::before,
  #quran-auto-panel *::after {
    box-sizing: border-box;
  }

  /* ================ C03. AYAH HIGHLIGHT ==================== */

  .qap-highlight {
    background: rgba(255,190,30,.20) !important;
    outline: 2px solid #d6a500 !important;
    outline-offset: 1px;
    border-radius: 9px;
    transition: background .3s ease;
  }


/* ================ C04. MODERN HEADER ==================== */

#quran-auto-panel .qap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--qap-border);
}

#quran-auto-panel .qap-brand-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-width: 0;
}

#quran-auto-panel .qap-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: .5px;
}

#quran-auto-panel .qap-brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--qap-gold);
  background: rgba(246,196,83,.13);
  border: 1px solid rgba(246,196,83,.25);
  border-radius: 11px;
}

#quran-auto-panel .qap-brand-icon .qap-icon {
  width: 19px;
  height: 19px;
}

/* SURAH TITLE */

#quran-auto-panel .qap-surah-name {
  margin-top: 15px;
  color: var(--qap-gold);
  font-size: 19px;
  font-weight: 800;
  text-align: center;
  letter-spacing: .3px;
  overflow-wrap: anywhere;
}

#quran-auto-panel .qap-surah-subtitle {
  display: none;
}


  /* ================ C05. MUTED TEXT ==================== */

  #quran-auto-panel .qap-muted {
    color: var(--qap-muted);
    font-size: 11px;
  }

  /* ================ C06. BUTTON BASE ==================== */

  #quran-auto-panel button {
    cursor: pointer;
    border: none;
    outline: none;
    border-radius: 9px;

    font-family: inherit;
    font-size: 12px;
    font-weight: 600;

    transition:
      background .2s ease,
      transform .15s ease,
      opacity .2s ease;
  }

  #quran-auto-panel button:hover {
    opacity: .88;
  }

  #quran-auto-panel button:active {
    transform: scale(.97);
  }

  #quran-auto-panel button:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  #quran-auto-panel button:focus-visible,
  #quran-auto-panel select:focus-visible,
  #quran-auto-panel input:focus-visible {
    outline: 2px solid var(--qap-gold-light);
    outline-offset: 3px;
  }


  /* ================ C07. MODERN SETTINGS BUTTON ==================== */

#quran-auto-panel .qap-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  color: var(--qap-gold);
  background: rgba(246,196,83,.10);
  border-radius: 12px;
  transition: all .25s ease;

  /* 1. This keeps it completely borderless/invisible at first */
  border: 1px solid rgba(0, 0, 0, 0);
}

#quran-auto-panel .qap-expand:hover {
  background: rgba(246,196,83,.20);

  /* 2. This makes the border appear seamlessly when the mouse comes over it */
  border-color: var(--qap-gold);
}

#quran-auto-panel .qap-expand .qap-icon {
  width: 19px;
  height: 19px;
}

#quran-auto-panel #qap-ayah-details {
  border-radius: 50%;
  /* Essential for the 3D pop effect to feel fluid */
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
}

#quran-auto-panel #qap-ayah-details:hover {
  /* Scales the button up slightly (105%), bringing it "closer" on the Z-axis */
  transform: scale(1.08);

  /* A larger, softer shadow simulates the button lifting off the screen toward you */
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}



  /* ================ C08. AYAH INFORMATION ==================== */

#quran-auto-panel .qap-ayah-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 15px;
  padding: 11px 13px;
  background: rgba(255,255,255,.075);
  border: 1px solid var(--qap-border);
  border-radius: 12px;
}

#quran-auto-panel .qap-ayah-number {
  color: var(--qap-gold);
  font-size: 16px;
  font-weight: 700;
}

#quran-auto-panel .qap-ayah-info > div:last-child {
  display: flex;
  align-items: center;
  justify-content: center;
}


  /* ================ C09. PROGRESS BAR ==================== */

  #quran-auto-panel .qap-progress {
    height: 6px;
    margin-top: 17px;

    background: rgba(255,255,255,.19);

    border-radius: 30px;
    overflow: hidden;
  }

  #quran-auto-panel .qap-progress-fill {
    width: 0%;
    height: 100%;

    background: linear-gradient(
      90deg,
      #e6b84f,
      #ffe29a
    );

    border-radius: 30px;

    box-shadow: 0 0 10px rgba(246,196,83,.35);

    transition: width .15s linear;
  }

  /* ================ C10. TIME INFORMATION ==================== */

  #quran-auto-panel .qap-time-row {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }

  /* ================ C11. PLAYBACK CONTROLS ==================== */

#quran-auto-panel .qap-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  margin-top: 19px;
}

#quran-auto-panel .qap-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 43px;
  height: 43px;
  flex-shrink: 0;
  color: #fff;
  background: rgba(255,255,255,.11);
  border: 1px solid var(--qap-border);
  border-radius: 13px;
}

#quran-auto-panel .qap-play-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  height: 47px;
  color: #17432f;
  background: linear-gradient(135deg,#ffe5a1,#f4c65c);
  font-size: 14px;
  font-weight: 800;
  border-radius: 14px;
}


#quran-auto-panel .qap-control-btn {
  position: relative;
}

#quran-auto-panel .qap-seek-time {
  position: absolute;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  bottom: 9px;
}

#quran-auto-panel .qap-control-btn:has(.qap-seek-time) {
  border-radius: 50%;
}


/* ================ C12. SECONDARY CONTROLS ==================== */

#quran-auto-panel .qap-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 13px;
}

#quran-auto-panel .qap-secondary button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 41px;
  color: #fff;
  background: rgba(255,255,255,.10);
  border: 1px solid var(--qap-border);
  border-radius: 12px;
}

#quran-auto-panel .qap-end-btn {
  color: #ffd6d6 !important;
  background: rgba(255,90,90,.17) !important;
}

/* ================ C13. RETURN BUTTON ==================== */

#quran-auto-panel .qap-return-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 41px;
  margin-top: 0;
  padding: 10px;
  color: var(--qap-gold);
  background: rgba(246,196,83,.12);
  border: 1px solid rgba(246,196,83,.25);
  border-radius: 12px;
}


/* ================ C14. RANGE INFORMATION ==================== */

#quran-auto-panel #qap-main-range-info {
  margin-top: 9px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

#quran-auto-panel #qap-main-range-info:empty {
  display: none;
}

  /* ================ C15. SETTINGS CONTAINER ==================== */

  #quran-auto-panel .qap-settings {
    max-height: 60vh;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,.35) transparent;
  }

  #quran-auto-panel .qap-settings[hidden] {
    display: none !important;
  }

  #quran-auto-panel .qap-section {
    margin-top: 15px;
    padding-top: 13px;
    border-top: 1px solid rgba(255,255,255,.13);
  }

  #quran-auto-panel .qap-section-title {
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
  }

  /* ================ C16. INTERNAL SETTINGS PAGES ==================== */

  #quran-auto-panel .qap-internal-page {
    position: absolute;
    inset: 0;

    z-index: 30;

    width: 100%;
    height: 100%;

    padding: 19px;

    overflow-y: auto;
    overscroll-behavior: contain;

    background: linear-gradient(
      155deg,
      #18543d,
      #103326
    );

    border-radius: 19px;

    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,.35) transparent;
  }

  #quran-auto-panel .qap-internal-page[hidden] {
    display: none !important;
  }

  /* ================ C17. INTERNAL PAGE HEADER ==================== */

  #quran-auto-panel .qap-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;

    padding-bottom: 15px;
    margin-bottom: 17px;

    border-bottom: 1px solid rgba(255,255,255,.2);
  }

  #quran-auto-panel .qap-page-header strong {
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    text-align: right;
  }

  /* ================ C18. BACK BUTTON ==================== */

  #quran-auto-panel .qap-back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;

    flex-shrink: 0;

    padding: 9px 12px;

    color: #ffffff;
    background: rgba(255,255,255,.14);

    font-size: 12px;
    border-radius: 9px;
  }

  /* ================ C19. SETTINGS MENU ==================== */

  #quran-auto-panel .qap-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    width: 100%;
    min-height: 68px;

    padding: 13px;
    margin-top: 10px;

    color: #ffffff;
    background: rgba(255,255,255,.075);

    text-align: left;

    border: 1px solid rgba(255,255,255,.10);
    border-radius: 13px;
  }

  #quran-auto-panel .qap-menu-item:hover {
    background: rgba(246,196,83,.14);
    border-color: rgba(246,196,83,.65);
  }

  #quran-auto-panel .qap-menu-item > span:last-child {
    color: var(--qap-gold);
    font-size: 21px;
  }

  #quran-auto-panel .qap-menu-icon {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    width: 43px;
    height: 43px;

    color: var(--qap-gold);
    background: rgba(246,196,83,.12);

    border-radius: 12px;
  }

  #quran-auto-panel .qap-icon {
    display: inline-block;
    width: 21px;
    height: 21px;
    flex-shrink: 0;
    vertical-align: middle;
  }

  /* ================ C20. FORM LABELS ==================== */

  #quran-auto-panel label {
    display: block;
    margin-bottom: 7px;

    color: #d6e9de;
    font-size: 12px;
  }

  #quran-auto-panel .qap-internal-page label {
    font-weight: 600;
  }

  /* ================ C21. FORM INPUTS ==================== */

  #quran-auto-panel select {
    width: 100%;
    min-height: 40px;

    padding: 10px 11px;

    color: #174d38;
    background: #ffffff;

    border: 1px solid rgba(255,255,255,.2);
    border-radius: 9px;

    font-family: inherit;
    font-size: 12px;
    outline: none;
  }

  #quran-auto-panel .qap-internal-page select {
    margin-top: 5px;
  }

  #quran-auto-panel input[type="checkbox"] {
    accent-color: var(--qap-gold);
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* ================ C22. MESSAGE AND NOTIFICATIONS ==================== */

  #quran-auto-panel .qap-message {
    margin-top: 13px;
    padding: 11px;

    color: #d5e9dc;
    background: rgba(255,255,255,.09);

    font-size: 10px;
    line-height: 1.6;

    overflow-wrap: anywhere;
    white-space: normal;

    border-radius: 10px;
  }

  #quran-auto-panel .qap-message.error {
    color: #ffd1d1;
    background: rgba(255,70,70,.16);
    border-left: 3px solid #ff8585;
  }

  #quran-auto-panel .qap-message.success {
    color: #c8f5d4;
  }

  /* ================ C23. RANGE ERROR ==================== */

  #quran-auto-panel #qap-range-info {
    margin-top: 15px;
    color: #d6e9de;
    font-size: 11px;
    line-height: 1.7;
  }

  #quran-auto-panel #qap-range-info.qap-range-error {
    padding: 10px;
    color: #ffd1d1 !important;
    background: rgba(255,70,70,.16);
    border-left: 3px solid #ff8585;
    border-radius: 7px;
  }

  /* ================ C24. PLAYBACK INFORMATION LIST ==================== */

  #quran-auto-panel .qap-info-list {
    display: flex;
    flex-direction: column;
    gap: 0;

    margin-top: 12px;
    padding: 5px 13px;

    background: rgba(255,255,255,.065);

    border: 1px solid rgba(255,255,255,.13);
    border-radius: 13px;
  }

  #quran-auto-panel .qap-info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    min-height: 42px;
    padding: 10px 0;

    border-bottom: 1px solid rgba(255,255,255,.10);
  }

  #quran-auto-panel .qap-info-row:last-child {
    border-bottom: none;
  }

  #quran-auto-panel .qap-info-row span {
    flex: 1;
    min-width: 0;

    color: #c8dfd3;
    font-size: 11px;
    line-height: 1.5;
  }

  #quran-auto-panel .qap-info-row strong {
    flex: 1;
    min-width: 0;

    color: var(--qap-gold);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;

    text-align: right;
    overflow-wrap: anywhere;
  }

  /* ================ C25. PLAYBACK INFORMATION PAGE ==================== */

  #quran-auto-panel #qap-info-page {
    display: flex;
    flex-direction: column;
  }

  #quran-auto-panel #qap-info-page[hidden] {
    display: none !important;
  }

  #quran-auto-panel .qap-info-intro {
    margin: 5px 0 16px;
    padding: 15px;

    background: rgba(255,255,255,.075);

    border: 1px solid rgba(246,196,83,.22);
    border-radius: 13px;
  }

  #quran-auto-panel .qap-info-intro strong {
    display: block;
    margin-bottom: 6px;

    color: var(--qap-gold);
    font-size: 14px;
  }

  #quran-auto-panel .qap-info-intro p {
    margin: 0;

    color: var(--qap-muted);
    font-size: 11px;
    line-height: 1.7;
  }

  #quran-auto-panel .qap-info-group {
    margin-top: 13px;
    padding: 13px;

    background: rgba(255,255,255,.065);

    border: 1px solid rgba(255,255,255,.12);
    border-radius: 12px;
  }

  #quran-auto-panel .qap-info-group-title {
    display: flex;
    align-items: center;
    gap: 8px;

    margin-bottom: 9px;

    color: var(--qap-gold);
    font-size: 12px;
    font-weight: 700;
  }

  #quran-auto-panel .qap-info-details {
    color: #e0eee6;
    font-size: 11px;
    line-height: 1.9;

    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  /* ================ C26. INFORMATION STATUS ==================== */

  #quran-auto-panel .qap-info-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;

    margin-top: 13px;
    padding: 12px;

    background: rgba(255,255,255,.08);

    border: 1px solid rgba(255,255,255,.12);
    border-radius: 11px;
  }

  #quran-auto-panel .qap-info-status-label {
    color: var(--qap-muted);
    font-size: 11px;
  }

  #quran-auto-panel .qap-info-status-value {
    color: var(--qap-success);
    font-size: 11px;
    font-weight: 700;
  }

  /* ================ C27. INTERNAL SECTION SPACING ==================== */

  #quran-auto-panel .qap-internal-page .qap-section {
    margin-top: 14px;
    padding-top: 14px;
  }

  #quran-auto-panel .qap-internal-page .qap-section-title {
    font-size: 13px;
    line-height: 1.5;
  }

  /* ================ C28. SCROLLBAR ==================== */

  #quran-auto-panel .qap-settings::-webkit-scrollbar,
  #quran-auto-panel .qap-internal-page::-webkit-scrollbar {
    width: 4px;
  }

  #quran-auto-panel .qap-settings::-webkit-scrollbar-thumb,
  #quran-auto-panel .qap-internal-page::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,.35);
    border-radius: 10px;
  }

  #quran-auto-panel .qap-settings::-webkit-scrollbar-track,
  #quran-auto-panel .qap-internal-page::-webkit-scrollbar-track {
    background: transparent;
  }

  /* ================ C29. MOBILE RESPONSIVENESS ==================== */

  @media (max-width: 480px) {

    #quran-auto-panel {
      width: 320px;
      max-width: calc(100vw - 20px);

      right: 10px;
      bottom: 10px;

      max-height: calc(100vh - 20px);
      padding: 15px;
    }

    #quran-auto-panel .qap-internal-page {
      padding: 16px;
    }

    #quran-auto-panel .qap-surah-name {
      font-size: 17px;
    }

    #quran-auto-panel .qap-info-row {
      gap: 8px;
    }

  }

  /* ================ C30. SMALL MOBILE RESPONSIVENESS ==================== */

  @media (max-width: 350px) {

    #quran-auto-panel {
      width: calc(100vw - 16px);
      max-width: none;
      right: 8px;
      bottom: 8px;
      padding: 13px;
    }

    #quran-auto-panel .qap-controls {
      gap: 9px;
    }

    #quran-auto-panel .qap-control-btn {
      width: 39px;
      height: 39px;
    }

  }

  /* ================ C31. REDUCED MOTION ACCESSIBILITY ==================== */

  @media (prefers-reduced-motion: reduce) {

    #quran-auto-panel,
    #quran-auto-panel *,
    .qap-highlight {
      transition: none !important;
      animation: none !important;
    }

  }

  `;

  document.head.appendChild(css);

  // =====================================================
  // 7. CREATE PLAYER PANEL
  // =====================================================

  const panel = document.createElement("div");

  panel.id = "quran-auto-panel";

  panel.innerHTML = `



<!-- ================= MAIN PLAYER ================= -->

<div class="qap-header">

  <div class="qap-brand-area">
    <div class="qap-brand">
      <span class="qap-brand-icon">
        <i data-lucide="book-open"></i>
      </span>
      <span>QURAN COMPANION</span>
    </div>
  </div>

  <button
    class="qap-expand"
    id="qap-expand"
    title="Player Settings"
    aria-label="Open Player Settings"
  >
    <i data-lucide="settings"></i>
  </button>

</div>

<!-- SURAH NAME -->

<div class="qap-surah-name" id="qap-surah">
  Loading Surah...
</div>

<!-- AYAH INFORMATION -->

<div class="qap-ayah-info">

  <div style="flex:1;min-width:0">

    <div class="qap-muted">NOW PLAYING</div>

    <div class="qap-ayah-number" id="qap-ayah">
      Ayah 1 of  ${totalAyahs}
    </div>

  </div>

  <button
    id="qap-ayah-details"
    class="qap-control-btn"
    title="Ayah Information"
    aria-label="Ayah Information"
  >
    <i data-lucide="sparkles"></i>
  </button>

</div>

<!-- SELECTED RANGE -->

<div
  id="qap-main-range-info"
  class="qap-muted"
  style="display:none"
></div>

<!-- AUDIO PROGRESS -->

<div class="qap-progress">
  <div
    class="qap-progress-fill"
    id="qap-progress"
  ></div>
</div>

<!-- TIME -->

<div class="qap-time-row">
  <span class="qap-muted" id="qap-current">00:00</span>
  <span class="qap-muted" id="qap-duration">00:00</span>
</div>

<!-- PLAYBACK CONTROLS -->

<div class="qap-controls">

  <button
    class="qap-control-btn"
    id="qap-prev"
    title="Previous Ayah"
    aria-label="Previous Ayah"
  >
    <i data-lucide="skip-back"></i>
  </button>

  <button
    class="qap-control-btn"
    id="qap-rewind"
    title="Rewind"
    aria-label="Rewind"
  >
    <i data-lucide="rotate-ccw"></i>
    <span class="qap-seek-time">10</span>
  </button>

  <button
    class="qap-play-btn"
    id="qap-play"
    title="Play or Pause"
  >
    <i data-lucide="play"></i>
    Play
  </button>

  <button
    class="qap-control-btn"
    id="qap-forward"
    title="Forward"
    aria-label="Forward"
  >
    <i data-lucide="rotate-cw"></i>
    <span class="qap-seek-time">10</span>
  </button>

  <button
    class="qap-control-btn"
    id="qap-next"
    title="Next Ayah"
    aria-label="Next Ayah"
  >
    <i data-lucide="skip-forward"></i>
  </button>

</div>

<!-- SECONDARY CONTROLS -->

<div class="qap-secondary">

  <button id="qap-reset" title="Reset Playback">
    <i data-lucide="refresh-ccw"></i>
  </button>

  <button
    id="qap-return"
    class="qap-return-btn"
    title="Return to Current Ayah"
    aria-label="Return to Current Ayah"
  >
    <i data-lucide="locate-fixed"></i>
  </button>

  <button
    id="qap-end"
    class="qap-end-btn"
    title="End Playback"
    aria-label="End Playback"
  >
    <i data-lucide="square"></i>
  </button>

</div>


  <!-- ================= SETTINGS CONTENT ================= -->

  <div
    class="qap-settings"
    id="qap-settings"
    hidden
  >

    <!-- PLAYBACK INFORMATION -->

    <div class="qap-section">

      <div class="qap-section-title">
        <i data-lucide="info"></i>
        &nbsp; Playback Information
      </div>

      <div id="qap-info" class="qap-info-list">

        <div class="qap-info-row">
          <span>Surah</span>
          <strong id="qap-info-surah">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Current Ayah</span>
          <strong id="qap-info-ayah">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Arabic Reciter</span>
          <strong id="qap-info-qari">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Audio Track</span>
          <strong id="qap-info-track">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Audio Mode</span>
          <strong id="qap-info-mode">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Urdu Translation</span>
          <strong id="qap-info-translation">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Playback Speed</span>
          <strong id="qap-info-speed">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Ayah Range</span>
          <strong id="qap-info-range">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Repeat Settings</span>
          <strong id="qap-info-repeat">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Repeat Method</span>
          <strong id="qap-info-repeat-mode">-</strong>
        </div>

        <div class="qap-info-row">
          <span>Playback Status</span>
          <strong id="qap-info-status">Ready</strong>
        </div>

      </div>

    </div>

  </div>


  <!-- ================= AUDIO SETTINGS PAGE ================= -->

  <div
    id="qap-audio-popup"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-close-audio" class="qap-back-btn">
        <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong><i data-lucide="music"></i> Audio Settings</strong>

    </div>


    <div class="qap-section">

      <div class="qap-section-title">
        Audio Configuration
      </div>

      <div style="margin-top:17px">

        <label for="qap-audio-mode">Audio Mode</label>

        <select id="qap-audio-mode">
          <option value="arabic">Arabic Only</option>
          <option value="urdu">Urdu Only</option>
          <option value="both" selected>Arabic + Urdu</option>
        </select>

      </div>


      <div style="margin-top:18px">

        <label for="qap-qari">Arabic Reciter</label>

        <select id="qap-qari">
          <option value="01">Qari 1</option>
          <option value="02" selected>Qari 2</option>
          <option value="03">Qari 3</option>
          <option value="04">Qari 4</option>
        </select>

      </div>


      <div style="margin-top:18px">

        <label for="qap-urdu-translation">
          Urdu Translation
        </label>

        <select id="qap-urdu-translation">
          <option value="01">Kanzul Iman</option>
          <option value="02" selected>Kanzul Irfan</option>
        </select>

      </div>


      <div style="margin-top:18px">

        <label for="qap-speed">Playback Speed</label>

        <select id="qap-speed">
          <option value=".5">0.5x</option>
          <option value=".75">0.75x</option>
          <option value="1" selected>1x Normal</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="1.75">1.75x</option>
          <option value="2">2x</option>
        </select>

      </div>

    </div>

  </div>


  <!-- ================= AYAH PLAYBACK PAGE ================= -->

  <div
    id="qap-range-popup"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-close-range" class="qap-back-btn">
       <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong>☷ Ayah Playback</strong>

    </div>


    <div class="qap-section">

      <div class="qap-section-title">
        Select Ayah Range
      </div>


      <div style="margin-top:17px">

        <label for="qap-range-start">
          Start Ayah
        </label>

        <select id="qap-range-start"></select>

      </div>


      <div style="margin-top:17px">

        <label for="qap-range-end">
          End Ayah
        </label>

        <select id="qap-range-end"></select>

      </div>


      <div style="margin-top:17px">

        <label for="qap-range-repeat">
          Repeat Count
        </label>

        <select id="qap-range-repeat">
          <option value="1" selected>1 Total Play</option>
          <option value="2">2 Total Plays</option>
          <option value="3">3 Total Plays</option>
          <option value="5">5 Total Plays</option>
          <option value="10">10 Total Plays</option>
          <option value="0">Unlimited</option>
        </select>

      </div>


      <div style="margin-top:17px">

        <label for="qap-repeat-mode">
          Repetition Method
        </label>

        <select id="qap-repeat-mode">

          <option value="range" selected>
            Repeat Entire Range
          </option>

          <option value="each">
            Repeat Each Ayah
          </option>

        </select>

        <div class="qap-muted" style="margin-top:9px;line-height:1.8">

          <strong style="color:var(--qap-gold)">
            Repeat Entire Range
          </strong>

          <div>
            Complete all selected Ayahs before repeating.
          </div>

          <div style="margin-top:9px">

            <strong style="color:var(--qap-gold)">
              Repeat Each Ayah
            </strong>

            <div>
              Repeat each Ayah individually before moving forward.
            </div>

          </div>

        </div>

      </div>


      <div style="display:flex;gap:9px;margin-top:22px">

        <button
          id="qap-range-listen"
          style="
            flex:1;
            padding:12px;
            color:#174d38;
            background:#ffffff;
          "
        >
         <i data-lucide="headphones"></i>
          Listen
        </button>

        <button
          id="qap-range-move"
          style="
            flex:1;
            padding:12px;
            color:#174d38;
            background:var(--qap-gold);
          "
        >
          ↗ Move
        </button>

      </div>


      <div id="qap-range-info">
        Select your Ayah range.
      </div>

    </div>

  </div>


  <!-- ================= STATUS MESSAGE ================= -->

  <div
    class="qap-message success"
    id="qap-message"
    role="status"
    aria-live="polite"
  >
    Ready. Select Play to begin Quran recitation.
  </div>


  <!-- ================= SETTINGS HOME ================= -->

  <div
    id="qap-settings-home"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-settings-back" class="qap-back-btn">
        <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong>☪ Quran Companion</strong>

    </div>


    <div style="margin:20px 0 18px">

      <div style="font-size:20px;font-weight:700">
        Player Settings
      </div>

      <div class="qap-muted" style="margin-top:7px">
        Personalize your Quran listening experience.
      </div>

    </div>


    <!-- AUDIO MENU -->

    <button id="qap-open-audio" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
          <i data-lucide="music"></i>
        </span>

        <span>
          <strong>Audio Settings</strong>

          <div class="qap-muted" style="margin-top:5px">
            Reciter, translation, mode and speed
          </div>
        </span>

      </span>

      <span>›</span>

    </button>


    <!-- AYAH PLAYBACK MENU -->

    <button id="qap-open-range" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
         <i data-lucide="headphones"></i>
        </span>

        <span>
          <strong>Ayah Playback</strong>

          <div class="qap-muted" style="margin-top:5px">
            Ayah range and repetition
          </div>
        </span>

      </span>

      <span>›</span>

    </button>


    <!-- READING SETTINGS MENU -->

    <button id="qap-open-reading" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
          <i data-lucide="book-open"></i>
        </span>

        <span>
          <strong>Reading Settings</strong>

          <div class="qap-muted" style="margin-top:5px">
            Scrolling and reading preferences
          </div>
        </span>

      </span>

      <span>›</span>

    </button>


    <!-- TRANSLATION MENU -->

    <button id="qap-open-translation" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
          <i data-lucide="languages"></i>
        </span>

        <span>
          <strong>Translation</strong>

          <div class="qap-muted" style="margin-top:5px">
            Choose website translation
          </div>
        </span>

      </span>

      <span>›</span>

    </button>


    <!-- PLAYBACK INFORMATION MENU -->

    <button id="qap-open-info" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
          <i data-lucide="info"></i>
        </span>

        <span>
          <strong>Playback Information</strong>

          <div class="qap-muted" style="margin-top:5px">
            Current recitation and player details
          </div>
        </span>

      </span>

      <span>›</span>

    </button>

  </div>


  <!-- ================= READING SETTINGS ================= -->

  <div
    id="qap-reading-page"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-close-reading" class="qap-back-btn">
        <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong>Reading Settings</strong>

    </div>


    <div class="qap-section">

      <div class="qap-section-title">
        <i data-lucide="scroll-text"></i>
        Automatic Scrolling
      </div>


      <label style="
        display:flex;
        align-items:center;
        gap:11px;
        margin-top:19px;
        line-height:1.6;
      ">

        <input
          type="checkbox"
          id="qap-scroll"
          checked
        >

        Automatically scroll to playing Ayah

      </label>


      <div class="qap-muted" style="line-height:1.9;margin-top:13px">

        Automatically moves the page to the currently playing Ayah.

        Manual scrolling will not be interrupted.

        Use the Current Ayah button whenever you want to return.

      </div>

    </div>

  </div>


  <!-- ================= TRANSLATION PAGE ================= -->

  <div
    id="qap-translation-page"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-close-translation" class="qap-back-btn">
        <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong>Translation</strong>

    </div>


    <div class="qap-section">

      <div class="qap-section-title">
        <i data-lucide="languages"></i>
        Website Translation
      </div>


      <div class="qap-muted" style="margin-top:11px;line-height:1.8">

        Select the translation you want to read on the website.

      </div>


      <label for="qap-translation" style="margin-top:19px">
        Select Translation
      </label>

      <select id="qap-translation"></select>


      <div class="qap-muted" style="margin-top:12px;line-height:1.8">

        Selecting a translation will open the corresponding
        translation page.

      </div>

    </div>

  </div>


  <!-- ================= PLAYBACK INFORMATION PAGE ================= -->

  <div
    id="qap-info-page"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-close-info" class="qap-back-btn">
       <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong>Playback Information</strong>

    </div>


    <div class="qap-section">

      <div class="qap-section-title">
        <i data-lucide="info"></i>
        Current Session
      </div>


      <div
        id="qap-info-page"
        class="qap-muted"
        style="
          margin-top:15px;
          line-height:2;
          white-space:pre-line;
        "
      >
        Player ready.
      </div>

    </div>

  </div>

`;

  // =====================================================
  // 2. ADD PLAYER TO WEBSITE
  // =====================================================

  document.body.appendChild(panel);

  // =========================================
  // INITIALIZE LUCIDE ICONS
  // =========================================

  initializeQapIcons();

  // =====================================================
  // 3.CUSTOM ELEMENT SELECTOR
  // =====================================================

  const $ = (id) => panel.querySelector("#" + id);

  // =====================================================
  // 4. DISPLAY SURAH INFORMATION
  // =====================================================

  $("qap-surah").textContent =
    "Surah " + surahName + " · " + totalAyahs + " Ayahs";

  // =====================================================
  // 5. TRANSLATION OPTIONS FROM WEBSITE
  // =====================================================

  const translationSelect = $("qap-translation");

  const translationLinks = [
    ...document.querySelectorAll(".ayahTranslaBtnDiv[href]"),
  ];

  const translations = [
    ...new Map(translationLinks.map((a) => [a.href, a])).values(),
  ];

  translations.forEach((link) => {
    const option = document.createElement("option");

    option.value = link.href;

    option.textContent = link.textContent.trim() || "Translation";

    option.selected = link.classList.contains("active");

    translationSelect.appendChild(option);
  });

  // =========================================
  // POPULATE AYAH RANGE DROPDOWNS
  // =========================================

  const rangeStartSelect = $("qap-range-start");
  const rangeEndSelect = $("qap-range-end");

  for (let i = 1; i <= totalAyahs; i++) {
    const startOption = document.createElement("option");
    startOption.value = i;
    startOption.textContent = "Ayah " + i;

    rangeStartSelect.appendChild(startOption);

    const endOption = document.createElement("option");
    endOption.value = i;
    endOption.textContent = "Ayah " + i;

    rangeEndSelect.appendChild(endOption);
  }

  rangeStartSelect.value = "1";
  rangeEndSelect.value = "1";

  // =====================================================
  // 6. INITIALIZE PLAYER DISPLAY
  // =====================================================

  $("qap-ayah").textContent = "Ayah 1 / " + totalAyahs;

  $("qap-current").textContent = "00:00";

  $("qap-duration").textContent = "00:00";

  $("qap-progress").style.width = "0%";

  // =====================================================
  // 1. ERROR AND STATUS MANAGEMENT
  // =====================================================

  function showMessage(message, type = "success") {
    const element = $("qap-message");

    if (!element) return;

    element.textContent = message;
    element.className = "qap-message " + type;

    if (type === "error") {
      console.error("Quran Auto Player:", message);
    }
  }

  function showError(message) {
    currentError = message;

    currentStatus = "Error";

    showMessage(message, "error");

    // Also display the error inside Ayah Playback.

    const rangeInfo = $("qap-range-info");

    if (rangeInfo) {
      rangeInfo.textContent = "⚠ Error: " + message;

      rangeInfo.classList.add("qap-range-error");
    }

    updateTimer();
  }

  function showStatus(message) {
    currentError = "";

    currentStatus = message;

    const rangeInfo = $("qap-range-info");

    if (rangeInfo) {
      // Remove previous error styling.

      rangeInfo.classList.remove("qap-range-error");

      // Remove old error text.

      if (rangeInfo.textContent.startsWith("⚠ Error:")) {
        rangeInfo.textContent = "Select your Ayah range.";
      }
    }

    showMessage(message, "success");

    updateTimer();
  }
  // =====================================================
  // 2. SAFE ELEMENT CHECKING
  // =====================================================

  function isPlayerAvailable() {
    return !destroyed && document.body.contains(panel);
  }

  // =====================================================
  // 3. FIND CURRENT AYAH
  // =====================================================

  function findBox(n) {
    const marker = document.querySelector(
      '.tolTopstyle[data-surah-id="' +
        surahId +
        '"][data-ayat-number="' +
        n +
        '"]',
    );

    if (!marker) return null;

    return marker.closest(".ayahTranslateBoxDiv");
  }

  // =====================================================
  // 4. REMOVE PREVIOUS HIGHLIGHTS
  // =====================================================

  function clearHighlight() {
    document.querySelectorAll(".qap-highlight").forEach((element) => {
      element.classList.remove("qap-highlight");
    });
  }

  // =====================================================
  // 5. HIGHLIGHT CURRENT AYAH
  // =====================================================

  function highlightAyah(n, shouldScroll = false) {
    clearHighlight();

    const box = findBox(n);

    if (!box) {
      showError("Ayah " + n + " could not be located on the page.");

      return false;
    }

    const elements = box.querySelectorAll(".arabicQuranText, .ayahTranslaBtnp");

    if (!elements.length) {
      showError(
        "Ayah " + n + " was found, but its text could not be highlighted.",
      );

      return false;
    }

    elements.forEach((element) => {
      element.classList.add("qap-highlight");
    });

    if (shouldScroll) {
      box.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    return true;
  }

  // =====================================================
  // 6. MANUALLY RETURN TO CURRENT PLAYING AYAH
  // =====================================================

  function returnToCurrentAyah() {
    if (!isPlayerAvailable()) return;

    const box = findBox(ayah);

    if (!box) {
      showError(
        "Currently playing Ayah " + ayah + " is not available in the page.",
      );

      return;
    }

    highlightAyah(ayah, true);

    showStatus("Showing currently playing Ayah " + ayah + ".");
  }

  // =====================================================
  // 7. TIME FORMATTING
  // =====================================================

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "00:00";
    }

    const minutes = Math.floor(seconds / 60);

    const remaining = Math.floor(seconds % 60);

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(remaining).padStart(2, "0")
    );
  }

  // =====================================================
  // 8. UPDATE PLAYER INFORMATION
  // =====================================================

  function updateTimer() {
    if (!isPlayerAvailable()) return;

    const current = audio.currentTime || 0;

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

    $("qap-current").textContent = formatTime(current);

    $("qap-duration").textContent = formatTime(duration);

    $("qap-progress").style.width =
      duration > 0 ? Math.min(100, (current / duration) * 100) + "%" : "0%";

    const infoText =
      "Surah: " +
      surahName +
      "\nAyah: " +
      ayah +
      " / " +
      totalAyahs +
      "\nReciter: " +
      $("qap-qari").selectedOptions[0].textContent +
      "\nCurrent Track: " +
      (currentTrack === "arabic" ? "Arabic" : "Urdu") +
      "\nAudio Mode: " +
      audioMode +
      "\nUrdu Translation: " +
      $("qap-urdu-translation").selectedOptions[0].textContent +
      "\nSpeed: " +
      speed +
      "x" +
      "\nPlayback Range: " +
      (rangePlaybackActive
        ? "Ayah " + rangeStart + "–" + rangeEnd
        : "Not active") +
      "\nRepeat: " +
      (rangePlaybackActive
        ? rangeRepeat === 0
          ? "Unlimited"
          : rangeRepeat + " Times"
        : "1 Time") +
      "\nRepeat Method: " +
      (rangeRepeatMode === "each"
        ? "Repeat Each Ayah"
        : "Repeat Entire Range") +
      "\nStatus: " +
      currentStatus;

    $("qap-info-page").textContent = infoText;
  }

  // =====================================================
  // 9. PLAY / PAUSE BUTTON APPEARANCE
  // =====================================================

  function updatePlayButton() {
    if (!isPlayerAvailable()) return;

    const button = $("qap-play");

    const icon =
      running && !audio.paused
        ? `<svg class="qap-icon" viewBox="0 0 24 24"
           fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round">
           <path d="M8 5v14M16 5v14"/>
         </svg>`
        : `<svg class="qap-icon" viewBox="0 0 24 24"
           fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round"
           stroke-linejoin="round">
           <polygon points="6 3 20 12 6 21 6 3"/>
         </svg>`;

    button.innerHTML = icon + (running && !audio.paused ? " Pause" : " Play");

    button.title =
      running && !audio.paused
        ? "Pause recitation"
        : "Play or resume recitation";
  }

  // =====================================================
  // 10. AUDIO EVENT CLEANUP
  // =====================================================

  function removeAudioEvents() {
    audio.oncanplay = null;
    audio.onended = null;
    audio.onerror = null;
    audio.onplaying = null;
    audio.onpause = null;
    audio.onwaiting = null;
    audio.onstalled = null;
    audio.onabort = null;
    audio.ontimeupdate = null;
  }

  // =====================================================
  // 11. AUDIO ERROR DETECTION
  // =====================================================

  function handleAudioError(token, failedURL) {
    if (generation !== token || destroyed) return;

    running = false;

    trackQueue = [];
    trackIndex = 0;

    const code = audio.error?.code;

    let message;

    switch (code) {
      case 1:
        message = "Audio loading was interrupted.";
        break;

      case 2:
        message = "Network error. Check your internet connection.";
        break;

      case 3:
        message = "Audio file could not be decoded.";
        break;

      case 4:
        message = "This reciter's audio file is unavailable or unsupported.";
        break;

      default:
        message = "Unable to load audio. Check your connection and reciter.";
    }
    console.error("Audio error:", {
      surah: surahName,
      ayah,
      qari,
      url: failedURL,
      errorCode: code,
      mediaError: audio.error,
    });

    showError(message);

    updatePlayButton();
  }

  // =====================================================
  // 12. LOAD AYAH AUDIO
  // =====================================================

  function getSelectedTracks() {
    if (audioMode === "arabic") {
      return ["arabic"];
    }

    if (audioMode === "urdu") {
      return ["urdu"];
    }

    return ["arabic", "urdu"];
  }

  // Load a particular language track.
  function loadTrack(n, token) {
    if (!isPlayerAvailable() || !running) return;

    if (token !== generation) return;

    if (trackIndex >= trackQueue.length) {
      loadAyah(n + 1);
      return;
    }

    currentTrack = trackQueue[trackIndex];

    const language = currentTrack;
    const url = audioURL(n, language);

    audio.pause();
    removeAudioEvents();

    showStatus(
      "Loading " + (language === "arabic" ? "Arabic" : "Urdu") + " · Ayah " + n,
    );

    let playbackStarted = false;
    audio.oncanplay = () => {
      if (generation !== token || !running) return;
      if (playbackStarted) return;

      playbackStarted = true;

      audio.playbackRate = speed;

      audio.play().catch((error) => {
        if (generation !== token || !running) return;

        running = false;

        if (error.name === "AbortError") {
          showStatus("Audio loading was interrupted.");
          updatePlayButton();
          return;
        }

        showError(
          error.name === "NotAllowedError"
            ? "Browser blocked playback. Press Play again."
            : "Unable to start audio playback.",
        );

        updatePlayButton();
      });
    };

    audio.onplaying = () => {
      if (generation !== token || !running) return;

      showStatus(
        "Playing " +
          (language === "arabic" ? "Arabic" : "Urdu") +
          " · Ayah " +
          n,
      );

      updatePlayButton();
      updateTimer();
    };

    audio.onended = () => {
      if (generation !== token || !running) return;

      trackIndex++;

      // =========================================
      // NEXT LANGUAGE TRACK
      // =========================================

      if (trackIndex < trackQueue.length) {
        loadTrack(n, token);
      } else {
        // =========================================
        // REPEAT EACH AYAH MODE
        // =========================================

        if (
          rangePlaybackActive &&
          rangeRepeatMode === "each" &&
          (rangeRepeat === 0 || rangeAyahRepeatCount < rangeRepeat - 1)
        ) {
          rangeAyahRepeatCount++;

          trackIndex = 0;

          showStatus(
            rangeRepeat === 0
              ? "Repeating Ayah " + n + " · Unlimited"
              : "Repeating Ayah " +
                  n +
                  " · " +
                  (rangeAyahRepeatCount + 1) +
                  " / " +
                  rangeRepeat,
          );

          loadTrack(n, token);
        } else {
          rangeAyahRepeatCount = 0;

          loadAyah(n + 1);
        }
      }
    };

    audio.onerror = () => {
      if (generation !== token || destroyed) return;

      handleAudioError(token, url);
    };

    audio.ontimeupdate = updateTimer;

    audio.onwaiting = () => {
      if (generation !== token || !running) return;
      showStatus("Buffering " + language + " audio...");
    };

    audio.onstalled = () => {
      if (generation !== token || !running) return;
      showStatus("Audio connection stalled. Waiting...");
    };

    // Start loading only after all event handlers are registered.

    audio.src = url;
    audio.playbackRate = speed;
    audio.load();
  }

  // Load an Ayah and its selected audio tracks.
  function loadAyah(n) {
    if (!isPlayerAvailable() || !running) return;

    // =========================================
    // AYAH RANGE COMPLETION AND REPETITION
    // =========================================

    // =========================================
    // AYAH RANGE COMPLETION
    // =========================================

    if (rangePlaybackActive && n > rangeEnd) {
      // Repeat Entire Range mode.

      if (rangeRepeatMode === "range") {
        rangeRepeatCount++;

        const shouldRepeat =
          rangeRepeat === 0 || rangeRepeatCount < rangeRepeat;

        if (shouldRepeat) {
          rangeAyahRepeatCount = 0;

          showStatus(
            "Repeating entire range · " +
              (rangeRepeat === 0
                ? "Unlimited"
                : rangeRepeatCount + " / " + rangeRepeat),
          );

          loadAyah(rangeStart);

          return;
        }
      }

      // Range completed.

      rangePlaybackActive = false;

      rangeRepeatCount = 0;

      rangeAyahRepeatCount = 0;

      running = false;

      generation++;

      audio.pause();

      audio.currentTime = 0;

      showStatus("Selected Ayah range completed.");

      updatePlayButton();

      updateTimer();

      return;
    }

    if (n > totalAyahs) {
      running = false;
      generation++;

      audio.pause();
      audio.currentTime = 0;

      trackQueue = [];
      trackIndex = 0;

      currentTrack = "arabic";

      $("qap-ayah").textContent = "Surah completed!";

      $("qap-current").textContent = "00:00";

      $("qap-progress").style.width = "100%";

      showStatus("Surah recitation completed.");

      updatePlayButton();
      updateTimer();

      return;
    }

    if (n < 1) n = 1;

    ayah = n;

    const token = ++generation;

    trackQueue = getSelectedTracks();
    trackIndex = 0;

    $("qap-ayah").textContent = "Ayah " + n + " of " + totalAyahs;

    $("qap-current").textContent = "00:00";
    $("qap-duration").textContent = "00:00";
    $("qap-progress").style.width = "0%";

    highlightAyah(n, autoScroll);

    loadTrack(n, token);

    updatePlayButton();
  }

  // =====================================================
  // 13. PLAY FUNCTION
  // =====================================================

  function play() {
    if (!isPlayerAvailable()) return;

    if (running && !audio.paused) {
      pause();

      return;
    }

    running = true;

    // Resume existing paused audio.
    if (audio.src && audio.paused && audio.currentTime > 0 && !audio.ended) {
      const token = generation;

      audio.playbackRate = speed;

      audio
        .play()
        .then(() => {
          if (generation !== token || !running) return;

          showStatus("Resumed recitation.");

          updatePlayButton();
        })
        .catch((error) => {
          if (generation !== token || !running) return;

          running = false;

          if (error.name === "AbortError") {
            showStatus("Audio resume was interrupted.");
            updatePlayButton();
            return;
          }

          console.error("Resume error:", error);

          showError(
            error.name === "NotAllowedError"
              ? "Browser blocked playback. Press Play again."
              : "Unable to resume audio.",
          );

          updatePlayButton();
        });
    } else {
      loadAyah(ayah);
    }

    updatePlayButton();
  }

  // =====================================================
  // 14. PAUSE FUNCTION
  // =====================================================

  function pause() {
    if (!isPlayerAvailable()) return;

    running = false;

    audio.pause();

    showStatus("Recitation paused.");

    updatePlayButton();
    updateTimer();
  }

  // =====================================================
  // 15. JUMP TO AYAH
  // =====================================================

  function jump(n) {
    n = Number(n);

    if (!Number.isInteger(n) || n < 1 || n > totalAyahs) {
      showError("Invalid Ayah number.");
      return;
    }

    // Manual Ayah navigation exits range playback.

    rangePlaybackActive = false;

    rangeRepeatCount = 0;

    rangeAyahRepeatCount = 0;

    $("qap-main-range-info").textContent = "Range: Not selected";

    $("qap-range-info").textContent =
      "Range playback cancelled. Moved to Ayah " + n + ".";

    $("qap-range-info").classList.remove("qap-range-error");

    ayah = n;

    running = true;

    generation++;

    loadAyah(n);

    updatePlayButton();
  }

  // =========================================
  // PLAY SELECTED AYAH RANGE
  // =========================================

  function startRangePlayback() {
    const start = Number($("qap-range-start").value);
    const end = Number($("qap-range-end").value);
    const repeat = Number($("qap-range-repeat").value);

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < 1 ||
      end > totalAyahs ||
      start > end
    ) {
      showError(
        "Invalid Ayah range. End Ayah must be equal to or greater than Start Ayah.",
      );

      return;
    }

    rangeStart = start;
    rangeEnd = end;
    rangeRepeat = repeat;

    rangeRepeatCount = 0;

    rangeAyahRepeatCount = 0;

    rangeRepeatMode = $("qap-repeat-mode").value;

    rangePlaybackActive = true;

    $("qap-main-range-info").textContent =
      "Range: Ayah " +
      rangeStart +
      "–" +
      rangeEnd +
      " · " +
      (rangeRepeat === 0 ? "Unlimited repeats" : rangeRepeat + " repetitions");

    ayah = rangeStart;

    running = true;

    generation++;

    audio.pause();

    showStatus("Starting Ayah range " + rangeStart + " – " + rangeEnd);

    $("qap-range-info").textContent =
      "Playing Ayahs " +
      rangeStart +
      " to " +
      rangeEnd +
      " · " +
      (repeat === 0 ? "Unlimited repetitions" : repeat + " repetitions");

    loadAyah(rangeStart);

    updatePlayButton();
  }

  // =====================================================
  // 16. RESET TO FIRST AYAH
  // =====================================================

  function resetPlayer() {
    if (!isPlayerAvailable()) return;

    // Stop current playback.
    running = false;

    generation++;

    // Reset range playback.
    rangePlaybackActive = false;
    rangeRepeatCount = 0;
    rangeAyahRepeatCount = 0;

    rangeStart = 1;
    rangeEnd = 1;
    rangeRepeat = 1;
    rangeRepeatMode = "range";

    // Reset audio settings.
    audioMode = "both";
    qari = "02";
    urduTranslation = "02";
    speed = 1;

    // Reset reading settings.
    autoScroll = true;

    // Stop and clear audio.
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    removeAudioEvents();

    // Reset dropdowns.
    $("qap-audio-mode").value = "both";
    $("qap-qari").value = "02";
    $("qap-urdu-translation").value = "02";
    $("qap-speed").value = "1";
    $("qap-scroll").checked = true;

    $("qap-range-start").value = "1";
    updateEndAyahOptions();
    $("qap-range-end").value = "1";
    $("qap-range-repeat").value = "1";
    $("qap-repeat-mode").value = "range";

    // Reset Ayah.
    ayah = 1;

    currentTrack = "arabic";
    trackQueue = [];
    trackIndex = 0;

    // Clear highlights.
    clearHighlight();

    // Reset player display.
    $("qap-ayah").textContent = "Ayah 1 / " + totalAyahs;
    $("qap-current").textContent = "00:00";
    $("qap-duration").textContent = "00:00";
    $("qap-progress").style.width = "0%";

    // Reset range information.
    $("qap-main-range-info").textContent = "Range: Not selected";

    $("qap-range-info").textContent = "Select your Ayah range.";

    $("qap-range-info").classList.remove("qap-range-error");

    // Clear error.
    currentError = "";

    showStatus("All settings restored to default.");

    updatePlayButton();

    updateTimer();
  }

  // =====================================================
  // END OF PART 3/4
  //
  // NEXT:
  // PART 4/4 — CONTROLS, SETTINGS,
  // END CLEANUP AND FINAL INITIALIZATION
  // =====================================================

  // =====================================================
  // QURAN AUTO PLAYER
  // PART 4/4 — FINAL CONTROLS & INITIALIZATION
  // =====================================================

  // =====================================================
  // 1. TRANSLATION CHANGE
  // =====================================================

  translationSelect.onchange = () => {
    const selectedURL = translationSelect.value;

    if (!selectedURL) return;

    showStatus("Changing translation...");

    endPlayer(true);

    location.href = selectedURL;
  };

  // =====================================================
  // 2. PLAY / PAUSE BUTTON
  // =====================================================

  $("qap-play").onclick = () => {
    if (running && !audio.paused) {
      pause();
    } else {
      play();
    }
  };

  // =====================================================
  // 3. PREVIOUS AYAH
  // =====================================================

  $("qap-prev").onclick = () => {
    if (ayah <= 1) {
      showError("You are already at the first Ayah.");

      return;
    }

    jump(ayah - 1);
  };

  // =====================================================
  // 4. NEXT AYAH
  // =====================================================

  $("qap-next").onclick = () => {
    if (ayah >= totalAyahs) {
      showError("You are already at the last Ayah.");

      return;
    }

    jump(ayah + 1);
  };

  // =====================================================
  // 5. RESET BUTTON
  // =====================================================

  $("qap-reset").onclick = resetPlayer;

  // =====================================================
  // 6. END BUTTON
  // =====================================================

  $("qap-end").onclick = () => {
    endPlayer(true);
  };

  // =====================================================
  // 7. CURRENT AYAH BUTTON
  // =====================================================

  $("qap-return").onclick = returnToCurrentAyah;

  // =====================================================
  // 8. EXPAND / COLLAPSE SETTINGS
  // =====================================================

  // Open Settings Home.

  $("qap-expand").onclick = () => {
    openInternalPage("settings");
  };

  // Return to Main Player.

  $("qap-settings-back").onclick = () => {
    showPage("main");
  };

  // =========================================
  // AUDIO SETTINGS POPUP
  // =========================================
  // =========================================
  // INTERNAL PAGE NAVIGATION
  // =========================================

  // =========================================
  // COMPLETE INTERNAL NAVIGATION
  // =========================================

  let currentPage = "main";

  function showPage(page) {
    currentPage = page;

    panel.querySelectorAll(".qap-internal-page").forEach((element) => {
      element.scrollTop = 0;
    });

    const pages = {
      settings: "qap-settings-home",
      audio: "qap-audio-popup",
      range: "qap-range-popup",
      reading: "qap-reading-page",
      translation: "qap-translation-page",
      info: "qap-info-page",
    };

    // Show only the selected internal page.
    Object.entries(pages).forEach(([name, id]) => {
      const element = $(id);

      if (element) {
        element.hidden = page !== name;
      }
    });

    // Main player elements.
    const mainElements = [
      ".qap-header",
      ".qap-ayah-info",
      "#qap-main-range-info",
      ".qap-progress",
      ".qap-time-row",
      ".qap-controls",
      ".qap-secondary",
      ".qap-return-btn",
      ".qap-settings",
      ".qap-message",
    ];

    mainElements.forEach((selector) => {
      panel.querySelectorAll(selector).forEach((element) => {
        element.style.display = page === "main" ? "" : "none";
      });
    });

    panel.style.width = page === "main" ? "330px" : "350px";

    panel.style.height = page === "main" ? "" : "min(430px, 80vh)";

    panel.style.maxHeight = page === "main" ? "" : "80vh";
  }

  // Internal page navigation is handled by the
  // complete definitions immediately below.

  function openInternalPage(page) {
    showPage(page);

    if (page === "range") {
      if (currentError) {
        $("qap-range-info").textContent = "⚠ Error: " + currentError;

        $("qap-range-info").classList.add("qap-range-error");
      }
    }
  }

  function closeInternalPages() {
    showPage("settings");
  }

  // Audio Settings navigation.

  $("qap-open-audio").onclick = () => {
    openInternalPage("audio");
  };

  $("qap-close-audio").onclick = closeInternalPages;

  // =========================================
  // READING SETTINGS NAVIGATION
  // =========================================

  $("qap-open-reading").onclick = () => {
    openInternalPage("reading");
  };

  $("qap-close-reading").onclick = closeInternalPages;

  // =========================================
  // TRANSLATION NAVIGATION
  // =========================================

  $("qap-open-translation").onclick = () => {
    openInternalPage("translation");
  };

  $("qap-close-translation").onclick = closeInternalPages;

  // =========================================
  // PLAYBACK INFORMATION NAVIGATION
  // =========================================

  $("qap-open-info").onclick = () => {
    openInternalPage("info");
    updateTimer();
  };

  $("qap-close-info").onclick = closeInternalPages;

  // Ayah Playback navigation.

  $("qap-open-range").onclick = () => {
    openInternalPage("range");
  };

  // =========================================
  // DYNAMIC END AYAH DROPDOWN
  // =========================================

  function updateEndAyahOptions() {
    const start = Number($("qap-range-start").value);

    const endSelect = $("qap-range-end");

    const previousEnd = Number(endSelect.value);

    endSelect.innerHTML = "";

    for (let i = start; i <= totalAyahs; i++) {
      const option = document.createElement("option");

      option.value = i;

      option.textContent = "Ayah " + i;

      endSelect.appendChild(option);
    }

    // Preserve the previous selection when valid.

    endSelect.value = String(
      previousEnd >= start && previousEnd <= totalAyahs ? previousEnd : start,
    );
  }

  $("qap-range-start").onchange = updateEndAyahOptions;

  // Initialize dependent dropdown.

  updateEndAyahOptions();

  $("qap-close-range").onclick = closeInternalPages;

  // Listen to selected Ayah range.

  $("qap-range-listen").onclick = () => {
    // Read latest settings.

    rangeRepeatMode = $("qap-repeat-mode").value;

    startRangePlayback();
  };

  // Move to selected Ayah without starting audio.

  $("qap-range-move").onclick = () => {
    const start = Number($("qap-range-start").value);

    const end = Number($("qap-range-end").value);

    // Validate selected range.

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start ||
      end > totalAyahs
    ) {
      showError("Please select a valid Ayah range.");

      return;
    }

    // Verify that the selected Ayah exists.

    const box = findBox(start);

    if (!box) {
      showError("Ayah " + start + " could not be located.");

      return;
    }

    // Stop existing playback.

    running = false;

    generation++;

    audio.pause();

    audio.removeAttribute("src");

    audio.load();

    // Clear existing track information.

    trackQueue = [];

    trackIndex = 0;

    // Exit previous range playback.

    rangePlaybackActive = false;

    rangeRepeatCount = 0;

    rangeAyahRepeatCount = 0;

    // Update selected range.

    rangeStart = start;

    rangeEnd = end;

    // Update current Ayah.

    ayah = start;

    $("qap-ayah").textContent = "Ayah " + ayah + " / " + totalAyahs;

    // Update main player range information.

    $("qap-main-range-info").textContent = "Range: Ayah " + start + "–" + end;

    // Reset progress display.

    $("qap-current").textContent = "00:00";

    $("qap-duration").textContent = "00:00";

    $("qap-progress").style.width = "0%";

    // Highlight and scroll to selected Ayah.

    highlightAyah(start, true);

    // Update range information.

    $("qap-range-info").textContent =
      "Moved to Ayah " + start + ". Press Listen to start playback.";

    $("qap-range-info").classList.remove("qap-range-error");

    showStatus("Moved to Ayah " + start + ". Ready to play.");

    updatePlayButton();

    updateTimer();
  };

  // =====================================================
  // 9. PLAYBACK SPEED
  // =====================================================

  $("qap-speed").onchange = () => {
    const newSpeed = Number($("qap-speed").value);

    if (!Number.isFinite(newSpeed) || newSpeed < 0.5 || newSpeed > 2) {
      showError("Invalid playback speed.");

      return;
    }

    speed = newSpeed;

    audio.playbackRate = speed;

    showStatus("Playback speed set to " + speed + "x.");

    updateTimer();
  };

  // =====================================================
  // 10. AUTOMATIC SCROLL SETTING
  // =====================================================

  $("qap-scroll").onchange = () => {
    autoScroll = $("qap-scroll").checked;

    if (autoScroll) {
      showStatus("Automatic Ayah scrolling enabled.");

      returnToCurrentAyah();
    } else {
      showStatus("Automatic scrolling disabled. Use Current Ayah to return.");
    }
  };

  // =====================================================
  // 11. RECITER SELECTION
  // =====================================================

  $("qap-qari").onchange = () => {
    const wasPlaying = running;
    const currentAyah = ayah;

    qari = $("qap-qari").value;

    generation++;

    audio.pause();

    audio.removeAttribute("src");
    audio.load();

    running = false;

    if (wasPlaying) {
      ayah = currentAyah;
      running = true;
      loadAyah(currentAyah);
    } else {
      showStatus("Reciter changed. Ready to continue.");
    }

    updatePlayButton();
    updateTimer();
  };

  $("qap-audio-mode").onchange = () => {
    audioMode = $("qap-audio-mode").value;

    const wasPlaying = running;
    const currentAyah = ayah;

    generation++;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    running = false;

    if (wasPlaying) {
      running = true;
      ayah = currentAyah;
      loadAyah(currentAyah);
    } else {
      trackQueue = getSelectedTracks();
      trackIndex = 0;

      showStatus("Audio mode changed to " + audioMode + ".");
    }

    updatePlayButton();
    updateTimer();
  };

  $("qap-urdu-translation").onchange = () => {
    urduTranslation = $("qap-urdu-translation").value;

    const wasPlaying = running;
    const currentAyah = ayah;

    generation++;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    running = false;

    if (wasPlaying) {
      running = true;
      ayah = currentAyah;
      loadAyah(currentAyah);
    } else {
      showStatus("Urdu translation changed.");
    }

    updatePlayButton();
    updateTimer();
  };

  // =====================================================
  // 12. PREVENT INVALID SETTINGS
  // =====================================================

  updateTimer();
  // =====================================================
  // 13. PLAYER END / COMPLETE CLEANUP
  // =====================================================

  function endPlayer(removePanel = true) {
    if (destroyed) return;

    running = false;

    generation++;

    trackQueue = [];
    trackIndex = 0;

    destroyed = true;

    // Stop audio.
    audio.pause();

    removeAudioEvents();

    audio.removeAttribute("src");

    audio.load();

    // Clear player timer.
    if (timer) {
      clearInterval(timer);

      timer = null;
    }

    // Remove highlighting.
    clearHighlight();

    // Remove injected CSS.
    css.remove();

    // Remove player panel.
    if (removePanel) {
      panel.remove();
    }

    // Release audio reference.
    audio = null;

    // Remove public controls.
    delete window.quranAutoPlayer;

    window.removeEventListener("pagehide", handlePageUnload);

    window.removeEventListener("error", handlePlayerError);

    window.removeEventListener("unhandledrejection", handleUnhandledRejection);

    console.log("Quran Auto Player: Completely stopped and cleaned up.");
  }

  // =====================================================
  // 14. HANDLE WEBSITE PAGE UNLOAD
  // =====================================================

  function handlePageUnload() {
    if (!destroyed) {
      running = false;

      generation++;

      if (audio) {
        audio.pause();

        removeAudioEvents();
      }

      if (timer) {
        clearInterval(timer);

        timer = null;
      }
    }
  }

  window.addEventListener("pagehide", handlePageUnload, { once: true });

  // =====================================================
  // 15. GLOBAL ERROR HANDLING
  // =====================================================

  function handlePlayerError(event) {
    if (!isPlayerAvailable()) return;

    const error = event?.error;

    const message =
      error?.message ||
      event?.message ||
      "An unexpected player error occurred.";

    showError("Player error: " + message);

    console.error("Quran Auto Player unexpected error:", error || event);
  }

  function handleUnhandledRejection(event) {
    if (!isPlayerAvailable()) return;

    const reason = event?.reason;

    const message =
      reason?.message || String(reason || "Unknown playback error.");

    showError("Playback error: " + message);

    console.error("Quran Auto Player rejected operation:", reason);
  }

  window.addEventListener("error", handlePlayerError);

  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  // =====================================================
  // 16. PUBLIC PLAYER CONTROLS
  // =====================================================

  window.quranAutoPlayer = {
    start: play,

    pause,

    stop: () => endPlayer(true),

    reset: resetPlayer,

    jump,

    returnToCurrentAyah,

    destroy: () => endPlayer(true),

    get ayah() {
      return ayah;
    },

    get surah() {
      return surahName;
    },

    get running() {
      return running;
    },

    get destroyed() {
      return destroyed;
    },
  };

  // =====================================================
  // 17. START TIMER
  // =====================================================

  timer = setInterval(() => {
    if (!destroyed) {
      updateTimer();
    }
  }, 300);

  // =====================================================
  // 18. INITIALIZE DISPLAY
  // =====================================================

  updateTimer();

  updatePlayButton();

  showStatus("Ready. Press Play to begin recitation.");

  // =====================================================
  // 19. FINAL CONSOLE INFORMATION
  // =====================================================

  console.log("========================================");

  console.log("QURAN AUTO PLAYER INSTALLED SUCCESSFULLY");

  console.log("========================================");

  console.log({
    surah: surahName,

    surahId,

    totalAyahs: totalAyahs,

    initialAyah: ayah,

    reciter: qari,

    audioPatterns: {
      arabic: audioURL(1, "arabic"),
      urdu: audioURL(1, "urdu"),
    },

    automaticScrolling: autoScroll,
  });
})();

// =====================================================
// END OF PART 4/4
// QURAN AUTO PLAYER INSTALLATION COMPLETE
// =====================================================
