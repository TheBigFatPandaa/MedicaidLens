import { useState, useRef, useEffect } from 'react'
import {
    BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Send, Bot, User, Sparkles, Zap, Search, TrendingUp, AlertTriangle, Database, DollarSign, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { sendChatMessage, fetchOverview, formatCurrency, formatNumber, formatMonth } from '../api'

const SUGGESTED_QUERIES = [
    { icon: <DollarSign size={15} />, text: 'What is the total Medicaid spending in 2023?' },
    { icon: <Search size={15} />, text: 'Show me the top 10 providers by total spending' },
    { icon: <TrendingUp size={15} />, text: 'What are the spending trends for autism therapy codes (97153)?' },
    { icon: <AlertTriangle size={15} />, text: 'Find providers with unusually high claim volumes' },
    { icon: <Database size={15} />, text: 'Which HCPCS codes have the highest per-claim cost?' },
    { icon: <TrendingUp size={15} />, text: 'Show spending growth rate by year' },
]

/* Lightweight inline markdown: **bold**, *italic*, `code`, and line breaks */
function RichText({ text }) {
    if (!text) return null
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\n)/g)
    return (
        <span>
            {parts.map((part, i) => {
                if (!part) return null
                if (part === '\n') return <br key={i} />
                if (part.startsWith('**') && part.endsWith('**'))
                    return <strong key={i} style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
                if (part.startsWith('*') && part.endsWith('*'))
                    return <em key={i}>{part.slice(1, -1)}</em>
                if (part.startsWith('`') && part.endsWith('`'))
                    return <code key={i} style={{ background: 'rgba(88,166,255,0.08)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-violet)' }}>{part.slice(1, -1)}</code>
                return <span key={i}>{part}</span>
            })}
        </span>
    )
}

/* Smart cell formatter — detects currency, NPI, percentages, etc. */
function SmartCell({ colKey, value, row }) {
    const key = colKey.toLowerCase()

    // Provider name — bold and prominent
    if (key === 'provider_name') {
        if (!value || value === 'Unknown') return <span className="text-muted-cell">—</span>
        return <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
    }

    // Specialty — styled tag
    if (key === 'specialty') {
        if (!value) return <span className="text-muted-cell">—</span>
        return <span className="badge badge-info">{value}</span>
    }

    // State / City — secondary text
    if (key === 'state' || key === 'city') {
        if (!value) return <span className="text-muted-cell">—</span>
        return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{value}</span>
    }

    // Provider type
    if (key === 'provider_type') {
        if (!value) return <span className="text-muted-cell">—</span>
        const color = value === 'Organization' ? 'var(--accent-violet)' : 'var(--accent-teal)'
        return <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{value}</span>
    }

    // HCPCS description
    if (key === 'description') {
        if (!value) return <span className="text-muted-cell">—</span>
        return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontStyle: 'italic' }}>{value}</span>
    }

    // Currency columns
    if (typeof value === 'number' && (key.includes('paid') || key.includes('cost') || key.includes('avg_paid'))) {
        return <span className="currency">{formatCurrency(value)}</span>
    }

    // Z-scores — color coded
    if (typeof value === 'number' && key.includes('z_score')) {
        const color = value > 5 ? 'var(--accent-rose)' : value > 3 ? 'var(--accent-amber)' : 'var(--accent-emerald)'
        return <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>{value.toFixed(1)}σ</span>
    }

    // Large numbers
    if (typeof value === 'number' && value > 1000) {
        return <span className="mono">{formatNumber(value)}</span>
    }

    // Decimals
    if (typeof value === 'number' && value % 1 !== 0) {
        return <span className="mono">{value.toFixed(2)}</span>
    }

    // Regular number
    if (typeof value === 'number') {
        return <span className="mono">{value.toLocaleString()}</span>
    }

    // Dates
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{formatMonth(value)}</span>
    }

    // Default
    return <span>{value ?? '—'}</span>
}

