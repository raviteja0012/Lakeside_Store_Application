// Chart helpers. Okabe-Ito colorblind-safe categorical set, in order, with grey for Other.
// One color per entity across every chart. Chrome stays neutral; only the data carries hue.

export const OKABE_ITO = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442"];
export const OTHER_GREY = "#999999";

export function paletteColor(index: number): string {
  return index < OKABE_ITO.length ? OKABE_ITO[index] : OTHER_GREY;
}
