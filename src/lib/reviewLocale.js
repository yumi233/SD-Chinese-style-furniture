const LANGUAGES = {
  cn: "Simplified Chinese (zh-CN, 简体中文)",
  tw: "Traditional Chinese (zh-TW, 繁體中文)",
  en: "English (en)",
};
const SCRIPT_CONVERTERS = {};

function normalizeReviewLocale(locale) {
  return typeof locale === "string" && Object.hasOwn(LANGUAGES, locale) ? locale : "cn";
}

function reviewLanguageInstruction(locale) {
  const language = LANGUAGES[normalizeReviewLocale(locale)];
  return `Write all review feedback in ${language}, regardless of the language of the requirement, prompt, or references. This includes highlight, all three highlightEvidence values, problems, suggestion, learningFeedback, any knowledgeReferences and complianceNotes, and any checks[].evidence. Keep JSON keys, IDs, and enum values as specified.`;
}

function reviewScriptConverter(locale) {
  const to = normalizeReviewLocale(locale);
  if (to === "en") return text => text;
  return text => {
    if (!/\p{Script=Han}/u.test(text)) return text;
    SCRIPT_CONVERTERS[to] ??= to === "cn"
      ? require("opencc-js/t2cn").Converter({ from: "tw", to: "cn" })
      : require("opencc-js/cn2t").Converter({ from: "cn", to: "tw" });
    return SCRIPT_CONVERTERS[to](text);
  };
}

module.exports = { normalizeReviewLocale, reviewLanguageInstruction, reviewScriptConverter };
