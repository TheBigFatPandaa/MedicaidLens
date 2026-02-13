import { useState, useEffect } from 'react'
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import { fetchTrends, formatCurrency, formatNumber, formatMonth } from '../api'

export default function Trends() {
    const [trends, setTrends] = useState([])
    const [loading, setLoading] = useState(true)
    const [view, setView] = useState('spending') // spending | claims | providers

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
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <TrendingUp size={28} style={{ color: 'var(--accent-emerald)' }} />
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
                        <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {growth.spendGrowth > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
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
                <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="gradTrend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={view === 'spending' ? '#22D3EE' : view === 'claims' ? '#A78BFA' : '#34D399'} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={view === 'spending' ? '#22D3EE' : view === 'claims' ? '#A78BFA' : '#34D399'} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                        <XAxis dataKey="month" stroke="#64748B" fontSize={11} />
                        <YAxis tickFormatter={v => view === 'spending' ? formatCurrency(v) : formatNumber(v)} stroke="#64748B" fontSize={11} />
                        <Tooltip
                            contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px', color: '#F1F5F9' }}
                            formatter={(v) => [view === 'spending' ? formatCurrency(v) : formatNumber(v), view === 'spending' ? 'Spending' : view === 'claims' ? 'Claims' : 'Providers']}
                        />
                        <Area
                            type="monotone"
                            dataKey={view}
                            stroke={view === 'spending' ? '#22D3EE' : view === 'claims' ? '#A78BFA' : '#34D399'}
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
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={yearlyArr}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                            <XAxis dataKey="year" stroke="#64748B" fontSize={12} />
                            <YAxis tickFormatter={v => formatCurrency(v)} stroke="#64748B" fontSize={11} />
                            <Tooltip
                                contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px', color: '#F1F5F9' }}
                                formatter={(v) => [formatCurrency(v), 'Total Spending']}
                            />
                            <Bar dataKey="spending" fill="#A78BFA" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </>
    )
}
