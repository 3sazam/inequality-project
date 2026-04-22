import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MainExperience from './experiences/ExpenditureScene01';
import Affordability from './pages/Affordability';
import WealthInequality from './pages/WealthInequality';
import BudgetProgressBarDemo from './pages/BudgetProgressBarDemo';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"                   element={<Home />} />
        <Route path="/3d-experience"      element={<MainExperience />} />
        <Route path="/affordability"      element={<Affordability />} />
        <Route path="/wealth-inequality"  element={<WealthInequality />} />
        <Route path="/bar-demo"           element={<BudgetProgressBarDemo />} />
      </Routes>
    </Router>
  );
}

export default App;