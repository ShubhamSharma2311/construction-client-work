/** A cookie the API set, parsed from Set-Cookie the way tests inspect it. */
export interface TestCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** An API reply, read once, with the parts tests check. */
export class TestResponse {
  private constructor(
    readonly statusCode: number,
    readonly headers: Readonly<Record<string, string>>,
    readonly body: string,
    readonly cookies: readonly TestCookie[],
  ) {}

  static async from(response: Response): Promise<TestResponse> {
    const headers = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie().map(parseCookie);
    return new TestResponse(response.status, headers, await response.text(), cookies);
  }

  /** The body as JSON. Typed loosely, as tests index into whatever the route returns. */
  // Same signature as the test client before (light-my-request), so tests read replies unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-parameters
  json<T = any>(): T {
    return JSON.parse(this.body) as T;
  }
}

function parseCookie(header: string): TestCookie {
  const [pair = "", ...attributes] = header.split(";").map((part) => part.trim());
  const split = pair.indexOf("=");
  const cookie: TestCookie = {
    name: pair.slice(0, split),
    value: decodeURIComponent(pair.slice(split + 1)),
  };
  for (const attribute of attributes) {
    const [key = "", value = ""] = attribute.split("=");
    switch (key.toLowerCase()) {
      case "path":
        cookie.path = value;
        break;
      case "domain":
        cookie.domain = value;
        break;
      case "max-age":
        cookie.maxAge = Number(value);
        break;
      case "expires":
        cookie.expires = new Date(value);
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "samesite":
        cookie.sameSite = value;
        break;
    }
  }
  return cookie;
}
