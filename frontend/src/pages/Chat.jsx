import { useState, useRef, useEffect } from 'react'
import {
    BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Send, Bot, User, Sparkles, Zap, Search, TrendingUp, AlertTriangle, Database, DollarSign } from 'lucide-react'
import { sendChatMessage, fetchOverview, formatCurrency, formatNumber, formatMonth } from '../api'

const SUGGESTED_QUERIES = [
    { icon: <DollarSign size={15} />, text: 'What is the total Medicaid spending in 2023?' },
    { icon: <Search size={15} />, text: 'Show me the top 10 providers by total spending' },
    { icon: <TrendingUp size={15} />, text: 'What are the spending trends for autism therapy codes (97153)?' },
    { icon: <AlertTriangle size={15} />, text: 'Find providers with unusually high claim volumes' },
    { icon: <Database size={15} />, text: 'Which HCPCS codes have the highest per-claim cost?' },
    { icon: <TrendingUp size={15} />, text: 'Show spending growth rate by year' },
]

function ResultTable({ data }) {
    if (!data || data.length === 0) return null
    const keys = Object.keys(data[0])
    return (
        <div className="result-table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        {keys.map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i}>
                            {keys.map(k => (
                                <td key={k} className={typeof row[k] === 'number' ? 'mono' : ''}>
                                    {typeof row[k] === 'number'
                                        ? (row[k] > 1000 && k.toLowerCase().includes('paid')
                                            ? formatCurrency(row[k])
                                            : row[k] > 1000
                                                ? formatNumber(row[k])
                                                : row[k] % 1 !== 0 ? row[k].toFixed(2) : row[k])
                                        : row[k]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.6)" />
                        <XAxis dataKey={config.x} stroke="#484F58" fontSize={11} />
                        <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v} stroke="#484F58" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#161B22', border: '1px solid rgba(48,54,61,0.8)', borderRadius: '8px', color: '#E6EDF3', fontSize: '0.8rem' }} />
                        <Bar dataKey={config.y} fill="#BC8CFF" radius={[4, 4, 0, 0]} />
                    </BarChart>
                )
            case 'line_chart':
                return (
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="gradChat" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#58A6FF" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#58A6FF" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.6)" />
                        <XAxis dataKey={config.x} stroke="#484F58" fontSize={11} />
                        <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v} stroke="#484F58" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#161B22', border: '1px solid rgba(48,54,61,0.8)', borderRadius: '8px', color: '#E6EDF3', fontSize: '0.8rem' }} />
                        <Area type="monotone" dataKey={config.y} stroke="#58A6FF" strokeWidth={2} fill="url(#gradChat)" />
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

    return (
        <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
            <div className="chat-avatar">
                {isUser ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className="chat-bubble">
                {!isUser && message.thinking && (
                    <div className="thinking">💭 {message.thinking}</div>
                )}

                {!isUser && message.sql && (
                    <div className="sql-block">{message.sql}</div>
                )}

                {!isUser && message.results && message.visualization === 'table' && (
                    <ResultTable data={message.results} />
                )}

                {!isUser && message.results && ['line_chart', 'bar_chart'].includes(message.visualization) && (
                    <ResultChart data={message.results} config={message.chart_config} type={message.visualization} />
                )}

                {!isUser && message.visualization === 'number' && message.results?.[0] && (
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', margin: '12px 0', letterSpacing: '-0.02em' }}>
                        {Object.values(message.results[0]).map((v, i) => (
                            <span key={i}>{typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}</span>
                        ))}
                    </div>
                )}

                {!isUser && message.narrative && (
                    <div className="narrative">{message.narrative}</div>
                )}

                {!isUser && message.error && (
                    <div style={{ color: 'var(--accent-rose)', fontSize: '0.82rem', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} /> {message.error}
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
    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => { scrollToBottom() }, [messages])

    // Fetch overview stats for the hero
    useEffect(() => {
        fetchOverview()
            .then(data => setOverview(data))
            .catch(() => { })
    }, [])

    const handleSend = async (text) => {
        const messageText = text || input.trim()
        if (!messageText || loading) return

        const userMsg = { role: 'user', content: messageText }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const history = messages.map(m => ({
                role: m.role,
                content: m.role === 'user' ? m.content : (m.narrative || m.content || ''),
            }))

            const result = await sendChatMessage(messageText, history)
            const aiMsg = {
                role: 'assistant',
                content: result.narrative || '',
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
