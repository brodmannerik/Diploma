import { useEffect, useRef, useState } from 'react';
import './GraphVisualization.css';

interface Person {
  id: string;
  name: string;
  flagged: boolean;
  clusters?: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface Cluster {
  id: string;
  name: string;
  color: string;
}

interface GraphVisualizationProps {
  people: Person[];
  refreshSignal?: number;
}

const clusters: Cluster[] = [
  { id: 'extremism', name: 'Extremism', color: '#FF6B6B' },
  { id: 'organized_resistance', name: 'Organized Resistance', color: '#4ECDC4' },
  { id: 'shared_belief', name: 'Shared Belief', color: '#FFE66D' },
  { id: 'state_denial', name: 'State Denial', color: '#95E1D3' },
  { id: 'conspiracist', name: 'Conspiracist Ideologies', color: '#C7CEEA' },
  { id: 'radicalization', name: 'Radicalization Pipeline', color: '#F38181' },
  { id: 'misinformation', name: 'Misinformation Network', color: '#AA96DA' },
];

const NODE_SIZE = 65;
const NAME_BOX_HEIGHT = 32;
const PADDING = 80;

export const GraphVisualization = ({ people, refreshSignal }: GraphVisualizationProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Person[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef<number>(0);
  const draggedNodeRef = useRef<Person | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const zoomRef = useRef(1);
  const mouseDownRef = useRef({ x: 0, y: 0 });
  const connectionsRef = useRef<GraphLink[]>([]);
  const lastRefreshSignalRef = useRef<number | undefined>(undefined);

  // Build connections dynamically from people data
  useEffect(() => {
    if (people.length === 0) {
      connectionsRef.current = [];
      return;
    }

    // Generate connections: connect all people for now
    // Later this will be based on actual conversations
    const newConnections: GraphLink[] = [];
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < Math.min(people.length, i + 3); j++) {
        newConnections.push({
          source: people[i].id,
          target: people[j].id,
        });
      }
    }
    connectionsRef.current = newConnections;
  }, [people]);

  // Subtle nudge when new conversations arrive
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;

    const nodes = nodesRef.current;
    if (nodes.length === 0) return;

    const centerX = nodes.reduce((sum, n) => sum + (n.x || 0), 0) / nodes.length;
    const centerY = nodes.reduce((sum, n) => sum + (n.y || 0), 0) / nodes.length;

