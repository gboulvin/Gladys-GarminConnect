// -----------------------------------------------------------------------------
// Minimal HTTP helpers on top of the global `fetch` (Node 22+): no dependency.
//
// The SSO sign-in is a short cookie-based conversation (the MFA step must
// reuse the cookies of the login step), hence the tiny cookie jar. Every
// request carries a timeout so a stuck Garmin endpoint never blocks a sync.
// -----------------------------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 30_000;

/** Session cookies of one sign-in conversation (all on the SSO host). */
export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  /** Remember the `Set-Cookie` headers of a response. */
  store(response) {
    const setCookies = response.headers?.getSetCookie?.() ?? [];
    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  /** `Cookie` request header, or undefined when empty. */
  header() {
    if (this.cookies.size === 0) {
      return undefined;
    }
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** `https://host/path` + query parameters. */
export function buildUrl(base, path, query) {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Send a request. `json` and `form` build the body and its content type; the
 * jar, when given, sends and stores the session cookies.
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, json, form, jar, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  const finalHeaders = { ...headers };
  let body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    finalHeaders['Content-Type'] = 'application/json';
  } else if (form !== undefined) {
    body = new URLSearchParams(form).toString();
    finalHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const cookie = jar?.header();
  if (cookie) {
    finalHeaders.Cookie = cookie;
  }
  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  jar?.store(response);
  return response;
}

/** Parse a JSON body, or undefined when it is not JSON (a Cloudflare page...). */
export async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
