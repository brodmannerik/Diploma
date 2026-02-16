import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface Actor {
  id: string;
  name: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  speaker: string;
  listener: string;
  message: string;
  timestamp: number;
}

interface BackendData {
  actors: Actor[];
  conversations: Conversation[];
  connected: boolean;
}

// Backend URL - use localhost for development, or Pi's Tailscale IP
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const useBackend = () => {
  const [data, setData] = useState<BackendData>({
    actors: [],
    conversations: [],
    connected: false,
  });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to backend WebSocket
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('✅ Connected to backend');
      setData(prev => ({ ...prev, connected: true }));

      // Fetch initial data
      fetch(`${BACKEND_URL}/api/actors`)
        .then(res => res.json())
        .then(actorsData => {
          if (actorsData.actors) {
            setData(prev => ({ ...prev, actors: actorsData.actors }));
          }
        })
        .catch(err => console.error('Failed to fetch actors:', err));

      fetch(`${BACKEND_URL}/api/conversations?limit=100`)
        .then(res => res.json())
        .then(convData => {
          if (convData.conversations) {
            setData(prev => ({ ...prev, conversations: convData.conversations }));
          }
        })
        .catch(err => console.error('Failed to fetch conversations:', err));
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from backend');
      setData(prev => ({ ...prev, connected: false }));
    });

    // Listen for real-time updates
    newSocket.on('actors-update', (actors: Actor[]) => {
      console.log('📥 Actors update received:', actors);
      setData(prev => ({ ...prev, actors }));
    });

    newSocket.on('new-conversation', (conversation: Conversation) => {
      console.log('💬 New conversation:', conversation);
      setData(prev => ({
        ...prev,
        conversations: [conversation, ...prev.conversations].slice(0, 100), // Keep last 100
      }));
    });

    newSocket.on('conversations-history', (conversations: Conversation[]) => {
      console.log('📚 Conversations history:', conversations.length);
      setData(prev => ({ ...prev, conversations }));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  return { ...data, socket: socketRef.current };
};
