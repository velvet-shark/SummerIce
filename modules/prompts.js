import { CONFIG } from "../constants.js";

const getFormatInstruction = (summaryFormat) =>
  summaryFormat === "bullets"
    ? "Format the summary as clear bullet points."
    : "Format the summary in well-structured paragraphs.";

const getSourceLabels = (options = {}) => {
  const sourceType = options.sourceType || "article";
  const subjectLabel = sourceType === "video" ? "video transcript" : "article";
  const contentLabel = sourceType === "video" ? "Transcript" : "Article";
  const titleLine = options.title ? `Title: ${options.title}\n` : "";

  return { subjectLabel, contentLabel, titleLine };
};

export const getSummaryPrompt = (content, length, format, options = {}) => {
  const wordCount = CONFIG.SUMMARY_LENGTHS[length]?.words || 200;
  const formatInstruction = getFormatInstruction(format);
  const { subjectLabel, contentLabel, titleLine } = getSourceLabels(options);

  return `Provide a concise summary of the ${subjectLabel} below. The summary should be around ${wordCount} words and capture the essential information while preserving the original meaning and context. ${formatInstruction} Avoid including minor details or tangential information. The goal is to provide a quick, informative overview of the ${subjectLabel}'s core content.

Do not include any intro text, e.g. 'Here is a concise summary', get straight to the summary.

${contentLabel}:
---
${titleLine}${content}
---`;
};

export const buildChunkPrompt = (
  chunk,
  chunkIndex,
  totalChunks,
  targetWords,
  summaryFormat,
  options = {},
) => {
  const formatInstruction = getFormatInstruction(summaryFormat);
  const { subjectLabel, contentLabel, titleLine } = getSourceLabels(options);

  return `Summarize section ${chunkIndex} of ${totalChunks} from a longer ${subjectLabel}. Target about ${targetWords} words. ${formatInstruction} Keep the key facts and context.

Do not include any intro text.

${contentLabel} section:
---
${titleLine}${chunk}
---`;
};

export const buildSynthesisPrompt = (
  chunkSummaries,
  length,
  summaryFormat,
  options = {},
) => {
  const wordCount = CONFIG.SUMMARY_LENGTHS[length]?.words || 200;
  const formatInstruction = getFormatInstruction(summaryFormat);
  const { subjectLabel } = getSourceLabels(options);

  return `The text below contains summaries of sections from one long ${subjectLabel}. Synthesize them into a single coherent summary around ${wordCount} words. ${formatInstruction} Remove duplication and keep the most important points.

Do not include any intro text.

Section summaries:
---
${chunkSummaries}
---`;
};
