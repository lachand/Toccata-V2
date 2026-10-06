// Remplace le module virtuel de vite-plugin-pwa dans les tests.
const state = <T,>(v: T): [T, (x: T) => void] => [v, () => {}];
export const useRegisterSW = () => ({ needRefresh: state(false), offlineReady: state(false), updateServiceWorker: async () => {} });
