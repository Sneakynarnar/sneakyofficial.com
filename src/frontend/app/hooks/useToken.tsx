import { useState, useEffect } from "react";

const apiUrl = import.meta.env.VITE_API_URL || "https://www.sneakyofficial.com";

function useToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = document.cookie
      .split(";")
      .find((cookie) => cookie.trim().startsWith("discord_access_token="));
    if (savedToken) {
      setToken(savedToken.split("=")[1]);
    }
  }, []);

  const refreshToken = async (): Promise<void> => {
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    const data: { access_token?: string } = await response.json();
    if (data.access_token) {
      document.cookie = `discord_access_token=${data.access_token}; path=/; samesite=Lax`;
      setToken(data.access_token);
    }
  };

  return { token, refreshToken };
}

export default useToken;
