import { Request } from "express";
export interface Principal {
  id: string;
  sessionId: string;
  email: string;
  displayName: string;
}
export type AuthRequest = Request & { user: Principal };
