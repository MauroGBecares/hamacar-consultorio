export interface User {
  id: string;
  active: boolean;
  name: string;
  fullName: string;
  discipline: string;
  role: 'partner' | 'professional';
}
