export interface JwtPayload {
  sub: string;
  actorType: "employee" | "superadmin";
  role: string;
  companyId: string | null;
  supervisorId?: string;
}