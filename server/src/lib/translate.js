/**
 * Inline message translation (PRD §4.2).
 *
 * Ships with a deterministic offline dictionary so the feature is demonstrable
 * with no external dependency. Point TRANSLATE_ENDPOINT at a real provider
 * (DeepL, Google Cloud Translation, Azure Translator) to go live. The shape of
 * `translate()` does not change.
 */
const SUPPORTED = { en: 'English', fr: 'Français', es: 'Español', yo: 'Yorùbá', ha: 'Hausa', ar: 'العربية' };

const PHRASES = {
  fr: {
    'good morning': 'bonjour', hello: 'bonjour', thank: 'merci', 'thank you': 'merci',
    homework: 'devoirs', assignment: 'devoir', teacher: 'enseignant', school: 'école',
    please: "s'il vous plaît", meeting: 'réunion', progress: 'progrès', reading: 'lecture',
    absent: 'absent', today: "aujourd'hui", tomorrow: 'demain', class: 'classe', help: 'aide',
  },
  es: {
    'good morning': 'buenos días', hello: 'hola', thank: 'gracias', 'thank you': 'gracias',
    homework: 'tarea', assignment: 'tarea', teacher: 'maestro', school: 'escuela',
    please: 'por favor', meeting: 'reunión', progress: 'progreso', reading: 'lectura',
    absent: 'ausente', today: 'hoy', tomorrow: 'mañana', class: 'clase', help: 'ayuda',
  },
  yo: {
    'good morning': 'ẹ káàrọ̀', hello: 'báwo', thank: 'ẹ ṣé', 'thank you': 'ẹ ṣé',
    homework: 'iṣẹ́ ilé', assignment: 'iṣẹ́ àṣetiléwá', teacher: 'olùkọ́', school: 'ilé-ìwé',
    please: 'jọ̀wọ́', meeting: 'ìpàdé', progress: 'ìlọsíwájú', reading: 'kíkà',
    absent: 'kò sí', today: 'lónìí', tomorrow: 'ọ̀la', class: 'kíláàsì', help: 'ìrànlọ́wọ́',
  },
  ha: {
    'good morning': 'ina kwana', hello: 'sannu', thank: 'na gode', 'thank you': 'na gode',
    homework: 'aikin gida', assignment: 'aiki', teacher: 'malami', school: 'makaranta',
    please: 'don Allah', meeting: 'taro', progress: 'ci gaba', reading: 'karatu',
    absent: 'bai halarta ba', today: 'yau', tomorrow: 'gobe', class: 'aji', help: 'taimako',
  },
  ar: {
    'good morning': 'صباح الخير', hello: 'مرحبا', thank: 'شكرا', 'thank you': 'شكرا',
    homework: 'واجب منزلي', assignment: 'مهمة', teacher: 'معلم', school: 'مدرسة',
    please: 'من فضلك', meeting: 'اجتماع', progress: 'تقدم', reading: 'قراءة',
    absent: 'غائب', today: 'اليوم', tomorrow: 'غدا', class: 'صف', help: 'مساعدة',
  },
};

export const languages = SUPPORTED;

export async function translate(text, targetLang) {
  if (!text || targetLang === 'en' || !SUPPORTED[targetLang]) return text;

  if (process.env.TRANSLATE_ENDPOINT) {
    try {
      const res = await fetch(process.env.TRANSLATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.TRANSLATE_API_KEY && { Authorization: `Bearer ${process.env.TRANSLATE_API_KEY}` }),
        },
        body: JSON.stringify({ text, target: targetLang }),
      });
      if (res.ok) return (await res.json()).translation ?? text;
    } catch {
      /* fall through to the offline dictionary */
    }
  }

  const dict = PHRASES[targetLang] || {};
  let out = text;
  for (const [en, translated] of Object.entries(dict).sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`\\b${en}\\b`, 'gi'), translated);
  }
  return out;
}
