const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    name: string;
    phone: string;
    email?: string | null;
    isVerified: boolean;
  };
}

export const authApi = {
  register: (body: {
    name: string;
    phone: string;
    email?: string;
    password: string;
  }) => post<AuthResponse>("/auth/register", body),

  login: (body: { phone?: string; email?: string; password: string }) =>
    post<AuthResponse>("/auth/login", body),

  sendOtp: (phone: string) =>
    post<{ message: string; otp?: string }>("/auth/send-otp", { phone }),

  verifyOtp: (body: { phone: string; otp: string; name?: string }) =>
    post<AuthResponse>("/auth/verify-otp", body),
};
