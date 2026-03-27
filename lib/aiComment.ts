interface AiCommentInput {
  times: string[];
  forecastDraft: number[];
  depth: number;
  requiredDraft?: number;
}

export async function generateAiComment(_input: AiCommentInput) {
  // Placeholder for future AI integration (OpenAI, Azure, etc).
  return "AI comment generation is not enabled yet.";
}
