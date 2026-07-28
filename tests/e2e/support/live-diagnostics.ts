export function diagnosticUrl(value: string, base?: string | URL) {
  try {
    const url = new URL(value, base);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}
