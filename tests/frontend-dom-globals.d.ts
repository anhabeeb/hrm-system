declare const window: {
  location: { href: string };
  dispatchEvent: (event: Event) => boolean;
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
};

interface ImportMeta {
  env: {
    VITE_API_BASE_URL?: string;
    VITE_APP_VERSION?: string;
    MODE?: string;
  };
}
