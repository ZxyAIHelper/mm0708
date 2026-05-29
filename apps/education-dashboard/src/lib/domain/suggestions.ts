export type SuggestionCard = {
  id: string;
  priority: number;
  title: string;
  summary: string;
  rationale: string;
};

export function sortSuggestions<T extends SuggestionCard>(suggestions: T[]) {
  return [...suggestions].sort((left, right) => left.priority - right.priority);
}
