# Quran Companion

Quran Companion is a Tampermonkey userscript that adds an audio player, reading
tools, and optional AI-assisted Ayah research to Dawat-e-Islami Quran Surah
translation pages.

## Where it works

- The player appears on Dawat-e-Islami Surah translation pages matching
  `https://www.dawateislami.net/quran/surah-*/translation-*`.
- The Gemini integration runs on `https://gemini.google.com/`. Sign in to Gemini
  and allow popups for the Dawat-e-Islami site to use Ayah research.
- Audio device discovery and output routing depend on browser support and
  permissions. The userscript does not request microphone access until you
  explicitly run the microphone check.

## Installation

1. Install the Tampermonkey browser extension.
2. In Tampermonkey, create a new userscript and replace its contents with
   `quran-companion.js`, then save it.
3. Open or reload a supported Dawat-e-Islami Surah translation page.
4. If prompted, allow Tampermonkey to run on both the Dawat-e-Islami and Gemini
   sites. Allow popups if you want to use research.

## Using the player

The compact player is added to the Surah page. Use its settings button to open
the settings menu and the individual settings pages.

### Audio and Ayah playback

- Play, pause, reset, stop, jump to the previous or next Ayah, and return the
  page to the current Ayah.
- Choose Arabic, Urdu, or both tracks; configure the reciter, Urdu translation,
  playback speed, seek amount, and the gap between audio tracks.
- Select an Ayah range, choose a repeat count and repeat method, then listen to
  the range or use **Move** to navigate without audio.
- Enable automatic page scrolling during playback. For Move reading, enable
  **Auto-advance Ayahs after Move** and enter a positive whole-number interval
  in seconds.

### Reading and Hifz

- **Hifz Mode** conceals Arabic during Arabic playback or Urdu text during Urdu
  playback. It conceals both text areas during Move reading.
- For Move reading, set **Reveal Ayah after (seconds)** to control how long the
  text stays hidden. During audio, the active language remains concealed for
  that track and is revealed when the track pauses or ends.
- Use the Sound Settings page for independent Arabic and Urdu volume and mute
  controls. Select an available playback output where supported, refresh the
  device list, or explicitly check microphone access. Microphones are inputs,
  not playback destinations; the check does not record audio.

### Ayah research

Select the Ayah’s sparkle button to open Ayah Research Settings and choose
languages and which sections to request: Ayah details, translation, Tafseer,
and word-by-word meaning. Tafseer can be brief or detailed.

- With **Show research in popup** enabled, the response appears in the
  in-page research dialog. It shows progress while Gemini loads and generates
  an answer, and retries if the completed answer is missing the required
  boundaries. Close the dialog to cancel the search and remove its temporary
  request data. Use the dialog’s zoom controls to resize the answer.
- With the option disabled, the prompt opens in a Gemini window and the result
  remains there rather than being transferred into the player.
- Research requires Gemini to be available and signed in. If the browser blocks
  the popup or Gemini cannot complete the request, an error is shown in the
  player or research dialog. Diagnostic reference codes in error messages can
  be matched with details in the browser console.

AI-generated research can contain inaccuracies. Verify important Quranic
information with the cited original sources and qualified Islamic scholars.
