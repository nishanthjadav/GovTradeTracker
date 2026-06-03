import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white">
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-8">
          <span className="font-bold text-lg text-green-400">PoliTrades</span>
          <NavLink to="/" className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
            Dashboard
          </NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}