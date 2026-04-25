type LogoutFn = () => void;
let _globalLogout: LogoutFn | null = null;

export function setGlobalLogout(fn: LogoutFn | null) {
  _globalLogout = fn;
}

export function triggerGlobalLogout() {
  _globalLogout?.();
}
