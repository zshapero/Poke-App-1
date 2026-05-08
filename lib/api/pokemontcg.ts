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
  set?: { id?: string; name?: string };
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

export async function searchCard(name: string, setName: string): Promise<TcgCard[]> {
  const query = `name:"${escapeLuceneValue(name)}" set.name:"${escapeLuceneValue(setName)}"`;
  const url = `${BASE_URL}/cards?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Pokemon TCG API responded ${response.status}`);
  }
  const json = (await response.json()) as { data?: TcgCard[] };
  return json.data ?? [];
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
