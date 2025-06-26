import { useNavigate } from "react-router-dom";

function useLogout() {
  const navigate = useNavigate();

  const logout = async () => {
    await fetch("/api/auth/discord/logout", { method: "POST",  credentials: "include",  });
    navigate("/");
  };

  return { logout };
}

export default useLogout;