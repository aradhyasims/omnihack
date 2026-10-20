// Domain errors. Services throw these; server actions and API handlers translate them
// into user-facing messages / HTTP status codes without leaking internals.

export type ErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "PRECONDITION" | "UNAVAILABLE";

const httpStatus: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PRECONDITION: 422,
  UNAVAILABLE: 503,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return httpStatus[this.code];
  }
}

export const validation = (message: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", message, fieldErrors);
export const forbidden = (message = "You do not have permission to perform this action.") => new AppError("FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`);
export const conflict = (message: string) => new AppError("CONFLICT", message);
export const precondition = (message: string) => new AppError("PRECONDITION", message);
export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Please sign in to continue.");

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
