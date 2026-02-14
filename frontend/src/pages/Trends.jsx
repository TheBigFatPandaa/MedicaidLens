import { useState, useEffect } from 'react'
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { fetchTrends, formatCurrency, formatNumber, formatMonth } from '../api'

const TOOLTIP_STYLE = {
    background: '#fff',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    color: '#1E293B',
    fontSize: '0.78rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const COLORS = {
    spending: '#0070DD',
    claims: '#7C3AED',
    providers: '#16A34A',
}

export default function Trends() {
    const [trends, setTrends] = useState([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState('spending')

    useEffect(() => {
        fetchTrends()
            .then(data => { setTrends(data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    if (loading) {
        return <div className="loading-spinner"><div className="spinner" /></div>
    }

    const chartData = trends.map(t => ({
        ...t,
        month: formatMonth(t.claim_month),
        spending: t.total_paid,
        claims: t.total_claims,
        providers: t.active_providers,
        beneficiaries: t.total_beneficiaries,
    }))

    // Year-over-year comparison
    const yearlyData = {}
    trends.forEach(t => {
        const year = t.claim_month.substring(0, 4)
        if (!yearlyData[year]) yearlyData[year] = { year, spending: 0, claims: 0, months: 0 }
        yearlyData[year].spending += t.total_paid
        yearlyData[year].claims += t.total_claims
        yearlyData[year].months += 1
    })
    const yearlyArr = Object.values(yearlyData).filter(y => y.months >= 6)

    // Growth stats
    const getGrowth = () => {
        if (yearlyArr.length < 2) return null
        const last = yearlyArr[yearlyArr.length - 1]
        const prev = yearlyArr[yearlyArr.length - 2]
        const spendGrowth = ((last.spending / last.months) - (prev.spending / prev.months)) / (prev.spending / prev.months) * 100
        return { spendGrowth, lastYear: last.year, prevYear: prev.year }
    }
    const growth = getGrowth()

    return (
        <>
            <div className="page-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp size={24} style={{ color: 'var(--accent-emerald)' }} />
                    Spending Trends
                </h2>
                <p>Monthly and yearly Medicaid spending trends across all providers</p>
            </div>

            {/* Growth Summary Cards */}
            {growth && (
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="stat-card cyan">
                        <div className="stat-label">Latest Monthly Spend</div>
                        <div className="stat-value">{formatCurrency(trends[trends.length - 1]?.total_paid)}</div>
                        <div className="stat-sub">{formatMonth(trends[trends.length - 1]?.claim_month)}</div>
                    </div>
                    <div className={`stat-card ${growth.spendGrowth > 0 ? 'rose' : 'emerald'}`}>
                        <div className="stat-label">YoY Growth ({growth.prevYear}→{growth.lastYear})</div>
                        <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {growth.spendGrowth > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                            {growth.spendGrowth.toFixed(1)}%
                        </div>
                        <div className="stat-sub">Average monthly spend change</div>
                    </div>
                    <div className="stat-card violet">
                        <div className="stat-label">Data Coverage</div>
                        <div className="stat-value">{trends.length} months</div>
                        <div className="stat-sub">
                            {formatMonth(trends[0]?.claim_month)} – {formatMonth(trends[trends.length - 1]?.claim_month)}
                        </div>
                    </div>
                </div>
            )}

            {/* View Toggle */}
            <div className="filter-bar mb-lg">
                {['spending', 'claims', 'providers'].map(v => (
                    <button
                        key={v}
                        className={`filter-btn ${view === v ? 'active' : ''}`}
                        onClick={() => setView(v)}
                    >
                        {v === 'spending' ? '💰 Spending' : v === 'claims' ? '📄 Claims' : '👥 Providers'}
                    </button>
                ))}
            </div>

            {/* Main Trend Chart */}
            <div className="card mb-lg">
                <div className="card-header">
                    <div className="card-title">
                        Monthly {view === 'spending' ? 'Spending' : view === 'claims' ? 'Claims' : 'Active Providers'}
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={380}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="gradTrend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={COLORS[view]} stopOpacity={0.2} />
                                <stop offset="100%" stopColor={COLORS[view]} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.8)" />
                        <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} />
                        <YAxis tickFormatter={v => view === 'spending' ? formatCurrency(v) : formatNumber(v)} stroke="#94A3B8" fontSize={11} />
                        <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(v) => [view === 'spending' ? formatCurrency(v) : formatNumber(v), view === 'spending' ? 'Spending' : view === 'claims' ? 'Claims' : 'Providers']}
                        />
                        <Area
                            type="monotone"
                            dataKey={view}
                            stroke={COLORS[view]}
                            strokeWidth={2}
                            fill="url(#gradTrend)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Year-over-Year Comparison */}
            {yearlyArr.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Year-over-Year Comparison</div>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={yearlyArr}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.8)" />
                            <XAxis dataKey="year" stroke="#94A3B8" fontSize={12} />
                            <YAxis tickFormatter={v => formatCurrency(v)} stroke="#94A3B8" fontSize={11} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v), 'Total Spending']} />
                            <Bar dataKey="spending" fill="#0070DD" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </>
    )
}
