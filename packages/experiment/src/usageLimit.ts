const usageLimitPattern =
  /\b(usage limit|hit your (session |weekly |[a-z]+ )?limit|limit reached|rate[ _]limit(ed)?|too many requests)\b/i;

const rateLimitStatus = 429;

export function isUsageLimit(options: {
  readonly text: string;
  readonly apiErrorStatus?: number | null;
}): boolean {
  return options.apiErrorStatus === rateLimitStatus || usageLimitPattern.test(options.text);
}
