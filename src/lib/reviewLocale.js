const { Converter } = require("opencc-js");

const LANGUAGES = {
  cn: "Simplified Chinese (zh-CN, 简体中文)",
  tw: "Traditional Chinese (zh-TW, 繁體中文)",
  en: "English (en)",
};
const SCRIPT_CONVERTERS = {
  cn: Converter({ from: "tw", to: "cn" }),
  tw: Converter({ from: "cn", to: "tw" }),
};

function normalizeReviewLocale(locale) {
  return typeof locale === "string" && Object.hasOwn(LANGUAGES, locale) ? locale : "cn";
}

function reviewLanguageInstruction(locale) {
  const language = LANGUAGES[normalizeReviewLocale(locale)];
  return `Write all review feedback in ${language}, regardless of the language of the requirement, prompt, or references. This includes highlight, all three highlightEvidence values, problems, suggestion, learningFeedback, any knowledgeReferences and complianceNotes, and any checks[].evidence. Keep JSON keys, IDs, and enum values as specified.`;
}

function reviewScriptConverter(locale) {
  return SCRIPT_CONVERTERS[normalizeReviewLocale(locale)] || (text => text);
}

module.exports = { normalizeReviewLocale, reviewLanguageInstruction, reviewScriptConverter };
