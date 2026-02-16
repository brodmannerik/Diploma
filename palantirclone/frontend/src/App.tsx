import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'
import './App.css'
import { GraphVisualization } from './components/GraphVisualization'
import { Sidebar } from './components/Sidebar'
import { useBackend } from './hooks/useBackend'
import { useMemo } from 'react'

const clusters = [
  { id: 'extremism', name: 'Extremism', color: '#FF6B6B' },
  { id: 'organized_resistance', name: 'Organized Resistance', color: '#4ECDC4' },
  { id: 'shared_belief', name: 'Shared Belief', color: '#FFE66D' },
  { id: 'state_denial', name: 'State Denial', color: '#95E1D3' },
  { id: 'conspiracist', name: 'Conspiracist Ideologies', color: '#C7CEEA' },
  { id: 'radicalization', name: 'Radicalization Pipeline', color: '#F38181' },
  { id: 'misinformation', name: 'Misinformation Network', color: '#AA96DA' },
]

function App() {
  const backend = useBackend()

  // Convert backend actors to people format
  const people = useMemo(() => {
    if (backend.actors.length === 0) {
      return []
    }

    // Get actors that have recent conversations (active)
    const activeActorIds = new Set<string>()
    backend.conversations.forEach(conv => {
      activeActorIds.add(conv.speaker)
      activeActorIds.add(conv.listener)
    })

    // Convert actors to people, USE backend classification data
    return backend.actors
      .map(actor => ({
        id: actor.id,
        name: actor.name,
        flagged: actor.flagged || false, // Use backend flagged status
        clusters: actor.clusters || [], // Use backend clusters
        riskScore: actor.riskScore || 0,
        timestamp: actor.timestamp,
        isActive: activeActorIds.has(actor.name),
      }))
      .sort((a, b) => {
        // Active people on top
        if (a.isActive && !b.isActive) return -1
        if (!a.isActive && b.isActive) return 1
        // Then by timestamp (most recent first)
        return b.timestamp - a.timestamp
      })
  }, [backend.actors, backend.conversations])

  const connectionStatus = backend.connected ? '🟢 Live' : '🔴 Disconnected'

  return (
    <div className="app bp5-dark">
      <div className="header">
        <div className="header-content">
          <h1 className="app-title">Network Analysis Platform</h1>
          <p className="app-subtitle">
            Real-time Graph Visualization & Threat Assessment
            <span style={{ marginLeft: '1rem', fontSize: '14px', opacity: 0.8 }}>
              {connectionStatus}
            </span>
          </p>
        </div>
      </div>
      
      <div className="main-container">
        <div className="graph-container">
          <GraphVisualization people={people} refreshSignal={backend.conversations.length} />
        </div>
        <Sidebar people={people} clusters={clusters} conversations={backend.conversations} />
      </div>
    </div>
  )
}

export default App
