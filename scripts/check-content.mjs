import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SECTIONS, spokenText, scriptOf, voiceRequest, matchVoice, telHref } from '../js/phrase-utils.js';

const dataDir = new URL('../data/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dataDir), 'utf8'));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const failures = [];

function fail(message) {
  failures.push(message);
}

assert.equal(spokenText({ native: 'Désolé(e)' }), 'Désolé');
assert.equal(spokenText({ native: 'perdu(e)', speak: 'perdu' }), 'perdu');
assert.equal(scriptOf('عندي حجز'), 'arab');
assert.equal(scriptOf('Bonjour'), 'latn');
assert.deepEqual(voiceRequest({ langCode: 'ar-MA', voiceLabel: 'Darija' }, 'Bonjour'), { lang: null, label: 'Darija' });
assert.deepEqual(voiceRequest({ langCode: 'ar-MA', voiceLabel: 'Darija' }, 'عندي حجز'), { lang: 'ar', label: 'Arabic' });
assert.equal(matchVoice([{ lang: 'fr-FR' }, { lang: 'en-US' }], 'fr')?.lang, 'fr-FR');
assert.equal(matchVoice([{ lang: 'en-US' }], 'ja'), null);
assert.equal(telHref('110'), 'tel:110');
assert.equal(telHref('110 / 119'), null);
assert.equal(telHref(''), null);

const ids = index.countries.map((country) => country.id);
if (ids.length !== 19) fail(`expected 19 countries, found ${ids.length}`);

for (const entry of index.countries) {
  if (!sw.includes(`/data/${entry.id}.json`)) fail(`service worker does not precache ${entry.id}`);
  const country = JSON.parse(readFileSync(new URL(`${entry.id}.json`, dataDir), 'utf8'));
  const { contentHash, ...rest } = country;
  const expected = createHash('sha256').update(JSON.stringify({
    phrases: rest.phrases,
    emergencyNumbers: rest.emergencyNumbers,
  })).digest('hex');
  if (contentHash !== expected) fail(`${entry.id} contentHash does not match its phrases`);
  if (!country.region || !country.voiceLabel || !country.langCode) fail(`${entry.id} is missing region, voice label, or language code`);
  if (!Array.isArray(country.emergencyNumbers) || !country.emergencyNumbers.length) fail(`${entry.id} has no emergency numbers`);
  for (const number of country.emergencyNumbers) {
    if (!telHref(number.tel)) fail(`${entry.id} emergency "${number.tel}" is not a single dialable number`);
    if (!number.name) fail(`${entry.id} emergency ${number.tel} has no service name`);
  }
  const seen = new Set();
  for (const section of SECTIONS) {
    const phrases = country.phrases[section];
    if (!phrases?.length) fail(`${entry.id} is missing phrases for ${section}`);
    if (!country.tips?.[section]) fail(`${entry.id} is missing a tip for ${section}`);
    for (const phrase of phrases || []) {
      if (!phrase.native || !phrase.pron || !phrase.en) fail(`${entry.id} ${section} has an empty phrase field`);
      const key = phrase.en.trim().toLowerCase();
      if (seen.has(key)) fail(`${entry.id} repeats the English line "${phrase.en}"`);
      seen.add(key);
    }
  }
  if (country.currency && !country.currency.asOf) fail(`${entry.id} currency has no asOf date`);
}

const singapore = JSON.parse(readFileSync(new URL('singapore.json', dataDir), 'utf8'));
if (singapore.langCode !== 'en-SG') fail('Singapore is not English');
if (!/english/i.test(singapore.lang)) fail('Singapore language label is not English');
if (singapore.phrases.greetings.some((phrase) => /selamat/i.test(phrase.native))) fail('Singapore greetings are still Malay');

const morocco = JSON.parse(readFileSync(new URL('morocco.json', dataDir), 'utf8'));
const arabic = Object.values(morocco.phrases).flat().filter((phrase) => scriptOf(phrase.native) === 'arab');
if (!arabic.length) fail('Morocco has no Arabic-script phrases');

const france = JSON.parse(readFileSync(new URL('france.json', dataDir), 'utf8'));
const frenchNumbers = new Set(france.phrases.numbers.map((phrase) => phrase.en));
for (const needed of ['30', '40', '60', '70', '80', '90', '1000']) {
  if (!frenchNumbers.has(needed)) fail(`France is missing the number ${needed}`);
}
if (france.emergencyNumbers.map((number) => number.tel).join(',') !== '112,17,15') fail('France emergency numbers drifted');

const japan = JSON.parse(readFileSync(new URL('japan.json', dataDir), 'utf8'));
if (japan.emergencyNumbers.map((number) => number.tel).join(',') !== '110,119') fail('Japan emergency numbers are not split');

if (!sw.includes('response.ok')) fail('service worker does not check response.ok before caching');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Checked ${ids.length} countries, ${readdirSync(dataDir).length} data files.`);
