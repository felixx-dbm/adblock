// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { handleYoutubeAd } from '../../src/content/youtube';

const mount = (inner: string, adShowing: boolean): HTMLVideoElement => {
  document.body.innerHTML = `<div class="html5-video-player${adShowing ? ' ad-showing' : ''}">
    <video class="html5-main-video"></video>${inner}</div>`;
  return document.querySelector('video') as HTMLVideoElement;
};

it('returns false and does not throw when there is no player or video', () => {
  document.body.innerHTML = '<div id="home"></div>';
  expect(handleYoutubeAd(document)).toBe(false);
});

it('clicks the skip button when one is available', () => {
  mount('<button class="ytp-skip-ad-button"></button>', true);
  let clicks = 0;
  document.querySelector('.ytp-skip-ad-button')?.addEventListener('click', () => clicks++);
  expect(handleYoutubeAd(document)).toBe(true);
  expect(clicks).toBe(1);
});

it('mutes and speeds up unskippable ads, then restores playback afterwards', () => {
  const adVideo = mount('', true);
  expect(handleYoutubeAd(document)).toBe(true);
  expect(adVideo.muted).toBe(true);
  expect(adVideo.playbackRate).toBe(16);

  const normalVideo = mount('', false);
  normalVideo.muted = true;
  normalVideo.playbackRate = 16;
  expect(handleYoutubeAd(document)).toBe(false);
  expect(normalVideo.muted).toBe(false);
  expect(normalVideo.playbackRate).toBe(1);
});
