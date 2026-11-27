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
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers,
    });
    const contentType = res.headers.get('content-type') || '';
    const isNonJson = !contentType.includes('application/json');
    const isTransientProxyMiss =
      isNonJson &&
      (res.ok || res.status === 404 || res.status === 502 || res.status === 503 || res.status === 504);
    if (!isTransientProxyMiss || attempt === 4) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  const contentType = res?.headers.get('content-type') || '';
  const isNonJson = !contentType.includes('application/json');
  const resolvedUrl = res?.url || (typeof window !== 'undefined' ? `${window.location.origin}${path}` : path);

  if (!res || !res.ok || isNonJson) {
    const status = res?.status ?? 0;
    let bodySnippet = '';
    let apiErrorMsg = '';
    try {
      if (!isNonJson && res) {
        const errData = (await res.json()) as { error?: string } | undefined;
        if (errData?.error) apiErrorMsg = errData.error;
      } else if (res) {
        const rawText = await res.text();
        bodySnippet = rawText
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
      }
    } catch {
      // ignore parse errors
    }

    let message = apiErrorMsg || `Erro na solicitação (${status})`;
    if (!apiErrorMsg && isNonJson) {
      const snippetPart = bodySnippet ? ` · Resposta: "${bodySnippet}"` : '';
      message = `Serviço da API indisponível (${status} em ${resolvedUrl} · tipo: ${contentType || 'desconhecido'}${snippetPart}). Recarregue a página ou abra pela URL de desenvolvimento do aplicativo.`;
    }
    throw new ApiError(message, status, isNonJson, resolvedUrl);
  }

  return (await res.json()) as T;
}
