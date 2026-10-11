export type OpenCodeNativeEnvironment = {
  enabled?: string;
  url?: string;
  appOrigin?: string;
};

export type OpenCodeNativeAvailability =
  | { enabled: true; baseUrl: string; appOrigin: string }
  | { enabled: false; reason: string; appOrigin?: string };

export function isOpenCodeNativeOriginAllowed(configuredOrigin: string, actualOrigin: string) {
  return configuredOrigin === actualOrigin;
}

const isLoopback = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const isLocalHttpUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      isLoopback(url.hostname) &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export function getOpenCodeNativeAvailability(
  environment: OpenCodeNativeEnvironment,
): OpenCodeNativeAvailability {
  if (environment.enabled !== "1") {
    return { enabled: false, reason: "Disabled by server configuration" };
  }
  const serverAddress = environment.url;
  if (!serverAddress || !isLocalHttpUrl(serverAddress)) {
    return { enabled: false, reason: "Configure a loopback OpenCode server URL" };
  }
  const appOrigin = environment.appOrigin;
  if (!appOrigin || !isLocalHttpUrl(appOrigin)) {
    return { enabled: false, reason: "Configure the loopback app origin" };
  }

  const appUrl = new URL(appOrigin);
  if (appUrl.pathname !== "/") {
    return { enabled: false, reason: "Configure the app origin without a path" };
  }

  // An explicit opt-in allows browser E2E with the temporary SDK fetch workaround
  // for assistant-ui/assistant-ui#9244. This is not production readiness; the
  // native adapter's remaining lifecycle/permission behavior still needs E2E.
  return {
    enabled: true,
    baseUrl: new URL(serverAddress).origin,
    appOrigin: appUrl.origin,
  };
}
