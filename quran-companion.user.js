// ==UserScript==
// @name         Quran Companion - Dawat-e-Islami
// @author       AyahByte
// @namespace    https://www.dawateislami.net/
// @version      1.0.0
// @description  Professional Quran Media Player with Audio, Ayah Playback, Reading and Sound Settings
// @homepage     https://github.com/examlycbt-offline/quran-companion
// @supportURL   https://github.com/examlycbt-offline/quran-companion/issues
// @downloadURL  https://raw.githubusercontent.com/examlycbt-offline/quran-companion/main/quran-companion.user.js
// @updateURL    https://raw.githubusercontent.com/examlycbt-offline/quran-companion/main/quran-companion.user.js
// @match        https://www.dawateislami.net/quran/surah-*/translation-*
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @require      https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js
// ==/UserScript==


(() => {
  "use strict";

  /*
   * SCRIPT MAP
   * 1. Gemini research worker and request bridge
   * 2. Website validation and player bootstrap
   * 3. Player state and audio configuration
   * 4. Player styles
   * 5. Interface markup
   * 6. DOM setup, diagnostics, and shared Ayah helpers
   * 7. Audio playback engine and player actions
   * 8. Settings pages, device controls, and research UI
   * 9. Playback, reading, and audio setting handlers
   * 10. Lifecycle, public API, and startup
   */

  // ---------------------------------------------------------------------------
  // 1. GEMINI RESEARCH WORKER
  // ---------------------------------------------------------------------------

  const GEMINI_HOST = "gemini.google.com";
  const RESEARCH_START_MARKER = "<!-- QAP_RESEARCH_START -->";
  const RESEARCH_COMPLETE_MARKER = "<!-- QAP_RESEARCH_COMPLETE -->";

  if (location.hostname === GEMINI_HOST) {
    runGeminiResearchWorker();
    return;
  }

  async function runGeminiResearchWorker() {
    const params = new URLSearchParams(location.search);
    const requestId = params.get("qap_request");
    const directPrompt = params.get("qap_prompt");
    if (!requestId && !directPrompt) return;

    const requestKey = requestId ? "qap_research_request_" + requestId : "";
    const resultKey = requestId ? "qap_research_result_" + requestId : "";
    let returnHtml = false;
    let workerStage = "initializing";
    const reportProgress = async (message, status = "progress") => {
      if (!resultKey || !returnHtml) return;
      try {
        await GM_setValue(resultKey, {
          status,
          stage: workerStage,
          message,
          updatedAt: Date.now(),
        });
      } catch (error) {
        console.warn("Quran Companion could not update research progress:", {
          stage: workerStage,
          error,
        });
      }
    };
    const ensureRequestActive = async () => {
      if (requestId && returnHtml && !(await GM_getValue(requestKey))) {
        const error = new Error("In-app research was cancelled by the user.");
        error.name = "AbortError";
        throw error;
      }
    };

    const reportFailure = async (message, cause = null) => {
      const friendlyMessage = "AI research could not complete after multiple attempts. Please try again.";
      if (!resultKey) {
        console.error("Quran Companion research worker failed:", {
          stage: workerStage,
          message,
          requestId,
          cause,
          stack: cause?.stack || new Error(message).stack,
        });
        return;
      }

      try {
        await GM_setValue(resultKey, {
          status: "error",
          message: friendlyMessage,
          stage: workerStage,
          stack: cause?.stack || new Error(message).stack,
        });
      } catch (error) {
        console.error("Quran Companion could not report Gemini worker failure:", {
          stage: workerStage,
          message,
          cause,
          error,
        });
      }
    };

    const clearBlockingOverlays = () => {
      const overlaySelectors = [
        '[role="dialog"]',
        '[aria-modal="true"]',
        '.modal',
        '.overlay',
        '.mat-dialog-container',
        '.mat-focus-indicator',
        '.sign-in-dialog',
        '.signin-dialog',
        '.login-dialog',
        '.gmat-dialog',
      ];

      overlaySelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          if (!element || !element.parentNode) return;
          const text = (element.textContent || "").trim();
          const isOverlayCandidate = text.length === 0 || /sign in|log in|login|continue to|google account|welcome/i.test(text);
          if (isOverlayCandidate && element !== document.body) {
            element.remove();
          }
        });
      });
    };

    const isGeminiSignInPromptVisible = () => {
      const signInElements = document.querySelectorAll('.mat-focus-indicator');
      for (const element of signInElements) {
        const text = (element.textContent || "") + " " + (element.innerText || "");
        if (/(sign in|log in|login|continue to|google account)/i.test(text)) {
          return true;
        }
      }
      return false;
    };

    const resetGeminiSessionAndReload = async () => {
      try {
        document.cookie.split(';').forEach((cookie) => {
          const name = cookie.split('=')[0].trim();
          if (!name) return;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.google.com`;
        });
      } catch (error) {
        console.warn("Quran Companion could not clear Gemini cookies:", error);
      }

      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (error) {
        console.warn("Quran Companion could not clear Gemini storage:", error);
      }

      try {
        if (window.indexedDB) {
          indexedDB.databases?.().then((databases) => {
            databases.forEach((db) => {
              if (db.name) indexedDB.deleteDatabase(db.name);
            });
          }).catch(() => {});
        }
      } catch (error) {
        console.warn("Quran Companion could not clear Gemini indexedDB:", error);
      }

      location.reload();
    };

    try {
      workerStage = "checking-storage";
      if (
        typeof GM_getValue !== "function" ||
        typeof GM_setValue !== "function"
      ) {
        throw new Error("Tampermonkey storage is unavailable on Gemini.");
      }

      if (requestId && sessionStorage.getItem("qap-worker-" + requestId)) return;
      if (requestId) sessionStorage.setItem("qap-worker-" + requestId, "started");

      let request;
      if (requestId) {
        request = await GM_getValue(requestKey);
        if (!request || typeof request.prompt !== "string" || !request.prompt.trim()) {
          throw new Error("The research request was not found. Please try again.");
        }
      } else {
        request = {
          prompt: directPrompt,
          returnHtml: false,
        };
      }
      returnHtml = request.returnHtml === true;
      if (returnHtml) {
        workerStage = "loading-gemini";
        await reportProgress("Connected to Gemini. Waiting for its prompt box to load.");
      }

      const inputSelectors = [
        'div.ql-editor[contenteditable="true"][aria-label="Enter a prompt for Gemini"]',
        '.ql-editor[contenteditable="true"]',
        'rich-textarea [contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
      ];
      let inputBox = null;
      for (let attempt = 0; attempt < 120 && !inputBox; attempt++) {
        clearBlockingOverlays();
        if (isGeminiSignInPromptVisible()) {
          await resetGeminiSessionAndReload();
          return;
        }
        inputBox = inputSelectors.map((selector) => document.querySelector(selector)).find(Boolean);
        if (!inputBox) {
          if (returnHtml && attempt > 0 && attempt % 20 === 0) {
            await reportProgress("Gemini is still loading its prompt box. Please keep this research window open.");
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!inputBox) {
        const blockingPromptMessage = "Gemini is currently blocked by a sign-in, login, or overlay screen. Please allow access to gemini.google.com and try again.";
        if (returnHtml && resultKey) {
          await GM_setValue(resultKey, {
            status: "error",
            stage: "prompt-box-not-found",
            message: blockingPromptMessage,
          });
        }
        throw new Error(blockingPromptMessage);
      }

      const responseSelectors = [
        "div.markdown.markdown-main-panel",
        '[data-message-author-role="model"] .markdown',
        "model-response .markdown",
        ".model-response-text",
        "message-content",
      ];
      const findResponses = () => {
        const nodes = responseSelectors.flatMap((selector) =>
          [...document.querySelectorAll(selector)],
        );
        return [...new Set(nodes)];
      };
      const previousResponseCount = findResponses().length;

      const sendPrompt = async (prompt) => {
        await ensureRequestActive();
        workerStage = "sending-prompt";
        await reportProgress("Gemini is ready. Sending the Quran research instructions.");
        inputBox.focus();
        inputBox.innerText = prompt;
        inputBox.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: prompt,
        }));
        inputBox.dispatchEvent(new Event("change", { bubbles: true }));

        await new Promise((resolve) => setTimeout(resolve, 700));
        await ensureRequestActive();
        const sendButton = document.querySelector(
          'button[aria-label*="Send"], button[data-testid*="send"], button[aria-label*="Submit"]',
        );
        if (sendButton && !sendButton.disabled) {
          sendButton.click();
        } else {
          ["keydown", "keypress", "keyup"].forEach((type) => {
            inputBox.dispatchEvent(new KeyboardEvent(type, {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            }));
          });
        }
        workerStage = "waiting-for-answer";
        await reportProgress("Research prompt sent. Waiting for Gemini to finish its answer.");
      };

      const extractMarkedAnswer = (response) => {
        const code = response.querySelector("pre code");
        let content = code ? code.textContent : response.innerHTML;
        content = content
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'");
        const start = content.indexOf("QAP_RESEARCH_START");
        const end = content.indexOf("QAP_RESEARCH_COMPLETE");
        if (start < 0 || end <= start) return null;

        const startTagEnd = content.indexOf("-->", start);
        const endTagStart = content.lastIndexOf("<!--", end);
        const answerStart = startTagEnd >= 0 ? startTagEnd + 3 : start + "QAP_RESEARCH_START".length;
        const answerEnd = endTagStart > answerStart ? endTagStart : end;
        const answer = content.slice(answerStart, answerEnd).trim();
        return answer || null;
      };

      const waitForGeminiCompletion = async (afterResponseCount) => {
        const stopSelectors = [
          'button[aria-label*="Stop"]',
          'button[data-test-id*="stop"]',
          'button[data-testid*="stop"]',
          "button.stop-button",
        ];
        let hasStarted = false;
        let lastProgressAt = Date.now();

        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await ensureRequestActive();
          const stopButton = stopSelectors
            .map((selector) => document.querySelector(selector))
            .find((button) => {
              if (!button) return false;
              const style = getComputedStyle(button);
              return (
                button.getClientRects().length > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden"
              );
            });

          if (stopButton) {
            hasStarted = true;
            if (Date.now() - lastProgressAt >= 15000) {
              await reportProgress("Gemini is generating the answer. This may take a little while.");
              lastProgressAt = Date.now();
            }
            continue;
          }

          if (hasStarted) {
            workerStage = "checking-answer";
            await reportProgress("Gemini finished generating. Checking the answer boundaries.");
            const responses = findResponses();
            const latest = responses.length > afterResponseCount
              ? responses[responses.length - 1]
              : null;
            return { response: latest };
          }

          if (Date.now() - lastProgressAt >= 15000) {
            await reportProgress("Waiting for Gemini to begin generating the answer. The search is still active.");
            lastProgressAt = Date.now();
          }
        }
      };

      if (!returnHtml) {
        await sendPrompt(request.prompt);
        return;
      }

      const MAX_RESEARCH_RETRIES = 3;
      let responseCount = previousResponseCount;
      let attempt = 0;
      let prompt = request.prompt;

      while (attempt < MAX_RESEARCH_RETRIES) {
        await sendPrompt(prompt);
        const completion = await waitForGeminiCompletion(responseCount);
        const markedAnswer = completion.response
          ? extractMarkedAnswer(completion.response)
          : null;

        if (markedAnswer) {
          if (resultKey) {
            workerStage = "returning-answer";
            await reportProgress("Complete answer received. Preparing it for the in-app reader.");
            await GM_setValue(resultKey, { html: markedAnswer });
            setTimeout(() => window.close(), 2000);
          }
          return;
        }

        attempt++;
        if (attempt >= MAX_RESEARCH_RETRIES) {
          const limitMessage =
            "AI research could not complete after multiple attempts. Please try again.";
          if (resultKey) {
            workerStage = "retry-limit-reached";
            await GM_setValue(resultKey, {
              status: "error",
              stage: workerStage,
              message: limitMessage,
            });
          }
          try {
            if (window && !window.closed) {
              window.close();
            }
          } catch (error) {
            console.warn("Quran Companion could not close the Gemini research window:", error);
          }
          throw new Error(limitMessage);
        }

        if (resultKey) {
          workerStage = "retrying-answer";
          await GM_setValue(resultKey, {
            status: "retrying",
            attempt,
            stage: workerStage,
            message: "Gemini finished, but the answer was missing required boundaries. Retrying with the original Quran research instructions (attempt " + attempt + ").",
          });
        }

        responseCount = findResponses().length;
        prompt = [
          "Please try again and complete the Quran research using the original instructions below.",
          "Your previous completed answer did not include both required answer boundary markers, so it could not be transferred to the in-app reader.",
          "Return the complete answer as a semantic HTML fragment only. Do not use Markdown fences. Include every requested section and the exact accuracy disclaimer from the original prompt.",
          `Put ${RESEARCH_START_MARKER} alone immediately before the answer's first HTML element.`,
          `Put ${RESEARCH_COMPLETE_MARKER} alone immediately after the final answer element and disclaimer.`,
          "Do not omit, alter, or place either marker inside another element.",
          "",
          "ORIGINAL QURAN RESEARCH PROMPT:",
          request.prompt,
        ].join("\n");
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      await reportFailure(error?.message || "Gemini research failed unexpectedly.", error);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. WEBSITE VALIDATION AND PLAYER BOOTSTRAP
  // ---------------------------------------------------------------------------

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

  // Replace any player instance already attached to this page.

  // Destroy the previous Quran player, if it exists
  window.quranAutoPlayer?.destroy?.();

  // Remove previous player interface and styles
  document.querySelector("#quran-auto-panel")?.remove();
  document.querySelector("#quran-auto-player-style")?.remove();

  // Read and validate Surah metadata from the page.

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

  // ---------------------------------------------------------------------------
  // 3. PLAYER STATE AND AUDIO CONFIGURATION
  // ---------------------------------------------------------------------------

  let ayah = 0;

  let running = false;
  let expanded = false;
  let trackCanResume = false;
  let bufferingTimer = null;

  let autoScroll = true;
  let readingAutoScroll = true;
  let readingScrollIntervalSeconds = 5;
  let readingScrollTimer = null;
  let readingScrollAyah = 0;
  let hifzModeEnabled = false;
  let hifzRevealSeconds = 5;
  let hifzRevealTimer = null;
  let hifzContext = "none";

  let speed = 1;

  let seekPercent = 10;

  let generation = 0;

  let timer = null;

  let qari = "02";

  let destroyed = false;

  let currentError = "";

  let currentStatus = "Ready to play";

  // =========================================
  // AYAH RANGE PLAYBACK SETTINGS
  // =========================================

  let rangeStart = 0;

  let rangeEnd = 0;

  let rangeRepeat = 1;

  let rangeRepeatCount = 0;

  let rangeRepeatMode = "range";

  let rangeAyahRepeatCount = 0;

  let rangePlaybackActive = false;
  let rangeSelected = false;

  let audio = new Audio();

  audio.preload = "auto";

  let arabicVolume = 1;
  let urduVolume = 1;
  let arabicMuted = false;
  let urduMuted = false;
  let selectedAudioOutput = "";

  // Build audio URLs from the current Surah, reciter, and track.

  let audioMode = "both";
  let trackIntervalSeconds = 1;
  let trackGapTimer = null;
  let trackGapStartedAt = 0;
  let trackGapRemainingMs = 0;
  let pendingTrackAdvance = null;

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

    const normalized = Number(n);
    const isBismillahAyah = normalized === 0;

    const folder = isBismillahAyah ? "001" : String(surahId).padStart(3, "0");
    const ayahNumber = isBismillahAyah ? "000" : String(normalized).padStart(3, "0");

    const code = language === "arabic" ? qari : urduTranslation;

    const prefix = language === "arabic" ? "A" : "U";

    return (
      audioBase + folder + "/" + prefix + code + folder + ayahNumber + ".mp3"
    );
  }

  // Initialize Lucide icons when the library is available.

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
  // ---------------------------------------------------------------------------
  // 4. PLAYER STYLES
  // ---------------------------------------------------------------------------

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

  .qap-range-boundary {
    background-color: rgba(150,160,157,.055) !important;
    outline: 1px solid rgba(170,180,177,.48) !important;
    outline-offset: 3px;
    border-radius: 8px;
  }

  .qap-hifz-hidden {
    position: relative !important;
    color: transparent !important;
    text-shadow: none !important;
  }

  .qap-hifz-hidden * {
    color: transparent !important;
    text-shadow: none !important;
  }

  .qap-hifz-hidden::after {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    color: #15583b !important;
    background: linear-gradient(135deg, rgba(255,235,174,.96), rgba(247,214,124,.96));
    border: 1px solid rgba(133,101,28,.32);
    border-radius: 9px;
    box-shadow: 0 2px 8px rgba(37,66,47,.12);
    content: attr(data-qap-hifz-message);
    font-family: sans-serif;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.5;
    text-align: center;
    text-shadow: none !important;
    z-index: 1;
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
  font-size: 22px;
  font-weight: 800;
  text-align: center;
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
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: rgba(255,229,161,.78);
  background: rgba(246,196,83,.055);
  border: 1px solid rgba(246,196,83,.2);
  /* Essential for the 3D pop effect to feel fluid */
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
}

#quran-auto-panel #qap-ayah-details .qap-icon {
  width: 16px;
  height: 16px;
  opacity: .82;
  stroke-width: 1.8;
}

#quran-auto-panel #qap-ayah-details:hover {
  color: var(--qap-gold-light);
  background: rgba(246,196,83,.12);
  border-color: rgba(246,196,83,.48);
  /* Scales the button up slightly (105%), bringing it "closer" on the Z-axis */
  transform: scale(1.08);

  /* A larger, softer shadow simulates the button lifting off the screen toward you */
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

#quran-auto-panel #qap-ayah-details:hover .qap-icon {
  opacity: 1;
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
  font-size: 19px;
  font-weight: 700;
  text-align: center;
  line-height: 1.3;
}

