declare module "ua-parser-js" {
  interface ParsedUserAgent {
    browser: { name?: string };
    os: { name?: string };
    device: { type?: string };
  }

  export class UAParser {
    constructor(userAgent?: string);
    getResult(): ParsedUserAgent;
  }
}
