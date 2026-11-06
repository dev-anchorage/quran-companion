# Quran Companion

Quran Companion is a Tampermonkey userscript for Dawat-e-Islami Quran Surah
translation pages. It adds recitation playback, Ayah-range listening and reading,
Hifz practice, sound controls, and optional Gemini-assisted Ayah research.

**Current version:** `1.1.0`

## Contents

- [Highlights](#highlights)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Player controls](#player-controls)
- [Settings guide](#settings-guide)
- [Ayah research](#ayah-research)
- [Privacy and permissions](#privacy-and-permissions)
- [Troubleshooting](#troubleshooting)
- [Updating and releases](#updating-and-releases)

## Highlights

- Starts each Surah with Bismillah as special **Ayah 0**, including range
  selection, highlighting, and audio playback. It is not counted as a numbered
  Quranic Ayah.
- Plays Arabic, Urdu, or both audio tracks, with reciter, translation, speed,
  volume, and output-device controls.
- Supports repeatable Ayah ranges, page navigation, timed reading advance, and
  Hifz Mode.
- Offers optional Gemini research in a styled in-page dialog or a separate
  Gemini window. In-app answers are requested in structured HTML and sanitized
  before display.
- Handles incomplete Gemini answers with up to three attempts and a **Try
  again** action. Blocked Gemini access produces a user-facing message.

### Version 1.1.0

This release brings together the recent player and research improvements:

- Added Bismillah playback and selection as Ayah 0.
- Added expanded reading tools, Hifz Mode, independent Arabic/Urdu volume and
  mute controls, audio-device selection, and a microphone check.
- Improved Gemini startup and blocked-access feedback, bounded incomplete-answer
  retries, and added a retry action in the research dialog.
- Improved in-app research layout instructions for multilingual sections,
  tables, notes, and the highlighted AI disclaimer. The research dialog is wider
  on desktop and nearly full-width on small screens.

## Compatibility

- A userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) is
  required.
- The player runs on Dawat-e-Islami Surah translation pages matching
  `https://www.dawateislami.net/quran/surah-*/translation-*`.
- Ayah research opens `https://gemini.google.com/`; sign in to Gemini and allow
  pop-ups from the Dawat-e-Islami page.
- Device discovery and playback-output routing vary by browser. Output routing
  requires browser support for `HTMLMediaElement.setSinkId()`.
- An internet connection is needed for the website audio, Gemini, and the
  Lucide icon library loaded by the userscript.

## Installation

1. Install Tampermonkey in your browser.
2. Select the install button below. Tampermonkey should open the userscript
   review page.
3. Review the script and select **Install**.
4. Open or reload a supported Dawat-e-Islami Surah translation page. The player
   appears near the lower-right corner.

[![Install with Tampermonkey](https://img.shields.io/badge/Tampermonkey-Install%20Quran%20Companion-green?logo=tampermonkey)](https://raw.githubusercontent.com/examlycbt-offline/quran-companion/main/quran-companion.user.js)

If the button displays source code instead, install manually:

1. Open Tampermonkey's dashboard and choose **Create a new script**.
2. Replace the editor contents with the contents of
   [`quran-companion.user.js`](./quran-companion.user.js).
3. Save the script and reload a supported Surah translation page.

## Quick start

1. Open a Surah translation page and locate the Quran Companion panel.
2. Press **Play** to begin at Bismillah (Ayah 0). Use the transport controls to
   pause, move between Ayahs, or seek within the current audio track.
3. Select the settings button to configure audio, Ayah ranges, reading behavior,
   research, and sound.
4. Select the sparkle button beside the current Ayah to open Ayah Research.

## Player controls

| Control | Action |
| --- | --- |
| Settings | Opens the settings menu and its individual pages. |
| Research (sparkle) | Opens research for the current Ayah. |
| Previous / Next Ayah | Jumps to the adjacent Ayah. Bismillah is Ayah 0. |
| Rewind / Forward | Seeks by the configured percentage of the current track, capped at 30 seconds per press. |
| Play / Pause | Starts, pauses, or resumes the selected audio. |
| Reset | Stops playback and restores the player settings and current position to defaults, including Ayah 0. |
| Return to Current Ayah | Scrolls the page to the Ayah currently selected by the player. |
| End Playback | Stops and removes the player from the page. |

## Settings guide

Open the settings menu, then choose a settings page. Use its **Back** button to
return to the settings menu.

### Audio Settings

- **Audio Mode:** Arabic Only, Urdu Only, or Arabic + Urdu.
- **Arabic Reciter:** Select one of the available reciters. Changing the
  selection reloads the active track if playback is running.
- **Urdu Translation:** Select the available Urdu translation audio.
- **Playback Speed:** Adjust the speed from 0.5x to 2x.
- **Seek Amount:** Set rewind and forward to 2%, 5%, 10%, or 20% of the current
  track duration, capped at 30 seconds.
- **Interval Between Tracks:** Set the pause between consecutive tracks and
  Ayahs.

Bismillah is represented as Ayah 0 and uses the shared Bismillah audio path
(Surah 001, track 000), with the selected reciter or Urdu audio code applied.
Normal numbered Ayahs use the current Surah's audio folder.

### Ayah Playback

- **Start Ayah / End Ayah:** Select a range. The choices include **Bismillah**
  as Ayah 0 as well as numbered Ayahs.
- **Repeat Count:** Choose a finite number of total plays or **Unlimited**.
- **Repetition Method:** **Repeat Entire Range** completes the range before
  repeating; **Repeat Each Ayah** repeats each Ayah before advancing.
- **Listen:** Plays the selected range using the current audio settings.
- **Move:** Navigates to the selected range without starting audio. Reading
  auto-advance can optionally continue through the range.

The selected range is outlined on the page. Use the playback controls to stop or
change audio; choose a different range to replace the current selection.

### Reading Settings

- **Automatically scroll to playing Ayah:** Scrolls the page as audio advances.
  Manual scrolling is respected; use **Return to Current Ayah** to jump back.
- **Auto-advance Ayahs after Move:** When using **Move**, advances through the
  selected range at the interval below it.
- **Advance Ayah after:** Enter a positive whole number of seconds for Move
  auto-advance.
- **Hifz Mode:** During Arabic audio, conceals the Arabic text; during Urdu
  audio, conceals the translation. During Move reading, conceals both text
  areas.
- **Reveal Ayah after:** Sets how long text remains hidden during Move reading.
  During audio, the active language is revealed when its track pauses or ends.

### Translation

Choose a website translation discovered from the Surah page. Selecting one
navigates to that translation page.

### Playback Information

Shows the current Surah and Ayah, playback status, selected reciter and Urdu
translation, audio mode and speed, plus range and repeat settings.

### Sound Settings

- Adjust Arabic recitation and Urdu translation volume independently.
- Mute or unmute either track without changing the other.
- Choose an available playback device when supported, or keep the system
  default.
- Refresh the audio-device list when devices are connected or removed.
- **Check selected microphone** explicitly requests microphone permission to
  verify the selected input. The test does not record audio and stops its stream
  immediately. Microphones are input devices, not playback outputs.

Device names may be hidden until the browser grants permission. The script does
not request microphone access until you run the check.

## Ayah research

Select the sparkle button to research the current Ayah. In **Ayah Research
Settings**, select up to two output languages and choose which sections to
include:

- **Ayah Details:** Surah and Ayah references, Arabic text, transliteration,
  Juz, Ruku, classification, counts, and other relevant details.
- **Translation:** Complete Ayah translation in the selected languages.
- **Tafseer:** Dawat-e-Islami Tafseer, with a Brief or Detailed explanation
  length.
- **Word-by-Word Meaning:** Arabic words in order, transliteration, and
  individual meanings in the selected languages.
- **Show research in app:** Displays the result in the Quran Companion dialog.
  Turn it off to leave the answer in the Gemini window.

When in-app research is enabled, the dialog reports progress while Gemini loads
and prepares the answer. The userscript asks for numbered sections, language-
specific translation and Tafseer, language-paired table rows, concise notes,
and an emphasized AI disclaimer. HTML is sanitized before it is shown; the
dialog includes zoom controls.

If Gemini completes an answer without the required boundary markers, the worker
retries up to three total attempts. If it still cannot produce a usable answer,
the Gemini research window closes and the in-app dialog offers **Try again**.
If the browser, an extension, or a site restriction blocks Gemini, the dialog
explains that access to `gemini.google.com` must be allowed. Close the research
dialog to cancel an active in-app request.

Gemini must be signed in and pop-ups must be allowed for the Dawat-e-Islami
site. If the worker detects a recognized Gemini sign-in prompt, it attempts to
clear accessible Gemini cookies and site storage, then reloads. This can sign
you out and remove local Gemini site data.

AI-generated translations and explanations may contain inaccuracies. Verify
important Quranic information with original sources and qualified Islamic
scholars.

## Privacy and permissions

- Research is sent to Gemini only when you start Ayah Research. The request
  includes the selected Ayah's Arabic text, visible page translation when
  available, selected languages, and enabled research options.
- In-app requests use Tampermonkey storage to pass the prompt and result between
  the Dawat-e-Islami page and the Gemini research window. Temporary in-app
  request data is removed when the dialog is closed or the result is received.
- The microphone check is user-initiated, does not record audio, and stops its
  media stream immediately.
- Gemini sign-in recovery may clear accessible Gemini site data as described
  above. Consider using a separate browser profile if you need to preserve
  Gemini's local site state.

## Troubleshooting

**The player does not appear**

Confirm the URL is a Dawat-e-Islami Surah translation page, Tampermonkey is
enabled, and the page has finished loading. Reload the page after installing or
updating the userscript.

**Audio does not play**

Check the browser connection and volume, try another reciter or translation,
and confirm the selected Ayah or range is available. Browser autoplay policies
may require pressing **Play** again after an error.

**Gemini does not open or research does not finish**

Allow pop-ups for the Dawat-e-Islami site, sign in to Gemini, and check whether
an extension or site policy blocks `gemini.google.com`. Use **Try again** after
resolving access issues. A diagnostic reference in the console can help when
reporting a problem.

**Audio output selection is unavailable**

Output routing depends on browser support and device permissions. The system
default output remains available when selecting a specific device is unsupported.

## Updating and releases

The install button and `@downloadURL` / `@updateURL` metadata point to the
userscript on the repository's `main` branch. Tampermonkey can check that URL
for updates. To update manually, open the Tampermonkey dashboard and install or
replace the script with the latest
[`quran-companion.user.js`](./quran-companion.user.js).

After publishing a release, update `@version` and the **Current version** and
release notes in this README, then push both files to `main`.

Repository: <https://github.com/examlycbt-offline/quran-companion>
## Author

* **Nayab Ak** - *Lead Developer* - [@examlycbt-offline](https://github.com)

## Acknowledgements

Thank you to everyone using this Tampermonkey script! Your support keeps this project going. 

A special thanks to users who take the time to report bugs, suggest features, and help improve the script for the community. If you encounter any issues or have feedback, please feel free to open an issue in the repository.
