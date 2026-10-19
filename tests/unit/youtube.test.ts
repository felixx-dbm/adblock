// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { handleYoutubeAd } from '../../src/content/youtube';

const mount = (inner: string, adShowing: boolean): HTMLVideoElement => {
  document.body.innerHTML = `<div class="html5-video-player${adShowing ? ' ad-showing' : ''}">
    <video class="html5-main-video"></video>${inner}</div>`;
  return document.querySelector('video') as HTMLVideoElement;
};

const media = (video: HTMLVideoElement, props: { src?: string; duration?: number; readyState?: number }): void => {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(video, key, { value, configurable: true });
};

beforeEach(() => {
  mount('', false);
  handleYoutubeAd(document);
});

it('returns false and does not throw when there is no player or video', () => {
  document.body.innerHTML = '<div id="home"></div>';
  expect(handleYoutubeAd(document)).toBe(false);
});

it('clicks the skip button and still fast-forwards, since YouTube may ignore the click', () => {
  const video = mount('<button class="ytp-skip-ad-button"></button>', true);
  let clicks = 0;
  document.querySelector('.ytp-skip-ad-button')?.addEventListener('click', () => clicks++);
  expect(handleYoutubeAd(document)).toBe(true);
  expect(clicks).toBe(1);
  expect(video.muted).toBe(true);
  expect(video.playbackRate).toBe(16);
});

it('does not seek an ad that has no playable data yet', () => {
  const video = mount('', true);
  media(video, { src: 'blob:ad1', duration: 15, readyState: HTMLMediaElement.HAVE_METADATA });
  handleYoutubeAd(document);
  expect(video.currentTime).toBe(0);
});

it('seeks each ad in a pod just short of its end, once per ad', () => {
  const video = mount('', true);
  media(video, { src: 'blob:ad1', duration: 15, readyState: HTMLMediaElement.HAVE_ENOUGH_DATA });
  handleYoutubeAd(document);
  expect(video.currentTime).toBeCloseTo(14.9);

  video.currentTime = 3;
  handleYoutubeAd(document);
  expect(video.currentTime).toBe(3);

  media(video, { src: 'blob:ad2', duration: 30 });
  handleYoutubeAd(document);
  expect(video.currentTime).toBeCloseTo(29.9);
});

it('mutes and speeds up ads, then restores playback afterwards', () => {
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
