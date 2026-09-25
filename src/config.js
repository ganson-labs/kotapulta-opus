// Игровые константы. Единицы физики — метры, секунды, килограммы.

export const GRAVITY = -10;
export const STEP = 1 / 60;

export const MATERIALS = {
  cardboard: { density: 0.45, friction: 0.65, restitution: 0.05, hp: 7, score: 300 },
  wood: { density: 0.9, friction: 0.7, restitution: 0.05, hp: 16, score: 500 },
  ceramic: { density: 1.3, friction: 0.5, restitution: 0.0, hp: 2.2, score: 400 },
  brick: { density: 2.2, friction: 0.85, restitution: 0.0, hp: 45, score: 800 },
  pillow: { density: 0.3, friction: 0.9, restitution: 0.35, hp: 6, score: 300 },
  yarn: { density: 1.0, friction: 0.9, restitution: 0.3, hp: Infinity, score: 0 },
};

// Какой материал у какого вида блока.
export const BLOCK_KINDS = {
  box: 'cardboard',
  crate: 'wood',
  plank: 'wood',
  pot: 'ceramic',
  brick: 'brick',
  pillow: 'pillow',
  yarn: 'yarn',
};

export const CAT_TYPES = {
  ryzhik: {
    name: 'Рыжик', r: 0.55, density: 1.6, speed: 1, ability: null,
    intro: 'Рыжик — надёжный рыжий снаряд. Просто прицелься!',
  },
  ugolek: {
    name: 'Уголёк', r: 0.5, density: 1.6, speed: 1, ability: 'dash',
    intro: 'Уголёк: нажми в полёте — стремительный рывок сквозь коробки!',
  },
  barsik: {
    name: 'Барсик', r: 0.78, density: 1.7, speed: 0.92, ability: 'pound',
    intro: 'Барсик: нажми в полёте — толстая бомбочка прямо вниз!',
  },
  trio: {
    name: 'Трёшка', r: 0.52, density: 1.5, speed: 1, ability: 'split',
    intro: 'Трёшка: нажми в полёте — и она станет тремя котятами!',
  },
  kitten: { name: 'Котёнок', r: 0.36, density: 1.7, speed: 1, ability: null },
};

export const LAUNCH = {
  minSpeed: 9,
  maxSpeed: 27,
  minAngle: -0.35,
  maxAngle: 1.45,
  // Катапульта-качели: треугольная опора и доска.
  pivotH: 1.25,
  halfLen: 2.3,
  restAngle: 0.5, // правый конец поднят, левый (с котом) внизу
  fireAngle: -0.42,
};

export const SCORE = {
  fish: 1000,
  sleeper: 5000,
  spareCat: 10000,
};

// Порог импульса, ниже которого удары не повреждают (вес, лёгкие касания).
export const DAMAGE_MIN = 0.9;
