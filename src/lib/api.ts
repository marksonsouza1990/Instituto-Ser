let memoryToken: string | null = null;

export function setSessionToken(token: string | null): void {
  memoryToken = token;
}

export function getSessionToken(): string | null {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  isNonJson: boolean;
  path: string;

  constructor(message: string, status: number, isNonJson: boolean, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNonJson = isNonJson;
    this.path = path;
  }
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
      credentials: 'same-origin',
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
    const isNonJson = !contentType.includes('application/json');
    let message =
      status === 404 && isNonJson
        ? `Serviço da API indisponível no endereço atual (404 em ${path}). Recarregue a página; se estiver usando um link compartilhado ou publicado, republique o app para ativar o servidor.`
        : `Erro na solicitação (${status})`;
    try {
      if (!isNonJson) {
        const errData = (await res?.json()) as { error?: string } | undefined;
        if (errData?.error) message = errData.error;
      }
    } catch {
      // ignore json parse errors
    }
    throw new ApiError(message, status, isNonJson, path);
  }

  return (await res.json()) as T;
}
