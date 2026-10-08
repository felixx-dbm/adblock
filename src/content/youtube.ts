const SKIP_BUTTONS = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern';
const POLL_MS = 500;

let mutedBeforeAd: boolean | null = null;

export function handleYoutubeAd(doc: Document): boolean {
  const player = doc.querySelector('.html5-video-player');
  const video = doc.querySelector<HTMLVideoElement>('video.html5-main-video');

  if (!player?.classList.contains('ad-showing') || !video) {
    if (video && mutedBeforeAd !== null) {
      video.muted = mutedBeforeAd;
      video.playbackRate = 1;
      mutedBeforeAd = null;
    }
    return false;
  }

  const skip = doc.querySelector<HTMLElement>(SKIP_BUTTONS);
  if (skip) {
    skip.click();
    return true;
  }

  mutedBeforeAd ??= video.muted;
  video.muted = true;
  video.playbackRate = 16;
  if (Number.isFinite(video.duration)) video.currentTime = video.duration;
  return true;
}

export function startYoutubeSkipper(): void {
  window.setInterval(() => handleYoutubeAd(document), POLL_MS);
}
