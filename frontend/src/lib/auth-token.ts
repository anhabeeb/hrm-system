let memoryToken: string | null = null;

export const getAuthToken = () => {
  return memoryToken;
};

export const setAuthToken = (token: string | null) => {
  memoryToken = token;
};

export const clearAuthToken = () => setAuthToken(null);
