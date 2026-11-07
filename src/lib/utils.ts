export function getRandomId() {
    const crypt = crypto;
    if (!crypt || !crypt.randomUUID) {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Date.now();
    }
    return crypt.randomUUID();
}