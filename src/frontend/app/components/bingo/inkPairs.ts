/**
 * Every ink pairing the Splatoon games hand out, for choosing a card's colours.
 *
 * The values are the games' own, taken from Inkipedia's Template:InkColor,
 * which is transcribed from the game files. Each entry is one team pairing:
 * `a` is the alpha team's ink and `b` the bravo team's. Splatoon 3 runs a
 * dimmer set of the same pairings at night, and Salmon Run pairs your ink
 * against the Salmonids' rather than another team's.
 */

export interface InkPair {
  id: string;
  /** Which game it comes from, used to group the picker. */
  game: string;
  label: string;
  /** Alpha team's ink. */
  a: string;
  /** Bravo team's ink. */
  b: string;
}

export const INK_PAIRS: InkPair[] = [
  { id: "s3-blueyellow", game: "Splatoon 3", label: "Blue vs yellow", a: "#1a1aae", b: "#e38d24" },
  { id: "s3-greenpurple", game: "Splatoon 3", label: "Green vs purple", a: "#a0c937", b: "#ba30b0" },
  { id: "s3-limegreenpurple", game: "Splatoon 3", label: "Lime green vs purple", a: "#becd41", b: "#6325cd" },
  { id: "s3-orangeblue", game: "Splatoon 3", label: "Orange vs blue", a: "#de6624", b: "#343bc4" },
  { id: "s3-orangepurple", game: "Splatoon 3", label: "Orange vs purple", a: "#cd510a", b: "#6e04b6" },
  { id: "s3-pinkgreen", game: "Splatoon 3", label: "Pink vs green", a: "#c12d74", b: "#2cb721" },
  { id: "s3-turquoisepink", game: "Splatoon 3", label: "Turquoise vs pink", a: "#1bbeab", b: "#c43a6e" },
  { id: "s3-turquoisered", game: "Splatoon 3", label: "Turquoise vs red", a: "#1ec0ad", b: "#d74b31" },
  { id: "s3-yellowblue", game: "Splatoon 3", label: "Yellow vs blue", a: "#d0be08", b: "#3a0ccd" },
  { id: "s3-yellowpurple", game: "Splatoon 3", label: "Yellow vs purple", a: "#ceb121", b: "#9025c6" },
  { id: "s3-blueyellow-night", game: "Splatoon 3 · night", label: "Blue vs yellow (night)", a: "#2d2dd1", b: "#d7841f" },
  { id: "s3-greenpurple-night", game: "Splatoon 3 · night", label: "Green vs purple (night)", a: "#9ec63a", b: "#b838af" },
  { id: "s3-limegreenpurple-night", game: "Splatoon 3 · night", label: "Lime green vs purple (night)", a: "#b6c833", b: "#5b22c4" },
  { id: "s3-orangeblue-night", game: "Splatoon 3 · night", label: "Orange vs blue (night)", a: "#ca6129", b: "#2127a6" },
  { id: "s3-orangepurple-night", game: "Splatoon 3 · night", label: "Orange vs purple (night)", a: "#c85513", b: "#7722b1" },
  { id: "s3-pinkgreen-night", game: "Splatoon 3 · night", label: "Pink vs green (night)", a: "#c3397b", b: "#42bf3b" },
  { id: "s3-turquoisepink-night", game: "Splatoon 3 · night", label: "Turquoise vs pink (night)", a: "#17baa7", b: "#be265e" },
  { id: "s3-turquoisered-night", game: "Splatoon 3 · night", label: "Turquoise vs red (night)", a: "#1bbaa7", b: "#b62e16" },
  { id: "s3-yellowblue-night", game: "Splatoon 3 · night", label: "Yellow vs blue (night)", a: "#c4b40a", b: "#532ad9" },
  { id: "s3-yellowpurple-night", game: "Splatoon 3 · night", label: "Yellow vs purple (night)", a: "#cfab0c", b: "#8127af" },
  { id: "s3-warmup-yellowblue-lobby", game: "Splatoon 3", label: "Yellow vs blue (lobby)", a: "#dacd12", b: "#4b25c9" },
  { id: "s3-coop-blue", game: "Splatoon 3 · Salmon Run", label: "Blue shift", a: "#435bf3", b: "#067e63" },
  { id: "s3-coop-orange", game: "Splatoon 3 · Salmon Run", label: "Orange shift", a: "#c44b21", b: "#098264" },
  { id: "s3-coop-pink", game: "Splatoon 3 · Salmon Run", label: "Pink shift", a: "#c64184", b: "#0d6e74" },
  { id: "s3-coop-purple", game: "Splatoon 3 · Salmon Run", label: "Purple shift", a: "#9361ea", b: "#0a7a5e" },
  { id: "s3-coop-yellow", game: "Splatoon 3 · Salmon Run", label: "Yellow shift", a: "#b4d933", b: "#098a71" },
  { id: "s3-coop-sun-yellow", game: "Splatoon 3 · Salmon Run", label: "Sun Yellow shift", a: "#dda024", b: "#098264" },
  { id: "s3-coop-default", game: "Splatoon 3 · Salmon Run", label: "Default shift", a: "#c95431", b: "#03644b" },
  { id: "s2-lemonpurple", game: "Splatoon 2", label: "Lemon vs purple", a: "#bbc905", b: "#830b9c" },
  { id: "s2-lightblueyellow", game: "Splatoon 2", label: "Light blue vs yellow", a: "#007edc", b: "#e1a307" },
  { id: "s2-pinkblue", game: "Splatoon 2", label: "Pink vs blue", a: "#d60e6e", b: "#311aa8" },
  { id: "s2-pinkgreen", game: "Splatoon 2", label: "Pink vs green", a: "#cf0466", b: "#17a80d" },
  { id: "s2-pinklightblue", game: "Splatoon 2", label: "Pink vs light blue", a: "#cb0856", b: "#0199b8" },
  { id: "s2-pinkyellow", game: "Splatoon 2", label: "Pink vs yellow", a: "#de0b64", b: "#bfd002" },
  { id: "s2-purpleorange", game: "Splatoon 2", label: "Purple vs orange", a: "#4a14aa", b: "#fb5c03" },
  { id: "s2-purpleturquoise", game: "Splatoon 2", label: "Purple vs turquoise", a: "#5f0fb4", b: "#08b672" },
  { id: "s2-yellowblue", game: "Splatoon 2", label: "Yellow vs blue", a: "#dea801", b: "#4717a9" },
  { id: "s2-bluegreen-ranked", game: "Splatoon 2", label: "Blue vs green (ranked)", a: "#2922b5", b: "#5eb604" },
  { id: "s2-greenmazenta-ranked", game: "Splatoon 2", label: "Green vs magenta (ranked)", a: "#03b362", b: "#b1008d" },
  { id: "s2-greenpurple-ranked", game: "Splatoon 2", label: "Green vs purple (ranked)", a: "#25b100", b: "#571db1" },
  { id: "s2-purplelumigreen-ranked", game: "Splatoon 2", label: "Purple vs lumi green (ranked)", a: "#7b0393", b: "#43ba05" },
  { id: "s2-turquoiseorange-ranked", game: "Splatoon 2", label: "Turquoise vs orange (ranked)", a: "#0cae6e", b: "#f75900" },
  { id: "s2-yellowlightblue-ranked", game: "Splatoon 2", label: "Yellow vs light blue (ranked)", a: "#d9c100", b: "#007ac9" },
  { id: "s2-yellowpurple-ranked", game: "Splatoon 2", label: "Yellow vs purple (ranked)", a: "#ce8003", b: "#9208b2" },
  { id: "s2-pinkblue-splatfest", game: "Splatoon 2", label: "Pink vs blue (splatfest)", a: "#b72e6f", b: "#38249c" },
  { id: "s2-purplegreen-splatfest", game: "Splatoon 2", label: "Purple vs green (splatfest)", a: "#4e10bc", b: "#7eb915" },
  { id: "s2-purpleturquoise-splatfest", game: "Splatoon 2", label: "Purple vs turquoise (splatfest)", a: "#58199a", b: "#10814e" },
  { id: "s1-bluelime", game: "Splatoon", label: "Blue vs lime", a: "#26229f", b: "#91b00b" },
  { id: "s1-greenpurple", game: "Splatoon", label: "Green vs purple", a: "#799516", b: "#6e068a" },
  { id: "s1-lightbluedarkblue", game: "Splatoon", label: "Light blue vs dark blue", a: "#228cff", b: "#e85407" },
  { id: "s1-lightblueyellow", game: "Splatoon", label: "Light blue vs yellow", a: "#007edc", b: "#e1a307" },
  { id: "s1-orangeblue", game: "Splatoon", label: "Orange vs blue", a: "#cf581b", b: "#141494" },
  { id: "s1-pinkblue", game: "Splatoon", label: "Pink vs blue", a: "#c93457", b: "#048188" },
  { id: "s1-pinkgreen", game: "Splatoon", label: "Pink vs green", a: "#c83d79", b: "#409d3b" },
  { id: "s1-pinkorange", game: "Splatoon", label: "Pink vs orange", a: "#da3781", b: "#ed9408" },
  { id: "s1-turquoiseorange", game: "Splatoon", label: "Turquoise vs orange", a: "#20837d", b: "#df641a" },
  { id: "s1-blueorange", game: "Splatoon", label: "Blue vs orange", a: "#2e0cb5", b: "#f86300" },
  { id: "s1-darkblueyellow-ranked", game: "Splatoon", label: "Dark blue vs yellow (ranked)", a: "#0d195e", b: "#b97e1a" },
  { id: "s1-greenmazenta-ranked", game: "Splatoon", label: "Green vs magenta (ranked)", a: "#79b726", b: "#a52b85" },
  { id: "s1-greenorange-ranked", game: "Splatoon", label: "Green vs orange (ranked)", a: "#319471", b: "#bf3e24" },
  { id: "s1-limegreenblue-ranked", game: "Splatoon", label: "Lime green vs blue (ranked)", a: "#85e378", b: "#3d59de" },
  { id: "s1-lumigreenpurple-ranked", game: "Splatoon", label: "Lumi green vs purple (ranked)", a: "#60ab43", b: "#891a7f" },
  { id: "s1-sodapink-ranked", game: "Splatoon", label: "Soda vs pink (ranked)", a: "#65b799", b: "#9736b2" },
  { id: "s1-yellowlilac-ranked", game: "Splatoon", label: "Yellow vs lilac (ranked)", a: "#dd9016", b: "#4d24a3" },];

/** The pairings grouped by game, in the order the picker should list them. */
export function inkPairsByGame(): { game: string; pairs: InkPair[] }[] {
  const groups: { game: string; pairs: InkPair[] }[] = [];
  for (const pair of INK_PAIRS) {
    const group = groups.find((g) => g.game === pair.game);
    if (group) group.pairs.push(pair);
    else groups.push({ game: pair.game, pairs: [pair] });
  }
  return groups;
}

/** Splatoon 3's own yellow and blue, the pairing on the box art. */
export const DEFAULT_PAIR =
  INK_PAIRS.find((pair) => pair.id === "s3-yellowblue") ?? INK_PAIRS[0];