    nodes.forEach(node => {
      const dx = (node.x || 0) - centerX;
      const dy = (node.y || 0) - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const baseImpulse = 1.8 + Math.random() * 1.4;
      const jitter = 0.6;

      node.vx = (node.vx || 0) + (dx / dist) * baseImpulse + (Math.random() - 0.5) * jitter;
      node.vy = (node.vy || 0) + (dy / dist) * baseImpulse + (Math.random() - 0.5) * jitter;
    });
  }, [refreshSignal]);

  // Initialize canvas and nodes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    const width = rect.width;
    const height = rect.height;

    // Update existing nodes or create new ones
    const existingNodes = new Map(nodesRef.current.map(n => [n.id, n]));
    
    nodesRef.current = people.map(person => {
      const existing = existingNodes.get(person.id);
      if (existing) {
        // Keep position and velocity for existing nodes
        return { ...person, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy };
      }
      // New node - random position
      return {
        ...person,
        x: Math.random() * (width - PADDING * 2) + PADDING,
        y: Math.random() * (height - PADDING * 2) + PADDING,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1,
      };
    });
  }, [people]);

  // Physics simulation
  const simulate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const nodes = nodesRef.current;

    // Repulsive force between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = (nodes[j].x || 0) - (nodes[i].x || 0);
        const dy = (nodes[j].y || 0) - (nodes[i].y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 700 / (dist * dist + 100);

        nodes[i].vx = (nodes[i].vx || 0) - (force * dx) / dist;
        nodes[i].vy = (nodes[i].vy || 0) - (force * dy) / dist;
        nodes[j].vx = (nodes[j].vx || 0) + (force * dx) / dist;
        nodes[j].vy = (nodes[j].vy || 0) + (force * dy) / dist;
      }
    }

    // Attractive force for connected nodes
    connectionsRef.current.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        const dx = (target.x || 0) - (source.x || 0);
        const dy = (target.y || 0) - (source.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 280;
        const force = (dist - targetDist) / 100;

        source.vx = (source.vx || 0) + (force * dx) / dist * 0.08;
        source.vy = (source.vy || 0) + (force * dy) / dist * 0.08;
        target.vx = (target.vx || 0) - (force * dx) / dist * 0.08;
        target.vy = (target.vy || 0) - (force * dy) / dist * 0.08;
      }
    });

    // Cluster forces - pull nodes with shared clusters closer
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        const sharedClusters = (node1.clusters || []).filter(c => (node2.clusters || []).includes(c));

        if (sharedClusters.length > 0) {
          const dx = (node2.x || 0) - (node1.x || 0);
          const dy = (node2.y || 0) - (node1.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 200 + (3 - sharedClusters.length) * 20;
          const force = (dist - targetDist) / 150;

          node1.vx = (node1.vx || 0) + (force * dx) / dist * 0.05;
          node1.vy = (node1.vy || 0) + (force * dy) / dist * 0.05;
          node2.vx = (node2.vx || 0) - (force * dx) / dist * 0.05;
          node2.vy = (node2.vy || 0) - (force * dy) / dist * 0.05;
        }
      }
    }

    // Update positions and apply damping
    nodes.forEach(node => {
      node.vx = (node.vx || 0) * 0.92;
      node.vy = (node.vy || 0) * 0.92;
      node.x = (node.x || 0) + (node.vx || 0);
      node.y = (node.y || 0) + (node.vy || 0);

      // Keep nodes within canvas
      if (node.x! < PADDING) {
        node.x = PADDING;
        node.vx = 0;
      }
      if (node.x! > width - PADDING) {
        node.x = width - PADDING;
        node.vx = 0;
      }
      if (node.y! < PADDING) {
        node.y = PADDING;
        node.vy = 0;
      }
      if (node.y! > height - PADDING) {
        node.y = height - PADDING;
        node.vy = 0;
      }
    });
  };

  // Drawing with modern styling
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Clear canvas with subtle gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1F1F1F');
    gradient.addColorStop(1, '#1E1E1E');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Apply pan and zoom transformation to all content
    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    // Draw enhanced dot raster background
    ctx.fillStyle = '#2D2D2D';
    ctx.globalAlpha = 0.6;
    const dotSize = 1;
    const dotSpacing = 18;
    for (let x = -width; x < width * 2; x += dotSpacing) {
      for (let y = -height; y < height * 2; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    const nodes = nodesRef.current;

    // Draw cluster bubbles first (behind everything)
    clusters.forEach(cluster => {
      const clusterNodes = nodes.filter(n => (n.clusters || []).includes(cluster.id));
      if (clusterNodes.length > 0) {
        // Calculate centroid of cluster
        const centerX = clusterNodes.reduce((sum, n) => sum + (n.x || 0), 0) / clusterNodes.length;
        const centerY = clusterNodes.reduce((sum, n) => sum + (n.y || 0), 0) / clusterNodes.length;

        // Calculate radius to encompass all nodes with padding
        let maxDist = 0;
        clusterNodes.forEach(n => {
          const dx = (n.x || 0) - centerX;
          const dy = (n.y || 0) - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy) + NODE_SIZE;
          maxDist = Math.max(maxDist, dist);
        });

        const bubbleRadius = maxDist + 20;

        // Draw cluster bubble
        ctx.fillStyle = cluster.color;
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.arc(centerX, centerY, bubbleRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw cluster border
        ctx.strokeStyle = cluster.color;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Draw cluster label positioned around the bubble to avoid overlaps
        const labelDistance = bubbleRadius + 35;
        const clusterIndex = clusters.indexOf(cluster);
        const angleOffset = (clusterIndex / clusters.length) * Math.PI * 2;
        const labelX = centerX + Math.cos(angleOffset) * labelDistance;
        const labelY = centerY + Math.sin(angleOffset) * labelDistance;

        ctx.fillStyle = cluster.color;
        ctx.globalAlpha = 0.6;
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cluster.name, labelX, labelY);
        ctx.globalAlpha = 1;
      }
    });

    // Draw links with gradient effect
    connectionsRef.current.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        const sourceX = source.x || 0;
        const sourceY = source.y || 0;
        const targetX = target.x || 0;
        const targetY = target.y || 0;

        // Create gradient for each line
        const lineGradient = ctx.createLinearGradient(sourceX, sourceY, targetX, targetY);
        lineGradient.addColorStop(0, 'rgba(224, 224, 224, 0.15)');
        lineGradient.addColorStop(0.5, 'rgba(224, 224, 224, 0.25)');
        lineGradient.addColorStop(1, 'rgba(224, 224, 224, 0.15)');

        ctx.strokeStyle = lineGradient;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
      }
    });

    // Draw nodes
    nodes.forEach(node => {
      const isHovered = hoveredNode === node.id;
      const x = node.x || 0;
      const y = node.y || 0;

      // Calculate pulse effect for flagged nodes
      let pulseAmount = 0;
      if (node.flagged) {
        pulseAmount = Math.sin(timeRef.current * 0.008) * 0.15 + 0.3;
      }

      // Draw shadow/glow for flagged nodes
      if (node.flagged) {
        ctx.fillStyle = `rgba(244, 135, 113, ${0.15 + pulseAmount * 0.3})`;
        ctx.fillRect(
          x - NODE_SIZE / 2 - 8,
          y - NODE_SIZE / 2 - 8,
          NODE_SIZE + 16,
          NODE_SIZE + NAME_BOX_HEIGHT + 16
        );
      }

      // Draw main avatar square with gradient
      const squareGradient = ctx.createLinearGradient(
        x - NODE_SIZE / 2,
        y - NODE_SIZE / 2,
        x + NODE_SIZE / 2,
        y + NODE_SIZE / 2
      );

      if (node.flagged) {
        squareGradient.addColorStop(0, `rgba(244, 135, 113, ${0.8 + pulseAmount * 0.2})`);
        squareGradient.addColorStop(1, `rgba(220, 100, 80, ${0.8 + pulseAmount * 0.2})`);
      } else {
        squareGradient.addColorStop(0, 'rgba(224, 224, 224, 0.95)');
        squareGradient.addColorStop(1, 'rgba(200, 200, 200, 0.95)');
      }

      ctx.fillStyle = squareGradient;
      ctx.shadowColor = node.flagged
        ? `rgba(244, 135, 113, ${0.3 + pulseAmount * 0.3})`
        : 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = node.flagged ? 12 + pulseAmount * 8 : 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.fillRect(x - NODE_SIZE / 2, y - NODE_SIZE / 2, NODE_SIZE, NODE_SIZE);
      ctx.shadowColor = 'transparent';

      // Draw white avatar background inside
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      ctx.fillRect(x - NODE_SIZE / 2 + 4, y - NODE_SIZE / 2 + 4, NODE_SIZE - 8, NODE_SIZE - 8);

      // Draw avatar letter with smooth antialiasing
      ctx.fillStyle = '#1C2029';
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.name.charAt(0).toUpperCase(), x, y - 2);

      // Draw name box below avatar
      const nameBoxGradient = ctx.createLinearGradient(
        x - NODE_SIZE / 2,
        y + NODE_SIZE / 2,
        x + NODE_SIZE / 2,
        y + NODE_SIZE / 2 + NAME_BOX_HEIGHT
      );

      if (node.flagged) {
        nameBoxGradient.addColorStop(0, `rgba(213, 11, 46, ${0.6 + pulseAmount * 0.2})`);
        nameBoxGradient.addColorStop(1, `rgba(180, 8, 40, ${0.6 + pulseAmount * 0.2})`);
      } else {
        nameBoxGradient.addColorStop(0, 'rgba(195, 205, 214, 0.85)');
        nameBoxGradient.addColorStop(1, 'rgba(175, 185, 200, 0.85)');
      }

      ctx.fillStyle = nameBoxGradient;
      ctx.fillRect(x - NODE_SIZE / 2, y + NODE_SIZE / 2 + 2, NODE_SIZE, NAME_BOX_HEIGHT);

      // Draw name text
      ctx.fillStyle = '#1C2029';
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.name, x, y + NODE_SIZE / 2 + 2 + NAME_BOX_HEIGHT / 2);

      // Draw hover highlight with animation
      if (isHovered) {
        ctx.strokeStyle = 'rgba(195, 205, 214, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          x - NODE_SIZE / 2 - 3,
          y - NODE_SIZE / 2 - 3,
          NODE_SIZE + 6,
          NODE_SIZE + NAME_BOX_HEIGHT + 6
        );
      }
    });
    
    ctx.restore();
  };

  // Animation loop
  const animate = () => {
    timeRef.current += 1;
    simulate();
    draw();
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [hoveredNode]);

  // Handle mouse events
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const y = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    // Handle panning
    if (isPanningRef.current) {
      panRef.current.x = e.clientX - rect.left - mouseDownRef.current.x;
      panRef.current.y = e.clientY - rect.top - mouseDownRef.current.y;
      canvas.style.cursor = 'grabbing';
      return;
    }

    // Handle node dragging
    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = x;
      draggedNodeRef.current.y = y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
      return;
    }

    const hovered = nodesRef.current.find(node => {
      const nodeX = (node.x || 0);
      const nodeY = (node.y || 0);
      const nodeSize = 40;
      const nameBoxHeight = 20;

      return (
        x >= nodeX - nodeSize / 2 &&
        x <= nodeX + nodeSize / 2 &&
        y >= nodeY - nodeSize / 2 &&
        y <= nodeY + nodeSize / 2 + nameBoxHeight
      );
    });

    setHoveredNode(hovered?.id || null);
    canvas.style.cursor = hovered ? 'grab' : 'default';
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const y = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    // Start panning with middle mouse button or space + left click
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
      mouseDownRef.current.x = e.clientX - rect.left - panRef.current.x;
      mouseDownRef.current.y = e.clientY - rect.top - panRef.current.y;
      canvas.style.cursor = 'grabbing';
      return;
    }

    const clicked = nodesRef.current.find(node => {
      const nodeX = (node.x || 0);
      const nodeY = (node.y || 0);
      const nodeSize = 40;
      const nameBoxHeight = 20;

      return (
        x >= nodeX - nodeSize / 2 &&
        x <= nodeX + nodeSize / 2 &&
        y >= nodeY - nodeSize / 2 &&
        y <= nodeY + nodeSize / 2 + nameBoxHeight
      );
    });

    if (clicked) {
      draggedNodeRef.current = clicked;
      canvas.style.cursor = 'grabbing';
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isPanningRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'default';
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(3, zoomRef.current * zoomFactor));

    // Calculate new pan to zoom towards mouse position
    panRef.current.x = mouseX - (mouseX - panRef.current.x) * (newZoom / zoomRef.current);
    panRef.current.y = mouseY - (mouseY - panRef.current.y) * (newZoom / zoomRef.current);

    zoomRef.current = newZoom;
  };

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  );
};


