export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

export interface TopicCard {
  id: string;
  title: string;
  description: string;
  category: 'location' | 'object' | 'info' | 'alert';
  timestamp: Date;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioConfig {
  sampleRate: number;
  channels: number;
}
