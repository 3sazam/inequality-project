import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/home';
import MainExperience from './experiences/ExpenditureScene01';
import './App.css'; // Optional: keep this if you want to add global app styles later

function App() {
  return (
    <Router>
      <Routes>
        {/* The initial HTML landing page */}
        <Route path="/" element={<Home />} />
        
        {/* The 3D Experience page */}
        <Route path="/3d-experience" element={<MainExperience />} />
      </Routes>
    </Router>
  );
}

export default App;