import React from 'react';
import { Card, Tag, Icon } from '@blueprintjs/core';
import './Sidebar.css';

interface Person {
  id: string;
  name: string;
  flagged: boolean;
  clusters?: string[];
  isActive?: boolean;
  riskScore?: number;
}

interface Cluster {
  id: string;
  name: string;
  color: string;
}

interface Conversation {
  id: string;
  speaker: string;
  listener: string;
  message: string;
  timestamp: number;
}

interface SidebarProps {
  people: Person[];
  clusters?: Cluster[];
  conversations?: Conversation[];
}

export const Sidebar: React.FC<SidebarProps> = ({ people, clusters = [], conversations = [] }) => {
  const flaggedCount = people.filter(p => p.flagged).length;
  const activeCount = people.filter(p => p.isActive).length;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Network Analysis</h2>
        <p className="subtitle">Node Graph Visualization</p>
      </div>

      <Card className="sidebar-stats">
        <div className="stat-row">
          <span className="stat-label">Total Nodes:</span>
          <span className="stat-value">{people.length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">
            <Icon icon="dot" color="#4ECDC4" /> Active:
          </span>
          <span className="stat-value">{activeCount}</span>
        </div>
        <div className="stat-row flagged">
          <span className="stat-label">
            <Icon icon="warning-sign" /> Flagged:
          </span>
          <span className="stat-value">{flaggedCount}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">
            <Icon icon="chat" /> Conversations:
          </span>
          <span className="stat-value">{conversations.length >= 100 ? '100+' : conversations.length}</span>
        </div>
      </Card>

      {clusters.length > 0 && (
        <div className="sidebar-section">
          <h3>Threat Categories</h3>
          <div className="clusters-list">
            {clusters.map(cluster => {
              const clusterPeople = people.filter(p => 
                (p.clusters || []).includes(cluster.id)
              );
              return (
                <Card key={cluster.id} className="cluster-card">
                  <div className="cluster-header">
                    <div 
                      className="cluster-bubble"
                      style={{ backgroundColor: cluster.color }}
                    />
                    <div className="cluster-info">
                      <p className="cluster-name">{cluster.name}</p>
                      <p className="cluster-count">{clusterPeople.length} node{clusterPeople.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <h3>People {activeCount > 0 && <span style={{ fontSize: '12px', opacity: 0.6 }}>(Active on top)</span>}</h3>
        <div className="people-list">
          {people.map(person => (
            <Card key={person.id} className={`person-card ${person.isActive ? 'active' : ''}`}>
              <div className="person-header">
                <div className={`person-avatar ${person.flagged ? 'flagged' : ''}`}>
                  {person.name.charAt(0).toUpperCase()}
                  {person.isActive && (
                    <div className="active-indicator" title="Active in conversations" />
                  )}
                </div>
                <div className="person-info">
                  <p className="person-name">
                    {person.name}
                    {person.isActive && <Icon icon="dot" size={10} color="#4ECDC4" style={{ marginLeft: '6px' }} />}
                  </p>
                  {person.flagged && (
                    <>
                      <Tag
                        icon="warning-sign"
                        intent="danger"
                        className="flag-tag"
                      >
                        Flagged
                      </Tag>
                      {person.riskScore !== undefined && (
                        <div className="risk-score-display">
                          Risk: <strong>{person.riskScore.toFixed(1)}/10</strong>
                        </div>
                      )}
                      {person.clusters && person.clusters.length > 0 && (
                        <div className="clusters-display">
                          {person.clusters.map(clusterId => {
                            const cluster = clusters?.find(c => c.id === clusterId);
                            return cluster ? (
                              <span 
                                key={clusterId}
                                className="cluster-badge"
                                style={{ 
                                  backgroundColor: `${cluster.color}33`,
                                  borderColor: cluster.color
                                }}
                              >
                                {cluster.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <p className="footer-text">Real-time Network Analysis</p>
      </div>
    </div>
  );
};
