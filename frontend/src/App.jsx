import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, MessageCircle, AlertTriangle, TrendingUp, FileCode2 } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Anomalies from './pages/Anomalies'
import Trends from './pages/Trends'
import CodeExplorer from './pages/CodeExplorer'

export default function App() {
    const location = useLocation()

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/chat', icon: MessageCircle, label: 'AI Chat' },
        { to: '/anomalies', icon: AlertTriangle, label: 'Anomaly Detection' },
        { to: '/trends', icon: TrendingUp, label: 'Spending Trends' },
        { to: '/codes', icon: FileCode2, label: 'Code Explorer' },
    ]

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <h1>MEDICAIDLENS</h1>
                    <div className="tagline">HHS Open Data Explorer</div>
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
                <div style={{ padding: '0 24px', marginTop: 'auto' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        Data: HHS Medicaid Provider Spending
                        <br />
                        Jan 2018 – Dec 2024
                        <br />
                        <span style={{ color: 'var(--accent-cyan)' }}>Powered by DOGE × AI</span>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/anomalies" element={<Anomalies />} />
                    <Route path="/trends" element={<Trends />} />
                    <Route path="/codes" element={<CodeExplorer />} />
                </Routes>
            </main>
        </div>
    )
}
