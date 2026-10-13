// Share only requests that are currently in progress. Never cache completed
// account responses; the caller's key includes both portal and session token.
export function coalesceRequests<T>() {
  const requests = new Map<string, Promise<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const current = requests.get(key);
    if (current) return current;
    const pending = load().finally(() => requests.delete(key));
    requests.set(key, pending);
    return pending;
  };
}
