const SKIP_BUTTONS = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern';
const POLL_MS = 250;
// Seeking exactly to `duration` before the ad is buffered strands YouTube's MSE player
// (readyState 1, never fires `ended`), so the real video never loads. Stop just short instead.
const END_MARGIN_S = 0.1;

let mutedBeforeAd: boolean | null = null;
let seekedSrc: string | null = null;

export function handleYoutubeAd(doc: Document): boolean {
  const player = doc.querySelector('.html5-video-player');
  const video = doc.querySelector<HTMLVideoElement>('video.html5-main-video');

  if (!player?.classList.contains('ad-showing') || !video) {
    if (video && mutedBeforeAd !== null) {
      video.muted = mutedBeforeAd;
      video.playbackRate = 1;
      mutedBeforeAd = null;
    }
    seekedSrc = null;
    return false;
  }

  // YouTube ignores untrusted clicks and keeps the button hidden for ~5s, so never rely on it alone.
  doc.querySelector<HTMLElement>(SKIP_BUTTONS)?.click();

  mutedBeforeAd ??= video.muted;
  video.muted = true;
  video.playbackRate = 16;
  // Each ad in a pod gets its own src; seek each one once, after it has data to play.
  if (video.src !== seekedSrc && Number.isFinite(video.duration) && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    video.currentTime = Math.max(0, video.duration - END_MARGIN_S);
    seekedSrc = video.src;
  }
  return true;
}

export function startYoutubeSkipper(): void {
  window.setInterval(() => handleYoutubeAd(document), POLL_MS);
}
