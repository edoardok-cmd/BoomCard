/**
 * Profanity Filter Utility
 *
 * Checks text for inappropriate language in English and Bulgarian
 * Uses a combination of exact matches and pattern detection
 */

// Common profanity words (this is a basic list - expand as needed)
const PROFANITY_LIST_EN = [
  'damn', 'hell', 'crap', 'shit', 'fuck', 'ass', 'bitch', 'bastard',
  'idiot', 'stupid', 'moron', 'retard', 'dumb'
];

const PROFANITY_LIST_BG = [
  'мамка', 'путка', 'хуй', 'педал', 'боклук', 'простак', 'глупак',
  'идиот', 'магаре', 'будала'
];

export interface ProfanityCheckResult {
  hasProfanity: boolean;
  matches: string[];
  cleanedText?: string;
}

/**
 * Check if text contains profanity
 * @param text - Text to check
 * @param language - Language code ('en' or 'bg')
 * @returns ProfanityCheckResult
 */
export const checkProfanity = (text: string, language: 'en' | 'bg' = 'en'): ProfanityCheckResult => {
  if (!text || typeof text !== 'string') {
    return { hasProfanity: false, matches: [] };
  }

  const normalizedText = text.toLowerCase().trim();
  const profanityList = language === 'bg' ? PROFANITY_LIST_BG : PROFANITY_LIST_EN;
  const matches: string[] = [];

  // Check for exact word matches
  profanityList.forEach(word => {
    // Use word boundaries to avoid false positives
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(normalizedText)) {
      matches.push(word);
    }
  });

  // Check for l33t speak variations (e.g., "sh1t", "f*ck")
  const l33tPattern = /[a@][s$][s$]|[f\*][u\*][c\*][k\*]|[s\$][h#][i1!][t\+]/gi;
  if (l33tPattern.test(normalizedText)) {
    matches.push('l33t_speak_profanity');
  }

  return {
    hasProfanity: matches.length > 0,
    matches: Array.from(new Set(matches)) // Remove duplicates
  };
};

/**
 * Check text for profanity in multiple languages
 * @param text - Text to check
 * @returns ProfanityCheckResult
 */
export const checkProfanityMultilingual = (text: string): ProfanityCheckResult => {
  const resultEn = checkProfanity(text, 'en');
  const resultBg = checkProfanity(text, 'bg');

  return {
    hasProfanity: resultEn.hasProfanity || resultBg.hasProfanity,
    matches: [...resultEn.matches, ...resultBg.matches]
  };
};

/**
 * Censor profanity in text (replaces with asterisks)
 * @param text - Text to censor
 * @param language - Language code
 * @returns Censored text
 */
export const censorProfanity = (text: string, language: 'en' | 'bg' = 'en'): string => {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let censored = text;
  const profanityList = language === 'bg' ? PROFANITY_LIST_BG : PROFANITY_LIST_EN;

  profanityList.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const replacement = word[0] + '*'.repeat(word.length - 1);
    censored = censored.replace(regex, replacement);
  });

  return censored;
};

/**
 * Check if review comment is appropriate
 * Stricter checks for review content
 * @param comment - Review comment text
 * @returns boolean
 */
export const isReviewCommentAppropriate = (comment: string): boolean => {
  if (!comment || typeof comment !== 'string') {
    return true; // Empty is ok
  }

  const result = checkProfanityMultilingual(comment);

  // Also check for excessive capitalization (SHOUTING)
  const capitalRatio = (comment.match(/[A-Z]/g) || []).length / comment.length;
  const hasExcessiveCaps = capitalRatio > 0.5 && comment.length > 20;

  // Check for excessive punctuation
  const punctuationRatio = (comment.match(/[!?]{3,}/g) || []).length;
  const hasExcessivePunctuation = punctuationRatio > 2;

  return !result.hasProfanity && !hasExcessiveCaps && !hasExcessivePunctuation;
};

export default {
  checkProfanity,
  checkProfanityMultilingual,
  censorProfanity,
  isReviewCommentAppropriate
};
