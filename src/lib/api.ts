let memoryToken: string | null = null;

export function setSessionToken(token: string | null): void {
  memoryToken = token;
}

export function getSessionToken(): string | null {
  return memoryToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Erro na solicitação (${res.status})`;
    try {
      const errData = (await res.json()) as { error?: string };
      if (errData?.error) message = errData.error;
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}
