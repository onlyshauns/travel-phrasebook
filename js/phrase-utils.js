export const SECTIONS = ['greetings', 'food', 'directions', 'shopping', 'numbers', 'emergency', 'medical', 'immigration', 'hotel', 'transport'];

export const SECTION_LABELS = {
  greetings: 'Greetings',
  food: 'Food',
  directions: 'Directions',
  shopping: 'Shopping',
  numbers: 'Numbers',
  emergency: 'Emergency',
  medical: 'Medical',
  immigration: 'Immigration',
  hotel: 'Hotel',
  transport: 'Transport',
};

export function spokenText(phrase) {
  if (phrase && phrase.speak) return String(phrase.speak).trim();
  return String(phrase?.native || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

export function scriptOf(text) {
  const value = String(text || '');
  if (/[\u0600-\u06FF]/.test(value)) return 'arab';
  if (/[\u3040-\u30ff]/.test(value)) return 'jpan';
  if (/[\uac00-\ud7af]/.test(value)) return 'kore';
  if (/[\u0E00-\u0E7F]/.test(value)) return 'thai';
  if (/[\u0900-\u097F]/.test(value)) return 'deva';
  if (/[\u0370-\u03FF]/.test(value)) return 'grek';
  if (/[\u4e00-\u9fff]/.test(value)) return 'hans';
  return 'latn';
}

export function voiceRequest(country, text) {
  const value = text && typeof text === 'object' ? text.native : text;
  const script = scriptOf(value);
  if (script === 'arab') return { lang: 'ar', label: 'Arabic' };
  if (script === 'latn' && String(country?.langCode || '').toLowerCase().startsWith('ar')) {
    return { lang: null, label: 'Darija' };
  }
  const code = String(country?.langCode || 'en');
  return { lang: code.split('-')[0].toLowerCase(), label: country?.voiceLabel || code };
}

export function matchVoice(voices, lang) {
  if (!lang) return null;
  const want = String(lang).toLowerCase();
  const list = voices || [];
  const norm = (voice) => String(voice.lang || '').toLowerCase().replace(/_/g, '-');
  return list.find((voice) => norm(voice) === want)
    || list.find((voice) => norm(voice).split('-')[0] === want)
    || null;
}

export function telHref(tel) {
  const raw = String(tel || '').trim();
  if (!/^\+?\d{2,6}$/.test(raw)) return null;
  return `tel:${raw}`;
}

export function phraseKey(countryId, section, phrase) {
  return `${countryId}:${section}:${phrase.en}:${phrase.native}`;
}
