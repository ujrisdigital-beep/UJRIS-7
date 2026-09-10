export function toPrismaSqliteUrl(filePath: string): string;
export function sqliteUrlLooksLikeDevDb(url: string | undefined): boolean;
export function sqliteUrlLooksLikeProduction(url: string | undefined): boolean;
export function disposablePrismaSqliteUrl(fileName: string, root?: string): string;
export function assertDisposableSqliteUrl(url: string | undefined, label?: string): string;
