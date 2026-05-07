export const WORD_BLOCK_MESSAGE =
  "Your change was not saved because it contains blocked text (spam).";

export interface WordblockMatch {
  pattern: string;
  match: string;
}

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

export function findWordblockMatch(text: string): WordblockMatch | null {
  const prepared = prepareWordblockText(text);

  for (const pattern of DEFAULT_WORD_BLOCKS) {
    const expression = new RegExp(pattern, "is");
    const match = prepared.match(expression);

    if (match) {
      return { pattern, match: match[0] };
    }
  }

  return null;
}

function prepareWordblockText(text: string): string {
  return text.replace(/\b(www\.[^\s<>"']+)/gi, "http://$1 $1");
}
