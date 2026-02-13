import { useState, useEffect } from 'react'
import { AlertTriangle, Search, ExternalLink, Shield, ShieldAlert, ShieldX } from 'lucide-react'
import { fetchAnomalies, formatCurrency, formatNumber } from '../api'

function ZScoreBar({ score }) {
    const maxWidth = Math.min(Math.abs(score) / 15 * 100, 100)
    const cls = Math.abs(score) > 10 ? 'z-high' : 'z-medium'
    return (
        <div className="z-score-bar" style={{ width: '100px' }}>
            <div className={`z-score-fill ${cls}`} style={{ width: `${maxWidth}%` }} />
        </div>
    )
}

function ThreatLevel({ score }) {
    const abs = Math.abs(score)
    if (abs > 10) return <span className="badge badge-danger"><ShieldX size={12} /> Critical</span>
    if (abs > 7) return <span className="badge badge-warning"><ShieldAlert size={12} /> High</span>
    return <span className="badge badge-info"><Shield size={12} /> Elevated</span>
}

export default function Anomalies() {
    const [anomalies, setAnomalies] = useState([])
    const [loading, setLoading] = useState(true)
    const [minZ, setMinZ] = useState(5)
    const [codeFilter, setCodeFilter] = useState('')
    const [limit, setLimit] = useState(50)

    const loadData = () => {
        setLoading(true)
        fetchAnomalies(limit, minZ, codeFilter || undefined)
            .then(data => { setAnomalies(data); setLoading(false) })
            .catch(() => setLoading(false))
    }

    useEffect(() => { loadData() }, [])

    return (
        <>
            <div className="page-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <AlertTriangle size={28} style={{ color: 'var(--accent-rose)' }} />
                    Anomaly Detection
                </h2>
                <p>Statistical outliers in provider billing — potential fraud, waste, or abuse indicators</p>
            </div>

            <div className="card mb-lg">
                <div className="anomaly-header">
                    <div className="filter-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Min Z-Score:</label>
                            <input
                                className="filter-input"
                                type="number"
                                value={minZ}
                                onChange={e => setMinZ(Number(e.target.value))}
                                min={2} max={20} step={0.5}
                                style={{ width: '80px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>HCPCS Code:</label>
                            <input
                                className="filter-input"
                                type="text"
                                placeholder="e.g., 97153"
                                value={codeFilter}
                                onChange={e => setCodeFilter(e.target.value)}
                                style={{ width: '120px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Limit:</label>
                            <select
                                className="filter-input"
                                value={limit}
                                onChange={e => setLimit(Number(e.target.value))}
                                style={{ width: '80px' }}
                            >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                            </select>
                        </div>
                        <button className="filter-btn active" onClick={loadData}>
                            <Search size={14} /> Search
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                ) : (
                    <>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Found {anomalies.length} anomalous provider-code combinations
                        </div>
                        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Threat</th>
                                        <th>Provider</th>
                                        <th>HCPCS Code</th>
                                        <th style={{ textAlign: 'right' }}>Paid</th>
                                        <th style={{ textAlign: 'right' }}>Claims</th>
                                        <th style={{ textAlign: 'right' }}>vs Avg Paid</th>
                                        <th>Z-Score (Paid)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {anomalies.map((a, i) => (
                                        <tr key={i}>
                                            <td><ThreatLevel score={a.z_score_paid} /></td>
                                            <td>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {a.provider_name || a.billing_npi}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {a.specialty && `${a.specialty} • `}
                                                    {a.state && `${a.state} • `}
                                                    NPI: {a.billing_npi}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="mono">{a.hcpcs_code}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.description}</div>
                                            </td>
                                            <td className="currency text-right">{formatCurrency(a.total_paid)}</td>
                                            <td className="mono text-right">{formatNumber(a.total_claims)}</td>
                                            <td className="text-right">
                                                <span style={{ color: 'var(--accent-rose)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                                    {a.code_avg_paid > 0 ? `${(a.total_paid / a.code_avg_paid).toFixed(0)}×` : '—'}
                                                </span>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    avg: {formatCurrency(a.code_avg_paid)}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span className="mono" style={{ minWidth: '45px', color: Math.abs(a.z_score_paid) > 10 ? 'var(--mirch)' : 'var(--haldi)' }}>
                                                        {a.z_score_paid.toFixed(1)}
                                                    </span>
                                                    <ZScoreBar score={a.z_score_paid} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
