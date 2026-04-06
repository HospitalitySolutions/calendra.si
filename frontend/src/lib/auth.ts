export type AppUser = {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: 'ADMIN' | 'CONSULTANT' | 'SUPER_ADMIN';
    companyId?: number;
};

export function getToken() {
    return sessionStorage.getItem('token');
}

export function getCurrentUser(): AppUser | null {
    const raw = sessionStorage.getItem('user');
    if (!raw) return null;

    try {
        return JSON.parse(raw) as AppUser;
    } catch {
        return null;
    }
}

export function isAdmin() {
    const role = getCurrentUser()?.role;
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}