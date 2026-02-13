import { useState, useEffect } from 'react'
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
    DollarSign, Users, FileText, Activity, Search,
} from 'lucide-react'
import {
    fetchOverview, fetchTrends, fetchTopProviders, fetchTopCodes,
    formatCurrency, formatNumber, formatMonth,
} from '../api'

function ProviderModal({ npi, onClose }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`/api/provider/${npi}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false) })
            .catch(() => setLoading(false))
    }, [npi])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3>{data?.provider?.provider_name || npi}</h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            NPI: {npi} {data?.provider?.specialty && `• ${data.provider.specialty}`}
                            {data?.provider?.state && ` • ${data.provider.city}, ${data.provider.state}`}
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <div className="loading-spinner"><div className="spinner" /></div>
                    ) : data ? (
                        <>
                            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                                <div className="stat-card cyan">
                                    <div className="stat-label">Total Paid</div>
                                    <div className="stat-value">{formatCurrency(data.provider.total_paid)}</div>
                                </div>
                                <div className="stat-card violet">
                                    <div className="stat-label">Total Claims</div>
                                    <div className="stat-value">{formatNumber(data.provider.total_claims)}</div>
                                </div>
                                <div className="stat-card emerald">
                                    <div className="stat-label">Beneficiaries</div>
                                    <div className="stat-value">{formatNumber(data.provider.total_beneficiaries)}</div>
                                </div>
                            </div>

                            {data.trend?.length > 0 && (
                                <div className="card mb-lg">
                                    <div className="card-header">
                                        <div className="card-title">Spending Trend</div>
                                    </div>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <AreaChart data={data.trend}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                                            <XAxis dataKey="claim_month" tickFormatter={formatMonth} stroke="#64748B" fontSize={11} />
                                            <YAxis tickFormatter={v => formatCurrency(v)} stroke="#64748B" fontSize={11} />
                                            <Tooltip
                                                contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px' }}
                                                formatter={(v) => [formatCurrency(v), 'Paid']}
                                                labelFormatter={formatMonth}
                                            />
                                            <Area type="monotone" dataKey="total_paid" stroke="#22D3EE" fill="rgba(34,211,238,0.1)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {data.top_codes?.length > 0 && (
                                <div className="card">
                                    <div className="card-header">
                                        <div className="card-title">Top Billing Codes</div>
                                    </div>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Code</th>
                                                <th>Description</th>
                                                <th style={{ textAlign: 'right' }}>Claims</th>
                                                <th style={{ textAlign: 'right' }}>Paid</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.top_codes.map(c => (
                                                <tr key={c.hcpcs_code}>
                                                    <td className="mono">{c.hcpcs_code}</td>
                                                    <td>{c.description}</td>
                                                    <td className="mono text-right">{formatNumber(c.total_claims)}</td>
                                                    <td className="currency text-right">{formatCurrency(c.total_paid)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="empty-state"><h3>Provider not found</h3></div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function Dashboard() {
    const [overview, setOverview] = useState(null)
    const [trends, setTrends] = useState([])
    const [topProviders, setTopProviders] = useState([])
    const [topCodes, setTopCodes] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedNPI, setSelectedNPI] = useState(null)

    useEffect(() => {
        Promise.all([
            fetchOverview(),
            fetchTrends(),
            fetchTopProviders(10),
            fetchTopCodes(10),
        ]).then(([ov, tr, tp, tc]) => {
            setOverview(ov)
            setTrends(tr)
            setTopProviders(tp)
            setTopCodes(tc)
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    if (loading) {
        return <div className="loading-spinner"><div className="spinner" /></div>
    }

    const chartData = trends.map(t => ({
        ...t,
        month: formatMonth(t.claim_month),
        spending: t.total_paid,
    }))

    return (
        <>
            <div className="page-header">
                <h2>Medicaid Spending Dashboard</h2>
                <p>HHS Open Data — Provider-level claims analytics (2018–2024)</p>
            </div>

            {overview && (
                <div className="stats-grid">
                    <div className="stat-card cyan">
                        <div className="stat-icon"><DollarSign size={20} /></div>
                        <div className="stat-label">Total Paid</div>
                        <div className="stat-value">{formatCurrency(overview.total_paid)}</div>
                        <div className="stat-sub">{overview.date_from} → {overview.date_to}</div>
                    </div>
                    <div className="stat-card violet">
                        <div className="stat-icon"><Users size={20} /></div>
                        <div className="stat-label">Providers</div>
                        <div className="stat-value">{formatNumber(overview.total_providers)}</div>
                        <div className="stat-sub">Unique billing NPIs</div>
                    </div>
                    <div className="stat-card emerald">
                        <div className="stat-icon"><FileText size={20} /></div>
                        <div className="stat-label">Total Claims</div>
                        <div className="stat-value">{formatNumber(overview.total_claims)}</div>
                        <div className="stat-sub">{formatNumber(overview.total_rows)} data rows</div>
                    </div>
                    <div className="stat-card amber">
                        <div className="stat-icon"><Activity size={20} /></div>
                        <div className="stat-label">HCPCS Codes</div>
                        <div className="stat-value">{formatNumber(overview.total_codes)}</div>
                        <div className="stat-sub">Unique billing codes</div>
                    </div>
                </div>
            )}

            {/* Spending Trend Chart */}
            <div className="charts-grid full mb-lg">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Monthly Medicaid Spending</div>
                        <div className="card-subtitle">Total paid across all providers</div>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                            <XAxis dataKey="month" stroke="#64748B" fontSize={11} />
                            <YAxis tickFormatter={v => formatCurrency(v)} stroke="#64748B" fontSize={11} />
                            <Tooltip
                                contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px', color: '#F1F5F9' }}
                                formatter={(v) => [formatCurrency(v), 'Spending']}
                            />
                            <Area type="monotone" dataKey="spending" stroke="#22D3EE" strokeWidth={2} fill="url(#gradCyan)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Top Providers and Top Codes */}
            <div className="charts-grid">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Top 10 Providers by Spending</div>
                    </div>
                    <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Provider</th>
                                    <th style={{ textAlign: 'right' }}>Total Paid</th>
                                    <th style={{ textAlign: 'right' }}>Claims</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topProviders.map(p => (
                                    <tr key={p.billing_npi} className="clickable" onClick={() => setSelectedNPI(p.billing_npi)}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {p.provider_name || p.billing_npi}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {p.specialty && `${p.specialty} • `}NPI: {p.billing_npi}
                                            </div>
                                        </td>
                                        <td className="currency text-right">{formatCurrency(p.total_paid)}</td>
                                        <td className="mono text-right">{formatNumber(p.total_claims)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Top 10 HCPCS Codes by Spending</div>
                    </div>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={topCodes.slice(0, 10)} layout="vertical" margin={{ left: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                            <XAxis type="number" tickFormatter={v => formatCurrency(v)} stroke="#64748B" fontSize={11} />
                            <YAxis type="category" dataKey="hcpcs_code" stroke="#64748B" fontSize={11} width={60} />
                            <Tooltip
                                contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px', color: '#F1F5F9' }}
                                formatter={(v) => [formatCurrency(v), 'Total Paid']}
                                labelFormatter={(label) => {
                                    const code = topCodes.find(c => c.hcpcs_code === label)
                                    return `${label} — ${code?.description || ''}`
                                }}
                            />
                            <Bar dataKey="total_paid" fill="#A78BFA" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {selectedNPI && <ProviderModal npi={selectedNPI} onClose={() => setSelectedNPI(null)} />}
        </>
    )
}
