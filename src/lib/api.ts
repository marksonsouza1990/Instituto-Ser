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

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(path, {
      ...options,
      headers,
    });
    const contentType = res.headers.get('content-type') || '';
    const isTransientProxyMiss =
      !res.ok &&
      !contentType.includes('application/json') &&
      (res.status === 404 || res.status === 502 || res.status === 503 || res.status === 504);
    if (!isTransientProxyMiss || attempt === 2) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const contentType = res?.headers.get('content-type') || '';
    let message =
      status === 404 && !contentType.includes('application/json')
        ? 'O servidor ainda estava reiniciando (404). Recarregue a página e tente entrar novamente.'
        : `Erro na solicitação (${status})`;
    try {
      const errData = (await res?.json()) as { error?: string } | undefined;
      if (errData?.error) message = errData.error;
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}
