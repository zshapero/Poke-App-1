export type PendingCardPrefill = {
  name: string;
  set: string;
  photo_uri: string | null;
  tcg_card_id: string;
  tcg_set_id: string | null;
  current_price: number | null;
};

let pending: PendingCardPrefill | null = null;

export function setPendingCard(prefill: PendingCardPrefill | null): void {
  pending = prefill;
}

export function consumePendingCard(): PendingCardPrefill | null {
  const value = pending;
  pending = null;
  return value;
}
