# Goal

Generate an educational and engaging audio podcast script tailored to the kids based on their context above (age, interests, etc.) to help them learn and remember new things.
The tone must be premium, similar to a high-quality radio production. This script will be transcribed to audio to generate one episode in podcast series.

# Inputs

- Topic: {theme}
- Duration Goal: {duration} minutes = {word_count} words
- Target Age: {age} years old
- Kids life context:
  {context}

# Core Instructions:

1. Characters: Sophie and Marc (Strictly stick to these two) who have the following roles:
   - Marc the Learner: Enthusiastic, curious, full of wonder. He asks the questions kids would ask.
   - Sophie the Expert: Calm, pedagogical, warm. She is the "expert" who explains things simply but deeply.
     Note: We MUST have one learner and one expert per episode. If Sophie is the learner, Marc is the expert and vice versa.
2. Context:
   - You must adapt content to the kids age ({age}).
   - Refer to the kids context once or twice max and only when very relevant to explain or illustrate a concept.
   - To increase engagement, invent a friendly character (animal, object, etc.) that will help Sophie and Marc to explore the topic through its adventure.
3. Language: French only but teach 5 English words using the bilingual methodology below.
4. Structure: Follow the following podcast structure and add a [pause 1s] before each section:
   1. Title: Always start with topic name: {theme} with neutral tone.
   2. Opening (Hook): Start exactly with "Bonjour <kids names> ! Prêts pour une nouvelle aventure ? Aujourd'hui, on va encore découvrir quelque chose de <fascinant/incroyable/étonnant...>. Ouvrez grands vos petites oreilles !"
   3. Discovery section: An in-depth dialogue where Sophie and Marc explore the topic with science based facts and real life examples.
   4. "Le saviez-vous": 3 fun facts about the topic they could share with their friends/parents.
   5. Key Takeaways: Wrap-up what they have learned + all 5 english words one more time.
   6. Outro: A recap and a simple home experiment. End with "À très bientôt les petits curieux !"
5. Length & Content Depth (CRITICAL):
   - You MUST produce an output of roughly {word_count} words
   - DO NOT summarize. Elaborate on descriptions, scenery, character feelings, and detailed scientific/natural/cultural explanations.
6. Steering & Pacing:
   - Use ONLY these steering tags in brackets: [neutre], [enthousiaste], [curieuse], [neutre], [pédagogue], [blagueur].
   - ONOMATOPOEIA: Use them sparingly (max 3 in the whole script). Only when truly meaningful (e.g., a "Plouf" into the water).
   - ACTING: Once or twice max per episode, kids should be asked to do a simple action to keep them engaged(e.g., "Faites l'abeille" or "Tappez des pieds")
7. Bilingual Methodology:
   - Pick 5 key terms that are central to the topic.
   - Throughout the podcast, as they first appear, they should be repeated in English.
   - For each of the 5 words let's have either Marc or Sophie repeat it in English. "En anglais, on dit [accent américain] 'WORD'. Répétez avec moi : [accent américain] 'WORD' [pause 1s]. Encore une fois : [accent américain] 'WORD' [pause 1s]."

# Output format

Return the script as a JSON object with an "items" field containing the list of objects:
{{
  "items": [
    {{"speaker": "Sophie", "text": "[pause 300ms] [enthousiaste] Oh regarde Marc !..."}},
{{"speaker": "Marc", "text": "[pause 300ms] [pédagogue] Oui Sophie, c'est ce qu'on appelle..."}}
]
}}
The "text" field must includes the steering tags.
