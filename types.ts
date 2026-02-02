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

export interface Commissioner {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
}

export interface Post {
  id: string;
  type: 'tweet' | 'story' | 'manifesto' | 'announcement' | 'update';
  content: string;
  author_name: string;
  author_role: string;
  likes: number;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  content: string;
  author_name: string;
  created_at: string;
}

export interface ElectionConfig {
  org_name: string;
  election_title: string;
  start_date: string | null;
  end_date: string | null;
  is_results_public: boolean;
}