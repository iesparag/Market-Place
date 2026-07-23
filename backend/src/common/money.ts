/** All money is integer minor units (paise). Never use floats for money. */
export const toMinor = (major: number): number => Math.round(major * 100);
export const toMajor = (minor: number): number => minor / 100;
export const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** Percentage of a minor-unit amount, rounded to the nearest minor unit. */
export const percentOf = (amount: number, percent: number): number =>
  Math.round((amount * percent) / 100);
