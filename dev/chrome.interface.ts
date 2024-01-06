import Timer from "easytimer.js";

export interface Domain {
  domain: string;
  pages: Page[];
}

export interface Tabs {
  id: number;
  url: string | undefined;
  isActive: boolean;
  timer: Timer;
  domain?: string;
  openedAt: number;
  meta?: {
    title: string;
    description: string;
  };
}

export interface Page {
  openedAt: number;
  page: string;
  timeSpent: number;
  domain: string;
  meta: {
    title: string;
    description: string;
    tags?: string[];
  };
  lastVisited: number;
  synced: boolean;
}
