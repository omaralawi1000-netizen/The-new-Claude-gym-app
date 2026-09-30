import type { BasisUnit, Food, FoodState, Nutrients } from '../lib/types';

/**
 * Bundled REFERENCE foods — approximate, typical values per 100 g / 100 ml compiled
 * from general food-composition knowledge. They are NOT live USDA / Open Food Facts
 * records and are labelled "Reference (approximate)" in the app. Null = not provided
 * here, so it is UNKNOWN in the app (never shown as zero).
 * Portion sizes marked "~" are typical, not verified.
 */

type N = [kcal: number, p: number, c: number, f: number, fibre: number | null, sugar: number | null, sat: number | null, na: number | null];
type P = [label: string, amount: number];
interface Opt { state?: FoodState; group?: string; density?: number; aliases?: string[] }

const nut = (n: N): Nutrients => {
  const [kcal, protein, carbs, fat, fibre, sugar, satFat, sodium] = n;
  const o: Nutrients = { kcal, protein, carbs, fat };
  if (fibre !== null) o.fibre = fibre;
  if (sugar !== null) o.sugar = sugar;
  if (satFat !== null) o.satFat = satFat;
  if (sodium !== null) o.sodium = sodium;
  return o;
};

function F(id: string, name: string, nameDa: string, basis: BasisUnit, n: N, portions: P[] = [], opt: Opt = {}): Food {
  return {
    id: `ref:${id}`, name, nameDa, source: 'reference', sourceId: id, basis, per100: nut(n),
    portions: portions.map(([label, amount], i) => ({ id: `p${i}`, label, amount, verified: false })),
    density: opt.density, state: opt.state, variantGroup: opt.group, aliases: opt.aliases,
  };
}

