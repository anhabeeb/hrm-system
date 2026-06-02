const TOKEN_STORAGE_KEY = "hrm.auth.token";

let memoryToken: string | null = null;

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

export const getAuthToken = () => {
  if (memoryToken) {
    return memoryToken;
  }

  if (!canUseStorage()) {
    return null;
  }

  memoryToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  return memoryToken;
};

export const setAuthToken = (token: string | null) => {
  memoryToken = token;

  if (!canUseStorage()) {
    return;
  }

  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const clearAuthToken = () => setAuthToken(null);
