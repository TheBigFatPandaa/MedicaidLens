import { useState, useEffect } from 'react'
import {
    BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { FileCode2, Search, ArrowUpDown } from 'lucide-react'
import { fetchTopCodes, fetchCodeDetail, formatCurrency, formatNumber, formatMonth } from '../api'

const TOOLTIP_STYLE = {
    background: '#161B22',
    border: '1px solid rgba(48,54,61,0.8)',
    borderRadius: '8px',
    color: '#E6EDF3',
    fontSize: '0.78rem',
}

function CodeDetailPanel({ code, onClose }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchCodeDetail(code)
            .then(d => { setData(d); setLoading(false) })
            .catch(() => setLoading(false))
    }, [code])

    if (loading) return <div className="loading-spinner"><div className="spinner" /></div>
    if (!data) return null

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700 }}>{code}</h3>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {data.code.description}
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <div className="stats-grid" style={{ marginBottom: '20px' }}>
                        <div className="stat-card cyan">
                            <div className="stat-label">Total Paid</div>
                            <div className="stat-value">{formatCurrency(data.code.total_paid)}</div>
                        </div>
                        <div className="stat-card violet">
                            <div className="stat-label">Providers</div>
                            <div className="stat-value">{formatNumber(data.code.provider_count)}</div>
                        </div>
                        <div className="stat-card emerald">
                            <div className="stat-label">Avg Per Claim</div>
                            <div className="stat-value">{formatCurrency(data.code.avg_paid_per_claim)}</div>
                        </div>
                    </div>

                    {data.trend?.length > 0 && (
                        <div className="card mb-lg">
                            <div className="card-header"><div className="card-title">Monthly Spending Trend</div></div>
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={data.trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.6)" />
                                    <XAxis dataKey="claim_month" tickFormatter={formatMonth} stroke="#484F58" fontSize={10} />
                                    <YAxis tickFormatter={v => formatCurrency(v)} stroke="#484F58" fontSize={10} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v), 'Paid']} labelFormatter={formatMonth} />
                                    <Area type="monotone" dataKey="total_paid" stroke="#BC8CFF" fill="rgba(188,140,255,0.08)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {data.top_providers?.length > 0 && (
                        <div className="card">
                            <div className="card-header"><div className="card-title">Top Providers for This Code</div></div>
                            <div style={{ maxHeight: '320px', overflow: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Provider</th>
                                            <th style={{ textAlign: 'right' }}>Claims</th>
                                            <th style={{ textAlign: 'right' }}>Paid</th>
                                            <th style={{ textAlign: 'right' }}>Beneficiaries</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.top_providers.map(p => (
                                            <tr key={p.billing_npi}>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                                                        {p.provider_name || p.billing_npi}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                                                        {p.specialty && `${p.specialty} · `}
                                                        {p.state && `${p.state} · `}
                                                        NPI: {p.billing_npi}
                                                    </div>
                                                </td>
                                                <td className="mono text-right">{formatNumber(p.total_claims)}</td>
                                                <td className="currency text-right">{formatCurrency(p.total_paid)}</td>
                                                <td className="mono text-right">{formatNumber(p.beneficiaries)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function CodeExplorer() {
    const [codes, setCodes] = useState([])
    const [loading, setLoading] = useState(true)
    const [sortBy, setSortBy] = useState('total_paid')
    const [selectedCode, setSelectedCode] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    const loadCodes = () => {
        setLoading(true)
        fetchTopCodes(100, sortBy)
            .then(data => { setCodes(data); setLoading(false) })
            .catch(() => setLoading(false))
    }

    useEffect(() => { loadCodes() }, [sortBy])

    const filtered = searchTerm
        ? codes.filter(c =>
            c.hcpcs_code.includes(searchTerm) ||
            (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        : codes

    return (
        <>
            <div className="page-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileCode2 size={24} style={{ color: 'var(--accent-violet)' }} />
                    HCPCS Code Explorer
                </h2>
                <p>Explore billing codes, spending patterns, and provider distributions</p>
            </div>

            <div className="filter-bar mb-lg">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <Search size={15} style={{ color: 'var(--text-muted)' }} />
                    <input
                        className="filter-input"
                        type="text"
                        placeholder="Search by code or description..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ flex: 1, maxWidth: '360px' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ArrowUpDown size={13} style={{ color: 'var(--text-muted)' }} />
                    {['total_paid', 'total_claims', 'provider_count'].map(s => (
                        <button
                            key={s}
                            className={`filter-btn ${sortBy === s ? 'active' : ''}`}
                            onClick={() => setSortBy(s)}
                        >
                            {s === 'total_paid' ? 'By Spending' : s === 'total_claims' ? 'By Claims' : 'By Providers'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Top Codes Bar Chart */}
            <div className="card mb-lg">
                <div className="card-header">
                    <div className="card-title">Top 20 HCPCS Codes</div>
                    <div className="card-subtitle">By {sortBy.replace(/_/g, ' ')}</div>
                </div>
                <ResponsiveContainer width="100%" height={380}>
                    <BarChart data={filtered.slice(0, 20)} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.6)" />
                        <XAxis type="number" tickFormatter={v => sortBy === 'total_paid' ? formatCurrency(v) : formatNumber(v)} stroke="#484F58" fontSize={10} />
                        <YAxis type="category" dataKey="hcpcs_code" stroke="#484F58" fontSize={11} width={70} />
                        <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            formatter={(v) => [sortBy === 'total_paid' ? formatCurrency(v) : formatNumber(v)]}
                            labelFormatter={(label) => {
                                const c = filtered.find(x => x.hcpcs_code === label)
                                return `${label} — ${c?.description || ''}`
                            }}
                        />
                        <Bar dataKey={sortBy} fill="#BC8CFF" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Full Code Table */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title">All Codes ({filtered.length})</div>
                </div>
                {loading ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                ) : (
                    <div style={{ maxHeight: '480px', overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Description</th>
                                    <th style={{ textAlign: 'right' }}>Providers</th>
                                    <th style={{ textAlign: 'right' }}>Claims</th>
                                    <th style={{ textAlign: 'right' }}>Total Paid</th>
                                    <th style={{ textAlign: 'right' }}>Per Claim</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.hcpcs_code} className="clickable" onClick={() => setSelectedCode(c.hcpcs_code)}>
                                        <td className="mono" style={{ fontWeight: 700, color: 'var(--accent-violet)' }}>{c.hcpcs_code}</td>
                                        <td>{c.description}</td>
                                        <td className="mono text-right">{formatNumber(c.provider_count)}</td>
                                        <td className="mono text-right">{formatNumber(c.total_claims)}</td>
                                        <td className="currency text-right">{formatCurrency(c.total_paid)}</td>
                                        <td className="mono text-right">{formatCurrency(c.avg_paid_per_claim)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedCode && <CodeDetailPanel code={selectedCode} onClose={() => setSelectedCode(null)} />}
        </>
    )
}
