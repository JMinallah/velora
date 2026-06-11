import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const USER_ID = uuidv4(); // one per browser session

export function useVelora() {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Create session on mount
    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID }),
    })
      .then(r => r.json())
      .then(d => setSessionId(d.sessionId));
  }, []);

  async function send(text: string) {
    if (!sessionId) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, userId: USER_ID }),
      });

      if (!res.ok) throw new Error('Chat request failed');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let agentReply = '';

      setMessages(prev => [...prev, { role: 'agent', text: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        agentReply += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].text = agentReply;
          return updated;
        });
      }
    } catch (err) {
      console.error('Velora chat error:', err);
      setMessages(prev => [...prev, { role: 'agent', text: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return { messages, loading, send, ready: !!sessionId };
}
