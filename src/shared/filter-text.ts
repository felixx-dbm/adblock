const COSMETIC_SEPARATOR = /#@?(?:\$\??|%|\?)?#|\$@?\$/;
const COSMETIC_EXCEPTION_OPTIONS =
  /^@@.*\$.*\b(?:elemhide|generichide|specifichide|jsinject|content|urlblock|extension)\b/;

export function extractCosmeticLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== '' &&
        !line.startsWith('!') &&
        (COSMETIC_SEPARATOR.test(line) || COSMETIC_EXCEPTION_OPTIONS.test(line)),
    )
    .join('\n');
}