/* Format column header from snake_case */
function formatHeader(key) {
    const labels = {
        billing_npi: 'NPI',
        provider_name: 'Provider',
        provider_type: 'Type',
        specialty: 'Specialty',
        state: 'State',
        city: 'City',
        hcpcs_code: 'Code',
        description: 'Description',
        total_paid: 'Total Paid',
        total_claims: 'Claims',
        total_beneficiaries: 'Beneficiaries',
        record_count: 'Records',
        unique_codes: 'Codes',
        active_months: 'Active Mo.',
        z_score_paid: 'Z-Score ($)',
        z_score_claims: 'Z-Score (Claims)',
        avg_paid_per_claim: 'Avg $/Claim',
        code_avg_paid: 'Peer Avg $',
        code_avg_claims: 'Peer Avg Claims',
        active_providers: 'Providers',
        provider_count: 'Providers',
        claim_month: 'Month',
        first_month: 'First Active',
        last_month: 'Last Active',
        servicing_npi: 'Servicing NPI',
    }
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function ResultTable({ data }) {
    if (!data || data.length === 0) return null
    const keys = Object.keys(data[0])
    return (
        <div className="result-table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        {keys.map(k => <th key={k}>{formatHeader(k)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i}>
                            {keys.map(k => (
                                <td key={k}>
                                    <SmartCell colKey={k} value={row[k]} row={row} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="table-row-count">
                {data.length} row{data.length !== 1 ? 's' : ''}
            </div>
        </div>
    )
}

function ResultChart({ data, config, type }) {
    if (!data || data.length === 0 || !config) return null

    const chartData = data.map(row => ({
        ...row,
        [config.x]: typeof row[config.x] === 'string' && row[config.x].includes('-')
            ? formatMonth(row[config.x])
            : row[config.x],
    }))

    const renderChart = () => {
        switch (type) {
            case 'bar_chart':
                return (
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey={config.x} stroke="#94A3B8" fontSize={11} />
                        <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v} stroke="#94A3B8" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#1E293B', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} />
                        <Bar dataKey={config.y} fill="#0070DD" radius={[4, 4, 0, 0]} />
                    </BarChart>
                )
            case 'line_chart':
                return (
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="gradChat" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0070DD" stopOpacity={0.15} />
                                <stop offset="100%" stopColor="#0070DD" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey={config.x} stroke="#94A3B8" fontSize={11} />
                        <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v} stroke="#94A3B8" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#1E293B', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} />
                        <Area type="monotone" dataKey={config.y} stroke="#0070DD" strokeWidth={2} fill="url(#gradChat)" />
                    </AreaChart>
                )
            default:
                return null
        }
    }

    return (
        <div style={{ margin: '12px 0' }}>
            {config.title && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                    {config.title}
                </div>
            )}
            <ResponsiveContainer width="100%" height={260}>
                {renderChart()}
            </ResponsiveContainer>
        </div>
    )
}

function ChatMessage({ message }) {
    const isUser = message.role === 'user'
    const [sqlExpanded, setSqlExpanded] = useState(false)

    return (
        <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
            <div className="chat-avatar">
                {isUser ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className="chat-bubble">
                {/* Thinking — collapsible */}
                {!isUser && message.thinking && (
                    <div className="thinking">
                        <Sparkles size={12} style={{ opacity: 0.6 }} />
                        <span>{message.thinking}</span>
                    </div>
                )}

                {/* SQL — collapsible */}
                {!isUser && message.sql && (
                    <div className="sql-section">
                        <button className="sql-toggle" onClick={() => setSqlExpanded(!sqlExpanded)}>
                            <Database size={12} />
                            <span>SQL Query</span>
                            {sqlExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        {sqlExpanded && (
                            <div className="sql-block">{message.sql}</div>
                        )}
                    </div>
                )}

                {/* Large number result */}
                {!isUser && message.visualization === 'number' && message.results?.[0] && (
                    <div className="big-number-result">
                        {Object.entries(message.results[0]).map(([k, v], i) => (
                            <div key={i} className="big-number-item">
                                <div className="big-number-value">
                                    {typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}
                                </div>
                                <div className="big-number-label">{formatHeader(k)}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Table results */}
                {!isUser && message.results && message.visualization === 'table' && (
                    <ResultTable data={message.results} />
                )}

                {/* Chart results */}
                {!isUser && message.results && ['line_chart', 'bar_chart'].includes(message.visualization) && (
                    <ResultChart data={message.results} config={message.chart_config} type={message.visualization} />
                )}

                {/* Narrative — rich text */}
                {!isUser && message.narrative && (
                    <div className="narrative">
                        <RichText text={message.narrative} />
                    </div>
                )}

                {/* Error */}
                {!isUser && message.error && (
                    <div className="chat-error">
                        <AlertTriangle size={14} /> {message.error}
                    </div>
                )}

                {/* Elapsed time */}
                {!isUser && message.elapsed && (
                    <div className="elapsed-time">
                        <Clock size={11} /> {message.elapsed}
                    </div>
                )}

                {isUser && <span>{message.content}</span>}
            </div>
        </div>
    )
}

export default function Chat() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [overview, setOverview] = useState(null)
    const [elapsed, setElapsed] = useState(0)
    const messagesEndRef = useRef(null)
    const timerRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => { scrollToBottom() }, [messages])

    useEffect(() => {
        fetchOverview()
            .then(data => setOverview(data))
            .catch(() => { })
    }, [])

    // Timer for elapsed time display
    useEffect(() => {
        if (loading) {
            setElapsed(0)
            timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000)
        } else {
            clearInterval(timerRef.current)
        }
        return () => clearInterval(timerRef.current)
    }, [loading])

    const handleSend = async (text) => {
        const messageText = text || input.trim()
        if (!messageText || loading) return

        const userMsg = { role: 'user', content: messageText }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)
        const startTime = Date.now()

        try {
            const history = messages.map(m => ({
                role: m.role,
                content: m.role === 'user' ? m.content : (m.narrative || m.content || ''),
            }))

            const result = await sendChatMessage(messageText, history)
            const duration = ((Date.now() - startTime) / 1000).toFixed(1)
            const aiMsg = {
                role: 'assistant',
                content: result.narrative || '',
                elapsed: `${duration}s`,
                ...result,
            }
            setMessages(prev => [...prev, aiMsg])
        } catch (err) {
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: '', error: 'Failed to get response. Please try again.', narrative: '' },
            ])
        }

        setLoading(false)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="chat-container">
            {messages.length === 0 ? (
                <div className="chat-empty-state">
                    <div className="chat-hero-icon">
                        <Sparkles size={32} color="white" />
                    </div>
                    <h2 className="chat-hero-title">Ask anything about Medicaid</h2>
                    <p className="chat-hero-subtitle">
                        Query the largest Medicaid dataset in HHS history — provider spending, billing codes,
                        fraud patterns, and more — using natural language.
                    </p>

                    {overview && (
                        <div className="chat-hero-stats">
                            <div className="chat-hero-stat">
                                <div className="value">{formatCurrency(overview.total_paid)}</div>
                                <div className="label">Total Spending</div>
                            </div>
                            <div className="chat-hero-stat">
                                <div className="value">{formatNumber(overview.total_providers)}</div>
                                <div className="label">Providers</div>
                            </div>
                            <div className="chat-hero-stat">
                                <div className="value">{formatNumber(overview.total_rows)}</div>
                                <div className="label">Data Rows</div>
                            </div>
                            <div className="chat-hero-stat">
                                <div className="value">{overview.total_codes?.toLocaleString()}</div>
                                <div className="label">HCPCS Codes</div>
                            </div>
                        </div>
                    )}

                    <div className="suggested-grid">
                        {SUGGESTED_QUERIES.map((sq, i) => (
                            <button
                                key={i}
                                className="suggested-card"
                                onClick={() => handleSend(sq.text)}
                            >
                                <div className="sq-icon">{sq.icon}</div>
                                <div className="sq-text">{sq.text}</div>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="chat-messages">
                    {messages.map((msg, i) => (
                        <ChatMessage key={i} message={msg} />
                    ))}

                    {loading && (
                        <div className="chat-message assistant">
                            <div className="chat-avatar"><Bot size={16} /></div>
                            <div className="chat-bubble">
                                <div className="typing-indicator">
                                    <span /><span /><span />
                                </div>
                                {elapsed > 0 && (
                                    <div className="elapsed-live">
                                        <Clock size={11} /> Analyzing... {elapsed}s
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            )}

            <div className="chat-input-container">
                <div className="chat-input-wrapper">
                    <input
                        className="chat-input"
                        type="text"
                        placeholder="Ask about Medicaid spending, providers, fraud patterns..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                    <button
                        className="chat-send-btn"
                        onClick={() => handleSend()}
                        disabled={!input.trim() || loading}
                    >
                        <Send size={16} />
                    </button>
                </div>

                {messages.length > 0 && (
                    <div className="suggested-queries">
                        {SUGGESTED_QUERIES.slice(0, 3).map((sq, i) => (
                            <button
                                key={i}
                                className="suggested-query"
                                onClick={() => handleSend(sq.text)}
                                disabled={loading}
                            >
                                {sq.icon} {sq.text}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
