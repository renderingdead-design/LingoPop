
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DictionaryData, ExampleSentence, ChatMessage, NewsArticle } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * Stage 1: Fast fetch for just the definition and word.
 */
export const fetchBasicDefinition = async (
  query: string,
  nativeLang: string,
  targetLang: string
): Promise<DictionaryData> => {
  const model = "gemini-2.5-flash";

  const prompt = `
    Task: Translate/Define.
    Input: "${query}".
    Target Language: ${targetLang}.
    User's Native Language: ${nativeLang}.
    
    Return JSON with:
    1. "word": The refined target word/phrase.
    2. "definition": A clear, concise natural language definition in ${nativeLang}.
    3. "pronunciation": IPA or phonetic guide.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          pronunciation: { type: Type.STRING },
          definition: { type: Type.STRING },
        },
        required: ["word", "definition"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  return JSON.parse(text) as DictionaryData;
};

/**
 * Stage 2: Fetch the rich content (Examples, Fun Usage, Etymology, Synonyms, Antonyms, Nuance).
 */
export const fetchDetailedInfo = async (
  word: string,
  nativeLang: string,
  targetLang: string,
  contextDefinition: string
): Promise<Partial<DictionaryData>> => {
  const model = "gemini-2.5-flash";

  const prompt = `
    Word: "${word}" (${targetLang}).
    Definition Context: ${contextDefinition}.
    Native Language: ${nativeLang}.
    
    Provide:
    1. "examples": 2 example sentences in ${targetLang} with ${nativeLang} translation.
    2. "funUsage": A cool, witty friend-like explanation (cultural context, vibe, nuance). No textbook style.
    3. "etymology": Brief, interesting origin/roots of the word in ${nativeLang}.
    4. "synonyms": List of up to 3 synonyms in ${targetLang}.
    5. "antonyms": List of up to 3 antonyms in ${targetLang} (empty if none).
    6. "synonymNuance": A 1-sentence explanation of the subtle difference between this word and its synonyms (e.g. formal vs casual).
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          etymology: { type: Type.STRING },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                translation: { type: Type.STRING }
              }
            }
          },
          funUsage: { type: Type.STRING },
          synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          synonymNuance: { type: Type.STRING }
        },
        required: ["examples", "funUsage", "etymology", "synonyms", "antonyms"]
      }
    }
  });

  const text = response.text;
  if (!text) return {};
  
  return JSON.parse(text) as Partial<DictionaryData>;
};

/**
 * Generates an illustration for the concept.
 */
export const generateConceptImage = async (word: string): Promise<string | undefined> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{
          text: `A simple, bright, vibrant, flat vector art style illustration representing the concept of "${word}". Minimalist, icon-like, colorful on a white background.`
        }]
      }
    });

    // Extract image from parts
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.error("Image generation failed", e);
    return undefined; // Fail gracefully without crashing app
  }
  return undefined;
};

/**
 * Generates Speech for the given text using Gemini TTS.
 */
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<AudioBuffer | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode Base64
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return await audioContext.decodeAudioData(bytes.buffer);

  } catch (e) {
    console.error("TTS generation failed", e);
    return null;
  }
};

/**
 * Chat with context about the word.
 */
export const sendChatMessage = async (
  history: ChatMessage[], 
  currentWord: string, 
  userMessage: string,
  targetLang: string
): Promise<string> => {
  const model = "gemini-2.5-flash";
  
  // Construct conversation history for context
  const contextPrompt = `You are a fun, helpful language tutor. The user is asking about the word/phrase: "${currentWord}" in ${targetLang}. Keep answers concise, helpful, and conversational.`;
  
  const contents = [
    { role: 'user', parts: [{ text: contextPrompt }] },
    { role: 'model', parts: [{ text: "Got it! I'm ready to help explaining this word." }] },
    ...history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    })),
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const response = await ai.models.generateContent({
    model,
    contents,
  });

  return response.text || "Sorry, I couldn't think of a response.";
};

/**
 * Generate a story from saved words.
 */
export const generateStoryFromWords = async (words: string[], targetLang: string, nativeLang: string): Promise<string> => {
   const model = "gemini-2.5-flash";
   const wordList = words.join(", ");
   
   const prompt = `Write a very short, creative, and funny story (max 150 words) in ${targetLang} that includes the following words: ${wordList}. 
   Then provide a translation in ${nativeLang}.
   Format the output as:
   [STORY]
   (story text here)
   
   [TRANSLATION]
   (translation here)`;

   const response = await ai.models.generateContent({
     model,
     contents: prompt
   });
   
   return response.text || "Could not generate story.";
};

/**
 * Fetch a daily news article for language learning.
 */
export const fetchDailyNews = async (targetLang: string, nativeLang: string): Promise<NewsArticle> => {
  const model = "gemini-2.5-flash";
  
  // We use googleSearch to get recent topics, but we ask the model to rephrase it 
  // into a learning article.
  const prompt = `
    Find a recent, interesting, non-political news topic (culture, science, technology, or weird news) from the last 48 hours relevant to ${targetLang} speakers.
    
    Based on this news, write a short, simplified news article (about 80-100 words) suitable for a language learner in ${targetLang}.
    Provide a translation in ${nativeLang}.
    
    Return JSON with:
    1. "title": Headline in ${targetLang}.
    2. "content": The article text in ${targetLang}.
    3. "translation": The full translation in ${nativeLang}.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          translation: { type: Type.STRING }
        },
        required: ["title", "content", "translation"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate news");

  const data = JSON.parse(text);

  // Extract source from grounding metadata if available
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  let sourceUrl = undefined;
  let sourceTitle = undefined;
  
  if (groundingChunks && groundingChunks.length > 0) {
    // Find the first web source
    const webSource = groundingChunks.find((chunk: any) => chunk.web?.uri);
    if (webSource) {
      sourceUrl = webSource.web.uri;
      sourceTitle = webSource.web.title;
    }
  }

  return {
    ...data,
    sourceUrl,
    sourceTitle
  };
}
