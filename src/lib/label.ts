/** Physical label geometry. Defaults: 80 x 50 mm @ 203 dpi = 639 x 400 dots. */
export interface Label {
  widthMm: number
  heightMm: number
  dpi: number
}

export const dotsPerMm = (dpi: number) => dpi / 25.4
export const widthDots = (l: Label) => Math.round(l.widthMm * dotsPerMm(l.dpi))
export const heightDots = (l: Label) => Math.round(l.heightMm * dotsPerMm(l.dpi))
export const aspect = (l: Label) => (l.heightMm > 0 ? l.widthMm / l.heightMm : 1.6)
