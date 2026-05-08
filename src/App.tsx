import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import MainExperience from './experiences/ExpenditureScene01';
import Affordability from './pages/Affordability';
import SpendingFlow from './pages/SpendingFlow';
import BudgetProgressBarDemo from './pages/BudgetProgressBarDemo';
import SoundToggle from './components/SoundToggle/SoundToggle';
import './App.css';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Sound is part of the immersive scenes — not the data-heavy pages.
const SOUND_ROUTES = new Set(['/3d-experience', '/affordability']);

function RouteAwareSoundToggle() {
  const { pathname } = useLocation();
  if (!SOUND_ROUTES.has(pathname)) return null;
  return <SoundToggle />;
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <RouteAwareSoundToggle />
      <Routes>
        <Route path="/"                   element={<Home />} />
        <Route path="/3d-experience"      element={<MainExperience />} />
        <Route path="/affordability"      element={<Affordability />} />
        <Route path="/spending-flow"      element={<SpendingFlow />} />
        <Route path="/bar-demo"           element={<BudgetProgressBarDemo />} />
      </Routes>
    </Router>
  );
}

export default App;