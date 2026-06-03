import { AppError } from "./errors";

export const withErrorStep = async <T>(
  step: string,
  operation: () => Promise<T> | T,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) {
      error.withStep(step);
    }
    throw error;
  }
};
