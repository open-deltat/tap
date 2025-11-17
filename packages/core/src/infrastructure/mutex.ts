type Mutex = (key: string) => Promise<() => void>;

export const createMutex = (): Mutex => {
	const locks = new Map<string, Promise<void>>();

	return async (key: string) => {
		const prev = locks.get(key);
		let release = () => {};
		const promise = new Promise<void>((res) => {
			release = res;
		});
		locks.set(key, promise);
		if (prev) {
			await prev;
		}
		return () => {
			locks.delete(key);
			release();
		};
	};
};
