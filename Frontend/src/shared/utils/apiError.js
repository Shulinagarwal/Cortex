export const getApiErrorMessage = (error, fallback = "Something went wrong.") => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;

  return (
    data.error?.message ||
    data.msg ||
    data.message ||
    fallback
  );
};

export const getApiErrorCode = (error) => error?.response?.data?.error?.code ?? null;
