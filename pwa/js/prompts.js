// Prompt templates and configuration for Kids Podcast PWA

export const DEFAULT_TRANSCRIPT_MODEL = "gemini-3.8-flash";
export const DEFAULT_TTS_MODEL = "gemini-3.8-flash-tts";

export const CATEGORIES = [
  { id: "nature", name: "Nature", icon: "🌿", desc: "Forêts, déserts, saisons, océans..." },
  { id: "animaux", name: "Animaux", icon: "🐾", desc: "Dinosaures, requins, oiseaux, baleines..." },
  { id: "espace", name: "Espace", icon: "🚀", desc: "Planètes, fusées, étoiles, astronautes..." },
  { id: "histoire", name: "Histoire", icon: "🏰", desc: "Châteaux forts, pyramides, chevaliers..." },
  { id: "sciences", name: "Sciences", icon: "🔬", desc: "Inventions, robots, électricité, gravité..." },
  { id: "corps", name: "Corps Humain", icon: "🫀", desc: "Le cerveau, le cœur, les 5 sens, sommeil..." },
  { id: "geographie", name: "Géographie", icon: "🌍", desc: "Volcans, terres lointaines, voyages..." },
  { id: "culture", name: "Culture", icon: "🏛️", desc: "Légendes, monuments, contes, traditions..." },
  { id: "musique", name: "Musique", icon: "🎵", desc: "Instruments, rythmes, styles musicaux, compositeurs..." },
  { id: "cuisine", name: "Cuisine", icon: "🍳", desc: "Fromage, chocolat, comment poussent les fruits..." },
  { id: "personnages", name: "Personnages", icon: "👑", desc: "Grands inventeurs, explorateurs, héros..." }
];

export function buildScriptPrompt({ category, theme, duration, age, context }) {
  // TTS audio pacing is ~170-175 words per minute in spoken French dialogue
  const wordCount = Math.round(duration * 175);
  
  return `# Goal
Generate an educational and engaging audio podcast script tailored to kids based on their context (age: ${age} years old) to help them learn and remember new things.
The tone must be premium, immersive, and dynamic—like an on-the-field investigative report rather than a calm indoor studio reading.

# Inputs
- Category: ${category}
- Topic: ${theme}
- Target Word Count: approximately ${wordCount} words
- Target Age: ${age} years old
- Kids life context:
  ${context || "Deux enfants curieux et dynamiques."}

# Core Instructions:
1. Pedagogical Plan & Story Arc (MANDATORY FIRST STEP):
   Before generating dialogue, you MUST define the pedagogical_plan:
   - learning_goal: The central educational concept or mystery children will discover.
   - narrative_arc: The connecting story thread between Sophie, Marc, and their friendly guide so explanations flow seamlessly without disjointed facts.
   - english_words: Exactly 5 key English terms (with their French translations) selected to fit naturally into the story.
2. In-Situ Exploration Atmosphere ("Sur le terrain"):
   - Sophie and Marc are NOT sitting in a soundproof studio. They are ON LOCATION, exploring the setting live (in the deep jungle, near a volcano, diving in the coral reef, wandering a medieval castle).
   - They physically react to their environment: observing scenery, whispering to avoid scaring animals, feeling temperature or wind, walking carefully, examining curious objects.
   - Make dialogue turns asymmetric and reactive: Marc shouldn't just wait politely to ask long questions, he reacts spontaneously to what he sees and feels.
3. Characters: Sophie and Marc (Strictly stick to these two) who have the following roles:
   - Marc the Learner: Enthusiastic, curious, full of wonder and spontaneous reactions. He asks the questions kids would ask.
   - Sophie the Expert: Calm, pedagogical, warm and attentive guide. She explains things simply but deeply while leading the exploration.
4. Context:
   - Adapt content to the target age (${age} years old).
   - Refer to the kids context once or twice max and ONLY when relevant to the explanations.
   - Invent a friendly character (animal, object, etc.) to guide or accompany Sophie and Marc on the terrain.
5. Language: French only, but teach 5 English words using the bilingual methodology below.
6. Structure & Flow:
   1. Title (CRITICAL): The VERY FIRST item in the script array MUST ALWAYS be Sophie speaking ONLY the exact topic name: "${theme}" in a calm, documentary tone. No greetings or introductory remarks before this title.
   2. Opening (Hook): Dynamic greeting on-location, introducing the sensory scene and the mystery to solve.
   3. Discovery section: In-depth exploration dialogue with science-based facts, sensory details, and actions following the narrative arc.
   4. "Le saviez-vous": 3 fun facts smoothly integrated into their observations.
   5. Key Takeaways: Wrap-up what they have learned on the field + recap all 5 English words one more time.
   6. Outro: A recap and a simple home observation/experiment. End with "À très bientôt les petits curieux !"
7. Length & Content Depth (CRITICAL):
   - You MUST produce an extensive script of approximately ${wordCount} words.
   - DO NOT summarize prematurely or rush to conclusion. Elaborate on descriptions, scenery, character feelings, curiosity, and detailed explanations.
8. Expressive Audio Tags (Gemini 3.8 TTS Engine):
   - Scripted Vocal Bursts (Use \`<tag>\`): Express non-verbal physical reactions using ONLY: <laughs>, <gasp>, <sigh>, <chuckle>. (Strict limit: 2 to 4 max across the whole script to avoid caricature).
   - Active Backchanneling (Use \`|token|\`): Use natural French active-listening tokens for fluid conversational turn-taking: |mhm|, |ah !|, |oh !|, |ouah|, |tiens ?|. (Strict limit: 3 to 5 max across the whole script. NEVER use English "yeah").
   - Direction Steering (Use \`[tag]\`): [whispering] (for stealth or intimacy), [shouting] (for distance), [short pause] (for comedic or dramatic suspense), [American accent] (strictly for English words).
   - ONOMATOPOEIA: Max 2 in the whole script.
9. Bilingual Methodology:
   - Pick the 5 key terms defined in your pedagogical plan.
   - Throughout the podcast, as they first appear, teach them in English: "En anglais, on dit [American accent] 'WORD'. Répétez avec moi : [American accent] 'WORD' [short pause]."

# Output format
Return ONLY valid JSON according to schema. Strictly generate the "pedagogical_plan" object first, then the "items" array.`;
}

export const SCRIPT_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    pedagogical_plan: {
      type: "OBJECT",
      properties: {
        learning_goal: { type: "STRING" },
        narrative_arc: { type: "STRING" },
        english_words: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              english: { type: "STRING" },
              french: { type: "STRING" }
            },
            required: ["english", "french"]
          }
        }
      },
      required: ["learning_goal", "narrative_arc", "english_words"]
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          speaker: { type: "STRING" },
          text: { type: "STRING" }
        },
        required: ["speaker", "text"]
      }
    }
  },
  required: ["pedagogical_plan", "items"]
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
