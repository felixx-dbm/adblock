# YouTube smoke test

Run after every `npm run update-lists` and whenever YouTube ads reappear. Load `dist/` unpacked.

1. Open a popular video while logged out: no pre-roll plays; the video starts immediately.
2. Reload the same video 3 times: no ad on any load.
3. Let a long video play past 5 minutes: no mid-roll interruption.
4. Open the home page and search results: no banner or promoted-video tiles.
5. Popup shows a non-zero count and the "Blocking on this site" toggle off restores ads.
6. If a pre-roll still plays: confirm the unskippable one is muted and sped up (fallback working), then update lists and re-test.
