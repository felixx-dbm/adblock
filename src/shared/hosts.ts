export function isAllowlisted(allowlist: readonly string[], host: string): boolean {
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function hostOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? hostname : null;
  } catch {
    return null;
  }
}

export function normalizeHost(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  try {
    const { hostname } = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    return hostname === '' ? null : hostname;
  } catch {
    return null;
  }
}

export function normalizeAllowlist(entries: readonly string[]): string[] {
  const hosts = entries.map(normalizeHost).filter((host): host is string => host !== null);
  return [...new Set(hosts)];
}

export function withoutHost(allowlist: readonly string[], host: string): string[] {
  return allowlist.filter((entry) => !(host === entry || host.endsWith(`.${entry}`)));
}

export function resolveFilterUrl(frameUrl: string, tabUrl: string | undefined): string | null {
  if (hostOf(frameUrl)) return frameUrl;
  return tabUrl && hostOf(tabUrl) ? tabUrl : null;
}
