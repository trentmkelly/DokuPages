export const WORD_BLOCK_MESSAGE =
  "Your change was not saved because it contains blocked text (spam).";
export const UPLOAD_SPAM_MESSAGE = "The upload was blocked by the spam blacklist.";

export interface WordblockMatch {
  pattern: string;
  match: string;
}

const WORD_BLOCK_CHUNK_SIZE = 200;

// Default mapping from DokuWiki's conf/wordblock.conf.
const DEFAULT_WORD_BLOCKS = [
  String.raw`https?:\/\/(\S*?)(-side-effects|top|pharm|pill|discount|discount-|deal|price|order|now|best|cheap|cheap-|online|buy|buy-|sale|sell)(\S*?)(cialis|viagra|prazolam|xanax|zanax|soma|vicodin|zenical|xenical|meridia|paxil|prozac|claritin|allegra|lexapro|wellbutrin|zoloft|retin|valium|levitra|phentermine)`,
  String.raw`https?:\/\/(\S*?)(bi\s*sex|gay\s*sex|fetish|incest|penis|\brape\b)`,
  String.raw`zoosex`,
  String.raw`gang\s*bang`,
  String.raw`facials`,
  String.raw`ladyboy`,
  String.raw`\btits\b`,
  String.raw`bolea\.com`,
  String.raw`52crystal`,
  String.raw`baida\.org`,
  String.raw`web-directory\.awardspace\.us`,
  String.raw`korsan-team\.com`,
  String.raw`BUDA TAMAMDIR`,
  String.raw`wow-powerleveling-wow\.com`,
  String.raw`wow gold`,
  String.raw`wow-gold\.dinmo\.cn`,
  String.raw`downgrade-vista\.com`,
  String.raw`downgradetowindowsxp\.com`,
  String.raw`elegantugg\.com`,
  String.raw`classicedhardy\.com`,
  String.raw`research-service\.com`,
  String.raw`https?:\/\/(\S*?)(2-pay-secure|911essay|academia-research|anypapers|applicationessay|bestbuyessay|bestdissertation|bestessay|bestresume|besttermpaper|businessessay|college-paper|customessay|custom-made-paper|custom-writing|degree-?result|dissertationblog|dissertation-service|dissertations?expert|essaybank|essay-?blog|essaycapital|essaylogic|essaymill|essayontime|essaypaper|essays?land|essaytownsucks|essay-?writ|fastessays|freelancercareers|genuinecontent|genuineessay|genuinepaper|goessay|grandresume|killer-content|ma-dissertation|managementessay|masterpaper|mightystudent|needessay|researchedge|researchpaper-blog|resumecvservice|resumesexperts|resumesplanet|rushessay|samedayessay|superiorcontent|superiorpaper|superiorthesis|term-paper|termpaper-blog|term-paper-research|thesisblog|universalresearch|valwriting|vdwriters|wisetranslation|writersassembly|writers\.com\.ph|writers\.ph)`,
  String.raw`flatsinmumbai\.co\.in`,
  String.raw`https?:\/\/(\S*?)penny-?stock`,
  String.raw`mattressreview\.biz`,
  String.raw`(just|simply) (my|a) profile (site|webpage|page)`
];

export function findWordblockMatch(
  text: string,
  patterns: readonly string[] = DEFAULT_WORD_BLOCKS
): WordblockMatch | null {
  const prepared = prepareWordblockText(text);
  const normalizedPatterns = patterns
    .map((pattern) => normalizeWordblockPattern(pattern))
    .filter((pattern): pattern is string => Boolean(pattern));

  for (let index = 0; index < normalizedPatterns.length; index += WORD_BLOCK_CHUNK_SIZE) {
    const chunk = normalizedPatterns.slice(index, index + WORD_BLOCK_CHUNK_SIZE);
    let expression: RegExp;
    try {
      expression = new RegExp(`(${chunk.join("|")})`, "is");
    } catch {
      continue;
    }

    const match = prepared.match(expression);
    if (match) {
      return { pattern: matchingPattern(prepared, chunk) ?? chunk.join("|"), match: match[0] };
    }
  }

  return null;
}

export function normalizeWordblockPattern(pattern: string): string | null {
  const stripped = pattern.replace(/#.*$/, "").trim();
  return stripped ? stripped : null;
}

function matchingPattern(text: string, patterns: readonly string[]): string | null {
  for (const pattern of patterns) {
    let expression: RegExp;
    try {
      expression = new RegExp(pattern, "is");
    } catch {
      continue;
    }
    const match = text.match(expression);

    if (match) {
      return pattern;
    }
  }

  return null;
}

function prepareWordblockText(text: string): string {
  return text.replace(
    /(\b)(www\.[\w.:?\-;,]+?\.[\w.:?\-;,]+?[\w/#~:.?+=&%@!\-.:?\-;,]+?)([.:?\-;,]*[^\w/#~:.?+=&%@!\-.:?\-;,])/gi,
    "$1http://$2 $2$3"
  );
}