export const REFERENCE_FOODS: Food[] = [
  // dairy & eggs
  F('skyr-plain', 'Skyr, plain', 'Skyr, naturel', 'g', [63, 11, 4, 0.2, 0, 4, 0.1, 40], [['1 small tub ~150 g', 150], ['1 tub ~450 g', 450], ['1 dl ~100 g', 100]], { aliases: ['skyr', 'skyr natural', 'skyr naturel'] }),
  F('skyr-vanilla', 'Skyr, vanilla', 'Skyr, vanilje', 'g', [72, 10, 7.5, 0.2, 0, 7, 0.1, 40], [['1 small tub ~150 g', 150]], { aliases: ['skyr'] }),
  F('skyr-protein', 'Skyr, high-protein', 'Skyr, højprotein', 'g', [68, 12, 4.5, 0.2, 0, 4, 0.1, null], [['1 tub ~200 g', 200]], { aliases: ['skyr', 'protein skyr'] }),
  F('yoghurt-greek', 'Greek yoghurt, 10%', 'Græsk yoghurt, 10%', 'g', [130, 5.5, 4, 10, 0, 4, 6.7, 40], [['1 dl ~100 g', 100], ['1 tbsp ~20 g', 20]], { aliases: ['yogurt'] }),
  F('yoghurt-natural', 'Yoghurt, natural 3.5%', 'Yoghurt naturel', 'g', [62, 3.5, 4.7, 3.5, 0, 4.7, 2.3, 45], [['1 dl ~100 g', 100]], { aliases: ['yogurt'] }),
  F('milk-15', 'Milk, semi-skimmed 1.5%', 'Letmælk 1,5%', 'ml', [46, 3.5, 4.8, 1.5, 0, 4.8, 1, 45], [['1 glass 200 ml', 200], ['1 dl', 100]], { density: 1.03, aliases: ['milk', 'mælk', 'maelk'] }),
  F('milk-whole', 'Milk, whole 3.5%', 'sødmælk', 'ml', [64, 3.4, 4.8, 3.5, 0, 4.8, 2.3, 45], [['1 glass 200 ml', 200]], { density: 1.03, aliases: ['milk', 'mælk', 'maelk', 'sødmælk'] }),
  F('milk-skim', 'Milk, skimmed', 'Skummetmælk', 'ml', [34, 3.5, 4.8, 0.1, 0, 4.8, 0.1, 45], [['1 glass 200 ml', 200]], { density: 1.03, aliases: ['milk', 'mælk', 'maelk'] }),
  F('oat-drink', 'Oat drink', 'Havredrik', 'ml', [46, 1, 7, 1.5, 0.8, 4, 0.2, null], [['1 glass 200 ml', 200]], { density: 1.03, aliases: ['oat milk', 'havremælk'] }),
  F('cottage', 'Cottage cheese', 'Hytteost', 'g', [98, 11, 3.4, 4.3, 0, 3.4, 2.7, 330], [['1 dl ~100 g', 100]], { aliases: ['hytteost'] }),
  F('cheddar', 'Cheddar cheese', 'Cheddar', 'g', [403, 25, 1.3, 33, 0, 0.5, 21, 650], [['1 slice ~20 g', 20]], { aliases: ['cheese', 'ost'] }),
  F('mozzarella', 'Mozzarella', 'Mozzarella', 'g', [280, 22, 2.2, 22, 0, 1, 13, 620], [['1 slice ~20 g', 20]], { aliases: ['cheese', 'ost'] }),
  F('egg-raw', 'Egg, whole, raw', 'Æg, rå', 'g', [143, 12.6, 0.7, 9.5, 0, 0.4, 3.1, 142], [['1 medium egg ~55 g', 55], ['1 large egg ~60 g', 60]], { state: 'raw', group: 'egg', aliases: ['egg', 'æg', 'eggs'] }),
  F('egg-boiled', 'Egg, hard-boiled', 'Æg, kogt', 'g', [155, 13, 1.1, 11, 0, 1.1, 3.3, 124], [['1 medium egg ~50 g', 50], ['1 large egg ~55 g', 55]], { state: 'cooked', group: 'egg', aliases: ['egg', 'æg', 'eggs'] }),
  F('butter', 'Butter', 'Smør', 'g', [717, 0.9, 0.1, 81, 0, 0.1, 51, 11], [['1 tsp ~5 g', 5], ['1 tbsp ~14 g', 14]], { aliases: ['smor'] }),
  F('whey', 'Whey protein powder', 'Valleprotein', 'g', [400, 80, 7, 6, null, null, null, null], [['1 scoop ~30 g', 30]], { aliases: ['protein powder', 'whey'] }),
  // grains
  F('oats-dry', 'Oats, rolled, dry', 'Havregryn, tørre', 'g', [372, 13.5, 58.7, 7, 10, 1, 1.2, 6], [['1 serving ~40 g', 40], ['1 dl ~35 g', 35]], { state: 'dry', group: 'oats', aliases: ['oats', 'oatmeal', 'havregryn', 'rolled oats'] }),
  F('porridge', 'Porridge, made with water', 'Grød, kogt i vand', 'g', [71, 2.5, 12, 1.5, 1.7, 0.3, 0.3, null], [['1 bowl ~250 g', 250]], { state: 'cooked', group: 'oats', aliases: ['oats', 'oatmeal', 'havregrød'] }),
  F('rice-dry', 'Rice, white, raw (dry)', 'Ris, hvide, rå', 'g', [360, 6.7, 79, 0.6, 1.3, 0.1, 0.2, 5], [['1 serving ~75 g', 75]], { state: 'raw', group: 'rice', aliases: ['rice', 'ris'] }),
  F('rice-cooked', 'Rice, white, cooked', 'Ris, hvide, kogte', 'g', [130, 2.7, 28, 0.3, 0.4, 0.1, 0.1, 1], [['1 serving ~180 g', 180], ['1 dl ~75 g', 75]], { state: 'cooked', group: 'rice', aliases: ['rice', 'ris'] }),
  F('pasta-dry', 'Pasta, dry (raw)', 'Pasta, tør', 'g', [352, 12.5, 71, 1.5, 3, 2.7, 0.3, 6], [['1 serving ~80 g', 80]], { state: 'raw', group: 'pasta', aliases: ['pasta', 'spaghetti'] }),
  F('pasta-cooked', 'Pasta, cooked', 'Pasta, kogt', 'g', [158, 5.8, 31, 0.9, 1.8, 0.6, 0.2, 1], [['1 serving ~200 g', 200]], { state: 'cooked', group: 'pasta', aliases: ['pasta', 'spaghetti'] }),
  F('bread-rye', 'Rye bread (rugbrød)', 'Rugbrød', 'g', [200, 6, 35, 1.5, 7, 2.5, 0.3, 450], [['1 slice ~35 g', 35]], { aliases: ['rugbrod', 'rye', 'bread', 'brød'] }),
  F('bread-wholegrain', 'Bread, wholegrain', 'Fuldkornsbrød', 'g', [250, 10, 43, 3.5, 6, 4, 0.7, 440], [['1 slice ~40 g', 40]], { aliases: ['bread', 'brød', 'toast'] }),
  F('bread-white', 'Bread, white', 'Hvedebrød', 'g', [266, 9, 49, 3.2, 2.7, 5, 0.7, 490], [['1 slice ~30 g', 30]], { aliases: ['bread', 'brød', 'toast'] }),
  F('potato-raw', 'Potato, raw', 'Kartofler, rå', 'g', [77, 2, 17.5, 0.1, 2.2, 0.8, 0, 6], [['1 medium ~170 g', 170]], { state: 'raw', group: 'potato', aliases: ['potatoes', 'kartoffel'] }),
  F('potato-boiled', 'Potato, boiled', 'Kartofler, kogte', 'g', [87, 1.9, 20, 0.1, 1.8, 0.9, 0, 5], [['1 medium ~150 g', 150]], { state: 'cooked', group: 'potato', aliases: ['potatoes', 'kartoffel'] }),
  F('sweet-potato', 'Sweet potato, baked', 'Sød kartoffel, bagt', 'g', [90, 2, 21, 0.2, 3.3, 6.5, 0, 36], [['1 medium ~130 g', 130]], { aliases: ['sweet potatoes'] }),
  F('quinoa-cooked', 'Quinoa, cooked', 'Quinoa, kogt', 'g', [120, 4.4, 21, 1.9, 2.8, 0.9, 0.2, 7], [['1 serving ~150 g', 150]], { state: 'cooked' }),
  F('cornflakes', 'Cornflakes', 'Cornflakes', 'g', [357, 7, 84, 0.9, 3, 8, 0.2, 560], [['1 bowl ~40 g', 40]], { aliases: ['cereal'] }),
  // protein
  F('chicken-raw', 'Chicken breast, raw', 'Kyllingebryst, rå', 'g', [120, 22.5, 0, 2.6, 0, 0, 0.6, 45], [['1 breast ~170 g', 170]], { state: 'raw', group: 'chicken', aliases: ['chicken', 'kylling'] }),
  F('chicken-cooked', 'Chicken breast, cooked', 'Kyllingebryst, stegt', 'g', [165, 31, 0, 3.6, 0, 0, 1, 74], [['1 breast ~120 g', 120]], { state: 'cooked', group: 'chicken', aliases: ['chicken', 'kylling'] }),
  F('beef-mince-raw', 'Beef mince 10%, raw', 'Hakket oksekød 10%, råt', 'g', [176, 20, 0, 10, 0, 0, 4.2, 66], [], { state: 'raw', group: 'beef-mince', aliases: ['beef', 'mince', 'oksekød', 'ground beef'] }),
  F('beef-mince-cooked', 'Beef mince 10%, cooked', 'Hakket oksekød 10%, stegt', 'g', [217, 26, 0, 12, 0, 0, 5, 76], [], { state: 'cooked', group: 'beef-mince', aliases: ['beef', 'mince', 'oksekød', 'ground beef'] }),
  F('salmon-raw', 'Salmon, raw', 'Laks, rå', 'g', [208, 20, 0, 13, 0, 0, 3, 59], [['1 fillet ~150 g', 150]], { state: 'raw', group: 'salmon', aliases: ['salmon', 'laks', 'fish'] }),
  F('salmon-cooked', 'Salmon, cooked', 'Laks, bagt', 'g', [206, 22, 0, 12, 0, 0, 2.5, 61], [['1 fillet ~120 g', 120]], { state: 'cooked', group: 'salmon', aliases: ['salmon', 'laks', 'fish'] }),
  F('cod-raw', 'Cod, raw', 'Torsk, rå', 'g', [82, 18, 0, 0.7, 0, 0, 0.1, 54], [], { state: 'raw', aliases: ['fish', 'torsk'] }),
  F('tuna-water', 'Tuna in water, drained', 'Tun i vand, afdryppet', 'g', [116, 26, 0, 1, 0, 0, 0.2, 247], [['1 can ~110 g drained', 110]], { aliases: ['tun', 'fish'] }),
  F('tofu', 'Tofu, firm', 'Tofu, fast', 'g', [144, 15.8, 3.9, 8.7, 2.3, 0.7, 1.3, 14], [], {}),
  F('lentils-cooked', 'Lentils, cooked', 'Linser, kogte', 'g', [116, 9, 20, 0.4, 7.9, 1.8, 0.1, 2], [['1 serving ~150 g', 150]], { state: 'cooked', group: 'lentils', aliases: ['linser'] }),
  F('lentils-dry', 'Lentils, dry', 'Linser, tørre', 'g', [352, 24.6, 63, 1.1, 10.7, 2, 0.2, 6], [], { state: 'dry', group: 'lentils', aliases: ['linser'] }),
  F('chickpeas', 'Chickpeas, cooked', 'Kikærter, kogte', 'g', [164, 8.9, 27, 2.6, 7.6, 4.8, 0.3, 7], [['1 dl ~85 g', 85]], { state: 'cooked', aliases: ['kikaerter'] }),
  F('black-beans', 'Black beans, cooked', 'Sorte bønner, kogte', 'g', [132, 8.9, 23.7, 0.5, 8.7, 0.3, 0.1, 1], [], { state: 'cooked', aliases: ['beans', 'bønner'] }),
  F('hummus', 'Hummus', 'Hummus', 'g', [166, 7.9, 14.3, 9.6, 6, 0.3, 1.4, 379], [['1 tbsp ~15 g', 15]], {}),
  // fruit & veg
  F('banana', 'Banana', 'Banan', 'g', [89, 1.1, 22.8, 0.3, 2.6, 12.2, 0.1, 1], [['1 medium ~118 g (peeled)', 118], ['1 small ~100 g (peeled)', 100], ['1 large ~136 g (peeled)', 136]], { aliases: ['bananas'] }),
  F('apple', 'Apple', 'Æble', 'g', [52, 0.3, 13.8, 0.2, 2.4, 10.4, 0, 1], [['1 medium ~180 g', 180]], { aliases: ['aeble', 'apples'] }),
  F('orange', 'Orange', 'Appelsin', 'g', [47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, 0], [['1 medium ~130 g', 130]], { aliases: ['oranges'] }),
  F('blueberries', 'Blueberries', 'Blåbær', 'g', [57, 0.7, 14.5, 0.3, 2.4, 10, 0, 1], [['1 handful ~50 g', 50]], { aliases: ['blaabaer'] }),
  F('strawberries', 'Strawberries', 'Jordbær', 'g', [32, 0.7, 7.7, 0.3, 2, 4.9, 0, 1], [['1 handful ~80 g', 80]], { aliases: ['jordbaer'] }),
  F('grapes', 'Grapes', 'Vindruer', 'g', [69, 0.7, 18, 0.2, 0.9, 15.5, 0.1, 2], [['1 handful ~80 g', 80]], {}),
  F('avocado', 'Avocado', 'Avocado', 'g', [160, 2, 8.5, 14.7, 6.7, 0.7, 2.1, 7], [['½ avocado ~100 g', 100]], {}),
  F('tomato', 'Tomato', 'Tomat', 'g', [18, 0.9, 3.9, 0.2, 1.2, 2.6, 0, 5], [['1 medium ~120 g', 120]], { aliases: ['tomatoes'] }),
  F('cucumber', 'Cucumber', 'Agurk', 'g', [15, 0.7, 3.6, 0.1, 0.5, 1.7, 0, 2], [], {}),
  F('carrot', 'Carrot', 'Gulerod', 'g', [41, 0.9, 9.6, 0.2, 2.8, 4.7, 0, 69], [['1 medium ~60 g', 60]], { aliases: ['carrots', 'gulerødder'] }),
  F('broccoli', 'Broccoli', 'Broccoli', 'g', [34, 2.8, 6.6, 0.4, 2.6, 1.7, 0.1, 33], [], {}),
  F('spinach', 'Spinach', 'Spinat', 'g', [23, 2.9, 3.6, 0.4, 2.2, 0.4, 0.1, 79], [], {}),
  F('onion', 'Onion', 'Løg', 'g', [40, 1.1, 9.3, 0.1, 1.7, 4.2, 0, 4], [['1 medium ~110 g', 110]], { aliases: ['log'] }),
  F('bell-pepper', 'Bell pepper', 'Peberfrugt', 'g', [31, 1, 6, 0.3, 2.1, 4.2, 0.1, 4], [['1 medium ~120 g', 120]], { aliases: ['pepper', 'paprika'] }),
  // fats, nuts, sweets
  F('olive-oil', 'Olive oil', 'Olivenolie', 'g', [884, 0, 0, 100, 0, 0, 13.8, 2], [['1 tsp ~4.5 g', 4.5], ['1 tbsp ~13.5 g', 13.5]], { density: 0.91, aliases: ['oil', 'olie'] }),
  F('peanut-butter', 'Peanut butter', 'Jordnøddesmør', 'g', [588, 25, 20, 50, 6, 9, 10, 17], [['1 tbsp ~16 g', 16]], { aliases: ['peanutbutter'] }),
  F('almonds', 'Almonds', 'Mandler', 'g', [579, 21, 22, 50, 12.5, 4.4, 3.8, 1], [['1 handful ~28 g', 28]], { aliases: ['nuts'] }),
  F('walnuts', 'Walnuts', 'Valnødder', 'g', [654, 15, 14, 65, 6.7, 2.6, 6.1, 2], [['1 handful ~28 g', 28]], { aliases: ['nuts'] }),
  F('dark-chocolate', 'Dark chocolate, 70%', 'Mørk chokolade 70%', 'g', [598, 7.8, 46, 43, 11, 24, 25, 20], [['1 square ~10 g', 10]], { aliases: ['chocolate', 'chokolade'] }),
  F('honey', 'Honey', 'Honning', 'g', [304, 0.3, 82, 0, 0.2, 82, 0, 4], [['1 tsp ~7 g', 7]], {}),
  F('sugar', 'Sugar', 'Sukker', 'g', [387, 0, 100, 0, 0, 100, 0, 1], [['1 tsp ~4 g', 4]], {}),
  // drinks
  F('water', 'Water', 'Vand', 'ml', [0, 0, 0, 0, null, null, null, null], [['1 glass 250 ml', 250]], { density: 1 }),
  F('coffee', 'Coffee, black', 'Kaffe, sort', 'ml', [1, 0.1, 0, 0, null, null, null, null], [['1 cup 200 ml', 200]], { density: 1 }),
  F('orange-juice', 'Orange juice', 'Appelsinjuice', 'ml', [45, 0.7, 10.4, 0.2, 0.2, 8.4, 0, 1], [['1 glass 200 ml', 200]], { density: 1.04, aliases: ['juice'] }),
  F('cola', 'Cola', 'Cola', 'ml', [42, 0, 10.6, 0, 0, 10.6, 0, 4], [['1 can 330 ml', 330]], { density: 1.04, aliases: ['soda'] }),
  F('beer', 'Beer, lager 4.6%', 'Øl, pilsner', 'ml', [43, 0.5, 3.6, 0, 0, 0, 0, 4], [['1 bottle 330 ml', 330]], { density: 1.01, aliases: ['beer', 'øl'] }),
];

export const REFERENCE_BY_ID: Record<string, Food> = Object.fromEntries(REFERENCE_FOODS.map((f) => [f.id, f]));
