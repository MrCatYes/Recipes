import { describe, it, expect } from 'vitest';
import { classifyRecipe, classifyDifficulty } from '../recipe-classifier';

describe('classifyRecipe — category', () => {
  it('gâteau → Dessert', () => expect(classifyRecipe('Gâteau au chocolat')).toBe('Dessert'));
  it('salade → Entrée', () => expect(classifyRecipe('Salade César')).toBe('Entrée'));
  it('poulet → Plat principal', () => expect(classifyRecipe('Poulet rôti au citron')).toBe('Plat principal'));
  it('crêpes → Déjeuner', () => expect(classifyRecipe('Crêpes du dimanche')).toBe('Déjeuner'));
  it('unknown → Plat principal (default)', () => expect(classifyRecipe('Truc mystère')).toBe('Plat principal'));
});

describe('classifyDifficulty — débutant', () => {
  it('few ingredients, few steps, quick', () => {
    expect(classifyDifficulty(4, ['Mélanger', 'Cuire 10 min', 'Servir'], 20)).toBe('débutant');
  });
  it('simple sandwich', () => {
    expect(classifyDifficulty(3, ['Tartiner le pain', 'Garnir'], 5)).toBe('débutant');
  });
});

describe('classifyDifficulty — confirmé', () => {
  it('medium ingredients + intermediate technique', () => {
    const steps = [
      'Faire mariner le poulet 30 min',
      'Faire revenir l\'oignon',
      'Saisir le poulet',
      'Laisser mijoter 25 min',
      'Incorporer la crème',
      'Rectifier l\'assaisonnement',
    ];
    expect(classifyDifficulty(8, steps, 75)).toBe('confirmé');
  });
});

describe('classifyDifficulty — expert', () => {
  it('advanced techniques push to expert', () => {
    const steps = [
      'Préparer la pâte feuilletée',
      'Tempérer le chocolat',
      'Monter la génoise',
      'Réaliser une crème anglaise',
      'Pocher les poires',
      'Émulsionner la sauce',
      'Glaçage miroir',
      'Assembler et réfrigérer 4 h',
    ];
    expect(classifyDifficulty(15, steps, 180)).toBe('expert');
  });

  it('many ingredients + steps + long time alone reach expert', () => {
    const steps = Array.from({ length: 12 }, (_, i) => `Étape ${i + 1}`);
    expect(classifyDifficulty(14, steps, 150)).toBe('expert');
  });
});

describe('classifyDifficulty — edge cases', () => {
  it('no instructions, no time → débutant', () => {
    expect(classifyDifficulty(2, [], null)).toBe('débutant');
  });
  it('null time handled (7 ingredients, 2 steps → débutant)', () => {
    expect(classifyDifficulty(7, ['Étape 1', 'Étape 2'], null)).toBe('débutant');
  });
});
