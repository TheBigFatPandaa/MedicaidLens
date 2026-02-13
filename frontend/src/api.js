const API_BASE = '/api'

export async function fetchOverview() {
    const res = await fetch(`${API_BASE}/overview`)
    if (!res.ok) throw new Error('Failed to fetch overview')
    return res.json()
}

export async function fetchTrends(start, end) {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    const res = await fetch(`${API_BASE}/trends?${params}`)
    if (!res.ok) throw new Error('Failed to fetch trends')
    return res.json()
}

export async function fetchTopProviders(limit = 20, sortBy = 'total_paid') {
    const res = await fetch(`${API_BASE}/top-providers?limit=${limit}&sort_by=${sortBy}`)
    if (!res.ok) throw new Error('Failed to fetch providers')
    return res.json()
}

export async function fetchTopCodes(limit = 20, sortBy = 'total_paid') {
    const res = await fetch(`${API_BASE}/top-codes?limit=${limit}&sort_by=${sortBy}`)
    if (!res.ok) throw new Error('Failed to fetch codes')
    return res.json()
}

export async function fetchProviderDetail(npi) {
    const res = await fetch(`${API_BASE}/provider/${npi}`)
    if (!res.ok) throw new Error('Provider not found')
    return res.json()
}

export async function fetchCodeDetail(code) {
    const res = await fetch(`${API_BASE}/code/${code}`)
    if (!res.ok) throw new Error('Code not found')
    return res.json()
}

export async function fetchAnomalies(limit = 50, minZScore = 5.0, hcpcsCode) {
    const params = new URLSearchParams({
        limit: limit.toString(),
        min_z_score: minZScore.toString(),
    })
    if (hcpcsCode) params.set('hcpcs_code', hcpcsCode)
    const res = await fetch(`${API_BASE}/anomalies?${params}`)
    if (!res.ok) throw new Error('Failed to fetch anomalies')
    return res.json()
}

export async function sendChatMessage(message, history = []) {
    const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
    })
    if (!res.ok) throw new Error('Chat request failed')
    return res.json()
}

export function formatCurrency(value) {
    if (value == null) return '$0'
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`
    return `$${value.toFixed(2)}`
}

export function formatNumber(value) {
    if (value == null) return '0'
    return value.toLocaleString()
}

export function formatMonth(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}
