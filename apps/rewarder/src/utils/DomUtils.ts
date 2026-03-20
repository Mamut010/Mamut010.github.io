function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Formats a rate number, showing up to 4 decimal places with trailing zeros stripped. */
function formatRate(n: number): string {
    return parseFloat(n.toFixed(4)).toString();
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
