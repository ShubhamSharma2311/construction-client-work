/** Injected wherever "now" matters, so tests can pin token expiry and IST day boundaries. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
