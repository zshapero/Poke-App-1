type Listener = (message: string) => void;

let listener: Listener | null = null;

export function showToast(message: string) {
  listener?.(message);
}

export function setToastListener(fn: Listener | null) {
  listener = fn;
}
