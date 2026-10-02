/**
 * READ A JSON BODY, AND SAY SOMETHING USEFUL WHEN IT IS NOT ONE.
 *
 * `response.json()` on a body that is not JSON — a proxy's HTML 502 page, a
 * plain-text "Internal Server Error" from a route that threw, an empty body —
 * rejects with the engine's parser message. In Safari that message is the
 * generic DOMException text "The string did not match the expected pattern",
 * which the terminal rendered verbatim as the reason an account could not load.
 * The owner reading it was on the withdraw path and had no idea it meant "the
 * server did not answer with data".
 *
 * This reads the body as text first, so the failure can name the status that
 * came back instead of the parser that choked on it.
 */
export async function readJsonBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(unexpectedBodyMessage(response.status, text));
  }
}

export function unexpectedBodyMessage(status: number, text: string): string {
  if (status >= 500) return `The server is not responding right now (status ${status}).`;
  if (text.trim() === "") return `The server sent an empty reply (status ${status}).`;
  return `The server sent an unexpected reply (status ${status}).`;
}
