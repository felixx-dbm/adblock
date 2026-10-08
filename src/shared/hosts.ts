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
