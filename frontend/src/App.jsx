import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { MessageCircle, LayoutDashboard, AlertTriangle, TrendingUp, FileCode2 } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Anomalies from './pages/Anomalies'
import Trends from './pages/Trends'
import CodeExplorer from './pages/CodeExplorer'

export default function App() {
    const location = useLocation()

    const navItems = [
        { to: '/', icon: MessageCircle, label: 'AI Chat' },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/anomalies', icon: AlertTriangle, label: 'Anomalies' },
        { to: '/trends', icon: TrendingUp, label: 'Trends' },
        { to: '/codes', icon: FileCode2, label: 'Code Explorer' },
    ]

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <h1>MEDICAIDLENS</h1>
                    <div className="tagline">HHS Open Data</div>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <Icon />
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <p>
                        HHS Medicaid Provider Spending
                        <br />
                        227M rows · Jan 2018 – Dec 2024
                        <br />
                        <span className="powered">Powered by DOGE × AI</span>
                    </p>
                </div>
            </aside>

            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Chat />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/anomalies" element={<Anomalies />} />
                    <Route path="/trends" element={<Trends />} />
                    <Route path="/codes" element={<CodeExplorer />} />
                </Routes>
            </main>
        </div>
    )
}