#quran-auto-panel .qap-ayah-info > div:first-child {
  text-align: left;
}

#quran-auto-panel .qap-now-playing {
  margin-bottom: 3px;
  font-size: 9px;
  line-height: 1.2;
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
  z-index: 1;
  bottom: 4px;
  padding: 2px 4px;
  color: #fff;
  background: #17432f;
  border: 1px solid rgba(255,255,255,.25);
  border-radius: 8px;
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
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

  #quran-auto-panel .qap-sound-level {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 5px 12px;
    margin-top: 16px;
  }

  #quran-auto-panel .qap-sound-level label {
    margin: 0;
  }

  #quran-auto-panel .qap-sound-level output {
    color: var(--qap-gold-light);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  #quran-auto-panel .qap-sound-slider {
    grid-column: 1 / -1;
    width: 100%;
    accent-color: var(--qap-gold);
  }

  #quran-auto-panel .qap-sound-mute,
  #quran-auto-panel .qap-sound-device-refresh,
  #quran-auto-panel .qap-sound-mic-test {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 38px;
    padding: 8px 12px;
    color: #f2f7f3;
    background: rgba(255,255,255,.09);
    border: 1px solid rgba(255,255,255,.17);
    border-radius: 9px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  #quran-auto-panel .qap-sound-mute:hover,
  #quran-auto-panel .qap-sound-device-refresh:hover,
  #quran-auto-panel .qap-sound-mic-test:hover {
    color: var(--qap-gold-light);
    background: rgba(246,196,83,.12);
  }

  #quran-auto-panel .qap-sound-device-status {
    margin-top: 10px;
    color: var(--qap-muted);
    font-size: 10px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  #quran-auto-panel .qap-sound-device-status[data-state="error"] {
    color: #ffb6ad;
  }

  #quran-auto-panel .qap-sound-device-status[data-state="success"] {
    color: var(--qap-success);
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
    margin: 5px 0 14px;
    padding: 13px 14px;

    background: linear-gradient(135deg, rgba(246,196,83,.13), rgba(255,255,255,.055));

    border: 1px solid rgba(246,196,83,.22);
    border-radius: 11px;
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
    margin-top: 11px;
    padding: 11px 13px 5px;

    background: rgba(255,255,255,.055);

    border: 1px solid rgba(255,255,255,.12);
    border-radius: 10px;
  }

  #quran-auto-panel .qap-info-group-title {
    display: flex;
    align-items: center;
    gap: 8px;

    margin-bottom: 5px;

    color: var(--qap-gold);
    font-size: 12px;
    font-weight: 700;
  }

  #quran-auto-panel .qap-info-fact {
    display: grid;
    grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
    align-items: start;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,.09);
  }

  #quran-auto-panel .qap-info-fact:last-child {
    border-bottom: none;
  }

  #quran-auto-panel .qap-info-fact span {
    color: var(--qap-muted);
    font-size: 11px;
    line-height: 1.5;
  }

  #quran-auto-panel .qap-info-fact strong {
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    text-align: right;
    overflow-wrap: anywhere;
  }

  #quran-auto-panel .qap-info-fact-status strong {
    color: var(--qap-success);
  }

  #quran-auto-panel .qap-research-section {
    margin-top: 16px;
    padding-top: 13px;
    border-top: 1px solid rgba(255,255,255,.13);
  }

  #quran-auto-panel .qap-research-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
  }

  #quran-auto-panel .qap-research-section-title .qap-icon {
    width: 16px;
    height: 16px;
    color: var(--qap-gold);
  }

  #quran-auto-panel .qap-research-language-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    margin-top: 11px;
  }

  #quran-auto-panel .qap-language-option {
    position: relative;
    display: block;
    min-width: 0;
    margin: 0;
    cursor: pointer;
  }

  #quran-auto-panel .qap-language-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  #quran-auto-panel .qap-language-option span {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 34px;
    padding: 5px 3px;
    color: #e5eee9;
    background: rgba(255,255,255,.055);
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }

  #quran-auto-panel .qap-language-option .qap-icon {
    display: none;
    width: 12px;
    height: 12px;
  }

  #quran-auto-panel .qap-language-option input:checked + span {
    color: var(--qap-gold-light);
    background: rgba(246,196,83,.13);
    border-color: rgba(246,196,83,.48);
  }

  #quran-auto-panel .qap-language-option input:checked + span .qap-icon {
    display: inline-block;
  }

  #quran-auto-panel .qap-language-option input:focus-visible + span {
    outline: 2px solid var(--qap-gold-light);
    outline-offset: 2px;
  }

  #quran-auto-panel .qap-research-language-meta {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  #quran-auto-panel .qap-language-count {
    flex-shrink: 0;
    color: var(--qap-gold);
    font-size: 10px;
    font-weight: 700;
  }

  #quran-auto-panel .qap-language-feedback {
    color: #ffd6a0;
    font-size: 10px;
    line-height: 1.4;
  }

  #quran-auto-panel .qap-language-feedback:empty {
    display: none;
  }

  #quran-auto-panel .qap-research-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid rgba(255,255,255,.09);
  }

  #quran-auto-panel .qap-research-option:last-child {
    border-bottom: none;
  }

  #quran-auto-panel .qap-research-option-copy {
    min-width: 0;
  }

  #quran-auto-panel .qap-research-option-title {
    display: block;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
  }

  #quran-auto-panel .qap-research-option-description {
    display: block;
    margin-top: 3px;
    color: var(--qap-muted);
    font-size: 10px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  #quran-auto-panel .qap-research-switch {
    position: relative;
    flex-shrink: 0;
    width: 38px;
    height: 22px;
    margin: 0;
    background: rgba(255,255,255,.16);
    border: 1px solid rgba(255,255,255,.22);
    border-radius: 99px;
    cursor: pointer;
    transition: background .2s ease, border-color .2s ease;
  }

  #quran-auto-panel .qap-research-switch::before {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: #e4eee8;
    border-radius: 50%;
    transition: transform .2s ease, background .2s ease;
  }

  #quran-auto-panel .qap-research-switch:checked {
    background: rgba(246,196,83,.68);
    border-color: rgba(255,229,161,.8);
  }

  #quran-auto-panel .qap-research-switch:checked::before {
    background: #fff;
    transform: translateX(16px);
  }

  #quran-auto-panel .qap-research-switch:focus-visible {
    outline: 2px solid var(--qap-gold-light);
    outline-offset: 3px;
  }

  #quran-auto-panel .qap-explanation-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  }

  #quran-auto-panel .qap-explanation-option {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 8px 10px;
    margin: 0;
    color: #e5eee9;
    background: rgba(255,255,255,.055);
    border: 1px solid rgba(255,255,255,.13);
    border-radius: 8px;
    font-size: 11px;
    cursor: pointer;
  }

  #quran-auto-panel .qap-explanation-option:has(input:checked) {
    color: var(--qap-gold-light);
    background: rgba(246,196,83,.12);
    border-color: rgba(246,196,83,.42);
  }

  #quran-auto-panel .qap-explanation-option input {
    appearance: none;
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    padding: 0;
    margin: 0;
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.48);
    border-radius: 50%;
    cursor: pointer;
  }

  #quran-auto-panel .qap-explanation-option input:checked {
    background: radial-gradient(circle, var(--qap-gold) 0 3px, transparent 3.5px);
    border-color: var(--qap-gold-light);
  }

  #quran-auto-panel .qap-explanation-option input:focus-visible {
    outline: 2px solid var(--qap-gold-light);
    outline-offset: 2px;
  }

  #quran-auto-panel .qap-explanation-length[hidden] {
    display: none !important;
  }

  #quran-auto-panel .qap-research-warning {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 9px;
    margin-top: 16px;
    padding: 11px;
    color: #ffe3b4;
    background: rgba(246,196,83,.09);
    border: 1px solid rgba(246,196,83,.27);
    border-radius: 9px;
  }

  #quran-auto-panel .qap-research-warning .qap-icon {
    width: 17px;
    height: 17px;
    margin-top: 1px;
    color: var(--qap-gold);
  }

  #quran-auto-panel .qap-research-warning strong {
    display: block;
    margin-bottom: 4px;
    font-size: 10px;
  }

  #quran-auto-panel .qap-research-warning p {
    margin: 0;
    color: #e9dbc0;
    font-size: 10px;
    line-height: 1.55;
  }

  .qap-research-dialog[hidden] {
    display: none !important;
  }

  .qap-research-dialog {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: grid;
    place-items: center;
    padding: 22px;
    background: rgba(3, 14, 10, .78);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .qap-research-dialog-card {
    display: flex;
    flex-direction: column;
    width: min(940px, 100%);
    max-height: min(88vh, 980px);
    overflow: hidden;
    color: #edf5ef;
    background: linear-gradient(155deg, #123b2d, #0b211a 78%);
    border: 1px solid rgba(246,196,83,.4);
    border-radius: 18px;
    box-shadow: 0 24px 80px rgba(0,0,0,.55);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .qap-research-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 22px;
    border-bottom: 1px solid rgba(255,255,255,.12);
  }

  .qap-research-dialog-title {
    margin: 0;
    color: #ffe5a1;
    font-size: 18px;
    font-weight: 750;
  }

  .qap-research-dialog-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .qap-research-zoom-button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    padding: 0;
    color: #edf5ef;
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 9px;
    font: 600 18px/1 system-ui, sans-serif;
    cursor: pointer;
  }

  .qap-research-zoom-button:hover:not(:disabled) {
    color: #ffe5a1;
    background: rgba(246,196,83,.12);
    border-color: rgba(246,196,83,.38);
  }

  .qap-research-zoom-button:focus-visible {
    outline: 2px solid #ffe5a1;
    outline-offset: 2px;
  }

  .qap-research-zoom-button:disabled {
    opacity: .4;
    cursor: not-allowed;
  }

  .qap-research-zoom-level {
    min-width: 42px;
    color: #d7e8dd;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .qap-research-dialog-close {
    display: grid;
    flex: 0 0 32px;
    width: 32px;
    height: 32px;
    place-items: center;
    padding: 0;
    color: #ffe5a1;
    background: rgba(246,196,83,.12);
    border: 1px solid rgba(246,196,83,.34);
    border-radius: 50%;
    font: 500 23px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: color .18s ease, background .18s ease, transform .18s ease;
  }

  .qap-research-dialog-close:hover {
    color: #123b2d;
    background: #ffe5a1;
    transform: rotate(90deg);
  }

  .qap-research-dialog-close:focus-visible {
    outline: 2px solid #ffe5a1;
    outline-offset: 3px;
  }

  .qap-research-dialog-body {
    min-height: 240px;
    overflow: auto;
    padding: 24px;
  }

  .qap-research-loading {
    display: grid;
    min-height: 260px;
    place-content: center;
    justify-items: center;
    gap: 18px;
    color: #d7e8dd;
    text-align: center;
  }

  .qap-research-loading[hidden],
  .qap-research-error[hidden],
  .qap-research-content[hidden] {
    display: none !important;
  }

  .qap-research-spinner {
    width: 46px;
    height: 46px;
    border: 3px solid rgba(246,196,83,.2);
    border-top-color: #f6c453;
    border-right-color: #ffe5a1;
    border-radius: 50%;
    animation: qap-research-spin .85s linear infinite;
  }

  @keyframes qap-research-spin {
    to { transform: rotate(360deg); }
  }

  .qap-research-loading p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
  }

  .qap-research-progress-detail {
    max-width: 420px;
    color: #ffe5a1;
    font-size: 12px !important;
    overflow-wrap: anywhere;
  }

  .qap-research-wait-note {
    max-width: 340px;
    color: #bcd2c5;
    font-size: 11px !important;
    text-align: center;
  }

  .qap-research-error {
    padding: 17px 19px;
    color: #ffe1dc;
    background: rgba(190,55,47,.16);
    border: 1px solid rgba(255,133,133,.4);
    border-radius: 12px;
    line-height: 1.65;
    overflow-wrap: anywhere;
  }

  .qap-research-retry {
    display: flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    min-width: 144px;
    margin: 16px auto 0;
    padding: 10px 18px;
    color: #123b2d;
    background: linear-gradient(180deg, #f8d77e, #f2be4d);
    border: 1px solid rgba(246,196,83,.7);
    border-radius: 10px;
    font: 700 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: .02em;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(0,0,0,.18);
    transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  }

  .qap-research-retry:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(0,0,0,.22);
    filter: brightness(1.02);
  }

  .qap-research-retry:focus-visible {
    outline: 2px solid #ffe5a1;
    outline-offset: 2px;
  }

  .qap-research-retry:disabled {
    opacity: .7;
    cursor: not-allowed;
  }

  .qap-research-content {
    color: #e8f1eb;
    font-size: 15px;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }

  .qap-research-content h1,
  .qap-research-content h2,
  .qap-research-content h3,
  .qap-research-content h4 {
    margin: 1.5em 0 .55em;
    color: #ffe5a1;
    line-height: 1.35;
  }

  .qap-research-content h1:first-child,
  .qap-research-content h2:first-child,
  .qap-research-content h3:first-child {
    margin-top: 0;
  }

  .qap-research-content p,
  .qap-research-content ul,
  .qap-research-content ol,
  .qap-research-content blockquote {
    margin: 0 0 1em;
  }

  .qap-research-content a {
    color: #ffe5a1;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .qap-research-content table {
    width: 100%;
    margin: 1em 0;
    border-collapse: collapse;
    background: rgba(255,255,255,.035);
  }

  .qap-research-content th,
  .qap-research-content td {
    padding: 9px 11px;
    border: 1px solid rgba(255,255,255,.18);
    text-align: start;
    vertical-align: top;
  }

  .qap-research-content th {
    color: #ffe5a1;
    background: rgba(246,196,83,.1);
  }

  .qap-research-content blockquote {
    padding: 10px 15px;
    color: #ffe7b0;
    background: rgba(246,196,83,.08);
    border-inline-start: 3px solid #f6c453;
  }

  .qap-research-content code {
    padding: 2px 5px;
    background: rgba(0,0,0,.22);
    border-radius: 4px;
  }

  @media (max-width: 600px) {
    .qap-research-dialog { padding: 10px; }
    .qap-research-dialog-card { max-height: 94vh; border-radius: 13px; }
    .qap-research-dialog-header { padding: 14px 16px; }
    .qap-research-dialog-body { padding: 17px; }
    .qap-research-content { font-size: 14px; }
    .qap-research-content table { font-size: 12px; }
    .qap-research-content th,
    .qap-research-content td { padding: 7px; }
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
      font-size: 19px;
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
    .qap-highlight,
    .qap-research-dialog * {
      transition: none !important;
      animation: none !important;
    }

  }

  `;

  document.head.appendChild(css);

  // ---------------------------------------------------------------------------
  // 5. PLAYER INTERFACE MARKUP
  // ---------------------------------------------------------------------------

  const panel = document.createElement("div");

  panel.id = "quran-auto-panel";
  panel.style.visibility = "hidden";

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

    <div class="qap-muted qap-now-playing">NOW PLAYING</div>

    <div class="qap-ayah-number" id="qap-ayah">
        Bismillah
    </div>

  </div>

  <button
    id="qap-ayah-details"
    class="qap-control-btn"
    title="Research this Ayah"
    aria-label="Research this Ayah"
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
    <span class="qap-seek-time" id="qap-rewind-label">10%</span>
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
    <span class="qap-seek-time" id="qap-forward-label">10%</span>
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

        <label for="qap-track-interval">Interval Between Tracks</label>

        <select id="qap-track-interval">
          <option value="1" selected>1 second</option>
          <option value="2">2 seconds</option>
          <option value="3">3 seconds</option>
          <option value="5">5 seconds</option>
          <option value="10">10 seconds</option>
        </select>

        <div class="qap-muted" style="margin-top:8px;line-height:1.6">
          Pause between consecutive Arabic and Urdu tracks and between Ayahs.
        </div>

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


      <div style="margin-top:18px">

        <label for="qap-seek-percent">Seek Amount</label>

        <select id="qap-seek-percent">
          <option value="2">2% of track</option>
          <option value="5">5% of track</option>
          <option value="10" selected>10% of track</option>
          <option value="20">20% of track</option>
        </select>

        <div class="qap-muted" style="margin-top:8px;line-height:1.6">
          Based on track length, up to 30 seconds per press.
        </div>

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


    <button id="qap-open-research" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
          <i data-lucide="sparkles"></i>
        </span>

        <span>
          <strong>Ayah Research Settings</strong>

          <div class="qap-muted" style="margin-top:5px">
            Languages, translation, tafseer and detail
          </div>
        </span>

      </span>

      <span>›</span>

    </button>

    <button id="qap-open-sound" class="qap-menu-item">

      <span style="display:flex;align-items:center;gap:13px">

        <span class="qap-menu-icon">
          <i data-lucide="audio-lines"></i>
        </span>

        <span>
          <strong>Sound Settings</strong>

          <div class="qap-muted" style="margin-top:5px">
            Volume, mute and audio devices
          </div>
        </span>

      </span>

      <span>›</span>

    </button>

  </div>

  <!-- ================= SOUND SETTINGS ================= -->

  <div
    id="qap-sound-page"
    class="qap-internal-page"
    hidden
  >
    <div class="qap-page-header">
      <button id="qap-close-sound" class="qap-back-btn">
        <i data-lucide="arrow-left"></i>
        Back
      </button>
      <strong><i data-lucide="volume-2"></i> Sound Settings</strong>
    </div>

    <section class="qap-section">
      <div class="qap-section-title"><i data-lucide="sliders-horizontal"></i> Track Volume</div>

      <div class="qap-sound-level">
        <label for="qap-arabic-volume">Arabic recitation</label>
        <output id="qap-arabic-volume-value" for="qap-arabic-volume">100%</output>
        <input class="qap-sound-slider" id="qap-arabic-volume" type="range" min="0" max="100" step="1" value="100" aria-label="Arabic recitation volume">
        <button class="qap-sound-mute" id="qap-arabic-mute" type="button" aria-pressed="false">
          <i data-lucide="volume-2"></i> Mute Arabic
        </button>
      </div>

      <div class="qap-sound-level">
        <label for="qap-urdu-volume">Urdu translation</label>
        <output id="qap-urdu-volume-value" for="qap-urdu-volume">100%</output>
        <input class="qap-sound-slider" id="qap-urdu-volume" type="range" min="0" max="100" step="1" value="100" aria-label="Urdu translation volume">
        <button class="qap-sound-mute" id="qap-urdu-mute" type="button" aria-pressed="false">
          <i data-lucide="volume-2"></i> Mute Urdu
        </button>
      </div>
    </section>

    <section class="qap-section">
      <div class="qap-section-title"><i data-lucide="headphones"></i> Audio Devices</div>

      <div style="margin-top:15px">
        <label for="qap-audio-output">Playback device</label>
        <select id="qap-audio-output">
          <option value="">System default (speakers/headphones)</option>
        </select>
        <div class="qap-muted" style="line-height:1.6;margin-top:7px">
          Select an available output such as headphones or a Realtek device. Device routing depends on browser support.
        </div>
      </div>

      <div style="margin-top:15px">
        <label for="qap-audio-input">Microphone device check</label>
        <select id="qap-audio-input">
          <option value="">Default microphone</option>
        </select>
        <button class="qap-sound-mic-test" id="qap-microphone-test" type="button" style="margin-top:9px">
          <i data-lucide="mic"></i> Check selected microphone
        </button>
      </div>

      <button class="qap-sound-device-refresh" id="qap-refresh-audio-devices" type="button" style="margin-top:15px">
        <i data-lucide="refresh-cw"></i> Refresh audio devices
      </button>
      <div class="qap-sound-device-status" id="qap-audio-device-status" role="status" aria-live="polite">
        Audio device names may be limited until the browser grants microphone permission.
      </div>
    </section>
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

      <label style="
        display:flex;
        align-items:center;
        gap:11px;
        margin-top:22px;
        line-height:1.6;
      ">
        <input type="checkbox" id="qap-reading-auto-scroll" checked>
        Auto-advance Ayahs after Move
      </label>

      <div style="margin-top:14px">
        <label for="qap-reading-scroll-interval">Advance Ayah after (seconds)</label>
        <input
          id="qap-reading-scroll-interval"
          type="number"
          min="1"
          step="1"
          value="5"
          inputmode="numeric"
          style="width:100%;min-height:40px;padding:9px 11px;color:#174d38;background:#fff;border:1px solid rgba(255,255,255,.2);border-radius:9px;font:inherit;font-size:12px"
        >
        <div class="qap-muted" style="line-height:1.7;margin-top:8px">
          When you use Move in Ayah Range, automatically scroll through the selected Ayahs at this interval. This is separate from audio playback scrolling.
        </div>
      </div>

      <label style="
        display:flex;
        align-items:center;
        gap:11px;
        margin-top:24px;
        line-height:1.6;
      ">
        <input type="checkbox" id="qap-hifz-mode">
        Hifz Mode
      </label>

      <div style="margin-top:13px">
        <label for="qap-hifz-reveal-seconds">Reveal Ayah after (seconds)</label>
        <input
          id="qap-hifz-reveal-seconds"
          type="number"
          min="1"
          step="1"
          value="5"
          inputmode="numeric"
          style="width:100%;min-height:40px;padding:9px 11px;color:#174d38;background:#fff;border:1px solid rgba(255,255,255,.2);border-radius:9px;font:inherit;font-size:12px"
        >
        <div class="qap-muted" style="line-height:1.7;margin-top:8px">
          During Move reading, hide Arabic and translation until this time passes. During audio, only the language currently playing is hidden for the duration of its track.
        </div>
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


  <!-- ================= AYAH RESEARCH SETTINGS ================= -->

  <div
    id="qap-research-page"
    class="qap-internal-page"
    hidden
  >

    <div class="qap-page-header">

      <button id="qap-close-research" class="qap-back-btn">
        <i data-lucide="arrow-left"></i>
        Back
      </button>

      <strong><i data-lucide="sparkles"></i> Ayah Research Settings</strong>

    </div>

    <section class="qap-research-section" aria-labelledby="qap-research-language-title">
      <div class="qap-research-section-title" id="qap-research-language-title">
        <i data-lucide="languages"></i>
        Languages
      </div>
      <div class="qap-research-language-meta">
        <span class="qap-language-count" id="qap-language-count" aria-live="polite">2 / 2 selected</span>
      </div>

      <div class="qap-research-language-grid">
        <label class="qap-language-option">
          <input type="checkbox" id="qap-research-language-en" data-qap-research-language checked>
          <span><i data-lucide="check"></i>English</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language checked>
          <span><i data-lucide="check"></i>Urdu</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language>
          <span><i data-lucide="check"></i>Hindi</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language>
          <span><i data-lucide="check"></i>Sindhi</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language>
          <span><i data-lucide="check"></i>Arabic</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language>
          <span><i data-lucide="check"></i>Bengali</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language>
          <span><i data-lucide="check"></i>French</span>
        </label>
        <label class="qap-language-option">
          <input type="checkbox" data-qap-research-language>
          <span><i data-lucide="check"></i>Hinglish</span>
        </label>
      </div>
      <div class="qap-language-feedback" id="qap-language-feedback" role="status" aria-live="polite"></div>
    </section>

    <section class="qap-research-section" aria-labelledby="qap-research-sections-title">
      <div class="qap-research-section-title" id="qap-research-sections-title">
        <i data-lucide="list-checks"></i>
        Research Sections
      </div>

      <label class="qap-research-option">
        <span class="qap-research-option-copy">
          <span class="qap-research-option-title">Ayah Details</span>
          <span class="qap-research-option-description">Surah, Ayah number, Juz, Ruku, word and letter counts</span>
        </span>
        <input class="qap-research-switch" id="qap-research-details" type="checkbox" checked aria-label="Include Ayah Details">
      </label>

      <label class="qap-research-option">
        <span class="qap-research-option-copy">
          <span class="qap-research-option-title">Translation</span>
          <span class="qap-research-option-description">Complete Quranic Ayah translation</span>
        </span>
        <input class="qap-research-switch" id="qap-research-translation" type="checkbox" checked aria-label="Include Translation">
      </label>

      <label class="qap-research-option">
        <span class="qap-research-option-copy">
          <span class="qap-research-option-title">Tafseer</span>
          <span class="qap-research-option-description">Dawat-e-Islami Tafseer, primarily Sirat-ul-Jinan</span>
        </span>
        <input class="qap-research-switch" type="checkbox" id="qap-research-tafseer" aria-label="Include Tafseer">
      </label>

      <div class="qap-research-option qap-explanation-length" id="qap-explanation-length" hidden>
        <div class="qap-research-option-title">Explanation Length</div>
        <div class="qap-explanation-options">
          <label class="qap-explanation-option">
            <input type="radio" name="qap-explanation-length" value="brief" checked>
            Brief
          </label>
          <label class="qap-explanation-option">
            <input type="radio" name="qap-explanation-length" value="detailed">
            Detailed
          </label>
        </div>
      </div>

      <label class="qap-research-option">
        <span class="qap-research-option-copy">
          <span class="qap-research-option-title">Word-by-Word Meaning</span>
          <span class="qap-research-option-description">Arabic words, transliteration and individual meanings</span>
        </span>
        <input class="qap-research-switch" id="qap-research-word-by-word" type="checkbox" aria-label="Include Word-by-Word Meaning">
      </label>

      <label class="qap-research-option">
        <span class="qap-research-option-copy">
          <span class="qap-research-option-title">Show research in app</span>
          <span class="qap-research-option-description">Display the Gemini answer in a large in-app popup instead of Gemini</span>
        </span>
        <input class="qap-research-switch" id="qap-research-show-in-app" type="checkbox" checked aria-label="Show research in app">
      </label>
    </section>

    <aside class="qap-research-warning" aria-label="Source and accuracy notice">
      <i data-lucide="triangle-alert"></i>
      <div>
        <strong>Source &amp; Accuracy</strong>
        <p>Research prioritizes official Dawat-e-Islami sources. AI translations and explanations may contain inaccuracies. Verify with original sources and qualified scholars.</p>
      </div>
    </aside>

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


    <div class="qap-info-intro">
      <strong>Current Session</strong>
      <p>Recitation and playback settings for this session.</p>
    </div>

    <div class="qap-info-group">
      <div class="qap-info-group-title">
        <i data-lucide="book-open-check"></i>
        Recitation
      </div>
      <div class="qap-info-fact">
        <span>Surah</span>
        <strong id="qap-session-info-surah">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Current Ayah</span>
        <strong id="qap-session-info-ayah">-</strong>
      </div>
      <div class="qap-info-fact qap-info-fact-status">
        <span>Status</span>
        <strong id="qap-session-info-status">-</strong>
      </div>
    </div>

    <div class="qap-info-group">
      <div class="qap-info-group-title">
        <i data-lucide="music-2"></i>
        Audio
      </div>
      <div class="qap-info-fact">
        <span>Arabic Reciter</span>
        <strong id="qap-session-info-qari">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Current Track</span>
        <strong id="qap-session-info-track">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Audio Mode</span>
        <strong id="qap-session-info-mode">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Urdu Translation</span>
        <strong id="qap-session-info-translation">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Playback Speed</span>
        <strong id="qap-session-info-speed">-</strong>
      </div>
    </div>

    <div class="qap-info-group">
      <div class="qap-info-group-title">
        <i data-lucide="repeat-2"></i>
        Range &amp; Repetition
      </div>
      <div class="qap-info-fact">
        <span>Ayah Range</span>
        <strong id="qap-session-info-range">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Repeat Settings</span>
        <strong id="qap-session-info-repeat">-</strong>
      </div>
      <div class="qap-info-fact">
        <span>Repeat Method</span>
        <strong id="qap-session-info-repeat-mode">-</strong>
      </div>
    </div>

  </div>

`;

  // ---------------------------------------------------------------------------
  // 6. DOM SETUP AND SHARED PLAYER HELPERS
  // ---------------------------------------------------------------------------

  // Attach the interface, initialize icons, and populate page-derived controls.
  document.body.appendChild(panel);

  // Render icons in the newly attached player interface.

  initializeQapIcons();

  // =====================================================
  // Cache the player-scoped element selector.
  // =====================================================

  const $ = (id) => panel.querySelector("#" + id);

  // =====================================================
  // Populate the Surah title.
  // =====================================================

  $("qap-surah").textContent = "Surah " + surahName;

  // =====================================================
  // Build translation choices from the links already present on the page.
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

  // Populate range selectors using the detected Surah length.

  const rangeStartSelect = $("qap-range-start");
  const rangeEndSelect = $("qap-range-end");

  for (let i = 0; i <= totalAyahs; i++) {
    const startOption = document.createElement("option");
    startOption.value = i;
    startOption.textContent = i === 0 ? "Bismillah" : "Ayah " + i;

    rangeStartSelect.appendChild(startOption);

    const endOption = document.createElement("option");
    endOption.value = i;
    endOption.textContent = i === 0 ? "Bismillah" : "Ayah " + i;

    rangeEndSelect.appendChild(endOption);
  }

  rangeStartSelect.value = "1";
  rangeEndSelect.value = "1";

  // Shared player and diagnostic message handling.

  let diagnosticSequence = 0;

  function createDiagnosticReference(context) {
    diagnosticSequence = (diagnosticSequence + 1) % 10000;
    const category = String(context || "player")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 12) || "PLAYER";
    return "QAP-" + category + "-" + Date.now().toString(36).toUpperCase() +
      "-" + String(diagnosticSequence).padStart(4, "0");
  }

  function showMessage(message, type = "success") {
    const element = $("qap-message");

    if (!element) return;

    element.textContent = message;
    element.className = "qap-message " + type;

  }

  function showError(message, context = "player", cause = null) {
    const reference = createDiagnosticReference(context);
    const displayedMessage = message + " (Reference: " + reference + ")";
    currentError = displayedMessage;

    currentStatus = "Error · " + reference;

    showMessage(displayedMessage, "error");
    console.error("Quran Companion diagnostic:", {
      reference,
      context,
      message,
      surah: surahName,
      surahId,
      ayah,
      track: currentTrack,
      audioSource: audio?.currentSrc || audio?.src || "",
      cause,
      stack: cause?.stack || new Error(message).stack,
    });

    // Also display the error inside Ayah Playback.

    const rangeInfo = $("qap-range-info");

    if (rangeInfo) {
      rangeInfo.textContent = "⚠ Error: " + displayedMessage;

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
  // Guard operations that depend on the player still being attached.

  function isPlayerAvailable() {
    return !destroyed && document.body.contains(panel);
  }

  function getAyahLabel(n) {
    if (n === 0) return "Bismillah";
    return "Ayah " + n;
  }

  // Locate the site's container for a given Ayah number.

  function findBox(n) {
    const selector =
      '.tolTopstyle[data-surah-id="' + surahId + '"][data-ayat-number="' + n + '"]';
    const marker = document.querySelector(selector);

    if (!marker && n === 0) {
      const bismillahFallback = Array.from(
        document.querySelectorAll(
          '.tolTopstyle[data-surah-id="' + surahId + '"]',
        ),
      ).find((element) => {
        const value = element.getAttribute("data-ayat-number");
        const text = (element.textContent || "").trim();
        return value === "0" || /bismi|بسم|بِسْم/i.test(text);
      });

      if (bismillahFallback) {
        return bismillahFallback.closest(".ayahTranslateBoxDiv");
      }
    }

    if (!marker) return null;

    return marker.closest(".ayahTranslateBoxDiv");
  }

  // Highlight, Hifz concealment, and range-boundary helpers.

  function clearHighlight() {
    document.querySelectorAll(".qap-highlight").forEach((element) => {
      element.classList.remove("qap-highlight");
    });
  }

  function clearHifzConcealment() {
    if (hifzRevealTimer !== null) {
      clearTimeout(hifzRevealTimer);
      hifzRevealTimer = null;
    }

    document.querySelectorAll(".qap-hifz-hidden").forEach((element) => {
      element.classList.remove("qap-hifz-hidden");
      element.removeAttribute("data-qap-hifz-message");
    });
    hifzContext = "none";
  }

  function concealAyahText(number, concealBoth, revealAfterSeconds = 0) {
    clearHifzConcealment();
    if (!hifzModeEnabled) return false;

    const box = findBox(number);
    if (!box) {
      showError(getAyahLabel(number) + " could not be located for Hifz Mode.");
      return false;
    }

    const arabicText = box.querySelector(".arabicQuranText");
    const translationText = box.querySelector(".ayahTranslaBtnp");
    const elements = concealBoth
      ? [arabicText, translationText]
      : [currentTrack === "arabic" ? arabicText : translationText];
    const targets = elements.filter((element) => element?.textContent.trim());

    if (!targets.length) {
      showError(getAyahLabel(number) + " text could not be found for Hifz Mode.");
      return false;
    }

    targets.forEach((element) => {
      element.classList.add("qap-hifz-hidden");
      element.dataset.qapHifzMessage =
        element === arabicText
          ? "Hifz Mode · Recite from memory"
          : "Hifz Mode · Recall the meaning";
    });
    hifzContext = concealBoth ? "move" : "audio";

    if (revealAfterSeconds > 0) {
      hifzRevealTimer = setTimeout(() => {
        clearHifzConcealment();
      }, revealAfterSeconds * 1000);
    }
    return true;
  }

  function clearRangeBoundary() {
    document.querySelectorAll(".qap-range-boundary").forEach((element) => {
      element.classList.remove("qap-range-boundary");
    });
  }

  function applyRangeBoundary(start, end) {
    clearRangeBoundary();

    for (let number = start; number <= end; number++) {
      const box = findBox(number);
      if (box) box.classList.add("qap-range-boundary");
    }
  }

  // Highlight the current Ayah and optionally scroll it into view.

  function highlightAyah(n, shouldScroll = false) {
    clearHighlight();

    const box = findBox(n);

    if (!box) {
      showError(getAyahLabel(n) + " could not be located on the page.");

      return false;
    }

    const elements = box.querySelectorAll(".arabicQuranText, .ayahTranslaBtnp");

    if (!elements.length) {
      showError(
        getAyahLabel(n) + " was found, but its text could not be highlighted.",
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

  // Return-to-current-Ayah and Move-range reading navigation.

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

  function stopReadingAutoScroll() {
    if (readingScrollTimer !== null) {
      clearInterval(readingScrollTimer);
      readingScrollTimer = null;
    }
    readingScrollAyah = 0;
  }

  function startReadingAutoScroll(start, end) {
    stopReadingAutoScroll();
    if (!readingAutoScroll || start >= end) return;

    readingScrollAyah = start;
    showStatus(
      "Reading range · Ayah " +
        start +
        " of " +
        end +
        " · next in " +
        readingScrollIntervalSeconds +
        "s",
    );
    readingScrollTimer = setInterval(() => {
      if (
        destroyed ||
        !isPlayerAvailable() ||
        !rangeSelected ||
        rangePlaybackActive ||
        running
      ) {
        stopReadingAutoScroll();
        return;
      }

      if (readingScrollAyah >= end) {
        stopReadingAutoScroll();
        showStatus("Finished scrolling through the selected Ayahs.");
        return;
      }

      const nextAyah = readingScrollAyah + 1;
      const box = findBox(nextAyah);
      if (!box) {
        stopReadingAutoScroll();
        showError("Ayah " + nextAyah + " could not be located while auto-advancing the selected range.");
        return;
      }

      readingScrollAyah = nextAyah;
      ayah = nextAyah;
      $("qap-ayah").textContent = "Ayah " + ayah + " of " + totalAyahs;
      highlightAyah(nextAyah, true);
      concealAyahText(nextAyah, true, hifzRevealSeconds);
      showStatus(
        "Reading range · Ayah " +
          nextAyah +
          " of " +
          end +
          " · next in " +
          readingScrollIntervalSeconds +
          "s",
      );
    }, readingScrollIntervalSeconds * 1000);
  }

  // Time formatting and seeking helpers.

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

  function updateSeekLabels() {
    $("qap-rewind-label").textContent = seekPercent + "%";
    $("qap-forward-label").textContent = seekPercent + "%";
  }

  function seekAudio(direction) {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      showStatus("Audio is not ready to seek yet.");
      return;
    }

    const seekSeconds = Math.min(
      30,
      Math.max(1, audio.duration * (seekPercent / 100)),
    );

    audio.currentTime = Math.min(
      audio.duration,
      Math.max(0, audio.currentTime + direction * seekSeconds),
    );

    updateTimer();
  }

  // Keep the progress display and playback information synchronized.

  function updateTimer() {
    if (!isPlayerAvailable()) return;

    const current = audio.currentTime || 0;

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

    $("qap-current").textContent = formatTime(current);

    $("qap-duration").textContent = formatTime(duration);

    $("qap-progress").style.width =
      duration > 0 ? Math.min(100, (current / duration) * 100) + "%" : "0%";

    const infoValues = {
      surah: surahName,
      ayah: ayah + " of " + totalAyahs,
      qari: $("qap-qari").selectedOptions[0].textContent,
      track: currentTrack === "arabic" ? "Arabic" : "Urdu",
      mode:
        audioMode === "both"
          ? "Arabic + Urdu"
          : audioMode === "arabic"
            ? "Arabic Only"
            : "Urdu Only",
      translation: $("qap-urdu-translation").selectedOptions[0].textContent,
      speed: speed + "x",
      range: rangePlaybackActive
        ? "Ayah " + rangeStart + "–" + rangeEnd + " · Playing"
        : rangeSelected
          ? "Ayah " + rangeStart + "–" + rangeEnd + " · Selected"
          : "Not selected",
      repeat: rangeSelected
        ? rangeRepeat === 0
          ? "Unlimited"
          : rangeRepeat + " Times"
        : "1 Time",
      "repeat-mode":
        rangeRepeatMode === "each"
          ? "Repeat Each Ayah"
          : "Repeat Entire Range",
      status: currentStatus,
    };

    Object.entries(infoValues).forEach(([key, value]) => {
      const sessionValue = $("qap-session-info-" + key);
      const summaryValue = $("qap-info-" + key);

      if (sessionValue) sessionValue.textContent = value;
      if (summaryValue) summaryValue.textContent = value;
    });
  }

  // Update transport controls to reflect playback state.

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

  // Audio event and buffering-timer cleanup.

  function clearBufferingTimer() {
    if (bufferingTimer === null) return;

    clearTimeout(bufferingTimer);
    bufferingTimer = null;
  }

  function removeAudioEvents() {
    clearBufferingTimer();

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

  // ---------------------------------------------------------------------------
  // 7. AUDIO PLAYBACK ENGINE
  // ---------------------------------------------------------------------------

  // Convert media-element errors into user-facing diagnostics.

  function handleAudioError(token, failedURL) {
    if (generation !== token || destroyed) return;

    clearHifzConcealment();
    running = false;
    trackCanResume = false;
    clearBufferingTimer();

    trackQueue = [];
    trackIndex = 0;

    const code = audio.error?.code;

    let message;

    switch (code) {
      case 1:
        message = "Audio loading was interrupted.";
        break;

      case 2:
        message =
          "Network error while loading " +
          (currentTrack === "arabic" ? "Arabic" : "Urdu") +
          " audio. Check your connection and try again.";
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

    showError(message, "audio", audio.error);

    updatePlayButton();
  }

  // Select tracks, manage inter-track gaps, and load each audio source.

  function getSelectedTracks() {
    if (audioMode === "arabic") {
      return ["arabic"];
    }

    if (audioMode === "urdu") {
      return ["urdu"];
    }

    return ["arabic", "urdu"];
  }

  function clearTrackGapTimer() {
    if (trackGapTimer !== null) {
      clearTimeout(trackGapTimer);
      trackGapTimer = null;
    }
  }

  function cancelPendingTrackAdvance() {
    clearTrackGapTimer();
    pendingTrackAdvance = null;
    trackGapRemainingMs = 0;
    trackGapStartedAt = 0;
  }

  function resumePendingTrackAdvance() {
    if (!pendingTrackAdvance || !running || trackGapTimer !== null) return;

    const token = pendingTrackAdvance.token;
    trackGapStartedAt = Date.now();
    trackGapTimer = setTimeout(() => {
      trackGapTimer = null;
      trackGapRemainingMs = 0;
      trackGapStartedAt = 0;

      const advance = pendingTrackAdvance;
      pendingTrackAdvance = null;
      if (!advance || !running || generation !== token) return;
      advance.callback();
    }, trackGapRemainingMs);
  }

  function scheduleTrackAdvance(callback, token) {
    const delay = trackIntervalSeconds * 1000;
    if (delay <= 0) {
      callback();
      return;
    }

    cancelPendingTrackAdvance();
    pendingTrackAdvance = { callback, token };
    trackGapRemainingMs = delay;
    showStatus("Next audio begins in " + trackIntervalSeconds + " second" +
      (trackIntervalSeconds === 1 ? "" : "s") + ".");
    resumePendingTrackAdvance();
  }

  // Load a particular language track.
  function loadTrack(n, token) {
    if (!isPlayerAvailable() || !running) return;

    if (token !== generation) return;

    clearHifzConcealment();
    if (trackIndex >= trackQueue.length) {
      loadAyah(n + 1);
      return;
    }

    currentTrack = trackQueue[trackIndex];
    applyTrackSoundSettings();

    const language = currentTrack;
    const url = audioURL(n, language);
    let bufferingNoticeShown = false;
    let stalledWarningLogged = false;

    const scheduleBufferingNotice = () => {
      if (bufferingTimer !== null || bufferingNoticeShown) return;

      bufferingTimer = setTimeout(() => {
        bufferingTimer = null;

        if (generation !== token || !running || destroyed) return;

        bufferingNoticeShown = true;
        showStatus("Buffering " + language + " audio...");
      }, 700);
    };

    audio.pause();
    removeAudioEvents();

    showStatus(
      "Loading " + (language === "arabic" ? "Arabic" : "Urdu") + " · " + getAyahLabel(n),
    );

    let playbackStarted = false;
    audio.oncanplay = () => {
      if (generation !== token || !running) return;
      if (playbackStarted) return;

      playbackStarted = true;

      applyTrackSoundSettings();
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
          "audio-start",
          error,
        );

        updatePlayButton();
      });
    };

    audio.onplaying = () => {
      if (generation !== token || !running) return;

      clearBufferingTimer();
      concealAyahText(n, false);

      bufferingNoticeShown = false;

      showStatus(
        "Playing " +
          (language === "arabic" ? "Arabic" : "Urdu") +
          " · " +
          getAyahLabel(n),
      );

      updatePlayButton();
      updateTimer();
    };

    audio.onended = () => {
      if (generation !== token || !running) return;

      clearHifzConcealment();
      trackCanResume = false;
      clearBufferingTimer();

      trackIndex++;

      const repeatsAyah =
        rangePlaybackActive &&
        rangeRepeatMode === "each" &&
        (rangeRepeat === 0 || rangeAyahRepeatCount < rangeRepeat - 1);
      const hasFollowingAyah = rangePlaybackActive
        ? n < rangeEnd ||
          (rangeRepeatMode === "range" &&
            (rangeRepeat === 0 || rangeRepeatCount < rangeRepeat))
        : n < totalAyahs;
      const advance = () => {
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
                ? "Repeating " + getAyahLabel(n) + " · Unlimited"
                : "Repeating " +
                    getAyahLabel(n) +
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

      if (trackIndex < trackQueue.length || repeatsAyah || hasFollowingAyah) {
        scheduleTrackAdvance(advance, token);
      } else {
        advance();
      }
    };

    audio.onerror = () => {
      if (generation !== token || destroyed) return;

      handleAudioError(token, url);
    };

    audio.ontimeupdate = updateTimer;

    audio.onwaiting = () => {
      if (generation !== token || !running) return;
      scheduleBufferingNotice();
    };

    audio.onstalled = () => {
      if (generation !== token || !running) return;

      if (!stalledWarningLogged) {
        stalledWarningLogged = true;
        console.warn("Audio fetch stalled; waiting for more data.", {
          surah: surahName,
          ayah: n,
          language,
          url,
          readyState: audio.readyState,
          networkState: audio.networkState,
        });
      }

      scheduleBufferingNotice();
    };

    // Start loading only after all event handlers are registered.

    trackCanResume = true;
    audio.src = url;
    audio.playbackRate = speed;
    audio.load();
  }

  // Load an Ayah and its selected audio tracks.
  function loadAyah(n) {
    if (!isPlayerAvailable() || !running) return;
    clearHifzConcealment();
    cancelPendingTrackAdvance();

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
      trackCanResume = false;

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
      trackCanResume = false;
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

    if (n < 0) n = 0;

    ayah = n;

    const token = ++generation;

    trackQueue = getSelectedTracks();
    trackIndex = 0;

    $("qap-ayah").textContent = n === 0 ? "Bismillah" : "Ayah " + n + " of " + totalAyahs;

    $("qap-current").textContent = "00:00";
    $("qap-duration").textContent = "00:00";
    $("qap-progress").style.width = "0%";

    highlightAyah(n, autoScroll);

    loadTrack(n, token);

    updatePlayButton();
  }

  // Start or resume playback.

  function play() {
    if (!isPlayerAvailable()) return;
    stopReadingAutoScroll();

    if (pendingTrackAdvance) {
      if (running) {
        pause();
      } else {
        running = true;
        resumePendingTrackAdvance();
        showStatus("Resuming before the next audio track.");
        updatePlayButton();
      }
      return;
    }

    if (running && !audio.paused) {
      pause();

      return;
    }

    running = true;

    // Resume existing paused audio.
    if (
      audio.src &&
      audio.paused &&
      !audio.ended &&
      !audio.error &&
      trackCanResume
    ) {
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
            "audio-resume",
            error,
          );

          updatePlayButton();
        });
    } else {
      loadAyah(ayah);
    }

    updatePlayButton();
  }

  // Pause playback while preserving any remaining inter-track gap.

  function pause() {
    if (!isPlayerAvailable()) return;

    clearHifzConcealment();
    if (pendingTrackAdvance && trackGapTimer !== null) {
      trackGapRemainingMs = Math.max(
        0,
        trackGapRemainingMs - (Date.now() - trackGapStartedAt),
      );
      clearTrackGapTimer();
      trackGapStartedAt = 0;
    }

    running = false;

    audio.pause();

    showStatus("Recitation paused.");

    updatePlayButton();
    updateTimer();
  }

  // Navigate directly to an Ayah and leave any previous range selection.

  function jump(n) {
    n = Number(n);

    if (!Number.isInteger(n) || n < 0 || n > totalAyahs) {
      showError("Invalid Ayah number.");
      return;
    }

    stopReadingAutoScroll();

    // Manual Ayah navigation exits range playback.

    rangePlaybackActive = false;
    rangeSelected = false;
    trackCanResume = false;

    rangeRepeatCount = 0;

    rangeAyahRepeatCount = 0;

    $("qap-main-range-info").textContent = "";

    clearRangeBoundary();

    $("qap-range-info").textContent =
      "Range playback cancelled. Moved to Ayah " + n + ".";

    $("qap-range-info").classList.remove("qap-range-error");

    ayah = n;

    running = true;

    generation++;

    loadAyah(n);

    updatePlayButton();
  }

  // Start playback for the selected Ayah range.

  function startRangePlayback() {
    stopReadingAutoScroll();

    const start = Number($("qap-range-start").value);
    const end = Number($("qap-range-end").value);
    const repeat = Number($("qap-range-repeat").value);

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < 0 ||
      end > totalAyahs ||
      start > end
    ) {
      showError(
        "Invalid Ayah range. Ayah numbers must be between 0 and " + totalAyahs + ".",
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
    rangeSelected = true;

    applyRangeBoundary(rangeStart, rangeEnd);

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

  // Restore player, audio, range, reading, and Hifz settings to defaults.

  function resetPlayer() {
    if (!isPlayerAvailable()) return;

    stopReadingAutoScroll();
    cancelPendingTrackAdvance();

    // Stop current playback.
    running = false;

    generation++;

    // Reset range playback.
    rangePlaybackActive = false;
    rangeSelected = false;
    trackCanResume = false;
    rangeRepeatCount = 0;
    rangeAyahRepeatCount = 0;

    rangeStart = 0;
    rangeEnd = 0;
    rangeRepeat = 1;
    rangeRepeatMode = "range";

    // Reset audio settings.
    audioMode = "both";
    trackIntervalSeconds = 1;
    arabicVolume = 1;
    urduVolume = 1;
    arabicMuted = false;
    urduMuted = false;
    qari = "02";
    urduTranslation = "02";
    speed = 1;
    seekPercent = 10;
    selectAudioOutput("");
    updateSoundControls();

    // Reset reading settings.
    autoScroll = true;
    readingAutoScroll = true;
    readingScrollIntervalSeconds = 5;
    hifzModeEnabled = false;
    hifzRevealSeconds = 5;
    clearHifzConcealment();

    // Stop and clear audio.
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    removeAudioEvents();

    // Reset dropdowns.
    $("qap-audio-mode").value = "both";
    $("qap-track-interval").value = "1";
    $("qap-qari").value = "02";
    $("qap-urdu-translation").value = "02";
    $("qap-speed").value = "1";
    $("qap-seek-percent").value = "10";
    updateSeekLabels();
    $("qap-scroll").checked = true;
    $("qap-reading-auto-scroll").checked = true;
    $("qap-reading-scroll-interval").value = "5";
    $("qap-hifz-mode").checked = false;
    $("qap-hifz-reveal-seconds").value = "5";

    $("qap-range-start").value = "0";
    updateEndAyahOptions();
    $("qap-range-end").value = "0";
    $("qap-range-repeat").value = "1";
    $("qap-repeat-mode").value = "range";

    // Reset Ayah.
    ayah = 0;

    currentTrack = "arabic";
    trackQueue = [];
    trackIndex = 0;

    // Clear highlights.
    clearHighlight();
    clearRangeBoundary();

    // Reset player display.
    $("qap-ayah").textContent = "Bismillah";
    $("qap-current").textContent = "00:00";
    $("qap-duration").textContent = "00:00";
    $("qap-progress").style.width = "0%";

    // Reset range information.
    $("qap-main-range-info").textContent = "";

    $("qap-range-info").textContent = "Select your Ayah range.";

    $("qap-range-info").classList.remove("qap-range-error");

    // Clear error.
    currentError = "";

    showStatus("All settings restored to default.");

    updatePlayButton();

    updateTimer();
  }

  // ---------------------------------------------------------------------------
  // 8. SETTINGS PAGES AND USER INTERACTIONS
  // ---------------------------------------------------------------------------

  // Translation changes navigate to the corresponding website page.

  translationSelect.onchange = () => {
    const selectedURL = translationSelect.value;

    if (!selectedURL) return;

    showStatus("Changing translation...");

    endPlayer(true);

    location.href = selectedURL;
  };

  // Primary transport controls.

  $("qap-play").onclick = () => {
    if (running && !audio.paused) {
      pause();
    } else {
      play();
    }
  };

  $("qap-prev").onclick = () => {
    if (ayah <= 0) {
      showError("You are already at the first Ayah.");

      return;
    }

    jump(ayah - 1);
  };

  $("qap-next").onclick = () => {
    if (ayah >= totalAyahs) {
      showError("You are already at the last Ayah.");

      return;
    }

    jump(ayah + 1);
  };

  $("qap-reset").onclick = resetPlayer;

  $("qap-end").onclick = () => {
    endPlayer(true);
  };

  $("qap-return").onclick = returnToCurrentAyah;

  $("qap-rewind").onclick = () => seekAudio(-1);

  $("qap-forward").onclick = () => seekAudio(1);

  // Settings entry point and internal-page navigation.

  // Open Settings Home.

  $("qap-expand").onclick = () => {
    openInternalPage("settings");
  };

  // Return to Main Player.

  $("qap-settings-back").onclick = () => {
    showPage("main");
  };

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
      research: "qap-research-page",
      sound: "qap-sound-page",
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

  $("qap-open-audio").onclick = () => {
    openInternalPage("audio");
  };

  $("qap-close-audio").onclick = closeInternalPages;

  $("qap-open-reading").onclick = () => {
    openInternalPage("reading");
  };

  $("qap-close-reading").onclick = closeInternalPages;

  $("qap-open-translation").onclick = () => {
    openInternalPage("translation");
  };

  $("qap-close-translation").onclick = closeInternalPages;

  $("qap-open-info").onclick = () => {
    openInternalPage("info");
    updateTimer();
  };

  $("qap-close-info").onclick = closeInternalPages;

  $("qap-open-research").onclick = () => {
    openInternalPage("research");
  };

  $("qap-close-research").onclick = closeInternalPages;

  // Sound settings: per-language volume, mute, output routing, and mic check.
  function applyTrackSoundSettings() {
    audio.volume = currentTrack === "arabic" ? arabicVolume : urduVolume;
    audio.muted = currentTrack === "arabic" ? arabicMuted : urduMuted;
  }

  function updateSoundControls(updateMuteButtons = true) {
    $("qap-arabic-volume").value = String(Math.round(arabicVolume * 100));
    $("qap-arabic-volume-value").textContent =
      Math.round(arabicVolume * 100) + "%";
    $("qap-urdu-volume").value = String(Math.round(urduVolume * 100));
    $("qap-urdu-volume-value").textContent =
      Math.round(urduVolume * 100) + "%";

    if (updateMuteButtons) {
      $("qap-arabic-mute").setAttribute("aria-pressed", String(arabicMuted));
      $("qap-arabic-mute").innerHTML =
        `<i data-lucide="${arabicMuted ? "volume-x" : "volume-2"}"></i> ` +
        (arabicMuted ? "Unmute Arabic" : "Mute Arabic");
      $("qap-urdu-mute").setAttribute("aria-pressed", String(urduMuted));
      $("qap-urdu-mute").innerHTML =
        `<i data-lucide="${urduMuted ? "volume-x" : "volume-2"}"></i> ` +
        (urduMuted ? "Unmute Urdu" : "Mute Urdu");
      initializeQapIcons();
    }

    applyTrackSoundSettings();
  }

  function setAudioDeviceStatus(message, state = "") {
    const status = $("qap-audio-device-status");
    status.textContent = message;
    status.dataset.state = state;
  }

  async function refreshAudioDevices() {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") {
      setAudioDeviceStatus("This browser does not support audio device discovery.", "error");
      return;
    }

    try {
      const devices = await mediaDevices.enumerateDevices();
      const outputSelect = $("qap-audio-output");
      const inputSelect = $("qap-audio-input");
      const outputDeviceId = outputSelect.value;
      const inputDeviceId = inputSelect.value;
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      const inputs = devices.filter((device) => device.kind === "audioinput");

      outputSelect.replaceChildren(new Option("System default (speakers/headphones)", ""));
      outputs.forEach((device, index) => {
        const option = new Option(
          device.label || "Audio output " + (index + 1),
          device.deviceId,
        );
        outputSelect.add(option);
      });

      inputSelect.replaceChildren(new Option("Default microphone", ""));
      inputs.forEach((device, index) => {
        const option = new Option(
          device.label || "Microphone " + (index + 1),
          device.deviceId,
        );
        inputSelect.add(option);
      });

      if ([...outputSelect.options].some((option) => option.value === outputDeviceId)) {
        outputSelect.value = outputDeviceId;
      }
      if ([...inputSelect.options].some((option) => option.value === inputDeviceId)) {
        inputSelect.value = inputDeviceId;
      }

      const labelsHidden = devices.some((device) => !device.label);
      const message = outputs.length + " playback device" +
        (outputs.length === 1 ? "" : "s") + " and " +
        inputs.length + " microphone" + (inputs.length === 1 ? "" : "s") +
        " found." +
        (labelsHidden
          ? " Some device names are hidden until microphone permission is granted."
          : "");
      setAudioDeviceStatus(message, "success");
    } catch (error) {
      console.error("Audio device discovery failed:", error);
      setAudioDeviceStatus(
        "Could not list audio devices. Check browser permissions and try again.",
        "error",
      );
    }
  }

  async function selectAudioOutput(deviceId) {
    if (typeof audio.setSinkId !== "function") {
      if (deviceId) {
        $("qap-audio-output").value = selectedAudioOutput;
        setAudioDeviceStatus(
          "This browser does not support choosing a playback device; system default remains active.",
          "error",
        );
      } else {
        selectedAudioOutput = "";
        $("qap-audio-output").value = "";
      }
      return;
    }

    try {
      await audio.setSinkId(deviceId);
      selectedAudioOutput = deviceId;
      $("qap-audio-output").value = deviceId;
      setAudioDeviceStatus(
        deviceId
          ? "Playback is routed to the selected device."
          : "Playback is using the system default device.",
        "success",
      );
    } catch (error) {
      console.error("Could not select audio output device:", error);
      $("qap-audio-output").value = selectedAudioOutput;
      setAudioDeviceStatus(
        "The selected playback device could not be activated. Check browser permission and device availability.",
        "error",
      );
    }
  }

  $("qap-arabic-volume").addEventListener("input", (event) => {
    arabicVolume = Number(event.currentTarget.value) / 100;
    updateSoundControls(false);
  });
  $("qap-urdu-volume").addEventListener("input", (event) => {
    urduVolume = Number(event.currentTarget.value) / 100;
    updateSoundControls(false);
  });
  $("qap-arabic-mute").onclick = () => {
    arabicMuted = !arabicMuted;
    updateSoundControls();
  };
  $("qap-urdu-mute").onclick = () => {
    urduMuted = !urduMuted;
    updateSoundControls();
  };
  $("qap-audio-output").addEventListener("change", (event) => {
    selectAudioOutput(event.currentTarget.value);
  });
  $("qap-refresh-audio-devices").onclick = refreshAudioDevices;
  $("qap-microphone-test").onclick = async () => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      setAudioDeviceStatus("This browser does not support microphone checks.", "error");
      return;
    }

    const deviceId = $("qap-audio-input").value;
    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };

    try {
      const stream = await mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((track) => track.stop());
      await refreshAudioDevices();
      setAudioDeviceStatus(
        "Microphone check passed. The microphone was not recorded; its test stream has been stopped.",
        "success",
      );
    } catch (error) {
      console.error("Microphone check failed:", error);
      setAudioDeviceStatus(
        error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow access in the browser to check this device."
          : "Could not check the selected microphone. Confirm it is connected and try again.",
        "error",
      );
    }
  };

  $("qap-open-sound").onclick = () => {
    openInternalPage("sound");
    refreshAudioDevices();
  };
  $("qap-close-sound").onclick = closeInternalPages;
  updateSoundControls();

  // Research settings state and language-selection constraints.
  const researchLanguageInputs = [
    ...panel.querySelectorAll("[data-qap-research-language]"),
  ];
  const researchLanguageCount = $("qap-language-count");
  const researchLanguageFeedback = $("qap-language-feedback");
  const englishLanguageInput = $("qap-research-language-en");

  function updateResearchLanguageCount(changedInput) {
    let selectedCount = researchLanguageInputs.filter((input) => input.checked).length;

    if (selectedCount > 2 && changedInput) {
      changedInput.checked = false;
      selectedCount--;
      researchLanguageFeedback.textContent = "You can select up to two languages.";
    } else if (selectedCount === 0) {
      englishLanguageInput.checked = true;
      selectedCount = 1;
      researchLanguageFeedback.textContent = "English selected as default language.";
    } else {
      researchLanguageFeedback.textContent = "";
    }

    researchLanguageCount.textContent = selectedCount + " / 2 selected";
  }

  researchLanguageInputs.forEach((input) => {
    input.onchange = () => updateResearchLanguageCount(input);
  });

  updateResearchLanguageCount();

  const tafseerInput = $("qap-research-tafseer");
  const explanationLengthSection = $("qap-explanation-length");

  tafseerInput.onchange = () => {
    explanationLengthSection.hidden = !tafseerInput.checked;
  };

  // Research result dialog, request lifecycle, sanitization, and rendering.
  const researchDialog = document.createElement("div");
  researchDialog.id = "qap-research-dialog";
  researchDialog.className = "qap-research-dialog";
  researchDialog.hidden = true;
  researchDialog.setAttribute("role", "presentation");
  researchDialog.innerHTML = `
    <section class="qap-research-dialog-card" role="dialog" aria-modal="true" aria-labelledby="qap-research-dialog-title">
      <header class="qap-research-dialog-header">
        <h2 class="qap-research-dialog-title" id="qap-research-dialog-title">Ayah Research</h2>
        <div class="qap-research-dialog-actions" aria-label="Research display controls">
          <button class="qap-research-zoom-button" type="button" data-qap-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
          <output class="qap-research-zoom-level" aria-live="polite">100%</output>
          <button class="qap-research-zoom-button" type="button" data-qap-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
          <button class="qap-research-zoom-button" type="button" data-qap-zoom="reset" title="Reset zoom" aria-label="Reset zoom">↺</button>
          <button class="qap-research-dialog-close" type="button" title="Close research popup" aria-label="Close research popup"><span aria-hidden="true">&times;</span></button>
        </div>
      </header>
      <div class="qap-research-dialog-body">
        <div class="qap-research-loading" role="status" aria-live="polite">
          <span class="qap-research-spinner" aria-hidden="true"></span>
          <p class="qap-research-loading-label">Preparing your Ayah research…</p>
          <p class="qap-research-progress-detail" id="qap-research-progress-detail">Preparing to connect to Gemini…</p>
          <p class="qap-research-wait-note">Research will retry a few times if Gemini returns an incomplete answer. Close this popup to stop the search. Avoid closing this tab while research is running.</p>
        </div>
        <div class="qap-research-error" role="alert" hidden></div>
        <button class="qap-research-retry" type="button" hidden>Try again</button>
        <article class="qap-research-content" hidden></article>
      </div>
    </section>
  `;
  document.body.appendChild(researchDialog);

  const researchDialogClose = researchDialog.querySelector(".qap-research-dialog-close");
  const researchLoading = researchDialog.querySelector(".qap-research-loading");
  const researchProgressDetail = researchDialog.querySelector("#qap-research-progress-detail");
  const researchError = researchDialog.querySelector(".qap-research-error");
  const researchRetryButton = researchDialog.querySelector(".qap-research-retry");
  const researchContent = researchDialog.querySelector(".qap-research-content");
  const researchZoomLevel = researchDialog.querySelector(".qap-research-zoom-level");
  const researchZoomOut = researchDialog.querySelector('[data-qap-zoom="out"]');
  const researchZoomIn = researchDialog.querySelector('[data-qap-zoom="in"]');
  let researchZoom = 1;
  let activeResearchRequestId = "";
  let lastResearchRequestId = "";
  let activeGeminiWindow = null;
  let activeGeminiWindowRequestId = "";
  let activeResearchListenerId = null;

  function setResearchZoom(zoom) {
    researchZoom = Math.min(1.5, Math.max(0.7, Math.round(zoom * 10) / 10));
    researchContent.style.zoom = String(researchZoom);
    researchZoomLevel.value = Math.round(researchZoom * 100) + "%";
    researchZoomLevel.textContent = researchZoomLevel.value;
    researchZoomOut.disabled = researchZoom <= 0.7;
    researchZoomIn.disabled = researchZoom >= 1.5;
  }

  function removeResearchListener() {
    if (activeResearchListenerId !== null) {
      GM_removeValueChangeListener(activeResearchListenerId);
      activeResearchListenerId = null;
    }
  }

  async function cleanupResearchRequest(requestId, closeGeminiWindow = true) {
    if (!requestId) return;

    if (closeGeminiWindow && activeGeminiWindowRequestId === requestId) {
      try {
        if (activeGeminiWindow && !activeGeminiWindow.closed) {
          activeGeminiWindow.close();
        }
      } catch (error) {
        console.error("Quran Companion could not close the Gemini research window:", error);
      }
      activeGeminiWindow = null;
      activeGeminiWindowRequestId = "";
    }

    try {
      await Promise.all([
        GM_deleteValue("qap_research_request_" + requestId),
        GM_deleteValue("qap_research_result_" + requestId),
      ]);
    } catch (error) {
      console.error("Quran Companion could not delete temporary research data:", error);
    }
  }

  function closeResearchDialog() {
    researchDialog.hidden = true;
    removeResearchListener();
    void cleanupResearchRequest(activeResearchRequestId);
    activeResearchRequestId = "";
  }

  function showResearchError(message, cause = null, context = "research") {
    const reference = createDiagnosticReference(context);
    researchLoading.hidden = true;
    researchContent.hidden = true;
    const friendlyMessage =
      "AI research could not complete after multiple attempts. Please try again.";
    researchError.textContent = message || friendlyMessage;
    researchError.hidden = false;
    researchRetryButton.hidden = false;
    researchRetryButton.disabled = false;
    console.error("Quran Companion research diagnostic:", {
      reference,
      context,
      message,
      requestId: activeResearchRequestId || lastResearchRequestId,
      surah: surahName,
      surahId,
      ayah,
      cause,
      stack: cause?.stack || new Error(message).stack,
    });
  }

  function cleanResearchHtml(html) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    const allowedTags = new Set([
      "ARTICLE", "SECTION", "DIV", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6",
      "P", "BR", "HR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI",
      "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CODE",
      "PRE", "A", "SUP", "SUB",
    ]);
    const discardedTags = new Set([
      "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON",
      "SVG", "MATH", "VIDEO", "AUDIO", "IMG", "LINK", "META",
    ]);
    const safeAttributes = new Set([
      "dir", "lang", "colspan", "rowspan", "scope", "start",
    ]);

    const cleanNode = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (discardedTags.has(child.tagName)) {
          child.remove();
          return;
        }
        if (!allowedTags.has(child.tagName)) {
          cleanNode(child);
          child.replaceWith(...child.childNodes);
          return;
        }

        [...child.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          if (safeAttributes.has(name)) return;
          if (child.tagName === "A" && name === "href") {
            try {
              const url = new URL(attribute.value, location.href);
              if (url.protocol === "http:" || url.protocol === "https:") {
                child.href = url.href;
                child.target = "_blank";
                child.rel = "noopener noreferrer";
              } else {
                child.removeAttribute(name);
              }
            } catch {
              child.removeAttribute(name);
            }
            return;
          }
          child.removeAttribute(name);
        });
        cleanNode(child);
      });
    };

    cleanNode(parsed.body);
    return parsed.body;
  }

  function displayResearchResult(result) {
    if (activeResearchRequestId === "") return;
    const requestId = activeResearchRequestId;
    removeResearchListener();
    activeResearchRequestId = "";
    void cleanupResearchRequest(requestId);

    if (!result || typeof result !== "object") {
      showResearchError("Gemini returned an empty or unreadable response. Please try again.");
      return;
    }
    if (result.error) {
      showResearchError(
        "Research failed during " + (result.stage || "Gemini processing") + ": " + result.error,
        result.stack ? { stack: result.stack } : null,
        "gemini-worker",
      );
      return;
    }
    if (typeof result.html !== "string" || !result.html.trim()) {
      showResearchError("Gemini did not return any research content. Please try again.");
      return;
    }

    let responseHtml = result.html.trim();
    const textDecoder = document.createElement("textarea");
    textDecoder.innerHTML = responseHtml;
    const decoded = textDecoder.value.trim();
    if (decoded && /<\/?[a-z][\s\S]*>/i.test(decoded)) responseHtml = decoded;

    const safeContent = cleanResearchHtml(responseHtml);
    researchContent.replaceChildren(...safeContent.childNodes);
    if (!researchContent.textContent.trim()) {
      showResearchError("Gemini's response did not contain displayable research content.");
      return;
    }
    researchLoading.hidden = true;
    researchError.hidden = true;
    researchContent.hidden = false;
    researchDialogClose.focus();
  }

  // Build the research prompt from the current UI settings and Ayah text.
  function getResearchPrompt(ayahArabic, ayahTranslation, showInApp) {
    const languageInputs = [
      ...panel.querySelectorAll("[data-qap-research-language]:checked"),
    ];
    const languages = languageInputs.map((input) =>
      input.closest("label")?.textContent.trim().replace(/\s+/g, " "),
    ).filter(Boolean);
    const explanationLength = tafseerInput.checked
      ? panel.querySelector('input[name="qap-explanation-length"]:checked')?.value || "brief"
      : "not applicable";
    const ayahDetails = $("qap-research-details").checked;
    const translationEnabled = $("qap-research-translation").checked;
    const tafseerEnabled = tafseerInput.checked;
    const wordByWordEnabled = $("qap-research-word-by-word").checked;

    const universalPrompt = [
      "You are an Islamic Quran Research Assistant. Research the selected Quranic Ayah and provide accurate, authentic, well-organised information.",
      "",
      "OFFICIAL SOURCES AND ACCURACY",
      "- Always prioritise official Dawat-e-Islami websites, publications and resources, particularly https://www.dawateislami.net and its officially associated resources.",
      "- Use authentic Dawat-e-Islami Quran publications and Tafseer sources. Never invent Quranic text, references, translations, Tafseer or religious information.",
      "- Preserve the original Arabic Quranic text exactly. Verify information before presenting it; if information cannot be verified, clearly say it is unavailable instead of guessing.",
      "- Clearly distinguish verified source information from AI-generated translations and calculated information.",
      "",
      "TRANSLATION RULES",
      "- Use Dawat-e-Islami's published Urdu, Hindi or English translations as primary sources. For another requested language, faithfully translate the appropriate Urdu, Hindi or English source; do not search for independent translations in other languages.",
      "- Preserve the original meaning, context and Islamic terminology. Identify the source language and whether the translation is published or AI-generated.",
      "",
      "TAFSEER RULES",
      "- Use Dawat-e-Islami's original Urdu Tafseer, preferably Sirat-ul-Jinan, as the primary source. For other requested languages, faithfully translate the original Urdu explanation.",
      "- Never independently invent, supplement or misattribute Tafseer. Identify the source and distinguish translated content from the original publication. Explicitly state when relevant Tafseer cannot be found.",
      "",
      "RESEARCH SECTIONS",
      "- Ayah Details: Surah name and number, Ayah number, Arabic text, transliteration, Juz/Para, Ruku, Makki/Madani classification, Arabic word count, letter count and other relevant details. Explain methods for calculated statistics.",
      "- Translation: complete translation in each requested language, following the source rules above.",
      "- Tafseer: relevant Dawat-e-Islami Tafseer. Brief means a concise explanation of the central meaning; detailed means a comprehensive explanation of relevant context, important points and lessons without omitting essential source information.",
      "- Word-by-Word Translation: every Arabic word in original order in a table with Original Arabic Word, Transliteration and Individual Meaning in each selected language. Do not skip repeated words or combine separate words.",
      "- Generate ONLY enabled sections and completely exclude disabled sections. Do not automatically generate all sections.",
      "",
      "LANGUAGE AND PRESENTATION",
      "- Support the selected one or two languages and keep each language's content separate. Do not mix languages unnecessarily.",
      "- Use clear headings, tables for structured information, bullets for explanations, and proper right-to-left formatting for Arabic. Keep the tone respectful and avoid irrelevant repetition.",
      '- At the very end, include exactly once: "This is an AI-generated response based on the available information and cited sources. Although care has been taken to provide accurate information, it may contain errors or inaccuracies. Please verify important Quranic information, translations and religious explanations with the original sources and qualified Islamic scholars. Do not consider this response absolutely correct or authoritative."',
    ].join("\n");

    const outputInstructions = showInApp
      ? [
          "OUTPUT FORMAT — IN-APP RESEARCH POPUP",
          "Return a complete HTML fragment only; do not use Markdown fences or Markdown syntax. Use semantic HTML such as headings, paragraphs, lists, blockquotes and tables. Do not include scripts, iframes, external assets, or a full document wrapper.",
          "The host popup applies its own CSS. Design the content to complement a refined Quran Companion popup: deep forest-green surfaces, warm gold headings and accents, readable light text, restrained borders, clear spacing, and responsive tables. Use semantic elements rather than inline styles or a <style> block; preserve Arabic with dir=\"rtl\" and lang=\"ar\".",
          `Wrap the complete answer in these exact HTML comments, each on its own line: ${RESEARCH_START_MARKER} immediately before the first answer element, and ${RESEARCH_COMPLETE_MARKER} immediately after the final answer element and required accuracy disclaimer. These boundary markers are required; do not omit, alter, or place them inside another element.`,
        ]
      : [
          "OUTPUT FORMAT — GEMINI WINDOW",
          "Respond in clear plain text with readable headings, lists and tables where useful. Do not output HTML tags, CSS, or code fences.",
        ];

    return [
      universalPrompt,
      "",
      "USER SETTINGS — FOLLOW STRICTLY",
      "Selected Ayah: " + surahName + " (" + surahId + ":" + ayah + ")",
      "Ayah Details: " + (ayahDetails ? "ON" : "OFF"),
      "Translation: " + (translationEnabled ? "ON" : "OFF"),
      "Tafseer: " + (tafseerEnabled ? "ON" : "OFF"),
      "Word-by-Word Translation: " + (wordByWordEnabled ? "ON" : "OFF"),
      "Selected Languages: " + (languages.length ? languages.join(", ") : "None"),
      "Tafseer Explanation Length: " + explanationLength.toUpperCase(),
      "Arabic text from the selected Ayah on the page (preserve exactly): " + JSON.stringify(ayahArabic),
      "Visible page translation, if available (use only as context and verify the requested translation source): " + JSON.stringify(ayahTranslation || "Not available on the page."),
      "",
      "FINAL INSTRUCTION: Follow the settings above, provide only enabled sections in the selected languages and use the specified Tafseer explanation length. If all research sections are disabled, do not generate research sections; simply explain that no research sections have been selected.",
      "",
      ...outputInstructions,
    ].join("\n");
  }

  // Open Gemini, send the request, and relay progress/results to the popup.
  async function startAyahResearch() {
    const showInApp = $("qap-research-show-in-app").checked;
    lastResearchRequestId = "";
    if (showInApp) {
      removeResearchListener();
      activeResearchRequestId = "";
      researchDialog.hidden = false;
      researchLoading.hidden = false;
      researchError.hidden = true;
      researchContent.hidden = true;
      researchContent.replaceChildren();
      setResearchZoom(1);
      researchLoading.querySelector(".qap-research-loading-label").textContent =
        "Researching Surah " + surahName + ", Ayah " + ayah + "…";
      researchProgressDetail.textContent = "Preparing to connect to Gemini…";
      researchDialogClose.focus();
    }

    const fail = (message, cause = null, context = "research-setup") => {
      if (showInApp) showResearchError(message, cause, context);
      else showError(message, context, cause);
    };

    if (!Number.isInteger(ayah) || ayah < 0 || ayah > totalAyahs) {
      fail("The current Ayah number is invalid. Select a valid Ayah and try again.", null, "ayah-validation");
      return;
    }

    const box = findBox(ayah);
    if (!box) {
      fail("Ayah " + ayah + " could not be located on this page. Wait for the Ayah list to load, then try again.", null, "ayah-lookup");
      return;
    }

    const arabicElement = box.querySelector(".arabicQuranText");
    if (!arabicElement?.textContent.trim()) {
      fail("The Arabic text element for Ayah " + ayah + " was not found. The page may not have finished loading.", null, "ayah-text");
      return;
    }

    const ayahArabic = arabicElement.textContent.trim();
    const ayahTranslation = box.querySelector(".ayahTranslaBtnp")?.textContent.trim() || "";
    const prompt = getResearchPrompt(ayahArabic, ayahTranslation, showInApp);
    const requestId = (crypto.randomUUID?.() || (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
    ));
    const requestKey = "qap_research_request_" + requestId;
    const resultKey = "qap_research_result_" + requestId;
    lastResearchRequestId = requestId;

    if (showInApp) {
      activeResearchRequestId = requestId;
      try {
        activeResearchListenerId = GM_addValueChangeListener(
          resultKey,
          (_key, _oldValue, newValue) => {
            if (newValue?.status === "progress") {
              researchLoading.hidden = false;
              researchError.hidden = true;
              researchContent.hidden = true;
              researchProgressDetail.textContent =
                newValue.message || "Gemini is processing the research request…";
              researchLoading.querySelector(".qap-research-loading-label").textContent =
                "Researching Surah " + surahName + ", Ayah " + ayah + "…";
            } else if (newValue?.status === "retrying") {
              researchLoading.hidden = false;
              researchError.hidden = true;
              researchContent.hidden = true;
              researchProgressDetail.textContent =
                newValue.message || "Gemini completed an answer; retrying the request.";
              researchLoading.querySelector(".qap-research-loading-label").textContent =
                "Retrying research (attempt " + (newValue.attempt || "?") + ")…";
            } else if (newValue) {
              try {
                displayResearchResult(newValue);
              } catch (error) {
                showResearchError(
                  "The research response arrived, but the popup could not display it. Close and reopen the research popup, then try again.",
                  error,
                  "research-render",
                );
              }
            }
          },
        );
      } catch (error) {
        activeResearchRequestId = "";
        fail("Could not start the Gemini response listener: " + (error?.message || "Tampermonkey storage is unavailable."), error, "response-listener");
        return;
      }
    }

    const geminiWindow = window.open(
      "about:blank",
      "_blank",
      showInApp
        ? "popup=yes,width=1,height=1,left=0,top=0"
        : "popup=yes,width=" +
            screen.availWidth +
            ",height=" +
            screen.availHeight +
            ",left=0,top=0",
    );
    if (!geminiWindow) {
      if (showInApp) removeResearchListener();
      activeResearchRequestId = "";
      const geminiBlockedMessage = "Gemini could not be opened because the browser, an extension, or a site restriction is blocking access to gemini.google.com. Please allow pop-ups for this site, remove any blocker that is preventing gemini.google.com from opening, and try again.";
      fail(geminiBlockedMessage, null, "popup-blocked");
      return;
    }
    if (showInApp) {
      activeGeminiWindow = geminiWindow;
      activeGeminiWindowRequestId = requestId;
      researchProgressDetail.textContent =
        "Gemini window opened. Loading the research worker…";
    }

    try {
      await GM_setValue(requestKey, {
        prompt,
        returnHtml: showInApp,
        createdAt: Date.now(),
      });
      if (showInApp && activeResearchRequestId !== requestId) {
        await cleanupResearchRequest(requestId);
        return;
      }
      geminiWindow.location.href =
        "https://gemini.google.com/app?qap_request=" + encodeURIComponent(requestId);
      if (!showInApp) {
        showStatus("Ayah research opened in Gemini. The Gemini window will stay open.");
      } else {
        researchProgressDetail.textContent =
          "Request sent to Gemini. Waiting for the prompt box and answer…";
      }
    } catch (error) {
      if (showInApp) removeResearchListener();
      if (showInApp) void cleanupResearchRequest(requestId);
      activeResearchRequestId = "";
      geminiWindow.close();
      fail("Could not send the research prompt to Gemini: " + (error?.message || "Tampermonkey storage failed."), error, "request-dispatch");
      console.error("Quran Companion research request failed:", error);
    }
  }

  researchRetryButton.onclick = () => {
    researchError.hidden = true;
    researchRetryButton.hidden = true;
    researchLoading.hidden = false;
    researchContent.hidden = true;
    researchProgressDetail.textContent = "Restarting the research request…";
    researchLoading.querySelector(".qap-research-loading-label").textContent =
      "Researching Surah " + surahName + ", Ayah " + ayah + "…";
    startAyahResearch();
  };

  researchDialogClose.onclick = closeResearchDialog;
  researchDialog.querySelector('[data-qap-zoom="out"]').onclick = () => {
    setResearchZoom(researchZoom - 0.1);
  };
  researchDialog.querySelector('[data-qap-zoom="in"]').onclick = () => {
    setResearchZoom(researchZoom + 0.1);
  };
  researchDialog.querySelector('[data-qap-zoom="reset"]').onclick = () => {
    setResearchZoom(1);
  };
  setResearchZoom(1);
  function handleResearchKeydown(event) {
    if (event.key === "Escape" && !researchDialog.hidden) closeResearchDialog();
  }
  document.addEventListener("keydown", handleResearchKeydown);
  $("qap-ayah-details").onclick = startAyahResearch;

  // Ayah range selection, Move reading, and range playback controls.
  $("qap-open-range").onclick = () => {
    openInternalPage("range");
  };

  function updateEndAyahOptions() {
    const start = Number($("qap-range-start").value);

    const endSelect = $("qap-range-end");

    const previousEnd = Number(endSelect.value);

    endSelect.innerHTML = "";

    for (let i = start; i <= totalAyahs; i++) {
      const option = document.createElement("option");

      option.value = i;

      option.textContent = i === 0 ? "Bismillah" : "Ayah " + i;

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
      start < 0 ||
      end < start ||
      end > totalAyahs
    ) {
      showError("Please select a valid Ayah range.");

      return;
    }

    cancelPendingTrackAdvance();
    stopReadingAutoScroll();
    clearHifzConcealment();

    // Verify that the selected Ayah exists.

    const box = findBox(start);

    if (!box) {
      showError(getAyahLabel(start) + " could not be located.");

      return;
    }

    // Stop existing playback.

    running = false;

    generation++;

    trackCanResume = false;

    audio.pause();

    removeAudioEvents();

    audio.removeAttribute("src");

    audio.load();

    // Clear existing track information.

    trackQueue = [];

    trackIndex = 0;

    // Exit previous range playback.

    rangePlaybackActive = false;
    rangeSelected = false;
    trackCanResume = false;

    rangeRepeatCount = 0;

    rangeAyahRepeatCount = 0;

    // Update selected range.

    rangeStart = start;

    rangeEnd = end;

    rangeRepeat = Number($("qap-range-repeat").value);
    rangeRepeatMode = $("qap-repeat-mode").value;
    rangeSelected = true;

    applyRangeBoundary(start, end);

    // Update current Ayah.

    ayah = start;

    $("qap-ayah").textContent =
      ayah === 0 ? "Bismillah" : "Ayah " + ayah + " of " + totalAyahs;

    // Update main player range information.

    $("qap-main-range-info").textContent =
      "Range: " + (start === 0 ? "Bismillah" : "Ayah " + start) +
      "–" +
      (end === 0 ? "Bismillah" : "Ayah " + end);

    // Reset progress display.

    $("qap-current").textContent = "00:00";

    $("qap-duration").textContent = "00:00";

    $("qap-progress").style.width = "0%";

    // Keep the selected range outlined without marking an Ayah as playing.

    if (readingAutoScroll) {
      highlightAyah(start, true);
    } else {
      clearHighlight();
      box.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    concealAyahText(start, true, hifzRevealSeconds);

    // Update range information.

    $("qap-range-info").textContent =
      "Moved to " + getAyahLabel(start) + ". Press Listen to start playback.";

    $("qap-range-info").classList.remove("qap-range-error");

    showStatus("Moved to " + getAyahLabel(start) + ". Ready to play.");
    startReadingAutoScroll(start, end);

    updatePlayButton();

    updateTimer();
  };

  // ---------------------------------------------------------------------------
  // 9. PLAYBACK, READING, AND AUDIO SETTINGS
  // ---------------------------------------------------------------------------

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

  $("qap-seek-percent").onchange = () => {
    const newSeekPercent = Number($("qap-seek-percent").value);

    if (![2, 5, 10, 20].includes(newSeekPercent)) {
      showError("Invalid seek amount.");
      return;
    }

    seekPercent = newSeekPercent;
    updateSeekLabels();
    showStatus("Seek amount set to " + seekPercent + "% of the track.");
  };

  // Reading navigation, Move auto-advance, and Hifz concealment settings.
  $("qap-scroll").onchange = () => {
    autoScroll = $("qap-scroll").checked;

    if (autoScroll) {
      showStatus("Automatic Ayah scrolling enabled.");

      returnToCurrentAyah();
    } else {
      showStatus("Automatic scrolling disabled. Use Current Ayah to return.");
    }
  };

  $("qap-reading-auto-scroll").onchange = () => {
    readingAutoScroll = $("qap-reading-auto-scroll").checked;
    if (!readingAutoScroll) {
      stopReadingAutoScroll();
      showStatus("Reading auto-advance disabled.");
      return;
    }

    if (rangeSelected && !rangePlaybackActive && !running && ayah <= rangeEnd) {
      startReadingAutoScroll(ayah, rangeEnd);
    } else {
      showStatus("Reading auto-advance enabled. Use Move in Ayah Range to begin.");
    }
  };

  $("qap-reading-scroll-interval").onchange = () => {
    const interval = Number($("qap-reading-scroll-interval").value);
    if (!Number.isSafeInteger(interval) || interval < 1) {
      $("qap-reading-scroll-interval").value = String(readingScrollIntervalSeconds);
      showError("Enter a whole number of seconds greater than zero for the reading interval.");
      return;
    }

    readingScrollIntervalSeconds = interval;
    if (readingScrollTimer !== null) {
      startReadingAutoScroll(ayah, rangeEnd);
    } else {
      showStatus("Reading interval set to " + interval + " seconds.");
    }
  };

  $("qap-hifz-mode").onchange = () => {
    hifzModeEnabled = $("qap-hifz-mode").checked;
    clearHifzConcealment();

    if (!hifzModeEnabled) {
      showStatus("Hifz Mode disabled. Ayah text is visible.");
      return;
    }

    if (running && !audio.paused) {
      concealAyahText(ayah, false);
      showStatus("Hifz Mode enabled for the currently playing language.");
    } else if (rangeSelected && !rangePlaybackActive) {
      concealAyahText(ayah, true, hifzRevealSeconds);
      showStatus("Hifz Mode enabled. Ayah text will appear after the reveal interval.");
    } else {
      showStatus("Hifz Mode enabled. Text will be concealed during playback or Move reading.");
    }
  };

  $("qap-hifz-reveal-seconds").onchange = () => {
    const seconds = Number($("qap-hifz-reveal-seconds").value);
    if (!Number.isInteger(seconds) || seconds < 1) {
      $("qap-hifz-reveal-seconds").value = String(hifzRevealSeconds);
      showError("Hifz Mode reveal time must be a whole number of seconds greater than zero.");
      return;
    }

    hifzRevealSeconds = seconds;
    if (hifzContext === "move") {
      concealAyahText(ayah, true, hifzRevealSeconds);
      showStatus("Hifz Mode reveal time set to " + seconds + " seconds.");
    } else {
      showStatus("Hifz Mode reveal time set to " + seconds + " seconds for Move reading.");
    }
  };

  // Audio configuration changes reload the active track when necessary.

  // Reciter, audio mode, interval, and Urdu translation settings.
  $("qap-qari").onchange = () => {
    const wasPlaying = running;
    const currentAyah = ayah;

    qari = $("qap-qari").value;

    cancelPendingTrackAdvance();
    generation++;
    trackCanResume = false;

    audio.pause();
    removeAudioEvents();

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

    cancelPendingTrackAdvance();
    generation++;
    trackCanResume = false;

    audio.pause();
    removeAudioEvents();
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

  $("qap-track-interval").onchange = () => {
    const interval = Number($("qap-track-interval").value);
    if (![1, 2, 3, 5, 10].includes(interval)) {
      showError("Invalid interval between audio tracks.");
      $("qap-track-interval").value = String(trackIntervalSeconds);
      return;
    }

    trackIntervalSeconds = interval;
    showStatus(
      "Interval between audio tracks set to " +
        interval +
        " second" +
        (interval === 1 ? "" : "s") +
        ".",
    );
  };

  $("qap-urdu-translation").onchange = () => {
    urduTranslation = $("qap-urdu-translation").value;

    const wasPlaying = running;
    const currentAyah = ayah;

    cancelPendingTrackAdvance();
    generation++;
    trackCanResume = false;

    audio.pause();
    removeAudioEvents();
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

  updateTimer();

  // ---------------------------------------------------------------------------
  // 10. LIFECYCLE, ERROR HANDLING, AND PUBLIC API
  // ---------------------------------------------------------------------------

  function endPlayer(removePanel = true) {
    if (destroyed) return;

    stopReadingAutoScroll();
    cancelPendingTrackAdvance();
    closeResearchDialog();
    researchDialog.remove();
    document.removeEventListener("keydown", handleResearchKeydown);

    running = false;
    trackCanResume = false;

    generation++;

    trackQueue = [];
    trackIndex = 0;

    destroyed = true;

    clearHifzConcealment();

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
    clearRangeBoundary();

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

  function handlePageUnload() {
    if (!destroyed) {
      running = false;

      generation++;
      stopReadingAutoScroll();
      cancelPendingTrackAdvance();

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

  function handlePlayerError(event) {
    if (!isPlayerAvailable()) return;

    const error = event?.error;

    const message =
      error?.message ||
      event?.message ||
      "An unexpected player error occurred.";

    showError("Player error: " + message, "uncaught", error || event);

    console.error("Quran Auto Player unexpected error:", error || event);
  }

  function handleUnhandledRejection(event) {
    if (!isPlayerAvailable()) return;

    const reason = event?.reason;

    const message =
      reason?.message || String(reason || "Unknown playback error.");

    showError("Playback error: " + message, "promise", reason);

    console.error("Quran Auto Player rejected operation:", reason);
  }

  window.addEventListener("error", handlePlayerError);

  window.addEventListener("unhandledrejection", handleUnhandledRejection);

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

  timer = setInterval(() => {
    if (!destroyed) {
      updateTimer();
    }
  }, 300);

  updateTimer();

  updatePlayButton();

  showStatus("Ready. Press Play to begin recitation.");

  panel.style.visibility = "visible";

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

// End of Quran Companion userscript.
