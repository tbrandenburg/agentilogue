/**
 * Temporary workaround for https://github.com/assistant-ui/assistant-ui/issues/9244.
 *
 * react-opencode@0.2.29 calls the OpenCode compaction endpoint with no body
 * when assistant-ui requests a new thread title. This is not a title API.
 * OpenCode generates the real session title during its first prompt.
 *
 * Suppress only the invalid bodyless POST. Real compaction requests with
 * a payload and every other SDK request still reach the unmodified server.
 * Remove this wrapper when the upstream adapter fixes generateTitle.
 */
const INVALID_TITLE_ROUTE = /^\/session\/[^/]+\/summarize$/;

export function withOpenCodeTitleWorkaround(delegate: typeof fetch): typeof fetch {
  return (input, init) => {
    const request =
      input instanceof Request && init === undefined ? input : new Request(input, init);

    if (
      request.method === "POST" &&
      request.body === null &&
      INVALID_TITLE_ROUTE.test(new URL(request.url).pathname)
    ) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    // Preserve the OpenCode SDK's default fetch behavior for long-lived SSE.
    (request as Request & { timeout?: boolean }).timeout = false;
    return delegate(request);
  };
}
