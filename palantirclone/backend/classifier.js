// Keyword-Based Threat Classification
// Lightweight system for Raspberry Pi

const THREAT_CATEGORIES = {
  extremism: {
    keywords: [
      'violence', 'attack', 'destroy', 'kill', 'weapon', 'bomb', 'terror',
      'militant', 'radical', 'jihad', 'crusade', 'war', 'fight', 'strike',
      'hate', 'enemy', 'purge', 'eliminate', 'execution'
    ],
    threshold: 2, // Need 2+ keywords to flag
    weight: 3 // High severity
  },
  
  organized_resistance: {
    keywords: [
      'organize', 'meeting', 'plan', 'coordinate', 'group', 'cell',
      'underground', 'secret', 'recruit', 'mobilize', 'network',
      'resistance', 'movement', 'coalition', 'alliance', 'operation'
    ],
    threshold: 2,
    weight: 2
  },
  
  shared_belief: {
    keywords: [
      'believe', 'truth', 'awakened', 'enlightened', 'they', 'them',
      'control', 'system', 'agenda', 'puppet', 'sheep', 'wake up',
      'red pill', 'propaganda', 'lies', 'hidden', 'real', 'truth'
    ],
    threshold: 2,
    weight: 1
  },
  
  state_denial: {
    keywords: [
      'government', 'authority', 'police', 'illegal', 'unconstitutional',
      'tyranny', 'oppression', 'corrupt', 'refuse', 'reject', 'deny',
      'sovereign', 'rights', 'freedom', 'liberty', 'dictator'
    ],
    threshold: 2,
    weight: 2
  },
  
  conspiracist: {
    keywords: [
      'conspiracy', 'coverup', 'cover-up', 'illuminati', 'deep state',
      'cabal', 'elite', 'nwo', 'new world order', 'shadow government',
      'fake news', 'mainstream media', 'msm', 'false flag', 'hoax',
      'crisis actor', 'staged', 'planted', 'orchestrated'
    ],
    threshold: 1, // Even 1 keyword is suspicious
    weight: 2
  },
  
  radicalization: {
    keywords: [
      'time for action', 'enough talking', 'take back', 'rise up',
      'fight back', 'stand up', 'resist', 'revolution', 'uprising',
      'overthrow', 'escalate', 'escalation', 'prepare', 'ready',
      'call to arms', 'no more', 'had enough'
    ],
    threshold: 1,
    weight: 3
  },
  
  misinformation: {
    keywords: [
      'research', 'look it up', 'google it', 'watch this', 'link',
      'proof', 'evidence', 'fact', 'study shows', 'they dont want you',
      'censored', 'banned', 'removed', 'deleted', 'silenced',
      'alternative facts', 'own research', 'question everything'
    ],
    threshold: 2,
    weight: 1
  }
};

// Calculate risk score based on conversation content
function classifyConversation(message) {
  const lowerMessage = message.toLowerCase();
  const classifications = {
    clusters: [],
    riskScore: 0,
    flagged: false,
    matchedKeywords: {}
  };

  // Check each threat category
  for (const [category, config] of Object.entries(THREAT_CATEGORIES)) {
    const matches = [];
    
    // Find matching keywords
    for (const keyword of config.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matches.push(keyword);
      }
    }

    // If threshold met, add to clusters
    if (matches.length >= config.threshold) {
      classifications.clusters.push(category);
      classifications.riskScore += matches.length * config.weight;
      classifications.matchedKeywords[category] = matches;
    }
  }

  // Flag if risk score is high enough
  if (classifications.riskScore >= 3) {
    classifications.flagged = true;
  }

  return classifications;
}

// Aggregate actor risk based on all their conversations
function calculateActorRisk(conversations) {
  const actorData = {};

  conversations.forEach(conv => {
    const classification = classifyConversation(conv.message);

    // Track speaker
    if (!actorData[conv.speaker]) {
      actorData[conv.speaker] = {
        totalRisk: 0,
        clusters: new Set(),
        conversationCount: 0,
        flaggedCount: 0
      };
    }

    actorData[conv.speaker].totalRisk += classification.riskScore;
    actorData[conv.speaker].conversationCount++;
    if (classification.flagged) {
      actorData[conv.speaker].flaggedCount++;
    }
    classification.clusters.forEach(c => actorData[conv.speaker].clusters.add(c));

    // Track listener (indirect involvement)
    if (!actorData[conv.listener]) {
      actorData[conv.listener] = {
        totalRisk: 0,
        clusters: new Set(),
        conversationCount: 0,
        flaggedCount: 0
      };
    }

    actorData[conv.listener].totalRisk += classification.riskScore * 0.5; // Half weight for listeners
    actorData[conv.listener].conversationCount++;
    classification.clusters.forEach(c => actorData[conv.listener].clusters.add(c));
  });

  // Convert to final format
  const result = {};
  for (const [actor, data] of Object.entries(actorData)) {
    const averageRisk = data.totalRisk / data.conversationCount;
    result[actor] = {
      riskScore: Math.round(data.totalRisk * 10) / 10,
      averageRisk: Math.round(averageRisk * 10) / 10,
      clusters: Array.from(data.clusters),
      flagged: data.flaggedCount > 0 || averageRisk >= 2,
      conversationCount: data.conversationCount,
      flaggedConversations: data.flaggedCount
    };
  }

  return result;
}

module.exports = {
  classifyConversation,
  calculateActorRisk,
  THREAT_CATEGORIES
};
