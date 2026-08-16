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

export type TestimonialEntry = {
  name: string;
  location: string;
  story: string;
  image: string;
  crop: string;
};

export const solutionEntries: SolutionEntry[] = [];

export const testimonialEntries: TestimonialEntry[] = [];

