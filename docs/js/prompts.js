// Prompt templates and configuration for Kids Podcast PWA

export const DEFAULT_TRANSCRIPT_MODEL = "gemini-2.5-pro";
export const DEFAULT_TTS_MODEL = "gemini-2.5-pro-preview-tts";

export const CATEGORIES = [
  { id: "nature", name: "Nature", icon: "🌿", desc: "Forêts, déserts, saisons, océans..." },
  { id: "animaux", name: "Animaux", icon: "🐾", desc: "Dinosaures, requins, oiseaux, baleines..." },
  { id: "espace", name: "Espace", icon: "🚀", desc: "Planètes, fusées, étoiles, astronautes..." },
  { id: "histoire", name: "Histoire", icon: "🏰", desc: "Châteaux forts, pyramides, chevaliers..." },
  { id: "sciences", name: "Sciences", icon: "🔬", desc: "Inventions, robots, électricité, gravité..." },
  { id: "corps", name: "Corps Humain", icon: "🫀", desc: "Le cerveau, le cœur, les 5 sens, sommeil..." },
  { id: "geographie", name: "Géographie", icon: "🌍", desc: "Volcans, terres lointaines, voyages..." },
  { id: "culture", name: "Culture", icon: "🏛️", desc: "Légendes, monuments, contes, musique..." },
  { id: "cuisine", name: "Cuisine", icon: "🍳", desc: "Fromage, chocolat, comment poussent les fruits..." },
  { id: "personnages", name: "Personnages", icon: "👑", desc: "Grands inventeurs, explorateurs, héros..." }
];

export function buildScriptPrompt({ category, theme, duration, age, context }) {
  const wordCount = duration * 130;
  
  return `# Goal
Generate an educational and engaging audio podcast script tailored to kids based on their context (age: ${age} years old) to help them learn and remember new things.
The tone must be premium, similar to a high-quality radio production.

# Inputs
- Category: ${category}
- Topic: ${theme}
- Duration Goal: ${duration} minutes = ${wordCount} words
- Target Age: ${age} years old
- Kids life context:
  ${context || "Deux enfants curieux et dynamiques."}

# Core Instructions:
1. Characters: Sophie and Marc (Strictly stick to these two) who have the following roles:
   - Marc the Learner: Enthusiastic, curious, full of wonder. He asks the questions kids would ask.
   - Sophie the Expert: Calm, pedagogical, warm. She is the "expert" who explains things simply but deeply.
2. Context:
   - Adapt content to the target age (${age} years old).
   - Refer to the kids context once or twice max when relevant.
   - Invent a friendly character (animal, object, etc.) to help Sophie and Marc explore the topic.
3. Language: French only, but teach 5 English words using the bilingual methodology below.
4. Structure:
   1. Title: Start with topic name: ${theme} with neutral tone.
   2. Opening (Hook): Start with a dynamic greeting to the kids.
   3. Discovery section: In-depth dialogue exploring the topic with science-based facts and real life examples.
   4. "Le saviez-vous": 3 fun facts about the topic.
   5. Key Takeaways: Wrap-up what they have learned + all 5 English words one more time.
   6. Outro: A recap and a simple home observation/experiment. End with "À très bientôt les petits curieux !"
5. Length & Content Depth:
   - You MUST produce an output of roughly ${wordCount} words.
   - DO NOT summarize prematurely. Elaborate on descriptions, scenery, character feelings, and detailed explanations.
6. Steering & Pacing:
   - Use ONLY these functional steering tags in brackets: [whispering], [shouting], [laughing], [sighing], [short pause], [American accent].
   - ONOMATOPOEIA: Max 3 in the whole script.
7. Bilingual Methodology:
   - Pick 5 key terms central to the topic.
   - Throughout the podcast, as they first appear, teach them in English: "En anglais, on dit [American accent] 'WORD'. Répétez avec moi : [American accent] 'WORD' [short pause]."

# Output format
Return ONLY valid JSON according to schema.`;
}

export const SCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", enum: ["Sophie", "Marc"] },
          text: { type: "string" }
        },
        required: ["speaker", "text"]
      }
    }
  },
  required: ["items"]
};

export function buildTtsPrompt(scriptItems) {
  const header = `# AUDIO PROFILE: Sophie
- Gender: Female
- Voice Quality: Warm, melodic, maternal, engaging educator
- Tone: Joyful, calm, encouraging

# AUDIO PROFILE: Marc
- Gender: Male
- Voice Quality: Energetic, enthusiastic, curious boy
- Tone: Playful, excited, eager to learn

# DIRECTOR'S NOTES
- High energy storytelling, articulated and clear for children.
- Sophie leads gently, Marc reacts with excitement and awe.

#### TRANSCRIPT
`;

  const dialogue = scriptItems.map(item => {
    const speaker = item.speaker === "Sophie" ? "Sophie" : "Marc";
    let text = item.text || "";
    // Clean redundant tags if any
    text = text.replace(/\[(Sophie|Marc)\s*-\s*([^\]]+)\]/gi, "[$2]");
    return `${speaker}: ${text}`;
  }).join("\n");

  return header + dialogue;
}
