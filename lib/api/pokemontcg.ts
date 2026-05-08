const BASE_URL = 'https://api.pokemontcg.io/v2';

export type TcgPriceVariant = {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
};

export type TcgCard = {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  set?: { id?: string; name?: string };
  images?: { small?: string; large?: string };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: {
      normal?: TcgPriceVariant;
      holofoil?: TcgPriceVariant;
      reverseHolofoil?: TcgPriceVariant;
      [variant: string]: TcgPriceVariant | undefined;
    };
  };
};

function escapeLuceneValue(value: string): string {
  // Lucene-style queries: backslash-escape backslashes, then quotes.
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function searchCard(name: string, setName?: string): Promise<TcgCard[]> {
  const parts = [`name:"${escapeLuceneValue(name)}"`];
  if (setName && setName.trim()) {
    parts.push(`set.name:"${escapeLuceneValue(setName)}"`);
  }
  const url = `${BASE_URL}/cards?q=${encodeURIComponent(parts.join(' '))}&pageSize=10`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Pokemon TCG API responded ${response.status}`);
  }
  const json = (await response.json()) as { data?: TcgCard[] };
  return json.data ?? [];
}

export async function getCardById(id: string): Promise<TcgCard | null> {
  const url = `${BASE_URL}/cards/${encodeURIComponent(id)}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Pokemon TCG API responded ${response.status}`);
  }
  const json = (await response.json()) as { data?: TcgCard };
  return json.data ?? null;
}

export function getMarketPrice(card: TcgCard): number | null {
  const prices = card.tcgplayer?.prices;
  if (!prices) return null;

  const candidates = [
    prices.normal?.market,
    prices.holofoil?.market,
    prices.reverseHolofoil?.market,
  ].filter((v): v is number => typeof v === 'number');

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}
