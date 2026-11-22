/**
 * The stadium layout: one shared, pure module (no three.js, no DOM). The server (seed, prices, labels)
 * and the browser (engine, web worker) use the same code, so seat indices agree everywhere.
 */
export * from './random';
export * from './plan';
export * from './params';
export * from './layout';
export * from './labels';
export * from './prices';
export * from './polygon';
export * from './patterns';
