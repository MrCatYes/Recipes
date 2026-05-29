import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  parseServings,
  parseImageUrl,
  parseInstructions,
  extractJsonLd,
} from '../recipe-parser.service';

// ─── parseDuration ────────────────────────────────────────────────────────────

describe('parseDuration', () => {
  it('PT30M → 30', () => expect(parseDuration('PT30M')).toBe(30));
  it('PT1H30M → 90', () => expect(parseDuration('PT1H30M')).toBe(90));
  it('PT2H → 120', () => expect(parseDuration('PT2H')).toBe(120));
  it('PT45M → 45', () => expect(parseDuration('PT45M')).toBe(45));
  it('P0DT15M → 15', () => expect(parseDuration('P0DT15M')).toBe(15));
  it('null → null', () => expect(parseDuration(null)).toBeNull());
  it('undefined → null', () => expect(parseDuration(undefined)).toBeNull());
  it('empty string → null', () => expect(parseDuration('')).toBeNull());
  it('malformed → null', () => expect(parseDuration('30 minutes')).toBeNull());
  it('number → null', () => expect(parseDuration(30)).toBeNull());
});

// ─── parseServings ────────────────────────────────────────────────────────────

describe('parseServings', () => {
  it('number 6 → 6', () => expect(parseServings(6)).toBe(6));
  it('number 1 → 1', () => expect(parseServings(1)).toBe(1));
  it('"4 servings" → 4', () => expect(parseServings('4 servings')).toBe(4));
  it('"Makes 8" → 8', () => expect(parseServings('Makes 8')).toBe(8));
  it('"6 portions" → 6', () => expect(parseServings('6 portions')).toBe(6));
  it('null → 4 (default)', () => expect(parseServings(null)).toBe(4));
  it('undefined → 4 (default)', () => expect(parseServings(undefined)).toBe(4));
  it('"no number" → 4 (default)', () => expect(parseServings('no number')).toBe(4));
  it('0 clamped to 1', () => expect(parseServings(0)).toBe(1));
});

// ─── parseImageUrl ────────────────────────────────────────────────────────────

describe('parseImageUrl', () => {
  it('string URL', () => expect(parseImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg'));
  it('array of strings', () => expect(parseImageUrl(['https://a.com/1.jpg', 'https://b.com/2.jpg'])).toBe('https://a.com/1.jpg'));
  it('object with url', () => expect(parseImageUrl({ url: 'https://c.com/3.jpg' })).toBe('https://c.com/3.jpg'));
  it('null → null', () => expect(parseImageUrl(null)).toBeNull());
  it('empty string → null', () => expect(parseImageUrl('')).toBeNull());
  it('empty array → null', () => expect(parseImageUrl([])).toBeNull());
});

// ─── parseInstructions ───────────────────────────────────────────────────────

describe('parseInstructions', () => {
  it('array of strings', () => {
    expect(parseInstructions(['Preheat oven.', 'Mix ingredients.'])).toEqual(['Preheat oven.', 'Mix ingredients.']);
  });
  it('array of HowToStep objects', () => {
    expect(parseInstructions([{ '@type': 'HowToStep', text: 'Step one.' }, { '@type': 'HowToStep', text: 'Step two.' }]))
      .toEqual(['Step one.', 'Step two.']);
  });
  it('plain string split by newline', () => {
    expect(parseInstructions('Step one.\nStep two.')).toEqual(['Step one.', 'Step two.']);
  });
  it('null → []', () => expect(parseInstructions(null)).toEqual([]));
  it('filters empty strings', () => {
    expect(parseInstructions(['', 'Step one.', '   '])).toEqual(['Step one.']);
  });
});

// ─── extractJsonLd ────────────────────────────────────────────────────────────

const RECIPE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Gâteau au chocolat',
  recipeYield: '8',
  recipeIngredient: ['200 g de chocolat noir', '3 oeufs', '125 g de beurre'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Faire fondre le chocolat.' },
    { '@type': 'HowToStep', text: 'Mélanger avec les oeufs.' },
  ],
  image: 'https://example.com/cake.jpg',
  prepTime: 'PT15M',
  cookTime: 'PT30M',
};

function makeHtml(ld: object): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
}

describe('extractJsonLd', () => {
  it('extracts recipe from direct @type Recipe', () => {
    const result = extractJsonLd(makeHtml(RECIPE_JSON_LD));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Gâteau au chocolat');
    expect(result!.servings).toBe(8);
    expect(result!.ingredients).toHaveLength(3);
    expect(result!.ingredients[0]).toBe('200 g de chocolat noir');
    expect(result!.instructions).toHaveLength(2);
    expect(result!.imageUrl).toBe('https://example.com/cake.jpg');
    expect(result!.prepTimeMinutes).toBe(15);
    expect(result!.cookTimeMinutes).toBe(30);
  });

  it('extracts recipe from @graph', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Mon site' },
        RECIPE_JSON_LD,
      ],
    };
    const result = extractJsonLd(makeHtml(ld));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Gâteau au chocolat');
  });

  it('extracts recipe from JSON-LD array', () => {
    const result = extractJsonLd(makeHtml([{ '@type': 'Organization' }, RECIPE_JSON_LD]));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Gâteau au chocolat');
  });

  it('returns null when no JSON-LD', () => {
    expect(extractJsonLd('<html><body>No JSON-LD here</body></html>')).toBeNull();
  });

  it('returns null when JSON-LD has no Recipe type', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: 'Test' };
    expect(extractJsonLd(makeHtml(ld))).toBeNull();
  });

  it('returns null for recipe with no ingredients', () => {
    const ld = { ...RECIPE_JSON_LD, recipeIngredient: [] };
    expect(extractJsonLd(makeHtml(ld))).toBeNull();
  });

  it('handles @type as array', () => {
    const ld = { ...RECIPE_JSON_LD, '@type': ['Recipe', 'Thing'] };
    const result = extractJsonLd(makeHtml(ld));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Gâteau au chocolat');
  });

  it('handles malformed JSON-LD gracefully', () => {
    const html = `<html><head>
      <script type="application/ld+json">{invalid json}</script>
      <script type="application/ld+json">${JSON.stringify(RECIPE_JSON_LD)}</script>
    </head></html>`;
    const result = extractJsonLd(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Gâteau au chocolat');
  });
});
