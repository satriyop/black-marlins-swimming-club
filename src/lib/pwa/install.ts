export type InstallPlatform = "ios" | "other";

export function detectInstallPlatform({
  userAgent,
  platform,
  maxTouchPoints,
}: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): InstallPlatform {
  const iosDevice = /iPad|iPhone|iPod/i.test(userAgent);
  const modernIPad = platform === "MacIntel" && maxTouchPoints > 1;
  return iosDevice || modernIPad ? "ios" : "other";
}

export function isStandaloneDisplay({
  displayModeStandalone,
  navigatorStandalone,
}: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}) {
  return displayModeStandalone || navigatorStandalone === true;
}
