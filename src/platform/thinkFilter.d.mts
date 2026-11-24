export function stripThinking(text: string): string;
export class ThinkFilter {
  push(chunk: string): string;
  flush(): string;
}
