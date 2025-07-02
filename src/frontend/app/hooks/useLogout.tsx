import { useNavigate } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_URL || "https://www.sneakyofficial.com";

function useLogout() {
  const navigate = useNavigate();

  const logout = async () => {
    await fetch(`${apiUrl}/api/auth/discord/logout`, { method: "POST",  credentials: "include",  });
    navigate("/");
  };

  return { logout };
}

export default useLogout;