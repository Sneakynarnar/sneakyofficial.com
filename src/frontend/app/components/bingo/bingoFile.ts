/**
 * The .bingo file: a card saved out of the studio and opened by the player.
 *
 * A file is one line of text, `SNEAKYBINGO1:<encoding>:<payload>`, so the
 * reader can tell what it is holding without guessing. Three encodings are
 * offered because they trade off against each other:
 *
 * * `json` — the card as readable JSON. Easy to hand-edit, and readable by
 *   anyone the file is passed to, which is the point when nothing is secret.
 * * `base64` — the same JSON, base64'd. Not encryption, and not pretending to
 *   be: it just stops the squares being read at a glance if the file is shared
 *   before the video goes out.
 * * `deflate` — base64 of the same JSON, compressed. Smallest, and equally
 *   unreadable at a glance. Falls back to base64 where the browser has no
 *   CompressionStream.
 */

import type { BingoCell } from "./bingoCanvas";

export const FILE_MAGIC = "SNEAKYBINGO1";
export const FILE_EXTENSION = ".bingo";

export type Encoding = "json" | "base64" | "deflate";

export const ENCODINGS: { id: Encoding; label: string; note: string }[] = [
  { id: "json", label: "Plain JSON", note: "Readable, and editable in any text editor." },
  { id: "base64", label: "Base64", note: "Scrambled enough that the squares aren't readable at a glance." },
  { id: "deflate", label: "Compressed", note: "Smallest file, and just as unreadable." },
];

/** Everything the player needs to put the card back on screen. */
export interface BingoFile {
  title: string;
  subtitle: string;
  rows: number;
  cols: number;
  freeText: string;
  accent: string;
  secondary: string;
  themeId: string;
  showCredits: boolean;
  cells: BingoCell[];
  /** When the file was written, for the player to show. */
  savedAt?: string;
}

const textToBytes = (text: string) => new TextEncoder().encode(text);
const bytesToText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked, because spreading a large array into apply() blows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function through(bytes: Uint8Array, stream: ReadableWritablePair): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

/** Write a card out as the text of a .bingo file. */
export async function encodeBingoFile(card: BingoFile, encoding: Encoding): Promise<string> {
  const json = JSON.stringify({ ...card, savedAt: card.savedAt ?? new Date().toISOString() });

  if (encoding === "json") return `${FILE_MAGIC}:json:${json}`;
  if (encoding === "base64") return `${FILE_MAGIC}:base64:${bytesToBase64(textToBytes(json))}`;

  if (typeof CompressionStream === "undefined") {
    return `${FILE_MAGIC}:base64:${bytesToBase64(textToBytes(json))}`;
  }
  const packed = await through(textToBytes(json), new CompressionStream("deflate-raw"));
  return `${FILE_MAGIC}:deflate:${bytesToBase64(packed)}`;
}

/**
 * Read a .bingo file back, whichever way it was written.
 *
 * Throws with something worth showing a person, since the only caller is a
 * file picker and the only thing it can do is say what was wrong.
 */
export async function decodeBingoFile(text: string): Promise<BingoFile> {
  const trimmed = text.trim();
  const marker = trimmed.indexOf(":");
  const second = trimmed.indexOf(":", marker + 1);

  if (marker < 0 || second < 0 || trimmed.slice(0, marker) !== FILE_MAGIC) {
    throw new Error("That doesn't look like a .bingo file.");
  }

  const encoding = trimmed.slice(marker + 1, second) as Encoding;
  const payload = trimmed.slice(second + 1);

  let json: string;
  if (encoding === "json") {
    json = payload;
  } else if (encoding === "base64") {
    json = bytesToText(base64ToBytes(payload));
  } else if (encoding === "deflate") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser can't open compressed cards. Save the card as Base64 instead.");
    }
    json = bytesToText(await through(base64ToBytes(payload), new DecompressionStream("deflate-raw")));
  } else {
    throw new Error(`This card is saved in a format this page doesn't know (${encoding}).`);
  }

  const card = JSON.parse(json) as BingoFile;
  if (!Array.isArray(card.cells) || !card.rows || !card.cols) {
    throw new Error("That card is missing its squares.");
  }
  if (card.cells.length !== card.rows * card.cols) {
    throw new Error("That card's squares don't match its size.");
  }
  return card;
}
