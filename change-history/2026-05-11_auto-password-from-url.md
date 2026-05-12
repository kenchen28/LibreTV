# Auto-fill and submit password from URL ?code= parameter

**Date:** 2026-05-11

## Summary
When a user lands on tv.gitdocker.com with a `?code=<password>` URL parameter, the password is now automatically filled and verified. On success, the modal is hidden, the `passwordVerified` event fires, and the `code` param is cleaned from the URL via `history.replaceState` to avoid leaking it on refresh. Falls back to the normal password modal if the code is missing or wrong.

## Files Modified
- `js/password.js` — Added `tryAutoSubmitFromUrl()`; updated `initPasswordProtection()` to check `?code=` before showing the modal
