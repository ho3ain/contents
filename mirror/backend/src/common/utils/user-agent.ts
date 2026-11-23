export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  kind: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/Windows NT/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux|X11/, 'Linux'],
];

/**
 * Coarse, dependency-free description of a User-Agent for the "your devices"
 * list. Deliberately returns only family names (never versions or the raw
 * string) so it is safe to display and to keep in audit metadata.
 */
export function describeUserAgent(
  userAgent: string | null | undefined,
): DeviceInfo {
  const ua = (userAgent ?? '').slice(0, 512);
  if (ua === '') return { browser: null, os: null, kind: 'unknown' };
  if (
    /bot|crawler|spider|curl|wget|python-requests|node-fetch|undici/i.test(ua)
  ) {
    return { browser: null, os: null, kind: 'bot' };
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const kind: DeviceInfo['kind'] = /iPad|Tablet/i.test(ua)
    ? 'tablet'
    : /Mobi|iPhone|Android.+Mobile/i.test(ua)
      ? 'mobile'
      : 'desktop';
  return { browser, os, kind };
}
