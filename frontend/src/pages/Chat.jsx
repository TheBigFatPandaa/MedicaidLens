import { useState, useRef, useEffect } from 'react'
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Send, Bot, User, Sparkles, Zap, Search, TrendingUp, AlertTriangle } from 'lucide-react'
import { sendChatMessage, formatCurrency, formatNumber, formatMonth } from '../api'

const SUGGESTED_QUERIES = [
    { icon: <Zap size={14} />, text: 'What is the total Medicaid spending in 2023?' },
    { icon: <Search size={14} />, text: 'Show me the top 10 providers by total spending' },
    { icon: <TrendingUp size={14} />, text: 'What are the spending trends for autism therapy codes (97153)?' },
    { icon: <AlertTriangle size={14} />, text: 'Find providers with unusually high claim volumes' },
    { icon: <Search size={14} />, text: 'Which HCPCS codes have the highest per-claim cost?' },
    { icon: <TrendingUp size={14} />, text: 'Show spending growth rate by year' },
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

    const commonProps = {
        data: chartData,
    }

    const renderChart = () => {
        switch (type) {
            case 'bar_chart':
                return (
                    <BarChart {...commonProps}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                        <XAxis dataKey={config.x} stroke="#64748B" fontSize={11} />
                        <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v} stroke="#64748B" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px', color: '#F1F5F9' }} />
                        <Bar dataKey={config.y} fill="#A78BFA" radius={[4, 4, 0, 0]} />
                    </BarChart>
                )
            case 'line_chart':
                return (
                    <AreaChart {...commonProps}>
                        <defs>
                            <linearGradient id="gradChat" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A3150" />
                        <XAxis dataKey={config.x} stroke="#64748B" fontSize={11} />
                        <YAxis tickFormatter={v => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v} stroke="#64748B" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#1A1F35', border: '1px solid #2A3150', borderRadius: '8px', color: '#F1F5F9' }} />
                        <Area type="monotone" dataKey={config.y} stroke="#22D3EE" strokeWidth={2} fill="url(#gradChat)" />
                    </AreaChart>
                )
            default:
                return null
        }
    }

    return (
        <div style={{ margin: '16px 0' }}>
            {config.title && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                    {config.title}
                </div>
            )}
            <ResponsiveContainer width="100%" height={280}>
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
                {isUser ? <User size={18} /> : <Bot size={18} />}
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
                    <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', margin: '16px 0' }}>
                        {Object.values(message.results[0]).map((v, i) => (
                            <span key={i}>{typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}</span>
                        ))}
                    </div>
                )}

                {!isUser && message.narrative && (
                    <div className="narrative">{message.narrative}</div>
                )}

                {!isUser && message.error && (
                    <div style={{ color: 'var(--mirch)', fontSize: '0.85rem', marginTop: '8px' }}>
                        ⚠️ {message.error}
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
    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => { scrollToBottom() }, [messages])

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
            <div className="page-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Sparkles size={28} style={{ color: 'var(--accent-cyan)' }} />
                    AI Data Analyst
                </h2>
                <p>Ask questions about Medicaid provider spending in natural language</p>
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div className="empty-state" style={{ marginTop: '60px' }}>
                        <Sparkles size={64} style={{ color: 'var(--accent-cyan)', opacity: 0.6 }} />
                        <h3 style={{ marginTop: '16px' }}>Ask me anything about Medicaid data</h3>
                        <p style={{ maxWidth: '480px', margin: '0 auto', lineHeight: '1.7' }}>
                            I can query the largest Medicaid dataset in HHS history — provider spending, billing codes,
                            fraud detection, and more. Try one of the suggestions below.
                        </p>
                        <div className="suggested-queries" style={{ justifyContent: 'center', marginTop: '24px' }}>
                            {SUGGESTED_QUERIES.map((sq, i) => (
                                <button
                                    key={i}
                                    className="suggested-query"
                                    onClick={() => handleSend(sq.text)}
                                >
                                    {sq.icon} {sq.text}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <ChatMessage key={i} message={msg} />
                ))}

                {loading && (
                    <div className="chat-message assistant">
                        <div className="chat-avatar"><Bot size={18} /></div>
                        <div className="chat-bubble">
                            <div className="typing-indicator">
                                <span /><span /><span />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

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
                        <Send size={18} />
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
