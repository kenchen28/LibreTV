# Remove Google Translate integration

**Date:** 2026-05-11

## Summary
Removed the Google Translate widget and language switcher buttons (EN / 简体 / 繁體) from the LibreTV landing page. The page no longer loads `translate.google.com/translate_a/element.js` and no longer exposes `window.changeLanguage`. Cleaner page, no third-party translate requests.

## Files Modified
- `index.html` — Removed desktop language buttons + divider, mobile language buttons, hidden `google_translate_element_hidden` div, and the full Google Translate script block (init, auto-apply, `changeLanguage`, `updateLangButtons`)
