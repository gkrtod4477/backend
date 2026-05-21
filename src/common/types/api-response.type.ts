export interface ApiMeta {
  requestId: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  data: T | null;
  meta: ApiMeta;
  error: ApiError | null;
}
