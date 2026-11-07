export type Language = "pt-BR" | "en-US";
export interface Issue {
  id: string;
  from: number;
  to: number;
  text: string;
  category: "spelling" | "review";
  message: string;
  suggestions: string[];
  rule?: string;
}
