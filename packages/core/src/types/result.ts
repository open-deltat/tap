export type Result<T, E = Error> =
	| { ok: true; value: T }
	| { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(
	result: Result<T, E>,
): result is { ok: true; value: T } => result.ok;
export const isErr = <T, E>(
	result: Result<T, E>,
): result is { ok: false; error: E } => !result.ok;

export const unwrap = <T, E>(result: Result<T, E>): T => {
	if (result.ok) return result.value;
	throw result.error instanceof Error
		? result.error
		: new Error(String(result.error));
};

export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
	result.ok ? result.value : defaultValue;

export const map = <T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => U,
): Result<U, E> => (result.ok ? ok(fn(result.value)) : result);

export const mapErr = <T, E, F>(
	result: Result<T, E>,
	fn: (error: E) => F,
): Result<T, F> => (result.ok ? result : err(fn(result.error)));

export const andThen = <T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? fn(result.value) : result);
