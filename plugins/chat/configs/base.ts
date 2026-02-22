export const BASE_CONFIG = {
  apiUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  isMultimodal: true,
  maxContextTokens: 128,
  temperature: 0.8,
  historyCount: 100, // 群聊历史消息数量
  maxIterations: 20, // AI 迭代次数限制，-1 表示不限制
};

export default BASE_CONFIG;
