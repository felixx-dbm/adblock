// Hosts whose scriptlets must run before any page script. Injecting them from the service worker
// on navigation lands too late on a cold start, so they ship as prebuilt files registered as
// MAIN-world content scripts, which Chrome injects synchronously at document_start.
export const MAIN_WORLD_HOSTS = [
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'www.youtubekids.com',
] as const;

export const mainWorldFile = (host: string): string => `scriptlets/${host}.js`;

export const isMainWorldHost = (host: string | null): boolean =>
  host !== null && (MAIN_WORLD_HOSTS as readonly string[]).includes(host);
