export type SolutionEntry = {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  href?: string;
  category: string;
  isAvailable?: boolean;
  statusLabel?: string;
};

export const solutionEntries: SolutionEntry[] = [];
