import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { MessageCircle, LayoutDashboard, AlertTriangle, TrendingUp, FileCode2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Anomalies from './pages/Anomalies'
import Trends from './pages/Trends'
import CodeExplorer from './pages/CodeExplorer'

export default function App() {
    const [collapsed, setCollapsed] = useState(false)

    const navItems = [
        { to: '/', icon: MessageCircle, label: 'AI Chat' },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/anomalies', icon: AlertTriangle, label: 'Anomalies' },
        { to: '/trends', icon: TrendingUp, label: 'Trends' },
        { to: '/codes', icon: FileCode2, label: 'Code Explorer' },
    ]

    return (
        <div className="app-container">
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
                <button
                    className="sidebar-toggle"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                </button>

                <div className="sidebar-brand">
                    <div>
                        <h1>MEDICAIDLENS</h1>
                        <div className="tagline">HHS Open Data</div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            title={collapsed ? label : undefined}
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
                        <span className="powered">DOGE × Gravity by Innovaccer</span>
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
