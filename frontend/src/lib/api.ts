export interface ApiError {
  code: string;
  field?: string;
  message: string;
}

export interface ApiResponse<T = any> {
  data: T;
  meta: {
    correlation_id: string;
    timestamp: string;
    [key: string]: any;
  };
  errors: ApiError[];
}

const getBaseUrl = (): string => {
  return (import.meta as any).env?.VITE_API_URL || '/api/v1';
};

export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem('printflow_owner_token');
  } catch {
    return null;
  }
};

export const setAuthToken = (token: string): void => {
  try {
    localStorage.setItem('printflow_owner_token', token);
  } catch {
    // Ignore in SSR / restricted storage
  }
};

export const removeAuthToken = (): void => {
  try {
    localStorage.removeItem('printflow_owner_token');
  } catch {
    // Ignore
  }
};

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const baseUrl = getBaseUrl().replace(/\/$/, '');
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const token = getAuthToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => ({
    data: null,
    meta: { correlation_id: 'unknown', timestamp: new Date().toISOString() },
    errors: [{ code: 'PARSE_ERROR', message: `Server returned non-JSON response (${response.status})` }],
  }));

  if (!response.ok) {
    const errorMsg = json.errors?.[0]?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg) as Error & { response: ApiResponse<T>; status: number };
    err.response = json;
    err.status = response.status;
    throw err;
  }

  return json;
}
