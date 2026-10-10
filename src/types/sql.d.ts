declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export class Statement {
    bind(values?: any[]): boolean;
    step(): boolean;
    get(): any[];
    getColumnNames(): string[];
    getAsObject(): Record<string, any>;
    run(values?: any[]): void;
    reset(): void;
    freemem(): void;
    free(): boolean;
  }

  export class Database {
    constructor(data?: Buffer | Uint8Array | number[]);
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string, params?: any[]): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export default function initSqlJs(config?: any): Promise<{
    Database: typeof Database;
  }>;
}
