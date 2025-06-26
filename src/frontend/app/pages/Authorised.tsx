import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const apiUrl = "https://www.sneakyofficial.com";

export default function AuthCallback() {
  const [fadeIn, setFadeIn] = useState(false);
  const [status, setStatus] = useState("loading"); // 'loading', 'success', 'error'
  const [message, setMessage] = useState("Authenticating...");
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        setMessage("Verifying authentication...");

        const response = await fetch(`${apiUrl}/api/auth/discord/status`, {
          credentials: "include",
          method: "GET",
        });

        const data = await response.json();
        console.log(data);
        if (data.logged_in) {
          setStatus("success");
          setMessage("Authentication successful! Redirecting to Splatdle...");

          setTimeout(() => {
            navigate("/splatdle");
          }, 5000);
        } else {
          setStatus("error");
          setMessage("Authentication failed. Please try again.");

          setTimeout(() => {
            navigate("/");
          }, 3000);
        }
      } catch (error) {
        console.error("Error checking authorization status:", error);
        setMessage("Authentication failed. Please try again.");

        setTimeout(() => {
          navigate("/");
        }, 3000);
      } finally {
        setTimeout(() => setFadeIn(true), 100);
      }
    };

    checkAuthorization();
  }, [navigate]);

  const handleGoBack = () => {
    navigate("/");
  };

  const getStatusIcon = () => {
    switch (status) {
      case "loading":
        return <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />;
      case "success":
        return <CheckCircle className="w-8 h-8 text-green-500" />;
      case "error":
        return <AlertCircle className="w-8 h-8 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "loading":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div
          className={`bg-white rounded-2xl shadow-xl p-8 text-center transition-opacity duration-500 ${
            fadeIn ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mb-4">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Splatdle</h1>
            <p className="text-gray-500">Authentication in progress</p>
          </div>

          <div className="flex flex-col items-center space-y-4">
            {getStatusIcon()}
            <p className={`text-lg font-medium ${getStatusColor()}`}>
              {message}
            </p>
          </div>

          {status === "loading" && (
            <div className="mt-6">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full animate-pulse w-3/4"></div>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="mt-6">
              <p className="text-sm text-gray-500 mb-4">
                You will be redirected to the home page shortly.
              </p>
              <button
                onClick={handleGoBack}
                className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 transition-all duration-200"
              >
                Go Back
              </button>
            </div>
          )}

          {status === "success" && (
            <div className="mt-6">
              <p className="text-sm text-gray-500">Taking you to Splatdle...</p>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-400">Powered by OAuth 2.0</p>
        </div>
      </div>
    </div>
  );
}
