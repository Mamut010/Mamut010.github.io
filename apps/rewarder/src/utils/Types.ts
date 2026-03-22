type Class<T> = new (...args: any[]) => T;

type ValueOf<T> = T extends Array<infer U> ? U : T[keyof T];