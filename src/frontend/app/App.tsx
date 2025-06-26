import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/Home";
import Developer from "./pages/Developer";
import Entertainer from "./pages/Entertainer";
import Musician from "./pages/Musician";
import Background from "./components/Background";
import Splatdle from "./pages/Splatdle";
import AuthCallback from "./pages/Authorised";
function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/developer" element={<Developer />} />
        <Route path="/entertainer" element={<Entertainer />} />
        <Route path="/socials" element={<Entertainer />} />
        <Route path="/musician" element={<Musician />} />
        <Route path="/background" element={<Background />} />
        <Route path="/splatdle" element={<Splatdle />} />
        <Route path="/authorised" element={<AuthCallback />} />
      </Routes>
      {/* <Background / */}
    </>
  );
}

export default App;
